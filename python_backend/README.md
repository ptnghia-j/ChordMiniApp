# Python Backend for Chord Recognition App

This is a Flask-based Python backend API for the Chord Recognition App that handles audio processing, specifically beat detection using the madmom library.

## Setup

1. Make sure you have Python 3.8+ installed
2. Run the setup script to create a virtual environment and install dependencies:

```bash
cd python_backend
./setup.sh
```

## Starting the Server

After setup, activate the virtual environment and start the server:

```bash
cd python_backend
source venv/bin/activate
python app.py
```

The server will start on http://localhost:5001 by default (changed from 5000 to avoid macOS AirTunes/AirPlay conflicts).

## API Endpoints

### GET /

Health check endpoint that returns a status message.

### POST /api/detect-beats

Detects beats in an audio file.

**Input Options:**
- Send an audio file with the key `file` in a multipart form
- OR send a path to an existing file on the server with the key `audio_path` in form data

**Response:**
```json
{
  "success": true,
  "beats": [0.12, 0.84, 1.56, 2.28, ...],  // Beat timestamps in seconds
  "bpm": 120.5,                           // Beats per minute
  "total_beats": 48,                      // Total number of beats detected
  "duration": 30.45                       // Audio duration in seconds
}
```

## Rate Limiting

The API implements production-grade rate limiting to ensure fair usage and system stability:

### Heavy Processing Endpoints (2 requests per minute)
- `POST /api/detect-beats` - Beat detection using madmom or Beat-Transformer
- `POST /api/recognize-chords` - Chord recognition using Chord-CNN-LSTM
- `POST /api/recognize-chords-btc-sl` - BTC Supervised Learning chord recognition
- `POST /api/recognize-chords-btc-pl` - BTC Pseudo-Label chord recognition
- `POST /api/detect-beats-firebase` - Beat detection from Firebase Storage URLs
- `POST /api/recognize-chords-firebase` - Chord recognition from Firebase Storage URLs

### Moderate Processing Endpoints (10 requests per minute)
- `POST /api/genius-lyrics` - Genius.com lyrics fetching
- `POST /api/lrclib-lyrics` - LRClib synchronized lyrics fetching
- `POST /api/search-youtube` - YouTube video search
- `GET /api/search-piped` - Piped API video search

### Light Processing Endpoints (20+ requests per minute)
- `GET /api/model-info` - Model availability information (20/min)
- `GET /` - Health check endpoint (30/min)
- `GET /docs` - API documentation (50/min)

### Test Endpoints (3-5 requests per minute)
- Various `/api/test-*` and `/api/debug-*` endpoints for diagnostics

Rate limiting uses Redis in production (via `REDIS_URL` environment variable) and falls back to in-memory storage for development.

## Notes

- The server uses madmom's RNNBeatProcessor for accurate beat detection
- Maximum file size is configured to 50MB
- CORS is enabled for all routes to allow cross-origin requests from the frontend
- For production deployment, consider using gunicorn or uwsgi
- Port 5001 is used by default to avoid conflicts with macOS AirTunes/AirPlay (port 5000)