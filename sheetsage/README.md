# SheetSage Backend

Standalone Flask API for Sheet Sage melody transcription.

## Endpoints

- `GET /health`
- `GET /info`
- `POST /transcribe`

`POST /transcribe` accepts multipart `file` uploads and returns `noteEvents` in the app format:

```json
{
  "success": true,
  "data": {
    "source": "sheetsage",
    "noteEvents": [
      { "onset": 0.0, "offset": 0.5, "pitch": 60, "velocity": 100 }
    ],
    "noteEventCount": 1,
    "beatTimes": [0.0, 0.5, 1.0],
    "beatsPerMeasure": 4,
    "tempoBpm": 120
  }
}
```

## Local Docker

From `sheetsage/`:

```bash
docker build --platform=linux/amd64 -t sheetsage-backend:local .
docker run --rm --platform=linux/amd64 -p 8082:8082 sheetsage-backend:local
```

Smoke test:

```bash
curl http://127.0.0.1:8082/health?warmup=true
```

The Docker image bundles only the melody-only assets used by the current runtime:

- `oafmelspec_moments.npy`
- `7d82e6839e582936ea428a823a0d868075a52dc5.cfg.json`
- `model.pt`

## Cloud Run

This service is intended to ship the same way as `SongFormer`: build the container locally or in Cloud Build, push the image to Artifact Registry, then deploy that image to Cloud Run.

```bash
PROJECT_ID=your-gcp-project
REGION=us-central1
REPO=cloud-run-source-deploy
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/sheetsage-backend:latest"

gcloud builds submit . --tag "$IMAGE"
gcloud run deploy sheetsage \
  --image "$IMAGE" \
  --region "$REGION" \
  --cpu 6 \
  --memory 4Gi \
  --timeout 900 \
  --concurrency 1
```

## Frontend env

Set these on the Next.js server deployment:

```bash
LOCAL_SHEETSAGE_API_URL=http://localhost:8082
SHEETSAGE_API_URL=https://your-sheetsage-cloud-run-url
SHEETSAGE_BACKEND_TIMEOUT_MS=600000
```

## Notes

- Docker is the supported runtime.
- The current service uses the non-Jukebox handcrafted melody transformer path only.
- Upstream Sheet Sage code is MIT, while upstream model/data assets remain subject to their original licensing terms.
