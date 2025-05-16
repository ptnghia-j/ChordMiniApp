# Python Backend for Beat Detection

This project includes a Python Flask backend that provides audio processing capabilities, specifically beat detection using librosa. This backend is separate from the Next.js frontend and runs as a microservice.

## Setup and Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Node.js and npm (for the Next.js frontend)

### Setup Steps

1. **Set up the Python environment**

   Navigate to the python_backend directory and run the setup script:

   ```bash
   cd python_backend
   ./setup.sh
   ```

   This script will:
   - Create a virtual environment
   - Install all required dependencies
   - Prepare the application for running

2. **Start the Python server**

   ```bash
   cd python_backend
   source venv/bin/activate  # Activate the virtual environment
   python app.py
   ```

   The server will start on http://localhost:5000 by default.

3. **Configure the Next.js frontend**

   The frontend is already configured to communicate with the Python backend at http://localhost:5000. If your backend is running at a different address, update the configuration in:

   ```
   src/config/env.ts
   ```

## API Endpoints

### Beat Detection

**Endpoint:** `POST /api/detect-beats`

Detects beats in an audio file using librosa's beat tracking capabilities.

**Request:**
- Upload an audio file in the `file` field of a multipart form
- OR provide a path to an audio file on the server in the `audio_path` field

**Response:**
```json
{
  "success": true,
  "beats": [0.12, 0.84, 1.56, 2.28, ...],  // Beat timestamps in seconds
  "beat_info": [
    { "time": 0.12, "strength": 0.75 },
    { "time": 0.84, "strength": 0.82 },
    ...
  ],
  "bpm": 120.5,                           // Beats per minute
  "total_beats": 48,                      // Total number of beats detected
  "duration": 30.45                       // Audio duration in seconds
}
```

## How It Works

1. **Audio File Processing**
   - Audio files are received either by uploading directly or by providing a path
   - Temporary files are used for uploads and cleaned up after processing
   - librosa is used to load the audio data

2. **Beat Detection**
   - librosa's beat tracker (`beat_track`) is used to identify beat positions
   - Beat timestamps are returned in seconds
   - Beat strength is calculated from the onset envelope

3. **Integration with Next.js**
   - The frontend communicates with this API to get beat information
   - Beats are synchronized with detected chords in the UI

## Troubleshooting

- If you encounter import errors, ensure you've activated the virtual environment
- If the server fails to start, check that port 5000 isn't already in use
- For permission issues, ensure you have execute permissions on the setup script (`chmod +x setup.sh`)

## Advanced Configuration

For production deployment, consider:
- Using gunicorn for better performance
- Setting up HTTPS
- Using environment variables for configuration 