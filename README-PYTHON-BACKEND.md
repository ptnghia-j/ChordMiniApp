# ChordMini Python Backend - Complete Deployment Guide

This document provides comprehensive information about the ChordMini Python backend, including all requirements, package dependencies, compatibility fixes, and deployment procedures for production-ready audio analysis services.

## Overview

The ChordMini backend is a Flask-based microservice that provides advanced audio analysis capabilities including:
- **Beat Detection**: Beat-Transformer and madmom models with time signature detection
- **Chord Recognition**: Multiple models (Chord-CNN-LSTM, BTC SL/PL) with 301+ chord labels
- **Lyrics Processing**: Genius API integration for lyrics fetching
- **Audio Processing**: FFmpeg-based audio extraction and preprocessing

## Production Deployment Status

### ✅ Current Production Service
- **URL**: `https://chordmini-backend-full-191567167632.us-central1.run.app/`
- **Platform**: Google Cloud Run
- **Status**: ✅ Healthy and operational
- **Features**: All models loaded and functional
- **Architecture**: Unified service with all capabilities

## System Requirements

### Python Version Compatibility
- **Recommended**: Python 3.9 (tested and verified)
- **Supported**: Python 3.8, 3.9, 3.10
- **Not Recommended**: Python 3.11+ (compatibility issues with some ML libraries)

### System Dependencies
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    python3-dev \
    python3-pip \
    build-essential \
    libsndfile1 \
    ffmpeg \
    git

# macOS (with Homebrew)
brew install python@3.9 ffmpeg libsndfile

# Alpine Linux (for Docker)
apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    build-base \
    ffmpeg \
    libsndfile-dev \
    git
```

## Package Dependencies & Compatibility Fixes

### Core ML Libraries
```txt
# TensorFlow (CPU optimized for deployment)
tensorflow-cpu==2.13.1

# PyTorch (with CPU support)
torch==1.13.1
torchaudio==0.13.1

# Librosa (audio processing)
librosa==0.10.1
soundfile==0.12.1

# NumPy (pinned for compatibility)
numpy==1.22.4
```

### Beat Detection Models
```txt
# Spleeter (audio separation for Beat-Transformer)
spleeter==2.3.2

# madmom (alternative beat detection)
madmom==0.16.1

# Required for madmom compilation
Cython<3.0
```

### Compatibility Fixes Applied

#### 1. Spleeter Dependency Issues
**Problem**: Spleeter has complex dependency conflicts with NumPy/Numba/Llvmlite
**Solution**: Pinned exact versions that work together
```txt
numpy==1.22.4
numba==0.56.4
llvmlite==0.39.1
spleeter==2.3.2
```

#### 2. Click Version Compatibility
**Problem**: Spleeter requires click<8.1, but newer versions cause conflicts
**Solution**: Pin click to working version
```txt
click==7.1.2
```

#### 3. Cython Build Requirements
**Problem**: madmom requires Cython to be installed before setup
**Solution**: Install Cython first in requirements order
```txt
Cython<3.0
madmom==0.16.1
```

#### 4. NumPy Metadata Generation
**Problem**: madmom needs numpy available during package metadata generation
**Solution**: Install numpy before madmom in dependency chain
```txt
numpy==1.22.4
scipy==1.9.3
madmom==0.16.1
```

#### 5. SciPy Compatibility Patch
**Problem**: SciPy 1.10+ removed deprecated functions used by beat-transformer
**Solution**: Applied scipy_patch.py to maintain compatibility
```python
# scipy_patch.py
import scipy.signal
if not hasattr(scipy.signal, 'hamming'):
    scipy.signal.hamming = scipy.signal.windows.hamming
```

## Complete Requirements File

### requirements.txt (Production-Ready)
```txt
# Core Dependencies (install first)
Cython<3.0
numpy==1.22.4
scipy==1.9.3

# Web Framework
Flask==2.3.3
Flask-CORS==4.0.0
gunicorn==21.2.0

# Audio Processing
librosa==0.10.1
soundfile==0.12.1
ffmpeg-python==0.2.0

