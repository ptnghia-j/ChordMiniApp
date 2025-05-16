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

The server will start on http://localhost:5000 by default.

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

## Notes

- The server uses madmom's RNNBeatProcessor for accurate beat detection
- Maximum file size is configured to 50MB
- CORS is enabled for all routes to allow cross-origin requests from the frontend
- For production deployment, consider using gunicorn or uwsgi 