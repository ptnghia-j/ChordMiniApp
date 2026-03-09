# SongFormer Backend

Standalone Flask API for SongFormer structural segmentation, intended for local development or deployment to Google Cloud Run.

## Endpoints

- `GET /healthz` — health check; add `?warmup=true` to preload models
- `GET /api/songformer/info` — service metadata
- `POST /api/songformer/segment` — run segmentation

## Request formats

### JSON

`POST /api/songformer/segment`

```json
{
  "audioUrl": "https://.../audio.mp3"
}
```

### Multipart upload

Send a `file` field containing the audio binary.

## Local setup

1. Use **Python 3.10.x** and create/activate a virtual environment.
   - The standalone SongFormer service is currently validated on Python 3.10.
   - Python 3.12+ is not supported for this backend.
2. Install dependencies:

```bash
python --version
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

3. Ensure the SongFormer checkpoints/configs expected by `app.py` are present.
4. Optional environment variables:

```bash
export PORT=8080
export SONGFORMER_PRELOAD=true
export SONGFORMER_MODEL_NAME=SongFormer
export SONGFORMER_CHECKPOINT=SongFormer.safetensors
export SONGFORMER_CONFIG=SongFormer.yaml
export SONGFORMER_AUDIO_DIR=/absolute/path/to/audio
# Optional overrides:
# export SONGFORMER_DEVICE=cpu
# export SONGFORMER_DEVICE=cuda
# export SONGFORMER_DEVICE=mps
# export SONGFORMER_ENABLE_EXPERIMENTAL_MPS=1
```

5. Start the server:

```bash
python app.py
```

For production-style serving:

```bash
gunicorn --bind 0.0.0.0:${PORT:-8080} app:app
```

## Frontend integration

The ChordMini frontend should **not** call this backend directly from the browser.

- Frontend browser calls: `POST /api/segmentation`
- Next.js server route calls this SongFormer backend using a **server-only** environment variable:

```bash
SONGFORMER_API_URL=https://your-songformer-cloud-run-url
```

If `SONGFORMER_API_URL` is not set, the frontend server route falls back to `PYTHON_API_URL`.

## Required frontend server env vars

Set these in the Next.js deployment environment, not as `NEXT_PUBLIC_*` vars:

```bash
PYTHON_API_URL=https://your-main-python-backend
SONGFORMER_API_URL=https://your-songformer-cloud-run-url
```

## Cloud Run notes

- Container must listen on `PORT`
- Cold starts can be noticeable because SongFormer loads multiple audio models
- Prefer CPU with generous memory for testing; use GPU only if your deployment path supports it and you need lower latency

## Docker

Build locally:

```bash
docker build -t songformer-backend:local ./SongFormer
```

Run locally:

```bash
docker run --rm -p 8080:8080 songformer-backend:local
```

Smoke test:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/api/songformer/info
```

Example Google Container Registry tag for the current GCP project:

```bash
docker tag songformer-backend:local gcr.io/chordmini-d29f9/songformer-backend:latest
docker push gcr.io/chordmini-d29f9/songformer-backend:latest
```

## Operational expectations

- Heavier than `madmom`
- Typically heavier than `chord-cnn-lstm`
- Best suited for asynchronous/occasional segmentation workloads rather than high-QPS interactive inference

## Apple Silicon / MPS note

- SongFormer can use CUDA on compatible NVIDIA systems.
- On Apple Silicon, PyTorch MPS support is still incomplete for parts of this model stack.
- Because SongFormer hits unsupported ops like FFT on MPS, the backend now defaults to **CPU** on MPS machines unless you explicitly opt in.
- To try experimental MPS anyway, set:

```bash
export SONGFORMER_ENABLE_EXPERIMENTAL_MPS=1
```

- When MPS is enabled, the backend also enables:

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

This can prevent crashes, but it may still be slower than pure CPU for this workload.