# Machine Learning - TensorFlow
tensorflow-cpu==2.13.1
protobuf==3.20.3

# Machine Learning - PyTorch
torch==1.13.1
torchaudio==0.13.1

# Beat Detection Models
spleeter==2.3.2
madmom==0.16.1

# Chord Recognition
transformers==4.21.3
datasets==2.14.5

# Compatibility Fixes
click==7.1.2
numba==0.56.4
llvmlite==0.39.1
resampy==0.4.2

# Utilities
requests==2.31.0
python-dotenv==1.0.0
Pillow==10.0.1
```

## Deployment Configurations

### Docker Configuration (Dockerfile)
```dockerfile
FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1-dev \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Apply compatibility patches
RUN python scipy_patch.py

# Expose port
EXPOSE 5000

# Run application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "600", "--workers", "1", "app:app"]
```

### Google Cloud Run Configuration
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/chordmini-backend', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/chordmini-backend']
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'chordmini-backend-full'
      - '--image'
      - 'gcr.io/$PROJECT_ID/chordmini-backend'
      - '--region'
      - 'us-central1'
      - '--memory'
      - '16Gi'
      - '--cpu'
      - '4'
      - '--timeout'
      - '600'
      - '--max-instances'
      - '5'
      - '--allow-unauthenticated'
```

## API Endpoints

### Health Check
**Endpoint:** `GET /`
**Response:**
```json
{
  "beat_model": "Beat-Transformer",
  "chord_model": "Chord-CNN-LSTM",
  "genius_available": true,
  "message": "Audio analysis API is running",
  "status": "healthy"
}
```

### Model Information
**Endpoint:** `GET /api/model-info`
**Response:**
```json
{
  "available_beat_models": ["beat-transformer", "madmom"],
  "available_chord_models": ["chord-cnn-lstm", "btc-sl", "btc-pl"],
  "beat_transformer_available": true,
  "chord_cnn_lstm_available": true,
  "success": true
}
```

### Beat Detection
**Endpoint:** `POST /api/detect-beats`
**Parameters:**
- `file`: Audio file (multipart form)
- `model`: "beat-transformer" or "madmom" (optional)

**Response:**
```json
{
  "success": true,
  "beats": [0.5, 1.0, 1.5, 2.0],
  "beat_info": [
    {"time": 0.5, "strength": 0.8},
    {"time": 1.0, "strength": 0.9}
  ],
  "downbeats": [0.5, 2.5],
  "BPM": 120,
  "duration": 3.0,
  "time_signature": 4
}
```

### Chord Recognition
**Endpoint:** `POST /api/recognize-chords`
**Parameters:**
- `file`: Audio file (multipart form)

**Response:**
```json
{
  "success": true,
  "chords": [
    {"chord": "C", "time": 0.0, "confidence": 0.95},
    {"chord": "Am", "time": 2.0, "confidence": 0.87}
  ],
  "model_used": "chord-cnn-lstm"
}
```

### Lyrics Processing
**Endpoint:** `POST /api/genius-lyrics`
**Parameters:**
```json
{
  "artist": "Artist Name",
  "title": "Song Title"
}
```

**Response:**
```json
{
  "success": true,
  "artist": "Artist Name",
  "title": "Song Title",
  "lyrics": "Song lyrics here...",
  "url": "https://genius.com/..."
}
```

## Installation & Setup Guide

### Local Development Setup
```bash
# 1. Clone repository and navigate to backend
cd python_backend

# 2. Create virtual environment (Python 3.9 recommended)
python3.9 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Upgrade pip and install build tools
pip install --upgrade pip setuptools wheel

# 4. Install Cython first (required for madmom)
pip install "Cython<3.0"

# 5. Install core dependencies in order
pip install numpy==1.22.4
pip install scipy==1.9.3

# 6. Install all requirements
pip install -r requirements.txt

# 7. Apply compatibility patches
python scipy_patch.py

# 8. Start development server
python app.py
```

