import os
import json
import subprocess
import re
import time
import logging

# Import compatibility patches FIRST, before any other packages that use numpy
import scipy_patch

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import tempfile
import numpy as np
# import soundfile as sf  # Optional dependency
import traceback
import sys
from pathlib import Path
import requests
import random

# Import the new app factory and utilities
from app_factory import create_app
from utils.logging import log_info, log_error, log_debug
from utils.audio_utils import trim_silence_from_audio
from utils.music_theory_utils import detect_time_signature_from_pattern
from utils.import_utils import lazy_import_librosa
from utils.model_utils import (
    check_spleeter_availability, check_beat_transformer_availability,
    check_chord_cnn_lstm_availability, check_genius_availability,
    check_btc_availability
)

# Configure logging for production (will be overridden by app_factory)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set production mode based on environment
PRODUCTION_MODE = os.environ.get('FLASK_ENV', 'production') == 'production' or os.environ.get('PORT') is not None
# import aiotube  # Removed - not needed for cloud deployment
# import quicktube  # Removed - QuickTube is a Ruby web app, not a Python package

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    log_info("Loaded environment variables from .env file")
except ImportError:
    log_info("python-dotenv not available, using system environment variables only")

# Audio processing utilities moved to utils/audio_utils.py

# Music theory utilities moved to utils/music_theory_utils.py

# Defer heavy imports until needed
# Import utilities moved to utils/import_utils.py

# Add the model directories to the Python path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "models" / "Beat-Transformer"
CHORD_CNN_LSTM_DIR = Path(__file__).parent / "models" / "Chord-CNN-LSTM"
AUDIO_DIR = Path(__file__).parent.parent / "public" / "audio"
log_info(f"Audio directory path: {AUDIO_DIR}")
sys.path.insert(0, str(BEAT_TRANSFORMER_DIR))
sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))

# Import the unified beat transformer implementation
try:
    from models.beat_transformer import BeatTransformerDetector, run_beat_tracking_wrapper
    log_info("Using unified beat_transformer implementation")

    # Create a simple wrapper function for the detect_beats endpoint
    def run_beat_tracking(audio_file):
        detector = BeatTransformerDetector()
        return detector.detect_beats(audio_file)

except ImportError as e:
    log_error(f"Warning: beat_transformer not found: {e}, beat tracking will be disabled")
    def run_beat_tracking(audio_file):
        return {"beats": [], "downbeats": [], "bpm": 120.0, "time_signature": 4}
    run_beat_tracking_wrapper = None

# Create Flask app using the application factory
app = create_app()

# Get the limiter from extensions for use in route decorators
from extensions import limiter

# Fix for Python 3.10+ compatibility with madmom
# MUST come before any madmom imports
try:
    import collections
    import collections.abc
    collections.MutableSequence = collections.abc.MutableSequence
    log_info("Applied collections.MutableSequence patch for madmom compatibility")
except Exception as e:
    log_error(f"Failed to apply madmom compatibility patch: {e}")

# Fix for NumPy 1.20+ compatibility
# These attributes are deprecated in newer NumPy versions
try:
    import numpy as np
    np.float = float  # Use built-in float instead
    np.int = int      # Use built-in int instead
    log_info("Applied NumPy compatibility fixes for np.float and np.int")
except Exception as e:
    log_info(f"Note: NumPy compatibility patch not needed: {e}")

# Defer all heavy checks to runtime - just assume everything is available for startup
SPLEETER_AVAILABLE = True  # Will check at runtime
USE_BEAT_TRANSFORMER = True  # Will check at runtime
USE_CHORD_CNN_LSTM = True  # Will check at runtime
GENIUS_AVAILABLE = True  # Will check at runtime

log_info("Deferred model availability checks to runtime for faster startup")

# Runtime model availability checks
# Model availability check functions moved to utils/model_utils.py

# Root route moved to health blueprint

# Debug endpoints moved to debug blueprint

# Health route moved to health blueprint

# Beat detection route moved to beats blueprint


# Chord recognition route moved to chords blueprint

# BTC chord recognition functions moved to chords blueprint

# BTC chord recognition function moved to chords blueprint

# BTC chord recognition routes moved to chords blueprint

# Check if BTC models are available
# BTC availability check function moved to utils/model_utils.py

# Global BTC availability check
BTC_AVAILABILITY = check_btc_availability()
USE_BTC_SL = BTC_AVAILABILITY['sl_available']
USE_BTC_PL = BTC_AVAILABILITY['pl_available']

# Model info route moved to beats blueprint

# Lyrics routes moved to lyrics blueprint

# Documentation routes moved to docs blueprint

# BTC debug endpoints moved to debug blueprint

# BTC import test endpoints moved to debug blueprint

# Beat detection test routes moved to beats blueprint

# Test madmom route moved to beats blueprint

# Chord-CNN-LSTM test endpoints moved to debug blueprint

# All remaining debug and test endpoints moved to debug blueprint

# Test DBN isolation route moved to beats blueprint

# Test all models route moved to beats blueprint

# YouTube search routes moved to youtube blueprint


# Audio extraction routes moved to audio blueprint

# Detect beats Firebase route moved to beats blueprint

# Firebase chord recognition route moved to chords blueprint


if __name__ == '__main__':
    # Get port from environment variable or default to 5001 for localhost to avoid macOS AirTunes/AirPlay conflicts
    # Production deployments (Cloud Run) will override this with PORT environment variable
    port = int(os.environ.get('PORT', 5001))
    log_info(f"Starting Flask app on port {port}")
    log_info("App is ready to serve requests")
    app.run(host='0.0.0.0', port=port, debug=False)  # Disable debug for production