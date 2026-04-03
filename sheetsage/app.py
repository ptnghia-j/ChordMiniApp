import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

from service import SheetSageAssetUnavailableError, SheetSageRuntime

DEFAULT_MAX_UPLOAD_BYTES = int(os.getenv("SHEETSAGE_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))

logging.basicConfig(level=os.getenv("SHEETSAGE_LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

runtime = SheetSageRuntime()


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
        if uploaded_file is None:
            return jsonify({"success": False, "error": "Missing uploaded file"}), 400

        filename = uploaded_file.filename or "upload"
        suffix = Path(filename).suffix or ".wav"
        started_at = time.perf_counter()
        temp_path = None  # type: Optional[str]

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                uploaded_file.save(temp_file.name)
                temp_path = temp_file.name

            logger.info("Transcribing uploaded audio with Sheet Sage: %s", filename)
            result = runtime.transcribe_file(temp_path, source_name=filename)
            result["processingTime"] = round(time.perf_counter() - started_at, 3)
            return jsonify({"success": True, "data": result})
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
