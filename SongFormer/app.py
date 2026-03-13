from __future__ import annotations

import importlib
import hashlib
import json
import logging
import os
import platform
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import scipy
import numpy as np
import torch
from flask import Flask, jsonify, request
from flask_cors import CORS
from ema_pytorch import EMA
from omegaconf import OmegaConf
from sequential_inference import process_audio_sequential

ROOT_DIR = Path(__file__).resolve().parent
SONGFORMER_SRC_DIR = ROOT_DIR / "src" / "SongFormer"
THIRD_PARTY_DIR = ROOT_DIR / "src" / "third_party"
MUQ_SRC_DIR = THIRD_PARTY_DIR / "MuQ" / "src"
MUSICFM_SRC_DIR = THIRD_PARTY_DIR / "musicfm"

os.chdir(SONGFORMER_SRC_DIR)
sys.path.insert(0, str(SONGFORMER_SRC_DIR))
sys.path.insert(0, str(THIRD_PARTY_DIR))
sys.path.insert(0, str(MUQ_SRC_DIR))
sys.path.insert(0, str(MUSICFM_SRC_DIR))

scipy.inf = np.inf

from dataset.label2id import DATASET_ID_ALLOWED_LABEL_IDS, DATASET_LABEL_TO_DATASET_ID
from muq import MuQ
from musicfm.model.musicfm_25hz import MusicFM25Hz
from postprocessing.functional import postprocess_functional_structure

