import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

from service import SheetSageAssetUnavailableError, SheetSageRuntime

DEFAULT_MAX_UPLOAD_BYTES = int(os.getenv("SHEETSAGE_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
DEFAULT_MAX_DOWNLOAD_BYTES = int(
    os.getenv("SHEETSAGE_MAX_DOWNLOAD_BYTES", str(100 * 1024 * 1024))
)
DEFAULT_DOWNLOAD_TIMEOUT = (
    float(os.getenv("SHEETSAGE_CONNECT_TIMEOUT_SECONDS", "30")),
    float(os.getenv("SHEETSAGE_READ_TIMEOUT_SECONDS", "300")),
)
ALLOWED_FIREBASE_STORAGE_HOSTS = (
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
)

logging.basicConfig(level=os.getenv("SHEETSAGE_LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

runtime = SheetSageRuntime()


def _host_matches_allowed_storage(hostname: str) -> bool:
    return any(
        hostname == allowed or hostname.endswith(f".{allowed}")
        for allowed in ALLOWED_FIREBASE_STORAGE_HOSTS
    )


def _validate_firebase_audio_url(audio_url: str) -> str:
    if not audio_url or not isinstance(audio_url, str):
        raise ValueError("audioUrl is required")

    parsed = urlparse(audio_url)
    if parsed.scheme != "https" or not _host_matches_allowed_storage(parsed.hostname or ""):
        raise ValueError("audioUrl must be an HTTPS Firebase Storage URL")

    return audio_url


def _source_name_from_audio_url(audio_url: str) -> str:
    parsed = urlparse(audio_url)
    path_name = Path(unquote(parsed.path)).name
    return path_name or "firebase-audio.mp3"


def _download_audio_url_to_tempfile(audio_url: str) -> str:
    validated_url = _validate_firebase_audio_url(audio_url)
    suffix = Path(_source_name_from_audio_url(validated_url)).suffix or ".mp3"

    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = temp_file.name
    bytes_downloaded = 0

    try:
        with temp_file:
            with requests.get(
                validated_url,
                stream=True,
                timeout=DEFAULT_DOWNLOAD_TIMEOUT,
            ) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    bytes_downloaded += len(chunk)
                    if bytes_downloaded > DEFAULT_MAX_DOWNLOAD_BYTES:
                        raise ValueError(
                            "Downloaded audio exceeds Sheet Sage size limit "
                            f"({DEFAULT_MAX_DOWNLOAD_BYTES // (1024 * 1024)}MB)"
                        )
                    temp_file.write(chunk)

        if bytes_downloaded == 0:
            raise ValueError("Downloaded audio is empty")

        return temp_path
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                logger.warning("Failed to remove failed download: %s", temp_path)
        raise


def _get_request_audio_url() -> Optional[str]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        for field_name in ("audioUrl", "firebase_url", "offload_url", "blob_url"):
            value = payload.get(field_name)
            if isinstance(value, str) and value.strip():
                return value.strip()

    for field_name in ("audioUrl", "firebase_url", "offload_url", "blob_url"):
        value = request.form.get(field_name)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


def create_app() -> Flask:
    flask_app = Flask(__name__)
    flask_app.config["MAX_CONTENT_LENGTH"] = DEFAULT_MAX_UPLOAD_BYTES
    CORS(flask_app)

    @flask_app.get("/")
    def root() -> Any:
        return jsonify(
            {
                "name": "Sheet Sage API",
                "status": "ok",
                "experimental": True,
                "endpoints": ["GET /health", "GET /info", "POST /transcribe"],
            }
        )

    @flask_app.get("/health")
    def health() -> Any:
        warmup_requested = (request.args.get("warmup") or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

        if warmup_requested:
            try:
                runtime.ensure_initialized()
            except SheetSageAssetUnavailableError as exc:
                return (
                    jsonify(
                        {
                            "status": "unavailable",
                            "service": "sheetsage",
                            "initialized": runtime.is_initialized,
                            "assetUnavailable": True,
                            "requiredAssetDetails": runtime.get_required_asset_details(),
                            "error": str(exc),
                            "runtime": runtime.get_runtime_info(),
                        }
                    ),
                    503,
                )
            except RuntimeError as exc:
                return (
                    jsonify(
                        {
                            "status": "error",
                            "service": "sheetsage",
                            "initialized": runtime.is_initialized,
                            "assetUnavailable": False,
                            "requiredAssetDetails": runtime.get_required_asset_details(),
                            "error": str(exc),
                            "runtime": runtime.get_runtime_info(),
                        }
                    ),
                    500,
                )

        return jsonify(
            {
                "status": "ok",
                "service": "sheetsage",
                "initialized": runtime.is_initialized,
                "assetUnavailable": False,
                "requiredAssetDetails": runtime.get_required_asset_details(),
                "runtime": runtime.get_runtime_info(),
            }
        )

    @flask_app.get("/info")
    def info() -> Any:
        return jsonify(
            {
                "name": "Standalone Sheet Sage melody backend",
                "available": True,
                "endpoint": "/transcribe",
                "experimental": True,
                "accepts": {
                    "multipart": {"file": "audio binary"},
                    "json": {"audioUrl": "Firebase Storage HTTPS URL"},
                    "extensions": [".wav", ".mp3", ".flac", ".ogg", ".m4a"],
                },
                "returns": {
                    "noteEvents": [
                        {
                            "onset": 0.0,
                            "offset": 0.5,
                            "pitch": 60,
                            "velocity": 100,
                        }
                    ],
                    "beatTimes": [0.0, 0.5, 1.0],
                    "beatsPerMeasure": 4,
                    "tempoBpm": 120,
                },
                "licenseWarning": (
                    "Experimental Sheet Sage integration. Upstream Sheet Sage model/data assets are not licensed for unrestricted commercial use."
                ),
                "requiredAssetDetails": runtime.get_required_asset_details(),
                "runtime": runtime.get_runtime_info(),
            }
        )

    @flask_app.post("/transcribe")
    def transcribe() -> Any:
        uploaded_file = request.files.get("file")
        audio_url = _get_request_audio_url()
        if uploaded_file is None and audio_url is None:
            return jsonify({"success": False, "error": "Missing uploaded file or audioUrl"}), 400

        filename = (
            uploaded_file.filename
            if uploaded_file is not None
            else _source_name_from_audio_url(audio_url or "")
        ) or "upload"
        suffix = Path(filename).suffix or ".wav"
        started_at = time.perf_counter()
        temp_path = None  # type: Optional[str]

        try:
            if uploaded_file is not None:
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                    uploaded_file.save(temp_file.name)
                    temp_path = temp_file.name

                logger.info("Transcribing uploaded audio with Sheet Sage: %s", filename)
            else:
                logger.info(
                    "Downloading Firebase audio for Sheet Sage transcription: %s",
                    (audio_url or "")[:120],
                )
                temp_path = _download_audio_url_to_tempfile(audio_url or "")
                logger.info(
                    "Downloaded Firebase audio to %s (%.1fMB)",
                    temp_path,
                    os.path.getsize(temp_path) / (1024 * 1024),
                )

            result = runtime.transcribe_file(temp_path, source_name=filename)
            result["processingTime"] = round(time.perf_counter() - started_at, 3)
            return jsonify({"success": True, "data": result})
        except requests.exceptions.RequestException as exc:
            logger.warning("Sheet Sage failed to download audioUrl: %s", exc)
            return jsonify({"success": False, "error": f"Failed to download audioUrl: {exc}"}), 400
        except ValueError as exc:
            logger.warning("Sheet Sage rejected request: %s", exc)
            return jsonify({"success": False, "error": str(exc)}), 400
        except SheetSageAssetUnavailableError as exc:
            logger.exception("Sheet Sage assets are unavailable")
            return jsonify({"success": False, "error": str(exc)}), 503
        except RuntimeError as exc:
            logger.exception("Sheet Sage runtime dependency failure")
            return jsonify({"success": False, "error": str(exc)}), 500
        except Exception as exc:
            logger.exception("Sheet Sage transcription failed")
            return jsonify({"success": False, "error": str(exc)}), 500
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    logger.warning("Failed to remove temporary upload: %s", temp_path)

    return flask_app


app = create_app()


if __name__ == "__main__":
    if (os.getenv("SHEETSAGE_PRELOAD", "false").strip().lower() in {"1", "true", "yes", "on"}):
        runtime.ensure_initialized()

    port = int(os.getenv("PORT", "8082"))
    app.run(host="0.0.0.0", port=port)