### Production Deployment Steps
```bash
# 1. Build Docker image
docker build -t chordmini-backend .

# 2. Test locally
docker run -p 5000:5000 chordmini-backend

# 3. Deploy to Google Cloud Run
gcloud run deploy chordmini-backend-full \
  --image gcr.io/PROJECT_ID/chordmini-backend \
  --region us-central1 \
  --memory 16Gi \
  --cpu 4 \
  --timeout 600 \
  --max-instances 5 \
  --allow-unauthenticated
```

## Troubleshooting Guide

### Common Installation Issues

#### 1. Cython Build Errors
**Error**: `ModuleNotFoundError: No module named 'Cython'`
**Solution**:
```bash
pip install "Cython<3.0"
pip install --no-cache-dir madmom==0.16.1
```

#### 2. NumPy Version Conflicts
**Error**: `numpy.dtype size changed` or similar
**Solution**:
```bash
pip uninstall numpy
pip install numpy==1.22.4 --no-cache-dir
```

#### 3. Spleeter Installation Issues
**Error**: `ERROR: Failed building wheel for spleeter`
**Solution**:
```bash
# Install exact compatible versions
pip install numpy==1.22.4 numba==0.56.4 llvmlite==0.39.1
pip install spleeter==2.3.2
```

#### 4. TensorFlow Compatibility
**Error**: `ImportError: cannot import name 'gfile' from 'tensorflow.python.platform'`
**Solution**:
```bash
pip install tensorflow-cpu==2.13.1
pip install protobuf==3.20.3
```

#### 5. Audio Processing Errors
**Error**: `soundfile.LibsndfileError: Error opening`
**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get install libsndfile1-dev

# macOS
brew install libsndfile

# Alpine
apk add libsndfile-dev
```

### Runtime Issues

#### 1. Memory Errors
**Error**: `MemoryError` during model loading
**Solution**: Increase memory allocation (minimum 8GB for full models)

#### 2. Timeout Issues
**Error**: Request timeouts during processing
**Solution**: Increase timeout settings (recommended: 600 seconds)

#### 3. Model Loading Failures
**Error**: `FileNotFoundError` for model files
**Solution**: Ensure all model files are properly included in deployment

### Performance Optimization

#### 1. Model Caching
```python
# Enable model caching to reduce load times
import os
os.environ['TRANSFORMERS_CACHE'] = '/tmp/transformers_cache'
```

#### 2. Memory Management
```python
# Clear GPU memory after processing (if using GPU)
import torch
if torch.cuda.is_available():
    torch.cuda.empty_cache()
```

#### 3. Concurrent Processing
```bash
# Use multiple workers for production
gunicorn --workers 2 --timeout 600 --bind 0.0.0.0:5000 app:app
```

## Environment Variables

### Required Variables
```bash
# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=False

# API Keys (optional)
GENIUS_API_KEY=your_genius_api_key_here

# Model Configuration
DEFAULT_BEAT_MODEL=beat-transformer
DEFAULT_CHORD_MODEL=chord-cnn-lstm

# Performance Settings
MAX_CONTENT_LENGTH=104857600  # 100MB
UPLOAD_TIMEOUT=600
```

### Optional Variables
```bash
# Logging
LOG_LEVEL=INFO
LOG_FILE=/var/log/chordmini.log

# CORS Settings
CORS_ORIGINS=https://your-frontend-domain.com

# Cache Settings
ENABLE_MODEL_CACHE=true
CACHE_DIR=/tmp/model_cache
```

## Security Considerations

### Production Security
- Use HTTPS in production
- Implement rate limiting
- Validate all file uploads
- Set appropriate CORS headers
- Use environment variables for sensitive data

### File Upload Security
```python
# Validate file types and sizes
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.flac', '.m4a'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
```

## Monitoring & Logging

### Health Check Endpoint
```bash
# Monitor service health
curl -f https://your-backend-url.com/ || exit 1
```

### Logging Configuration
```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### Performance Metrics
- Response time monitoring
- Memory usage tracking
- Error rate monitoring
- Model loading time tracking

---

**Last Updated**: December 2024
**Production Status**: ✅ Deployed and operational
**Compatibility**: Python 3.9, Google Cloud Run
**Version**: v0.1.0 Production Ready