MUQ_HOME_PATH = Path("ckpts") / "MuQ"
MUSICFM_HOME_PATH = Path("ckpts") / "MusicFM"
AFTER_DOWNSAMPLING_FRAME_RATES = 8.333
DATASET_LABEL = "SongForm-HX-8Class"
DATASET_IDS = [5]
TIME_DUR = 420
INPUT_SAMPLING_RATE = 24000
DEFAULT_AUDIO_DIR = ROOT_DIR.parent / "audio"
DEFAULT_MODEL_NAME = os.getenv("SONGFORMER_MODEL_NAME", "SongFormer")
DEFAULT_CHECKPOINT = os.getenv("SONGFORMER_CHECKPOINT", "SongFormer.safetensors")
DEFAULT_CONFIG_PATH = os.getenv("SONGFORMER_CONFIG", "SongFormer.yaml")
DEFAULT_DOWNLOAD_TIMEOUT = int(os.getenv("SONGFORMER_DOWNLOAD_TIMEOUT", "180"))
DEFAULT_MAX_UPLOAD_BYTES = int(os.getenv("SONGFORMER_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
DEFAULT_RESULT_CACHE_TTL_SECONDS = int(os.getenv("SONGFORMER_RESULT_CACHE_TTL_SECONDS", str(24 * 60 * 60)))
DEFAULT_RESULT_CACHE_MAX_ITEMS = int(os.getenv("SONGFORMER_RESULT_CACHE_MAX_ITEMS", "32"))
DEFAULT_ENABLE_30S_BATCHING = (os.getenv("SONGFORMER_ENABLE_30S_BATCHING", "1").strip().lower() in {"1", "true", "yes", "on"})
DEFAULT_30S_BATCH_SIZE = max(1, int(os.getenv("SONGFORMER_30S_BATCH_SIZE", "8")))
DEFAULT_CALLBACK_TIMEOUT = int(os.getenv("SONGFORMER_CALLBACK_TIMEOUT", "30"))
DEFAULT_CALLBACK_RETRY_COUNT = max(1, int(os.getenv("SONGFORMER_CALLBACK_RETRY_COUNT", "3")))
MIN_AUDIO_SAMPLES = 1025
CHUNK_30S_DURATION_SECONDS = 30

muq_model: Any = None
musicfm_model: Any = None
msa_model: Any = None
device: Any = None
device_reason: str | None = None
init_lock = threading.Lock()
result_cache_lock = threading.Lock()
segmentation_result_cache: dict[str, tuple[float, dict[str, Any]]] = {}

logging.basicConfig(level=os.getenv("SONGFORMER_LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)


def is_truthy_env(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_mps_available() -> bool:
    return bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available())


def enable_mps_fallback_if_needed() -> None:
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def is_experimental_mps_enabled() -> bool:
    return is_truthy_env(os.getenv("SONGFORMER_ENABLE_EXPERIMENTAL_MPS"))


def is_local_development() -> bool:
    """
    Match the main python_backend policy:
    - local development may use accelerators
    - production/cloud environments default to CPU
    """
    if is_truthy_env(os.getenv("SONGFORMER_FORCE_LOCAL_ACCELERATION")):
        return True

    flask_env = os.getenv("FLASK_ENV")
    port_env = os.getenv("PORT")
    node_env = os.getenv("NODE_ENV")

    is_google_cloud_run = port_env is not None
    is_vercel = os.getenv("VERCEL") is not None
    is_production_explicit = flask_env == "production" or node_env == "production"

    return not is_google_cloud_run and not is_vercel and not is_production_explicit


def resolve_runtime_device() -> tuple[torch.device, str]:
    forced_device = (os.getenv("SONGFORMER_DEVICE") or "").strip().lower()

    if forced_device == "cpu":
        return torch.device("cpu"), "SONGFORMER_DEVICE=cpu"

    if forced_device == "cuda":
        if torch.cuda.is_available():
            return torch.device("cuda"), "SONGFORMER_DEVICE=cuda"
        logger.warning("SONGFORMER_DEVICE=cuda requested, but CUDA is unavailable. Falling back to auto detection.")

    if forced_device == "mps":
        if is_mps_available():
            enable_mps_fallback_if_needed()
            return torch.device("mps"), "SONGFORMER_DEVICE=mps+fallback"
        logger.warning("SONGFORMER_DEVICE=mps requested, but MPS is unavailable. Falling back to auto detection.")

    if forced_device and forced_device not in {"cpu", "cuda", "mps"}:
        logger.warning("Unsupported SONGFORMER_DEVICE=%s. Falling back to auto detection.", forced_device)

    if not is_local_development():
        return torch.device("cpu"), "production-default-cpu"

    if torch.cuda.is_available():
        return torch.device("cuda"), "local-auto-cuda"

    if is_mps_available():
        if is_experimental_mps_enabled():
            enable_mps_fallback_if_needed()
            return torch.device("mps"), "local-auto-mps+fallback"

        logger.info(
            "MPS is available, but SongFormer defaults to CPU on Apple Silicon because this model stack uses ops "
            "that are not fully implemented on MPS. Set SONGFORMER_ENABLE_EXPERIMENTAL_MPS=1 to opt in."
        )
        return torch.device("cpu"), "local-auto-cpu-mps-unsupported"

    return torch.device("cpu"), "local-auto-cpu"


def get_runtime_info() -> dict[str, Any]:
    selected_device, selected_reason = resolve_runtime_device()
    return {
        "environment": "local_development" if is_local_development() else "production",
        "selectedDevice": str(device) if device is not None else str(selected_device),
        "devicePolicy": str(device_reason) if device_reason is not None else selected_reason,
        "platform": platform.platform(),
        "pythonVersion": sys.version.split()[0],
        "torchVersion": torch.__version__,
        "torchNumThreads": torch.get_num_threads(),
        "torchNumInteropThreads": torch.get_num_interop_threads(),
        "cudaAvailable": torch.cuda.is_available(),
        "mpsAvailable": is_mps_available(),
        "experimentalMpsEnabled": is_experimental_mps_enabled(),
        "mpsFallbackEnabled": is_truthy_env(os.getenv("PYTORCH_ENABLE_MPS_FALLBACK")),
        "resultCacheTtlSeconds": DEFAULT_RESULT_CACHE_TTL_SECONDS,
        "resultCacheMaxItems": DEFAULT_RESULT_CACHE_MAX_ITEMS,
        "cpuCount": max(1, os.cpu_count() or 1),
        "batch30sChunksEnabled": DEFAULT_ENABLE_30S_BATCHING,
        "batch30sChunkBatchSize": DEFAULT_30S_BATCH_SIZE,
    }


def build_result_cache_key(audio_source: str) -> str:
    return hashlib.sha256(audio_source.encode("utf-8")).hexdigest()


def get_cached_segmentation_result(audio_source: str) -> dict[str, Any] | None:
    if DEFAULT_RESULT_CACHE_TTL_SECONDS <= 0:
        return None

    cache_key = build_result_cache_key(audio_source)
    now = time.time()

    with result_cache_lock:
        cached_entry = segmentation_result_cache.get(cache_key)
        if cached_entry is None:
            return None

        expires_at, result = cached_entry
        if expires_at < now:
            segmentation_result_cache.pop(cache_key, None)
            return None

        segmentation_result_cache.pop(cache_key, None)
        segmentation_result_cache[cache_key] = (expires_at, result)
        return dict(result)


def cache_segmentation_result(audio_source: str, result: dict[str, Any]) -> None:
    if DEFAULT_RESULT_CACHE_TTL_SECONDS <= 0 or DEFAULT_RESULT_CACHE_MAX_ITEMS <= 0:
        return

    cache_key = build_result_cache_key(audio_source)
    expires_at = time.time() + DEFAULT_RESULT_CACHE_TTL_SECONDS

    with result_cache_lock:
        segmentation_result_cache[cache_key] = (expires_at, dict(result))
        while len(segmentation_result_cache) > DEFAULT_RESULT_CACHE_MAX_ITEMS:
            oldest_key = next(iter(segmentation_result_cache))
            segmentation_result_cache.pop(oldest_key, None)


def load_checkpoint(checkpoint_path: str, device_name: str | None = None) -> dict[str, Any]:
    if device_name is None:
        device_name = "cpu"
    if checkpoint_path.endswith(".pt"):
        return torch.load(checkpoint_path, map_location=device_name)
    if checkpoint_path.endswith(".safetensors"):
        from safetensors.torch import load_file

        return {"model_ema": load_file(checkpoint_path, device=device_name)}
    raise ValueError("Unsupported checkpoint format. Use .pt or .safetensors")


def require_local_model_files(model_name: str, model_dir: Path, required_files: tuple[str, ...]) -> Path:
    missing_files = [str(model_dir / filename) for filename in required_files if not (model_dir / filename).is_file()]
    if missing_files:
        raise FileNotFoundError(
            f"Missing required local {model_name} assets: {', '.join(missing_files)}. "
            "Refusing to fall back to remote Hugging Face downloads."
        )
    return model_dir


def initialize_models(
    model_name: str = DEFAULT_MODEL_NAME,
    checkpoint: str = DEFAULT_CHECKPOINT,
    config_path: str = DEFAULT_CONFIG_PATH,
):
    global muq_model, musicfm_model, msa_model, device, device_reason

    overall_start = time.perf_counter()
    device, device_reason = resolve_runtime_device()
    logger.info("Initializing SongFormer on device=%s (%s)", device, device_reason)

    muq_start = time.perf_counter()
    muq_dir = require_local_model_files("MuQ", MUQ_HOME_PATH, ("config.json", "model.safetensors"))
    muq_model = MuQ.from_pretrained(str(muq_dir))
    muq_model = muq_model.to(device).eval()
    logger.info("Loaded MuQ model in %.2fs", time.perf_counter() - muq_start)

    musicfm_start = time.perf_counter()
    musicfm_model = MusicFM25Hz(
        is_flash=False,
        stat_path=str(MUSICFM_HOME_PATH / "msd_stats.json"),
        model_path=str(MUSICFM_HOME_PATH / "pretrained_msd.pt"),
    )
    musicfm_model = musicfm_model.to(device).eval()
    logger.info("Loaded MusicFM model in %.2fs", time.perf_counter() - musicfm_start)

    msa_start = time.perf_counter()
    module = importlib.import_module(f"models.{model_name}")
    Model = getattr(module, "Model")
    hp = OmegaConf.load(Path("configs") / config_path)
    msa_model = Model(hp)

    ckpt = load_checkpoint(str(Path("ckpts") / checkpoint))
    if ckpt.get("model_ema") is not None:
        model_ema = EMA(msa_model, include_online_model=False)
        model_ema.load_state_dict(ckpt["model_ema"])
        msa_model.load_state_dict(model_ema.ema_model.state_dict())
    else:
        msa_model.load_state_dict(ckpt["model"])

    msa_model.to(device).eval()
    logger.info("Loaded SongFormer model in %.2fs", time.perf_counter() - msa_start)
    logger.info("SongFormer models initialized in %.2fs", time.perf_counter() - overall_start)
    return hp


def ensure_models_initialized(
    model_name: str = DEFAULT_MODEL_NAME,
    checkpoint: str = DEFAULT_CHECKPOINT,
    config_path: str = DEFAULT_CONFIG_PATH,
):
    global muq_model, musicfm_model, msa_model

    if muq_model is not None and musicfm_model is not None and msa_model is not None:
        return OmegaConf.load(Path("configs") / config_path)

    with init_lock:
        if muq_model is None or musicfm_model is None or msa_model is None:
            logger.info("Initializing SongFormer models")
            return initialize_models(model_name, checkpoint=checkpoint, config_path=config_path)

    return OmegaConf.load(Path("configs") / config_path)


def clear_accelerator_cache_if_available() -> None:
    if device is None:
        return

    if device.type == "cuda" and torch.cuda.is_available():
        torch.cuda.empty_cache()
        return

    if device.type == "mps" and hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()


def run_muq_hidden_state_batch(audio_batch: torch.Tensor) -> torch.Tensor:
    muq_output = muq_model(audio_batch, output_hidden_states=True)
    hidden_state = muq_output["hidden_states"][10]
    del muq_output
    return hidden_state


def run_musicfm_hidden_state_batch(audio_batch: torch.Tensor) -> torch.Tensor:
    _, musicfm_hidden_states = musicfm_model.get_predictions(audio_batch)
    hidden_state = musicfm_hidden_states[10]
    del musicfm_hidden_states
    return hidden_state


def process_audio(audio_path: str, win_size: int = 420, hop_size: int = 420, num_classes: int = 128):
    ensure_models_initialized()
    result = process_audio_sequential(
        audio_path,
        device=device,
        ensure_models_initialized=ensure_models_initialized,
        run_muq_hidden_state_batch=run_muq_hidden_state_batch,
        run_musicfm_hidden_state_batch=run_musicfm_hidden_state_batch,
        clear_accelerator_cache_if_available=clear_accelerator_cache_if_available,
        msa_model=msa_model,
        dataset_id_allowed_label_ids=DATASET_ID_ALLOWED_LABEL_IDS,
        dataset_label_to_dataset_id=DATASET_LABEL_TO_DATASET_ID,
        dataset_label=DATASET_LABEL,
        dataset_ids=DATASET_IDS,
        time_dur=TIME_DUR,
        input_sampling_rate=INPUT_SAMPLING_RATE,
        after_downsampling_frame_rates=AFTER_DOWNSAMPLING_FRAME_RATES,
        min_audio_samples=MIN_AUDIO_SAMPLES,
        chunk_30s_duration_seconds=CHUNK_30S_DURATION_SECONDS,
        batch_30s_enabled=DEFAULT_ENABLE_30S_BATCHING,
        batch_30s_size=DEFAULT_30S_BATCH_SIZE,
        num_classes=num_classes,
        win_size=win_size,
        hop_size=hop_size,
        postprocess_functional_structure=postprocess_functional_structure,
    )
    stats = result.stats
    logger.info(
        "SongFormer process_audio timings: total=%.2fs audio_load=%.2fs device=%s threads=%s interop_threads=%s "
        "420_windows=%s 30s_chunks=%s 30s_full=%s 30s_tail=%s 30s_batches=%s batch30_enabled=%s batch30_size=%s "
        "muq_420=%.2fs musicfm_420=%.2fs muq_30=%.2fs musicfm_30=%.2fs msa_infer=%.2fs",
        stats.total_seconds,
        stats.audio_load_seconds,
        device,
        torch.get_num_threads(),
        torch.get_num_interop_threads(),
        stats.num_420_windows,
        stats.num_30s_chunks,
        stats.num_30s_full_chunks,
        stats.num_30s_tail_chunks,
        stats.num_30s_batches,
        DEFAULT_ENABLE_30S_BATCHING,
        DEFAULT_30S_BATCH_SIZE,
        stats.muq_420_seconds,
        stats.musicfm_420_seconds,
        stats.muq_30_seconds,
        stats.musicfm_30_seconds,
        stats.msa_infer_seconds,
    )
    return result.msa_output


def rule_post_processing(msa_list):
    if len(msa_list) <= 2:
        return msa_list
    result = msa_list.copy()
    while len(result) > 2:
        if result[1][0] - result[0][0] < 1.0:
            result[0] = (result[0][0], result[1][1])
            result = [result[0]] + result[2:]
        else:
            break
    while len(result) > 2:
        if result[-1][0] - result[-2][0] < 1.0:
            result = result[:-2] + [result[-1]]
        else:
            break
    while len(result) > 2:
        if result[0][1] == result[1][1] and result[1][0] <= 10.0:
            result = [result[0]] + result[2:]
        else:
            break
    while len(result) > 2:
        if result[-2][1] == result[-3][1] and result[-1][0] - result[-2][0] <= 10.0:
            result = result[:-2] + [result[-1]]
        else:
            break
    return result


def format_as_segments(msa_output):
    return [
        {
            "start": str(round(msa_output[idx][0], 2)),
            "end": str(round(msa_output[idx + 1][0], 2)),
            "label": msa_output[idx][1],
        }
        for idx in range(len(msa_output) - 1)
    ]


def format_as_msa(msa_output):
    return "\n".join(f"{time:.2f} {label}" for time, label in msa_output)


def format_as_json(segments):
    return json.dumps(segments, indent=2, ensure_ascii=False)


def segment_audio_file(file_path: str) -> dict[str, Any]:
    msa_output = process_audio(file_path)
    cleaned_output = rule_post_processing(msa_output)
    segments = format_as_segments(cleaned_output)
    return {
        "segments": segments,
        "model": "songformer",
        "device": str(device) if device is not None else "unknown",
    }


def resolve_local_audio_path(audio_source: str) -> Path | None:
    direct_path = Path(audio_source).expanduser()
    if direct_path.exists():
        return direct_path.resolve()

    if audio_source.startswith("/audio/"):
        candidate = Path(os.getenv("SONGFORMER_AUDIO_DIR", str(DEFAULT_AUDIO_DIR))) / Path(audio_source).name
        if candidate.exists():
            return candidate.resolve()

    return None


def download_audio_to_tempfile(audio_url: str) -> str:
    suffix = Path(urlparse(audio_url).path).suffix or ".mp3"
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = temp_file.name
    temp_file.close()

    response = requests.get(audio_url, stream=True, timeout=DEFAULT_DOWNLOAD_TIMEOUT)
    try:
        response.raise_for_status()
        with open(temp_path, "wb") as output_file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    output_file.write(chunk)
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise
    finally:
        response.close()

    return temp_path


def segment_audio_source(audio_source: str) -> dict[str, Any]:
    cached_result = get_cached_segmentation_result(audio_source)
    if cached_result is not None:
        logger.info("SongFormer result cache hit for audio source")
        return cached_result

    total_start = time.perf_counter()
    local_path = resolve_local_audio_path(audio_source)
    if local_path is not None:
        result = segment_audio_file(str(local_path))
        cache_segmentation_result(audio_source, result)
        logger.info("SongFormer local-source request completed in %.2fs", time.perf_counter() - total_start)
        return result

    if not audio_source.startswith(("http://", "https://")):
        raise ValueError("audioUrl must be an http(s) URL, an existing file path, or a /audio/... path")

    download_start = time.perf_counter()
    temp_path = download_audio_to_tempfile(audio_source)
    logger.info("Downloaded remote audio source in %.2fs", time.perf_counter() - download_start)
    try:
        result = segment_audio_file(temp_path)
        cache_segmentation_result(audio_source, result)
        logger.info("SongFormer remote-source request completed in %.2fs", time.perf_counter() - total_start)
        return result
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def save_uploaded_audio() -> str:
    if "file" not in request.files:
        raise ValueError("file upload is required when audioUrl is not provided")

    uploaded_file = request.files["file"]
    if uploaded_file.filename is None or uploaded_file.filename == "":
        raise ValueError("uploaded file must have a filename")

    suffix = Path(uploaded_file.filename).suffix or ".mp3"
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = temp_file.name
    temp_file.close()
    uploaded_file.save(temp_path)
    return temp_path


def patch_async_job_callback(callback_url: str, payload: dict[str, Any]) -> None:
    last_error: Exception | None = None

    for attempt in range(DEFAULT_CALLBACK_RETRY_COUNT):
        try:
            response = requests.patch(
                callback_url,
                json=payload,
                timeout=DEFAULT_CALLBACK_TIMEOUT,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc if isinstance(exc, Exception) else Exception(str(exc))
            if attempt < DEFAULT_CALLBACK_RETRY_COUNT - 1:
                time.sleep(min(2 ** attempt, 5))

    raise RuntimeError(f"Failed to PATCH async callback after {DEFAULT_CALLBACK_RETRY_COUNT} attempts") from last_error


def create_app() -> Flask:
    flask_app = Flask(__name__)
    flask_app.config["MAX_CONTENT_LENGTH"] = DEFAULT_MAX_UPLOAD_BYTES
    CORS(flask_app)

    @flask_app.get("/")
    def root():
        return jsonify({
            "name": "SongFormer API",
            "status": "ok",
            "endpoints": ["GET /api/songformer/health", "GET /api/songformer/info", "POST /api/songformer/segment"],
        })

    @flask_app.get("/api/songformer/health")
    def songformer_health():
        warmup = request.args.get("warmup", "false").lower() in {"1", "true", "yes"}
        if warmup:
            ensure_models_initialized()

        runtime_info = get_runtime_info()
        models_loaded = all(model is not None for model in (muq_model, musicfm_model, msa_model))
        return jsonify({
            "status": "ok",
            "modelsLoaded": models_loaded,
            "device": runtime_info["selectedDevice"],
            "environment": runtime_info["environment"],
            "devicePolicy": runtime_info["devicePolicy"],
            "cudaAvailable": runtime_info["cudaAvailable"],
            "mpsAvailable": runtime_info["mpsAvailable"],
            "resultCacheEntries": len(segmentation_result_cache),
        })

    @flask_app.get("/api/songformer/info")
    def songformer_info():
        runtime_info = get_runtime_info()
        return jsonify({
            "name": "SongFormer backend",
            "available": True,
            "description": "Standalone SongFormer structural segmentation API for Cloud Run deployment.",
            "endpoint": "/api/songformer/segment",
            "runtime": runtime_info,
            "expects": {
                "json": {"audioUrl": "https://... or /audio/... or local file path"},
                "asyncJob": {"jobId": "string", "updateToken": "string", "callbackUrl": "https://...", "songContext": "Song context object"},
                "multipart": {"file": "audio binary"},
            },
        })

    @flask_app.post("/api/songformer/segment")
    def segment_songformer():
        temp_upload_path: str | None = None
        try:
            payload = request.get_json(silent=True) if request.is_json else None
            audio_url = payload.get("audioUrl") if isinstance(payload, dict) else None
            async_job = payload.get("asyncJob") if isinstance(payload, dict) else None
            job_id = async_job.get("jobId") if isinstance(async_job, dict) else None
            update_token = async_job.get("updateToken") if isinstance(async_job, dict) else None
            callback_url = async_job.get("callbackUrl") if isinstance(async_job, dict) else None
            song_context = async_job.get("songContext") if isinstance(async_job, dict) else None

            if async_job is not None:
                if not isinstance(audio_url, str) or not audio_url.strip():
                    raise ValueError("audioUrl is required when asyncJob is provided")
                if not isinstance(job_id, str) or not job_id.strip():
                    raise ValueError("asyncJob.jobId is required")
                if not isinstance(update_token, str) or not update_token.strip():
                    raise ValueError("asyncJob.updateToken is required")
                if not isinstance(callback_url, str) or not callback_url.strip():
                    raise ValueError("asyncJob.callbackUrl is required")
                if not isinstance(song_context, dict):
                    raise ValueError("asyncJob.songContext is required")

                patch_async_job_callback(callback_url.strip(), {
                    "updateToken": update_token.strip(),
                    "status": "processing",
                })

            if isinstance(audio_url, str) and audio_url.strip():
                logger.info("Processing SongFormer request from audioUrl source")
                result = segment_audio_source(audio_url.strip())
            else:
                temp_upload_path = save_uploaded_audio()
                logger.info("Processing SongFormer request from uploaded file")
                result = segment_audio_file(temp_upload_path)

            logger.info("SongFormer segmentation completed with %s segments", len(result.get("segments", [])))

            if async_job is not None:
                patch_async_job_callback(callback_url.strip(), {
                    "updateToken": update_token.strip(),
                    "status": "completed",
                    "rawSegments": result.get("segments", []),
                    "songContext": song_context,
                    "model": result.get("model", "songformer"),
                })

            return jsonify({"success": True, "data": result})

        except FileNotFoundError as exc:
            return jsonify({"success": False, "error": str(exc)}), 404
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except requests.RequestException as exc:
            if request.is_json:
                payload = request.get_json(silent=True) or {}
                async_job = payload.get("asyncJob") if isinstance(payload, dict) else None
                if isinstance(async_job, dict) and isinstance(async_job.get("callbackUrl"), str) and isinstance(async_job.get("updateToken"), str):
                    try:
                        patch_async_job_callback(async_job["callbackUrl"].strip(), {
                            "updateToken": async_job["updateToken"].strip(),
                            "status": "failed",
                            "error": f"Failed to download audio source: {exc}",
                        })
                    except Exception:
                        logger.exception("Failed to report async SongFormer download error")
            return jsonify({"success": False, "error": f"Failed to download audio source: {exc}"}), 502
        except Exception as exc:
            if request.is_json:
                payload = request.get_json(silent=True) or {}
                async_job = payload.get("asyncJob") if isinstance(payload, dict) else None
                if isinstance(async_job, dict) and isinstance(async_job.get("callbackUrl"), str) and isinstance(async_job.get("updateToken"), str):
                    try:
                        patch_async_job_callback(async_job["callbackUrl"].strip(), {
                            "updateToken": async_job["updateToken"].strip(),
                            "status": "failed",
                            "error": str(exc),
                        })
                    except Exception:
                        logger.exception("Failed to report async SongFormer failure")
            logger.exception("SongFormer segmentation failed")
            return jsonify({"success": False, "error": str(exc)}), 500
        finally:
            if temp_upload_path:
                try:
                    os.unlink(temp_upload_path)
                except OSError:
                    pass

    return flask_app


app = create_app()


if __name__ == "__main__":
    if os.getenv("SONGFORMER_PRELOAD", "false").lower() in {"1", "true", "yes"}:
        ensure_models_initialized()

    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)