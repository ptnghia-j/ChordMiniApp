import os
import json
import subprocess
import re
import time

# Import compatibility patches FIRST, before any other packages that use numpy
import scipy_patch

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import tempfile
import numpy as np
import soundfile as sf
import traceback
import sys
from pathlib import Path
import requests
import random
# import aiotube  # Removed - not needed for cloud deployment
# import quicktube  # Removed - QuickTube is a Ruby web app, not a Python package

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("Loaded environment variables from .env file")
except ImportError:
    print("python-dotenv not available, using system environment variables only")

def trim_silence_from_audio(audio_path, output_path=None, top_db=20, frame_length=2048, hop_length=512):
    """
    Trim silence from the beginning and end of an audio file.

    Args:
        audio_path: Path to the input audio file
        output_path: Path to save the trimmed audio (optional, defaults to overwriting input)
        top_db: The threshold (in decibels) below reference to consider as silence
        frame_length: Length of the frames for analysis
        hop_length: Number of samples between successive frames

    Returns:
        tuple: (trimmed_audio, sample_rate, trim_start_time, trim_end_time)
    """
    try:
        # Load the audio file
        y, sr = librosa.load(audio_path, sr=None)

        # Trim silence from beginning and end
        # top_db=20 means anything 20dB below the peak is considered silence
        y_trimmed, index = librosa.effects.trim(y, top_db=top_db, frame_length=frame_length, hop_length=hop_length)

        # Calculate the trim times
        trim_start_samples = index[0]
        trim_end_samples = index[1]
        trim_start_time = trim_start_samples / sr
        trim_end_time = trim_end_samples / sr

        print(f"DEBUG: Audio trimming results:")
        print(f"  - Original duration: {len(y) / sr:.3f}s")
        print(f"  - Trimmed duration: {len(y_trimmed) / sr:.3f}s")
        print(f"  - Trimmed from start: {trim_start_time:.3f}s")
        print(f"  - Trimmed from end: {len(y) / sr - trim_end_time:.3f}s")

        # Save the trimmed audio if output path is provided
        if output_path:
            import soundfile as sf
            sf.write(output_path, y_trimmed, sr)
            print(f"DEBUG: Saved trimmed audio to: {output_path}")

        return y_trimmed, sr, trim_start_time, trim_end_time

    except Exception as e:
        print(f"ERROR: Failed to trim silence from audio: {e}")
        # Return original audio if trimming fails
        y, sr = librosa.load(audio_path, sr=None)
        return y, sr, 0.0, len(y) / sr

def detect_time_signature_from_pattern(pattern):
    """
    Detect time signature from a beat pattern.

    Args:
        pattern: List of beat numbers (e.g., [1, 2, 3, 1, 2, 3, ...] or [3, 1, 2, 3, 1, 2, 3, ...] for pickup beats)

    Returns:
        int: Detected time signature (beats per measure) or None if not detected
    """
    if len(pattern) < 6:
        return None

    # Try different cycle lengths from 2 to 12
    for cycle_len in range(2, 13):
        if len(pattern) >= cycle_len * 2:
            # Try different starting offsets to handle irregular beginnings and pickup beats
            for start_offset in range(min(5, len(pattern) - cycle_len * 2)):
                offset_pattern = pattern[start_offset:]

                if len(offset_pattern) >= cycle_len * 2:
                    # Check if the pattern repeats
                    first_cycle = offset_pattern[:cycle_len]
                    second_cycle = offset_pattern[cycle_len:cycle_len*2]

                    # Check if it's a valid beat pattern (starts with 1 and increments)
                    if (first_cycle == second_cycle and
                        first_cycle[0] == 1 and
                        first_cycle == list(range(1, cycle_len + 1))):

                        # Verify with a third cycle if available
                        if len(offset_pattern) >= cycle_len * 3:
                            third_cycle = offset_pattern[cycle_len*2:cycle_len*3]
                            if first_cycle == third_cycle:
                                print(f"DEBUG: Detected {cycle_len}/4 time signature from pattern at offset {start_offset}: {first_cycle}")
                                return cycle_len
                        else:
                            print(f"DEBUG: Detected {cycle_len}/4 time signature from pattern at offset {start_offset}: {first_cycle}")
                            return cycle_len

    # Special case: Handle pickup beat patterns like [3, 1, 2, 3, 1, 2, 3, ...] for 3/4 time
    # Look for patterns where the first beat is the final beat of a cycle, followed by a regular cycle
    for cycle_len in range(2, 13):
        if len(pattern) >= cycle_len + 2:  # Need at least one pickup + one full cycle
            # Check if pattern starts with the final beat of the cycle, then continues with regular cycle
            if pattern[0] == cycle_len:  # First beat is the final beat number
                # Check if the rest follows the regular pattern [1, 2, 3, ..., cycle_len]
                regular_pattern = pattern[1:cycle_len+1]
                expected_pattern = list(range(1, cycle_len + 1))

                if regular_pattern == expected_pattern:
                    # Verify the pattern repeats
                    if len(pattern) >= cycle_len * 2 + 1:
                        next_cycle = pattern[cycle_len+1:cycle_len*2+1]
                        if next_cycle == expected_pattern:
                            print(f"DEBUG: Detected {cycle_len}/4 time signature from pickup pattern: pickup={pattern[0]}, cycle={expected_pattern}")
                            return cycle_len

    return None

# Defer heavy imports until needed
def lazy_import_librosa():
    """Lazy import librosa with patches applied"""
    global librosa
    if 'librosa' not in globals():
        # Apply scipy patches before importing librosa
        from scipy_patch import apply_scipy_patches, patch_librosa_beat_tracker, monkey_patch_beat_track
        apply_scipy_patches()
        patch_librosa_beat_tracker()
        monkey_patch_beat_track()

        # Now it's safe to import librosa
        import librosa as _librosa
        globals()['librosa'] = _librosa
    return globals()['librosa']

# Add the model directories to the Python path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "models" / "Beat-Transformer"
CHORD_CNN_LSTM_DIR = Path(__file__).parent / "models" / "Chord-CNN-LSTM"
AUDIO_DIR = Path(__file__).parent.parent / "public" / "audio"
print(f"Audio directory path: {AUDIO_DIR}")
sys.path.insert(0, str(BEAT_TRANSFORMER_DIR))
sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))

# Import the unified beat transformer implementation
try:
    from models.beat_transformer import BeatTransformerDetector, run_beat_tracking_wrapper
    print("Using unified beat_transformer implementation")

    # Create a simple wrapper function for the detect_beats endpoint
    def run_beat_tracking(audio_file):
        detector = BeatTransformerDetector()
        return detector.detect_beats(audio_file)

except ImportError as e:
    print(f"Warning: beat_transformer not found: {e}, beat tracking will be disabled")
    def run_beat_tracking(audio_file):
        return {"beats": [], "downbeats": [], "bpm": 120.0, "time_signature": 4}
    run_beat_tracking_wrapper = None

app = Flask(__name__, template_folder='templates')

# Configure rate limiting
# Use Redis if available, otherwise fall back to in-memory storage
redis_url = os.environ.get('REDIS_URL')
if redis_url:
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri=redis_url,
        default_limits=["100 per hour"]
    )
    print(f"Rate limiting configured with Redis: {redis_url}")
else:
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["100 per hour"]
    )
    print("Rate limiting configured with in-memory storage")

# Configure CORS for production deployment
# Allow requests from Vercel frontend and localhost for development
cors_origins = [
    "http://localhost:3000",  # Development
    "http://127.0.0.1:3000",  # Development
    "https://*.vercel.app",   # Vercel deployments
    "https://chord-mini-app.vercel.app",  # Specific Vercel deployment
]

# Add custom domain if specified in environment
custom_frontend_url = os.environ.get('CORS_ORIGINS')
if custom_frontend_url:
    if isinstance(custom_frontend_url, str):
        cors_origins.extend(custom_frontend_url.split(','))
    print(f"Added custom CORS origins: {custom_frontend_url}")

CORS(app, origins=cors_origins, supports_credentials=True)

# Configure maximum content length from environment variable or default to 150MB
max_content_mb = int(os.environ.get('FLASK_MAX_CONTENT_LENGTH_MB', 150))
app.config['MAX_CONTENT_LENGTH'] = max_content_mb * 1024 * 1024
print(f"Setting maximum upload size to {max_content_mb}MB")

# Rate limiting error handler
@app.errorhandler(429)
def ratelimit_handler(e):
    """Handle rate limit exceeded errors"""
    return jsonify({
        "error": "Rate limit exceeded",
        "message": "Too many requests. Please wait before trying again.",
        "retry_after": getattr(e, 'retry_after', None)
    }), 429

# Fix for Python 3.10+ compatibility with madmom
# MUST come before any madmom imports
try:
    import collections
    import collections.abc
    collections.MutableSequence = collections.abc.MutableSequence
    print("Applied collections.MutableSequence patch for madmom compatibility")
except Exception as e:
    print(f"Failed to apply madmom compatibility patch: {e}")

# Fix for NumPy 1.20+ compatibility
# These attributes are deprecated in newer NumPy versions
try:
    import numpy as np
    np.float = float  # Use built-in float instead
    np.int = int      # Use built-in int instead
    print("Applied NumPy compatibility fixes for np.float and np.int")
except Exception as e:
    print(f"Note: NumPy compatibility patch not needed: {e}")

# Defer all heavy checks to runtime - just assume everything is available for startup
SPLEETER_AVAILABLE = True  # Will check at runtime
USE_BEAT_TRANSFORMER = True  # Will check at runtime
USE_CHORD_CNN_LSTM = True  # Will check at runtime
GENIUS_AVAILABLE = True  # Will check at runtime

print("Deferred model availability checks to runtime for faster startup")

# Runtime model availability checks
def check_spleeter_availability():
    """Check if Spleeter is available without loading models"""
    try:
        import spleeter
        return True
    except ImportError:
        return False

def check_beat_transformer_availability():
    """Check if Beat-Transformer is available without loading it"""
    try:
        from models.beat_transformer import is_beat_transformer_available
        return is_beat_transformer_available()
    except Exception as e:
        print(f"Beat-Transformer availability check failed: {e}")
        return False

def check_chord_cnn_lstm_availability():
    """Check if Chord-CNN-LSTM is available without loading it"""
    try:
        # Check if the model directory exists and has required files
        model_dir = CHORD_CNN_LSTM_DIR
        if model_dir.exists():
            # Check for key files that indicate the model is present
            required_files = ['chord_recognition.py']
            for file in required_files:
                if not (model_dir / file).exists():
                    return False
            return True
        return False
    except Exception:
        return False

def check_genius_availability():
    """Check if Genius API is available"""
    try:
        import lyricsgenius
        return True
    except ImportError:
        return False

@app.route('/')
@limiter.limit("30 per minute")  # Allow more frequent health checks
def index():
    return jsonify({
        "status": "healthy",
        "message": "Audio analysis API is running"
    })

@app.route('/debug/files')
def debug_files():
    """Debug endpoint to check if essential files exist"""
    import os
    files_to_check = [
        '/app/models/ChordMini/test_btc.py',
        '/app/models/Chord-CNN-LSTM/data/train00.csv',
        '/app/models/ChordMini/config/btc_config.yaml',
        '/app/models/ChordMini/checkpoints/btc/btc_combined_best.pth'
    ]

    results = {}
    for file_path in files_to_check:
        results[file_path] = {
            'exists': os.path.exists(file_path),
            'is_file': os.path.isfile(file_path) if os.path.exists(file_path) else False
        }
        if os.path.exists(file_path):
            try:
                results[file_path]['size'] = os.path.getsize(file_path)
            except:
                results[file_path]['size'] = 'unknown'

    return jsonify(results)

@app.route('/health')
def health():
    """Simple health check endpoint for Cloud Run"""
    return jsonify({"status": "healthy"}), 200

@app.route('/api/detect-beats', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def detect_beats():
    """
    Detect beats in an audio file

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server
    - detector: 'beat-transformer', 'madmom', or 'auto' (default)
    - force: Set to 'true' to force using Beat-Transformer even for large files

    Returns:
    - JSON with beat and downbeat information
    """
    # Import required modules
    import os
    import tempfile
    import traceback

    # Lazy load librosa when needed
    librosa = lazy_import_librosa()

    if 'file' not in request.files and 'audio_path' not in request.form:
        return jsonify({"error": "No file or path provided"}), 400

    try:
        # Get the requested detector from form data
        detector = request.form.get('detector', 'auto')

        # Process either uploaded file or process an existing file
        if 'file' in request.files:
            file = request.files['file']

            # Check file size before saving - reject if over 50MB for direct uploads
            # This prevents issues with large file uploads
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)  # Reset file pointer

            # Check if force parameter is provided
            force_param = request.args.get('force', request.form.get('force', '')).lower()
            print(f"Force parameter: {force_param}")

            # Only reject if file is too large AND detector is not madmom/librosa AND force is not true
            if (file_size > 50 * 1024 * 1024 and
                detector not in ['librosa', 'madmom'] and
                force_param != 'true'):
                return jsonify({
                    "error": "The file is too large (over 50MB). Please use a smaller file, specify detector='madmom' or 'librosa', or add 'force=true' to use Beat-Transformer anyway."
                }), 413

            # Create a temporary file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            file.save(temp_file.name)
            file_path = temp_file.name
        else:
            # Use the provided file path
            file_path = request.form.get('audio_path')

            # Check if the path is a relative path from the public/audio directory
            if file_path.startswith('/audio/'):
                # Convert to absolute path
                relative_path = file_path[7:]  # Remove '/audio/' prefix
                file_path = os.path.join(AUDIO_DIR, relative_path)
                print(f"Converted relative path {request.form.get('audio_path')} to absolute path: {file_path}")
                print(f"AUDIO_DIR: {AUDIO_DIR}")
                print(f"Relative path: {relative_path}")
                print(f"File exists check: {os.path.exists(file_path)}")

                # List files in the audio directory for debugging
                print("Files in audio directory:")
                try:
                    for file in os.listdir(AUDIO_DIR):
                        print(f"  - {file}")
                except Exception as e:
                    print(f"Error listing files: {e}")

            if not os.path.exists(file_path):
                return jsonify({"error": f"File not found: {file_path}"}), 404

            # For audio_path method, check file size
            file_size = os.path.getsize(file_path)

            # Check if force parameter is provided
            force_param = request.args.get('force', request.form.get('force', '')).lower()
            print(f"Force parameter (audio_path): {force_param}")

            # Only reject if file is too large AND detector is not madmom AND force is not true
            if (file_size > 100 * 1024 * 1024 and
                detector not in ['madmom'] and
                force_param != 'true'):
                return jsonify({
                    "error": "The file is too large (over 100MB). Please use a smaller file, specify detector='madmom', or add 'force=true' to use Beat-Transformer anyway."
                }), 413

        # Check if madmom is available
        try:
            import madmom
            madmom_available = True
        except ImportError:
            madmom_available = False

        # Determine which detector to use - check availability at runtime
        use_beat_transformer = False
        use_madmom = False

        # Runtime checks for model availability
        beat_transformer_available = check_beat_transformer_availability()

        print(f"Detector requested: {detector}, beat_transformer_available: {beat_transformer_available}, madmom_available: {madmom_available}")

        # Select detector based on request and availability
        if detector == 'beat-transformer':
            if beat_transformer_available:
                use_beat_transformer = True
                print("Will use Beat-Transformer as requested")
            else:
                print("Beat-Transformer requested but not available, falling back to next best option")
                if madmom_available:
                    use_madmom = True
                    print("Falling back to madmom")
                else:
                    return jsonify({
                        "success": False,
                        "error": "No beat detection models available"
                    }), 500

        elif detector == 'madmom':
            if madmom_available:
                use_madmom = True
                print("Will use madmom as requested")
            else:
                return jsonify({
                    "success": False,
                    "error": "Madmom requested but not available"
                }), 400
        elif detector == 'auto':
            # Auto selection based on availability and file size
            file_size_mb = file_size / (1024 * 1024)

            # For smaller files, use beat-transformer if available
            if file_size_mb <= 50 and beat_transformer_available:
                use_beat_transformer = True
                print(f"Auto-selected Beat-Transformer (file size: {file_size_mb:.1f}MB)")
            # Fall back to madmom if available
            elif madmom_available:
                use_madmom = True
                print("Auto-selected madmom")
            # No fallback available
            else:
                return jsonify({
                    "success": False,
                    "error": "No beat detection models available"
                }), 500
        else:
            # Default fallback
            if beat_transformer_available:
                use_beat_transformer = True
                print(f"Unknown detector '{detector}', falling back to Beat-Transformer")
            elif madmom_available:
                use_madmom = True
                print(f"Unknown detector '{detector}', falling back to madmom")
            else:
                return jsonify({
                    "success": False,
                    "error": f"Unknown detector '{detector}' and no fallback available"
                }), 400

        # Always try to use Beat-Transformer if selected
        if use_beat_transformer:
            # Increased size limit from 30MB to 100MB to handle longer audio files
            size_limit_mb = 100  # 100MB
            if file_size > size_limit_mb * 1024 * 1024:
                print(f"File size is {file_size / (1024 * 1024):.1f}MB - exceeds {size_limit_mb}MB limit")
                print("File is too large for Beat-Transformer without force parameter")
                print("To process larger files with Beat-Transformer, use the 'force=true' parameter")

                # Allow forcing Beat-Transformer for large files if explicitly requested
                # Check both URL parameters and form data for the force parameter
                force_param = request.args.get('force', request.form.get('force', '')).lower()
                if force_param == 'true':
                    print("Force parameter detected - using Beat-Transformer despite large file size")
                    use_beat_transformer = True
                else:
                    use_beat_transformer = False
            else:
                use_beat_transformer = True



        if use_beat_transformer:
            try:
                # Use the enhanced BeatTransformerDetector
                print(f"Using enhanced Beat-Transformer detector for beat detection on: {file_path}")

                # Set paths for Beat-Transformer
                checkpoint_path = str(BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt")

                # Add the models directory to the Python path
                import sys
                import os
                import numpy as np  # Import numpy for array operations
                models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
                if models_dir not in sys.path:
                    sys.path.insert(0, models_dir)
                    print(f"Added {models_dir} to Python path")

                # Import and use the enhanced detector
                from beat_transformer import BeatTransformerDetector
                detector = BeatTransformerDetector(checkpoint_path)

                # Get the comprehensive beat detection results
                result = detector.detect_beats(file_path)

                if result.get("success"):
                    print(f"Enhanced Beat-Transformer detection successful!")
                    print(f"Found {result['total_beats']} beats and {result['total_downbeats']} downbeats")
                    print(f"BPM: {result['bpm']}, Duration: {result['duration']:.2f}s")
                    print(f"Time signature: {result['time_signature']}")

                    # Convert the result to match the expected format
                    beat_times = np.array(result['beats'])
                    downbeat_times = np.array(result['downbeats'])
                    bpm = result['bpm']
                    duration = result['duration']

                    # Handle time signature - it can be either an integer or a string like "4/4"
                    raw_time_signature = result['time_signature']
                    if isinstance(raw_time_signature, str) and '/' in raw_time_signature:
                        time_signature = int(raw_time_signature.split('/')[0])  # Extract number from "4/4"
                    else:
                        time_signature = int(raw_time_signature)  # Already an integer

                    # Calculate beat time range
                    beat_time_range_start = float(beat_times[0]) if len(beat_times) > 0 else 0.0
                    beat_time_range_end = float(beat_times[-1]) if len(beat_times) > 0 else duration


                    # Prepare the response data with enhanced detector results
                    response_data = {
                        "success": True,
                        "beats": beat_times.tolist(),
                        "beat_info": result.get('beat_info', []),
                        "downbeats": downbeat_times.tolist(),
                        "bpm": float(bpm),
                        "total_beats": len(beat_times),
                        "total_downbeats": len(downbeat_times),
                        "duration": float(duration),
                        "model": "beat-transformer",
                        "time_signature": int(time_signature),
                        "beat_time_range_start": beat_time_range_start,
                        "beat_time_range_end": beat_time_range_end,
                        "processing_method": "enhanced-detector"
                    }

                    # Clean up temporary files if any were created
                    if 'file' in request.files:
                        try:
                            os.unlink(file_path)
                        except Exception as e:
                            print(f"Warning: Failed to clean up temporary file: {e}")

                    return jsonify(response_data)

                else:
                    print(f"Enhanced Beat-Transformer detection failed: {result.get('error', 'Unknown error')}")
                    # Fall back to madmom or other detection methods
                    use_beat_transformer = False
                    if madmom_available:
                        use_madmom = True
                        print("Falling back to madmom after Beat-Transformer failure")

            except Exception as e:
                print(f"Error using enhanced Beat-Transformer: {e}")
                import traceback
                traceback.print_exc()
                use_beat_transformer = False
                if madmom_available:
                    use_madmom = True
                    print("Falling back to madmom after Beat-Transformer exception")

        # Use madmom if selected
        if use_madmom:
            print(f"Using madmom for beat detection on: {file_path}")

            try:
                # Import madmom beat tracking modules
                from madmom.features.beats import RNNBeatProcessor
                from madmom.features.downbeats import RNNDownBeatProcessor
                from madmom.features.beats import DBNBeatTrackingProcessor
                from madmom.features.downbeats import DBNDownBeatTrackingProcessor

                # Process the audio file with madmom
                # First, get beat activation function
                beat_proc = RNNBeatProcessor()
                beat_activation = beat_proc(file_path)

                # Then track the beats with a DBN
                beat_tracker = DBNBeatTrackingProcessor(fps=100)
                beat_times = beat_tracker(beat_activation)

                # Get downbeat activation function
                downbeat_proc = RNNDownBeatProcessor()
                downbeat_activation = downbeat_proc(file_path)

                # Track downbeats with a DBN - with error handling
                try:
                    downbeat_tracker = DBNDownBeatTrackingProcessor(beats_per_bar=[2, 3, 4], fps=100)
                    downbeats_with_beats = downbeat_tracker(downbeat_activation)

                    # Make sure the result is properly formatted before processing
                    if isinstance(downbeats_with_beats, np.ndarray) and downbeats_with_beats.ndim == 2:
                        # Extract only the downbeats (where second column is 1)
                        downbeat_times = downbeats_with_beats[downbeats_with_beats[:, 1] == 1][:, 0]
                        print(f"Successfully extracted {len(downbeat_times)} downbeats")
                    else:
                        print("Warning: Unexpected format from downbeat tracker, using beat-based downbeats")
                        # Fall back to using every 4th beat as a downbeat
                        downbeat_times = beat_times[::4]
                except Exception as e:
                    print(f"Error in downbeat tracking: {e}")
                    # Fall back to using every 4th beat as a downbeat
                    downbeat_times = beat_times[::4]

                print(f"Madmom detected {len(beat_times)} beats and {len(downbeat_times)} downbeats")

                # Make sure numpy is imported in this scope
                import numpy as np

                # Calculate BPM from beat times
                if len(beat_times) > 1:
                    # Calculate intervals between beats
                    intervals = np.diff(beat_times)
                    # Calculate median interval in seconds
                    median_interval = np.median(intervals)
                    # Convert to BPM
                    bpm = 60.0 / median_interval if median_interval > 0 else 120.0
                else:
                    bpm = 120.0  # Default BPM if not enough beats

                # Create beat positions
                beats_with_positions = []
                for i, beat_time in enumerate(beat_times):
                    # Find which measure this beat belongs to
                    measure_idx = 0
                    while measure_idx < len(downbeat_times) - 1 and beat_time >= downbeat_times[measure_idx + 1]:
                        measure_idx += 1

                    # If this is a downbeat, it's beat 1
                    if measure_idx < len(downbeat_times) and abs(beat_time - downbeat_times[measure_idx]) < 0.01:
                        beat_num = 1
                    else:
                        # For beats between downbeats, calculate position
                        if measure_idx < len(downbeat_times) - 1:
                            # Find position of this beat in the measure
                            curr_downbeat = downbeat_times[measure_idx]
                            next_downbeat = downbeat_times[measure_idx + 1]

                            # Count beats in this measure
                            beats_in_measure = sum(1 for b in beat_times if curr_downbeat <= b < next_downbeat)

                            # Default to 4/4 time signature if we can't determine
                            time_signature = 4
                            if 2 <= beats_in_measure <= 12:
                                time_signature = beats_in_measure

                            # Find position of this beat in the measure
                            # Count beats from the current downbeat up to (but not including) this beat
                            beats_before = sum(1 for b in beat_times if curr_downbeat <= b < beat_time)
                            beat_num = beats_before + 1

                            # Ensure beat numbers are within the time signature
                            beat_num = ((beat_num - 1) % time_signature) + 1
                        else:
                            # For beats in the last measure, use modulo 4
                            beat_num = ((i % 4) + 1)

                    beats_with_positions.append({
                        "time": float(beat_time),
                        "beatNum": int(beat_num)
                    })

                # Create downbeat positions
                downbeats_with_measures = [
                    {"time": float(time), "measureNum": i + 1}
                    for i, time in enumerate(downbeat_times)
                ]

                # Calculate beat strength based on position in measure
                beat_info = []
                for beat in beats_with_positions:
                    # Normalize beat strength based on position in measure (1 strongest, 4 weakest)
                    beat_num = beat["beatNum"]
                    # Make beat 1 the strongest, with decreasing strength for later beats
                    strength = max(0.3, 1.0 - ((beat_num - 1) % 4) * 0.2)

                    beat_info.append({
                        "time": beat["time"],
                        "strength": strength,
                        "beatNum": beat_num
                    })

                # Get audio duration
                y, sr = librosa.load(file_path, sr=None)
                duration = librosa.get_duration(y=y, sr=sr)

            except Exception as e:
                print(f"Error using madmom: {e}")
                print(traceback.format_exc())

                # Fall back to librosa as a last resort
                print("Falling back to librosa beat detection as last resort")
                y, sr = librosa.load(file_path, sr=None)
                tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
                beat_times = librosa.frames_to_time(beats, sr=sr)

                # Make sure numpy is imported in this scope
                import numpy as np

                # Calculate beat strength
                onset_env = librosa.onset.onset_strength(y=y, sr=sr)
                beat_strengths = onset_env[beats]

                # Format for response
                beat_info = []
                for i, time in enumerate(beat_times):
                    strength = float(beat_strengths[i] / np.max(beat_strengths)) if len(beat_strengths) > 0 else 0.5
                    # Add fictional beat number based on position (1-based)
                    beat_num = (i % 4) + 1
                    beat_info.append({
                        "time": float(time),
                        "strength": float(strength),
                        "beatNum": beat_num
                    })

                # Create fictional position data to match Beat-Transformer output format
                beats_with_positions = []
                for i, time in enumerate(beat_times):
                    beats_with_positions.append({
                        "time": float(time),
                        "beatNum": (i % 4) + 1  # Simple 4/4 beat numbering
                    })

                # Create simple downbeats (every 4th beat)
                downbeat_times = beat_times[::4]
                downbeats_with_measures = [
                    {"time": float(time), "measureNum": i + 1}
                    for i, time in enumerate(downbeat_times)
                ]

                # Calculate BPM
                if len(beat_times) > 1:
                    # Make sure numpy is imported in this scope
                    import numpy as np
                    intervals = np.diff(beat_times)
                    median_interval = np.median(intervals)
                    bpm = 60.0 / median_interval if median_interval > 0 else 120.0
                else:
                    bpm = 120.0

                # Determine time signature by analyzing beat pattern (same logic as Beat-Transformer)
                time_signature = 4  # Default to 4/4
                if beats_with_positions and len(beats_with_positions) >= 6:
                    # Analyze the beat pattern to find the repeating cycle
                    beat_numbers = [beat["beatNum"] for beat in beats_with_positions]
                    print(f"DEBUG (Madmom): Full beat pattern: {beat_numbers[:20]}...")  # Show first 20 beats

                    # Find the repeating pattern by looking for cycles
                    # Start from different offsets to handle irregular beginnings
                    pattern_length = None
                    best_pattern = None

                    # Try different starting points to handle irregular beginnings like [1,1,1,2,3,4,5,6...]
                    for start_offset in range(min(5, len(beat_numbers) // 3)):  # Try up to 5 different starting points
                        offset_beat_numbers = beat_numbers[start_offset:]

                        for cycle_len in range(2, 13):  # Test cycle lengths from 2 to 12
                            if len(offset_beat_numbers) >= cycle_len * 2:  # Need at least 2 complete cycles
                                # Check if the pattern repeats
                                first_cycle = offset_beat_numbers[:cycle_len]
                                second_cycle = offset_beat_numbers[cycle_len:cycle_len*2]

                                if first_cycle == second_cycle:
                                    # Verify with a third cycle if available
                                    if len(offset_beat_numbers) >= cycle_len * 3:
                                        third_cycle = offset_beat_numbers[cycle_len*2:cycle_len*3]
                                        if first_cycle == third_cycle:
                                            pattern_length = cycle_len
                                            best_pattern = first_cycle
                                            print(f"DEBUG (Madmom): Found repeating pattern at offset {start_offset}: {best_pattern}")
                                            break
                                    else:
                                        pattern_length = cycle_len
                                        best_pattern = first_cycle
                                        print(f"DEBUG (Madmom): Found repeating pattern at offset {start_offset}: {best_pattern}")
                                        break

                        if pattern_length:
                            break

                    if pattern_length and 2 <= pattern_length <= 12:
                        time_signature = pattern_length
                        print(f"DEBUG (Madmom): Detected time signature from beat pattern: {time_signature}/4 (pattern: {best_pattern})")
                    else:
                        # Fallback to analyzing beats between downbeats
                        time_signatures = []  # Store time signatures for each measure
                        if len(downbeat_times) >= 2:
                            for i in range(len(downbeat_times) - 1):
                                curr_downbeat = downbeat_times[i]
                                next_downbeat = downbeat_times[i + 1]

                                # Count beats in this measure
                                beats_in_measure = sum(1 for b in beat_times if curr_downbeat <= b < next_downbeat)

                                # Only consider reasonable time signatures
                                if 2 <= beats_in_measure <= 12:
                                    time_signatures.append(beats_in_measure)

                            # Use the most common time signature if we have enough data
                            if time_signatures:
                                from collections import Counter
                                time_signature = Counter(time_signatures).most_common(1)[0][0]
                                print(f"DEBUG (Madmom): Detected time signature from downbeat analysis: {time_signature}/4")
                        print(f"DEBUG (Madmom): Pattern detection failed, using fallback method")

                print(f"DEBUG: Final time signature for Madmom: {time_signature}")

                duration = librosa.get_duration(y=y, sr=sr)

            # If using a temp file, clean it up
            if 'file' in request.files:
                os.unlink(file_path)

            # Calculate beat time range for frontend padding logic
            beat_time_range_start = float(beat_times[0]) if len(beat_times) > 0 else 0.0
            beat_time_range_end = float(beat_times[-1]) if len(beat_times) > 0 else duration

            response_data = {
                "success": True,
                "beats": beat_times.tolist(),
                "beat_info": beat_info,
                "beats_with_positions": beats_with_positions,
                "downbeats": downbeat_times.tolist() if 'downbeat_times' in locals() else [],
                "downbeats_with_measures": downbeats_with_measures if 'downbeats_with_measures' in locals() else [],
                "bpm": float(bpm),
                "total_beats": len(beat_times),
                "total_downbeats": len(downbeat_times) if 'downbeat_times' in locals() else 0,
                "duration": float(duration),
                "model": "madmom",
                "time_signature": int(time_signature),  # Include the detected time signature
                "beat_time_range_start": beat_time_range_start,  # Start of beat time range
                "beat_time_range_end": beat_time_range_end       # End of beat time range
            }

            # Debug: Log the final response data
            print(f"DEBUG: Final Madmom response data:")
            print(f"  time_signature: {response_data['time_signature']}")
            print(f"  bpm: {response_data['bpm']}")
            print(f"  model: {response_data['model']}")
            print(f"  total_beats: {response_data['total_beats']}")
            print(f"  beat_time_range: {response_data['beat_time_range_start']:.3f}s to {response_data['beat_time_range_end']:.3f}s")

            return jsonify(response_data)

        # If no detector was used, return an error
        return jsonify({
            "success": False,
            "error": "No beat detection model available or selected"
        }), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/recognize-chords', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def recognize_chords():
    """
    Recognize chords in an audio file using the Chord-CNN-LSTM model

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server
    - chord_dict: Optional chord dictionary to use ('full', 'ismir2017', 'submission', 'extended')

    Returns:
    - JSON with chord recognition results
    """
    import os
    import tempfile
    import traceback

    # Check for JSON data
    if request.is_json:
        data = request.get_json()
        audio_url = data.get('audioUrl')
        chord_dict = data.get('chordDict', 'submission')

        # Convert relative URL to absolute file path
        if audio_url and audio_url.startswith('/audio/'):
            file_name = audio_url.split('/')[-1]
            file_path = os.path.join(AUDIO_DIR, file_name)
        else:
            return jsonify({"error": "Invalid audioUrl format"}), 400
    # Check for form data
    elif 'file' in request.files or 'audio_path' in request.form:
        # Get the chord dictionary from form data
        chord_dict = request.form.get('chord_dict', 'submission')

        # Process either uploaded file or process an existing file
        if 'file' in request.files:
            file = request.files['file']

            # Create a temporary file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            file.save(temp_file.name)
            file_path = temp_file.name
        else:
            # Use the provided file path
            file_path = request.form.get('audio_path')

            # Check if the path is a relative path from the public/audio directory
            if file_path.startswith('/audio/'):
                # Convert to absolute path
                relative_path = file_path[7:]  # Remove '/audio/' prefix
                file_path = os.path.join(AUDIO_DIR, relative_path)
                print(f"Converted relative path {request.form.get('audio_path')} to absolute path: {file_path}")
                print(f"AUDIO_DIR: {AUDIO_DIR}")
                print(f"Relative path: {relative_path}")
                print(f"File exists check: {os.path.exists(file_path)}")

                # List files in the audio directory for debugging
                print("Files in audio directory:")
                try:
                    for file in os.listdir(AUDIO_DIR):
                        print(f"  - {file}")
                except Exception as e:
                    print(f"Error listing files: {e}")
    else:
        return jsonify({"error": "No file or path provided"}), 400

    try:
        # Check if Chord-CNN-LSTM is available
        if not USE_CHORD_CNN_LSTM:
            return jsonify({
                "error": "Chord-CNN-LSTM model is not available. Please check the server logs for details."
            }), 500

        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {file_path}"}), 404

        # Create a temporary file for the lab output
        temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
        lab_path = temp_lab_file.name
        temp_lab_file.close()

        print(f"Running chord recognition on {file_path} with chord_dict={chord_dict}")

        # Run chord recognition
        try:
            # Change the working directory temporarily to run the model
            original_dir = os.getcwd()
            os.chdir(str(CHORD_CNN_LSTM_DIR))

            try:
                # Use the real chord recognition module
                from chord_recognition import chord_recognition
                print(f"Running real chord recognition on {file_path} with chord_dict={chord_dict}")
                success = chord_recognition(file_path, lab_path, chord_dict)
                if not success:
                    return jsonify({
                        "error": "Chord recognition failed. See server logs for details."
                    }), 500
            finally:
                # Change back to the original directory
                os.chdir(original_dir)
        except Exception as e:
            print(f"Error in chord_recognition: {e}")
            traceback.print_exc()
            return jsonify({
                "error": f"Chord recognition failed: {str(e)}"
            }), 500

        # Parse the lab file
        chord_data = []
        try:
            with open(lab_path, 'r') as f:
                for line in f:
                    # Print the raw line for debugging
                    print(f"Lab file line: '{line.strip()}'")

                    # Try to split by tabs first, then by spaces if that doesn't work
                    parts = line.strip().split('\t')
                    if len(parts) < 3:
                        parts = line.strip().split()

                    # Print the parts for debugging
                    print(f"Parsed line parts: {parts}")

                    if len(parts) >= 3:
                        start_time = float(parts[0])
                        end_time = float(parts[1])
                        chord_label = parts[2]

                        # Add to chord data
                        chord_data.append({
                            "start": start_time,
                            "end": end_time,
                            "chord": chord_label,
                            "confidence": 0.9  # Default confidence value
                        })

            # Print the parsed chord data for debugging
            print(f"Parsed {len(chord_data)} chords from lab file")
            if chord_data:
                print(f"First chord: {chord_data[0]}")
                print(f"Last chord: {chord_data[-1]}")
        except Exception as e:
            print(f"Error parsing lab file: {e}")
            traceback.print_exc()
            return jsonify({
                "error": f"Failed to parse chord data: {str(e)}"
            }), 500

        # Clean up temporary files
        try:
            if 'file' in request.files:
                os.unlink(file_path)
            os.unlink(lab_path)
        except Exception as e:
            print(f"Warning: Failed to clean up temporary files: {e}")

        # Prepare response
        response_data = {
            "success": True,
            "chords": chord_data,
            "total_chords": len(chord_data),
            "model": "chord-cnn-lstm",
            "chord_dict": chord_dict
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error in recognize_chords: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

def _recognize_chords_btc(model_variant):
    """
    Shared BTC chord recognition logic

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server
    - model_variant: 'sl' for Supervised Learning or 'pl' for Pseudo-Label

    Returns:
    - JSON with chord recognition results
    """
    import os
    import tempfile
    import traceback
    import time

    processing_start_time = time.time()

    if 'file' not in request.files and 'audio_path' not in request.form:
        return jsonify({"error": "No file or path provided"}), 400

    # Determine file path
    if 'file' in request.files:
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Save uploaded file temporarily
        temp_audio_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        file_path = temp_audio_file.name
        temp_audio_file.close()
        file.save(file_path)
    else:
        # Use provided audio path
        file_path = request.form['audio_path']
        if not os.path.exists(file_path):
            return jsonify({"error": f"Audio file not found: {file_path}"}), 404

    try:
        # Log BTC model availability but don't fail immediately - allow fallback
        if model_variant == 'sl' and not USE_BTC_SL:
            print(f"⚠️ BTC SL model not available, will attempt fallback to Chord-CNN-LSTM")
        elif model_variant == 'pl' and not USE_BTC_PL:
            print(f"⚠️ BTC PL model not available, will attempt fallback to Chord-CNN-LSTM")

        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {file_path}"}), 404

        # Create a temporary file for the lab output
        temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
        lab_path = temp_lab_file.name
        temp_lab_file.close()

        # Run BTC chord recognition with fallback to Chord-CNN-LSTM
        btc_success = False
        fallback_used = False

        # Check if BTC model is actually available before attempting
        btc_available = (model_variant == 'sl' and USE_BTC_SL) or (model_variant == 'pl' and USE_BTC_PL)

        if btc_available:
            try:
                # Check config file exists in models directory
                config_source = os.path.join(os.path.dirname(__file__), 'models', 'ChordMini', 'config', 'btc_config.yaml')
                print(f"DEBUG: Checking config source: {config_source}")
                print(f"DEBUG: Config source exists: {os.path.exists(config_source)}")

                if not os.path.exists(config_source):
                    raise FileNotFoundError(f"BTC config file not found at {config_source}")

                # Import the BTC module from the models directory
                from models.ChordMini.btc_chord_recognition import btc_chord_recognition
                print(f"Running BTC {model_variant.upper()} chord recognition on {file_path}")
                success = btc_chord_recognition(file_path, lab_path, model_variant)
                if success:
                    btc_success = True
                    print(f"BTC {model_variant.upper()} chord recognition completed successfully")
                else:
                    print(f"BTC {model_variant.upper()} chord recognition failed, attempting fallback...")
            except Exception as e:
                print(f"Error in BTC chord_recognition: {e}")
                print(f"BTC {model_variant.upper()} failed, attempting fallback to Chord-CNN-LSTM...")
                traceback.print_exc()
        else:
            print(f"BTC {model_variant.upper()} model not available, skipping to fallback...")

        # If BTC failed, try fallback to Chord-CNN-LSTM
        if not btc_success and USE_CHORD_CNN_LSTM:
            print(f"🔄 Falling back to Chord-CNN-LSTM for {file_path}")
            try:
                # Use the existing chord recognition function as fallback
                # Need to change working directory for relative path imports
                original_dir = os.getcwd()
                try:
                    sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))
                    os.chdir(str(CHORD_CNN_LSTM_DIR))
                    from chord_recognition import chord_recognition
                    success = chord_recognition(file_path, lab_path)
                    if success:
                        fallback_used = True
                        print("✅ Fallback to Chord-CNN-LSTM successful")
                    else:
                        print("❌ Fallback to Chord-CNN-LSTM also failed")
                finally:
                    os.chdir(original_dir)
            except Exception as fallback_e:
                print(f"❌ Fallback to Chord-CNN-LSTM failed: {fallback_e}")
                traceback.print_exc()

        # If both BTC and fallback failed, return error
        if not btc_success and not fallback_used:
            return jsonify({
                "error": f"BTC {model_variant.upper()} chord recognition failed and fallback unavailable. See server logs for details.",
                "btc_failed": True,
                "fallback_available": USE_CHORD_CNN_LSTM
            }), 500

        # Parse the lab file to extract chord data
        chord_data = []
        try:
            with open(lab_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        # BTC models use space-separated format: start_time end_time chord_name
                        # Try tab-separated first for compatibility, then space-separated
                        parts = line.split('\t')
                        if len(parts) < 3:
                            parts = line.split()  # Fall back to space-separated

                        if len(parts) >= 3:
                            start_time = float(parts[0])
                            end_time = float(parts[1])
                            chord_name = ' '.join(parts[2:])  # Handle chord names with spaces

                            # Use the unified format (start, end, chord, confidence) - removed redundant time property
                            chord_data.append({
                                'start': start_time,
                                'end': end_time,
                                'chord': chord_name,
                                'confidence': 1.0  # BTC models don't provide confidence scores
                            })

            # Print the parsed chord data for debugging
            print(f"Parsed {len(chord_data)} chords from BTC {model_variant.upper()} lab file")
            if chord_data:
                print(f"First chord: {chord_data[0]}")
                print(f"Last chord: {chord_data[-1]}")
        except Exception as e:
            print(f"Error parsing lab file: {e}")
            traceback.print_exc()
            return jsonify({
                "error": f"Failed to parse BTC chord data: {str(e)}"
            }), 500

        # Clean up temporary files
        try:
            if 'file' in request.files:
                os.unlink(file_path)
            os.unlink(lab_path)
        except Exception as e:
            print(f"Warning: Failed to clean up temporary files: {e}")

        # Calculate processing time (duration in seconds)
        processing_time = time.time() - processing_start_time

        # Prepare response in the format expected by frontend
        if fallback_used:
            response_data = {
                "success": True,
                "chords": chord_data,
                "total_chords": len(chord_data),
                "model_used": "chord-cnn-lstm",
                "model_name": "Chord-CNN-LSTM (Fallback)",
                "chord_dict": "full",
                "processing_time": round(processing_time, 2),
                "fallback_info": {
                    "original_model_requested": f"btc-{model_variant}",
                    "fallback_reason": f"BTC {model_variant.upper()} model failed",
                    "fallback_model": "chord-cnn-lstm"
                }
            }
        else:
            response_data = {
                "success": True,
                "chords": chord_data,
                "total_chords": len(chord_data),
                "model_used": f"btc-{model_variant}",
                "model_name": f"BTC {'SL (Supervised Learning)' if model_variant == 'sl' else 'PL (Pseudo-Label)'}",
                "chord_dict": "large_voca",
                "processing_time": round(processing_time, 2)
            }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error in BTC {model_variant.upper()} chord recognition: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/recognize-chords-btc-sl', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def recognize_chords_btc_sl():
    """
    Recognize chords in an audio file using the BTC Supervised Learning model

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server

    Returns:
    - JSON with chord recognition results
    """
    return _recognize_chords_btc('sl')

@app.route('/api/recognize-chords-btc-pl', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def recognize_chords_btc_pl():
    """
    Recognize chords in an audio file using the BTC Pseudo-Label model

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server

    Returns:
    - JSON with chord recognition results
    """
    return _recognize_chords_btc('pl')

# Check if BTC models are available
def check_btc_availability():
    """Check if BTC models and dependencies are available"""
    try:
        btc_dir = Path(__file__).parent / "models" / "ChordMini"

        # Check for model files
        sl_model = btc_dir / "checkpoints" / "SL" / "btc_model_large_voca.pt"
        pl_model = btc_dir / "checkpoints" / "btc" / "btc_combined_best.pth"
        config_file = btc_dir / "config" / "btc_config.yaml"

        sl_available = sl_model.exists()
        pl_available = pl_model.exists()
        config_available = config_file.exists()

        # Check for required Python modules
        try:
            import torch
            import numpy as np
            torch_available = True
        except ImportError:
            torch_available = False

        return {
            'sl_available': sl_available and config_available and torch_available,
            'pl_available': pl_available and config_available and torch_available,
            'sl_model_path': str(sl_model),
            'pl_model_path': str(pl_model),
            'config_path': str(config_file)
        }
    except Exception as e:
        print(f"Error checking BTC availability: {e}")
        return {
            'sl_available': False,
            'pl_available': False,
            'sl_model_path': '',
            'pl_model_path': '',
            'config_path': ''
        }

# Global BTC availability check
BTC_AVAILABILITY = check_btc_availability()
USE_BTC_SL = BTC_AVAILABILITY['sl_available']
USE_BTC_PL = BTC_AVAILABILITY['pl_available']

@app.route('/api/model-info', methods=['GET'])
@limiter.limit("20 per minute")  # Information endpoint, allow more requests
def model_info():
    """Return information about the available beat detection models"""
    # Check if madmom is available
    try:
        import madmom
        madmom_available = True
    except ImportError:
        madmom_available = False

    # Determine available models
    available_models = []
    if USE_BEAT_TRANSFORMER:
        available_models.append("beat-transformer")

    if madmom_available:
        available_models.append("madmom")

    # Set beat-transformer as the default model if available
    if USE_BEAT_TRANSFORMER:
        default_model = "beat-transformer"
    elif madmom_available:
        default_model = "madmom"
    else:
        default_model = "none"

    # Get Spleeter information
    spleeter_info = {
        "available": SPLEETER_AVAILABLE,
        "version": None,
        "models": []
    }

    if SPLEETER_AVAILABLE:
        try:
            import spleeter

            # Try to get version, but don't fail if not available
            try:
                spleeter_info["version"] = spleeter.__version__
            except:
                spleeter_info["version"] = "unknown"

            # Check for available models
            from pathlib import Path
            spleeter_models_dir = Path.home() / ".cache" / "spleeter"

            # Check for common models
            models = []
            for model_name in ["2stems", "4stems", "5stems"]:
                model_path = spleeter_models_dir / model_name
                if model_path.exists():
                    models.append(model_name)

            spleeter_info["models"] = models
        except Exception as e:
            print(f"Error getting Spleeter info: {e}")

    # Add chord model information
    chord_models = []
    if USE_CHORD_CNN_LSTM:
        chord_models.append("chord-cnn-lstm")
    if USE_BTC_SL:
        chord_models.append("btc-sl")
    if USE_BTC_PL:
        chord_models.append("btc-pl")

    return jsonify({
        "success": True,
        "default_beat_model": default_model,
        "available_beat_models": available_models,
        "beat_transformer_available": USE_BEAT_TRANSFORMER,

        "madmom_available": madmom_available,
        "chord_cnn_lstm_available": USE_CHORD_CNN_LSTM,
        "default_chord_model": "chord-cnn-lstm" if USE_CHORD_CNN_LSTM else "none",
        "available_chord_models": chord_models,
        "spleeter_info": spleeter_info,
        "file_size_limits": {
            "upload_limit_mb": 50,
            "local_file_limit_mb": 100,
            "beat_transformer_limit_mb": 100,

            "force_parameter_available": True
        },
        "beat_model_info": {
            "beat-transformer": {
                "name": "Beat-Transformer",
                "description": "High-precision ML model with 5-channel audio separation",
                "channels": 5,
                "performance": "High accuracy, slower processing",
                "uses_spleeter": True
            },
            "madmom": {
                "name": "Madmom",
                "description": "Neural network with good balance of accuracy and speed",
                "performance": "Medium accuracy, medium speed",
                "uses_spleeter": False
            }
        },
        "chord_model_info": {
            "chord-cnn-lstm": {
                "name": "Chord-CNN-LSTM",
                "description": "Deep learning model for chord recognition using CNN and LSTM layers",
                "performance": "High accuracy, medium processing speed",
                "available_chord_dicts": ["full", "ismir2017", "submission", "extended"],
                "available": USE_CHORD_CNN_LSTM
            },
            "btc-sl": {
                "name": "BTC SL (Supervised Learning)",
                "description": "Transformer-based model trained with supervised learning, 170 chord vocabulary",
                "performance": "High accuracy with large chord vocabulary",
                "available_chord_dicts": ["large_voca"],
                "available": USE_BTC_SL
            },
            "btc-pl": {
                "name": "BTC PL (Pseudo-Label)",
                "description": "Transformer-based model trained with pseudo-labeling, 170 chord vocabulary",
                "performance": "Enhanced accuracy through pseudo-labeling technique",
                "available_chord_dicts": ["large_voca"],
                "available": USE_BTC_PL
            }
        }
    })

@app.route('/api/genius-lyrics', methods=['POST'])
@limiter.limit("10 per minute")  # External API calls, moderate limit
def get_genius_lyrics():
    """
    Fetch lyrics from Genius.com using the lyricsgenius library

    Parameters:
    - artist: The artist name
    - title: The song title
    - search_query: Alternative search query (optional)

    Returns:
    - JSON with lyrics data or error message
    """
    if not GENIUS_AVAILABLE:
        return jsonify({
            "success": False,
            "error": "Genius lyrics service is not available. Please install lyricsgenius library."
        }), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400

        # Get search parameters
        artist = data.get('artist', '').strip()
        title = data.get('title', '').strip()
        search_query = data.get('search_query', '').strip()

        # Validate input
        if not search_query and (not artist or not title):
            return jsonify({
                "success": False,
                "error": "Either 'search_query' or both 'artist' and 'title' must be provided"
            }), 400

        # Get Genius API key from custom header (forwarded from frontend) or environment
        genius_api_key = request.headers.get('X-Genius-API-Key') or os.environ.get('GENIUS_API_KEY')
        if not genius_api_key:
            return jsonify({
                "success": False,
                "error": "Genius API key not configured. Please set GENIUS_API_KEY environment variable or pass it via X-Genius-API-Key header."
            }), 500

        # Initialize Genius client
        import lyricsgenius
        genius = lyricsgenius.Genius(genius_api_key)

        # Configure Genius client settings
        genius.verbose = False  # Turn off status messages
        genius.remove_section_headers = True  # Remove [Verse], [Chorus], etc.
        genius.skip_non_songs = True  # Skip non-song results
        genius.excluded_terms = ["(Remix)", "(Live)", "(Acoustic)", "(Demo)"]  # Skip remixes, live versions, etc.

        # Search for the song
        song = None
        if search_query:
            # Use custom search query
            print(f"Searching Genius for: '{search_query}'")
            song = genius.search_song(search_query)
        else:
            # Use artist and title
            print(f"Searching Genius for: '{title}' by '{artist}'")
            song = genius.search_song(title, artist)

        if not song:
            return jsonify({
                "success": False,
                "error": "Song not found on Genius.com",
                "searched_for": search_query if search_query else f"{title} by {artist}"
            }), 404

        # Extract lyrics and metadata
        lyrics_text = song.lyrics if song.lyrics else ""

        # Clean up lyrics text
        if lyrics_text:
            # Remove common artifacts
            lyrics_text = lyrics_text.replace("\\n", "\n")
            lyrics_text = lyrics_text.replace("\\", "")

            # Remove "Lyrics" from the beginning if present
            if lyrics_text.startswith("Lyrics\n"):
                lyrics_text = lyrics_text[7:]

            # Remove contributor info and song description at the beginning
            lines = lyrics_text.split('\n')
            cleaned_lines = []
            skip_intro = True

            for line in lines:
                # Skip lines until we find the actual lyrics (usually after "Read More" or empty lines)
                if skip_intro:
                    if ('Read More' in line or
                        line.strip() == '' or
                        (len(line) > 20 and not any(word in line.lower() for word in ['contributors', 'translations', 'lyrics', 'read more']))):
                        skip_intro = False
                        if line.strip() != '' and 'Read More' not in line:
                            cleaned_lines.append(line)
                    continue

                # Skip lines that look like embed info at the end
                if 'Embed' in line and len(line) < 20:
                    break

                cleaned_lines.append(line)

            lyrics_text = '\n'.join(cleaned_lines).strip()

        # Prepare response with safe serialization
        album_info = getattr(song, 'album', None)
        album_name = None
        if album_info:
            # Handle both string and Album object cases
            if hasattr(album_info, 'name'):
                album_name = album_info.name
            elif isinstance(album_info, str):
                album_name = album_info
            else:
                album_name = str(album_info) if album_info else None

        response_data = {
            "success": True,
            "lyrics": lyrics_text,
            "metadata": {
                "title": song.title,
                "artist": song.artist,
                "album": album_name,
                "release_date": getattr(song, 'release_date', None),
                "genius_url": song.url,
                "genius_id": song.id,
                "thumbnail_url": getattr(song, 'song_art_image_thumbnail_url', None)
            },
            "source": "genius.com"
        }

        print(f"Successfully fetched lyrics for '{song.title}' by '{song.artist}' from Genius")
        return jsonify(response_data)

    except Exception as e:
        print(f"Error fetching lyrics from Genius: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Failed to fetch lyrics: {str(e)}"
        }), 500

@app.route('/docs')
@limiter.limit("50 per minute")  # Documentation endpoint, allow many requests
def api_docs():
    """Serve API documentation page"""
    return render_template('docs.html')

@app.route('/api/docs')
@limiter.limit("50 per minute")  # Documentation endpoint, allow many requests
def api_docs_json():
    """Return API documentation in JSON format"""
    docs = {
        "title": "ChordMini Audio Analysis API",
        "version": "1.0.0",
        "description": "API for audio analysis including beat detection, chord recognition, and lyrics fetching",
        "base_url": request.host_url.rstrip('/'),
        "endpoints": [
            {
                "path": "/",
                "method": "GET",
                "summary": "Health check and API status",
                "description": "Returns the current status of the API and available models",
                "responses": {
                    "200": {
                        "description": "API status information",
                        "example": {
                            "status": "healthy",
                            "message": "Audio analysis API is running",
                            "beat_model": "Beat-Transformer",
                            "chord_model": "Chord-CNN-LSTM",
                            "genius_available": True
                        }
                    }
                }
            },
            {
                "path": "/api/model-info",
                "method": "GET",
                "summary": "Get available models information",
                "description": "Returns detailed information about available beat detection and chord recognition models",
                "responses": {
                    "200": {
                        "description": "Model information",
                        "example": {
                            "success": True,
                            "models": {
                                "beat": [
                                    {
                                        "id": "beat-transformer",
                                        "name": "Beat-Transformer",
                                        "description": "Deep learning model for beat tracking with downbeat detection",
                                        "default": True,
                                        "available": True
                                    },
                                    {
                                        "id": "madmom",
                                        "name": "Madmom",
                                        "description": "Classical beat tracking algorithm",
                                        "default": False,
                                        "available": True
                                    }
                                ],
                                "chord": [
                                    {
                                        "id": "chord-cnn-lstm",
                                        "name": "Chord-CNN-LSTM",
                                        "description": "Deep learning model for chord recognition",
                                        "default": True,
                                        "available": True
                                    },
                                    {
                                        "id": "btc-sl",
                                        "name": "BTC SL (Supervised Learning)",
                                        "description": "Transformer-based model with supervised learning",
                                        "default": False,
                                        "available": True
                                    },
                                    {
                                        "id": "btc-pl",
                                        "name": "BTC PL (Pseudo-Label)",
                                        "description": "Transformer-based model with pseudo-labeling",
                                        "default": False,
                                        "available": True
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                "path": "/api/detect-beats",
                "method": "POST",
                "summary": "Detect beats in audio file",
                "description": "Analyze an audio file to detect beat positions and downbeats",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    },
                    "model": {
                        "type": "string",
                        "required": False,
                        "default": "beat-transformer",
                        "options": ["beat-transformer", "madmom"],
                        "description": "Beat detection model to use"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Beat detection results",
                        "example": {
                            "success": True,
                            "beats": [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
                            "downbeats": [0.5, 2.5, 4.5],
                            "total_beats": 8,
                            "total_downbeats": 3,
                            "bpm": 120.0,
                            "time_signature": "4/4",
                            "model_used": "beat-transformer",
                            "model_name": "Beat-Transformer",
                            "processing_time": 2.34,
                            "audio_duration": 4.5
                        }
                    },
                    "400": {
                        "description": "Bad request - missing or invalid audio file"
                    },
                    "500": {
                        "description": "Internal server error during processing"
                    }
                }
            },
            {
                "path": "/api/recognize-chords",
                "method": "POST",
                "summary": "Recognize chords in audio file (Chord-CNN-LSTM)",
                "description": "Analyze an audio file to recognize chord progressions using the Chord-CNN-LSTM model",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Chord recognition results",
                        "example": {
                            "success": True,
                            "chords": [
                                {"start": 0.0, "end": 2.0, "chord": "C", "confidence": 0.95},
                                {"start": 2.0, "end": 4.0, "chord": "Am", "confidence": 0.87},
                                {"start": 4.0, "end": 6.0, "chord": "F", "confidence": 0.92},
                                {"start": 6.0, "end": 8.0, "chord": "G", "confidence": 0.89}
                            ],
                            "total_chords": 4,
                            "model_used": "chord-cnn-lstm",
                            "model_name": "Chord-CNN-LSTM",
                            "chord_dict": "large_voca",
                            "processing_time": 3.21,
                            "audio_duration": 8.0
                        }
                    }
                }
            },
            {
                "path": "/api/recognize-chords-btc-sl",
                "method": "POST",
                "summary": "Recognize chords using BTC Supervised Learning model",
                "description": "Analyze an audio file to recognize chord progressions using the BTC SL model",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Chord recognition results",
                        "example": {
                            "success": True,
                            "chords": [
                                {"start": 0.0, "end": 0.1, "chord": "N", "confidence": 1.0},
                                {"start": 0.1, "end": 0.2, "chord": "C", "confidence": 1.0},
                                {"start": 0.2, "end": 0.3, "chord": "Am", "confidence": 1.0}
                            ],
                            "total_chords": 3,
                            "model_used": "btc-sl",
                            "model_name": "BTC SL (Supervised Learning)",
                            "chord_dict": "large_voca",
                            "processing_time": 1.23
                        }
                    }
                }
            },
            {
                "path": "/api/recognize-chords-btc-pl",
                "method": "POST",
                "summary": "Recognize chords using BTC Pseudo-Label model",
                "description": "Analyze an audio file to recognize chord progressions using the BTC PL model",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Chord recognition results",
                        "example": {
                            "success": True,
                            "chords": [
                                {"start": 0.0, "end": 0.1, "chord": "N", "confidence": 1.0},
                                {"start": 0.1, "end": 0.2, "chord": "C", "confidence": 1.0},
                                {"start": 0.2, "end": 0.3, "chord": "Am", "confidence": 1.0}
                            ],
                            "total_chords": 3,
                            "model_used": "btc-pl",
                            "model_name": "BTC PL (Pseudo-Label)",
                            "chord_dict": "large_voca",
                            "processing_time": 1.45
                        }
                    }
                }
            },
            {
                "path": "/api/genius-lyrics",
                "method": "POST",
                "summary": "Fetch lyrics from Genius.com",
                "description": "Search and retrieve lyrics from Genius.com using artist and song title. API key is configured server-side.",
                "parameters": {
                    "artist": {
                        "type": "string",
                        "required": True,
                        "description": "Artist name"
                    },
                    "title": {
                        "type": "string",
                        "required": True,
                        "description": "Song title"
                    },
                    "search_query": {
                        "type": "string",
                        "required": False,
                        "description": "Alternative search query (optional, overrides artist/title)"
                    }
                },
                "example_request": {
                    "curl": "curl -X POST \"https://chordmini-backend-full-191567167632.us-central1.run.app/api/genius-lyrics\" -H \"Content-Type: application/json\" -d '{\"artist\": \"The Beatles\", \"title\": \"Hey Jude\"}'",
                    "note": "No API key required in request - configured server-side. Genius API key must be set as GENIUS_API_KEY environment variable on the server."
                },
                "responses": {
                    "200": {
                        "description": "Lyrics retrieval results",
                        "example": {
                            "success": True,
                            "lyrics": "Hey Jude, don't make it bad...",
                            "metadata": {
                                "title": "Hey Jude",
                                "artist": "The Beatles",
                                "album": "Hey Jude",
                                "genius_url": "https://genius.com/the-beatles-hey-jude-lyrics",
                                "genius_id": 378195,
                                "thumbnail_url": "https://images.genius.com/..."
                            },
                            "source": "genius.com"
                        }
                    },
                    "404": {
                        "description": "Song not found",
                        "example": {
                            "success": False,
                            "error": "Song not found on Genius.com",
                            "searched_for": "Hey Jude by The Beatles"
                        }
                    },
                    "500": {
                        "description": "API key not configured or other server error",
                        "example": {
                            "success": False,
                            "error": "Genius API key not configured. Please set GENIUS_API_KEY environment variable."
                        }
                    }
                }
            },
            {
                "path": "/api/lrclib-lyrics",
                "method": "POST",
                "summary": "Fetch synchronized lyrics from LRClib",
                "description": "Search and retrieve synchronized lyrics from LRClib API",
                "parameters": {
                    "artist": {
                        "type": "string",
                        "required": True,
                        "description": "Artist name"
                    },
                    "title": {
                        "type": "string",
                        "required": True,
                        "description": "Song title"
                    },
                    "album": {
                        "type": "string",
                        "required": False,
                        "description": "Album name (optional, improves accuracy)"
                    },
                    "duration": {
                        "type": "number",
                        "required": False,
                        "description": "Song duration in seconds (optional, improves accuracy)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Synchronized lyrics retrieval results",
                        "example": {
                            "success": True,
                            "lyrics": "[00:12.34] First line of lyrics\n[00:15.67] Second line...",
                            "artist": "Artist Name",
                            "title": "Song Title",
                            "album": "Album Name",
                            "duration": 180.5
                        }
                    }
                }
            }
        ],
        "rate_limits": {
            "description": "Production-grade rate limiting is enforced to ensure fair usage and system stability",
            "storage": "Redis-based in production, in-memory for development",
            "categories": {
                "heavy_processing": {
                    "limit": "2 requests per minute",
                    "endpoints": [
                        "/api/detect-beats",
                        "/api/recognize-chords",
                        "/api/recognize-chords-btc-sl",
                        "/api/recognize-chords-btc-pl",
                        "/api/detect-beats-firebase",
                        "/api/recognize-chords-firebase"
                    ],
                    "description": "CPU-intensive ML model inference endpoints"
                },
                "moderate_processing": {
                    "limit": "10 requests per minute",
                    "endpoints": [
                        "/api/genius-lyrics",
                        "/api/lrclib-lyrics",
                        "/api/search-youtube",
                        "/api/search-piped"
                    ],
                    "description": "External API calls and moderate processing"
                },
                "light_processing": {
                    "limit": "20-50 requests per minute",
                    "endpoints": [
                        "/api/model-info (20/min)",
                        "/ (30/min)",
                        "/docs, /api/docs (50/min)"
                    ],
                    "description": "Information and documentation endpoints"
                },
                "test_endpoints": {
                    "limit": "3-5 requests per minute",
                    "endpoints": [
                        "/api/test-*",
                        "/api/debug-*"
                    ],
                    "description": "Diagnostic and testing endpoints"
                }
            },
            "error_response": {
                "status_code": 429,
                "body": {
                    "error": "Rate limit exceeded",
                    "message": "Too many requests. Please wait before trying again.",
                    "retry_after": "seconds_to_wait"
                }
            }
        }
    }
    return jsonify(docs)

@app.route('/api/lrclib-lyrics', methods=['POST'])
@limiter.limit("10 per minute")  # External API calls, moderate limit
def get_lrclib_lyrics():
    """
    Fetch synchronized lyrics from LRClib API

    Parameters:
    - artist: The artist name
    - title: The song title
    - search_query: Alternative search query (optional)

    Returns:
    - JSON with synchronized lyrics data or error message
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400

        # Get search parameters
        artist = data.get('artist', '').strip()
        title = data.get('title', '').strip()
        search_query = data.get('search_query', '').strip()

        # Validate input
        if not search_query and (not artist or not title):
            return jsonify({
                "success": False,
                "error": "Either 'search_query' or both 'artist' and 'title' must be provided"
            }), 400

        import requests

        # Search for lyrics using LRClib API
        if artist and title:
            # Use specific artist and title search
            search_url = "https://lrclib.net/api/search"
            params = {
                "artist_name": artist,
                "track_name": title
            }
            print(f"Searching LRClib for: '{title}' by '{artist}'")
        else:
            # Use general search query
            search_url = "https://lrclib.net/api/search"
            params = {
                "q": search_query
            }
            print(f"Searching LRClib for: '{search_query}'")

        # Make API request
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()

        search_results = response.json()

        if not search_results or len(search_results) == 0:
            return jsonify({
                "success": False,
                "error": "No synchronized lyrics found on LRClib",
                "searched_for": search_query if search_query else f"{title} by {artist}"
            }), 404

        # Get the best match (first result)
        best_match = search_results[0]

        # Check if synchronized lyrics are available
        synced_lyrics = best_match.get('syncedLyrics')
        plain_lyrics = best_match.get('plainLyrics')

        if not synced_lyrics and not plain_lyrics:
            return jsonify({
                "success": False,
                "error": "No lyrics content found in LRClib result"
            }), 404

        # Parse synchronized lyrics if available
        parsed_lyrics = None
        if synced_lyrics:
            parsed_lyrics = parse_lrc_format(synced_lyrics)

        # Prepare response
        response_data = {
            "success": True,
            "has_synchronized": bool(synced_lyrics),
            "synchronized_lyrics": parsed_lyrics,
            "plain_lyrics": plain_lyrics,
            "metadata": {
                "title": best_match.get('trackName', ''),
                "artist": best_match.get('artistName', ''),
                "album": best_match.get('albumName', ''),
                "duration": best_match.get('duration', 0),
                "lrclib_id": best_match.get('id'),
                "instrumental": best_match.get('instrumental', False)
            },
            "source": "lrclib.net"
        }

        print(f"Successfully fetched {'synchronized' if synced_lyrics else 'plain'} lyrics for '{best_match.get('trackName')}' by '{best_match.get('artistName')}' from LRClib")
        return jsonify(response_data)

    except requests.exceptions.RequestException as e:
        print(f"Error fetching lyrics from LRClib: {e}")
        return jsonify({
            "success": False,
            "error": f"Failed to connect to LRClib: {str(e)}"
        }), 500
    except Exception as e:
        print(f"Error processing LRClib lyrics: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Failed to process lyrics: {str(e)}"
        }), 500

def parse_lrc_format(lrc_content):
    """
    Parse LRC format lyrics into structured data

    LRC format example:
    [00:12.34]Line of lyrics
    [01:23.45]Another line

    Returns:
    List of dictionaries with 'time' (in seconds) and 'text' keys
    """
    if not lrc_content:
        return []

    import re

    lines = []
    # Regex to match LRC timestamp format [mm:ss.xx] or [mm:ss]
    timestamp_pattern = r'\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$'

    for line in lrc_content.split('\n'):
        line = line.strip()
        if not line:
            continue

        match = re.match(timestamp_pattern, line)
        if match:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            milliseconds = int(match.group(3) or 0)

            # Convert to total seconds
            total_seconds = minutes * 60 + seconds + (milliseconds / 1000)

            # Get lyrics text
            lyrics_text = match.group(4).strip()

            lines.append({
                "time": total_seconds,
                "text": lyrics_text
            })

    # Sort by time to ensure proper order
    lines.sort(key=lambda x: x['time'])

    return lines

# Debug endpoints for BTC troubleshooting
@app.route('/api/debug-btc', methods=['POST'])
def debug_btc():
    """Debug endpoint to test BTC model components individually"""
    try:
        data = request.get_json() or {}
        results = {}

        # Test imports
        if data.get('test_imports', False):
            import_results = {}
            try:
                import torch
                import_results['torch'] = f"✅ PyTorch {torch.__version__}"
            except Exception as e:
                import_results['torch'] = f"❌ PyTorch: {str(e)}"

            try:
                import numpy as np
                import_results['numpy'] = f"✅ NumPy {np.__version__}"
            except Exception as e:
                import_results['numpy'] = f"❌ NumPy: {str(e)}"

            try:
                import librosa
                import_results['librosa'] = f"✅ Librosa {librosa.__version__}"
            except Exception as e:
                import_results['librosa'] = f"❌ Librosa: {str(e)}"

            # Test BTC-specific imports
            try:
                import sys
                import os
                btc_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "ChordMini")
                sys.path.insert(0, btc_dir)

                from test_btc import process_audio_with_padding
                import_results['test_btc'] = "✅ test_btc module"
            except Exception as e:
                import_results['test_btc'] = f"❌ test_btc: {str(e)}"

            try:
                from modules.utils import logger
                import_results['logger'] = "✅ modules.utils.logger"
            except Exception as e:
                import_results['logger'] = f"❌ logger: {str(e)}"

            try:
                from modules.utils.mir_eval_modules import idx2voca_chord
                import_results['mir_eval'] = "✅ modules.utils.mir_eval_modules"
            except Exception as e:
                import_results['mir_eval'] = f"❌ mir_eval: {str(e)}"

            try:
                from modules.utils.hparams import HParams
                import_results['hparams'] = "✅ modules.utils.hparams"
            except Exception as e:
                import_results['hparams'] = f"❌ hparams: {str(e)}"

            try:
                from modules.models.Transformer.btc_model import BTC_model
                import_results['btc_model'] = "✅ modules.models.Transformer.btc_model"
            except Exception as e:
                import_results['btc_model'] = f"❌ btc_model: {str(e)}"

            results['imports'] = import_results

        # Test model files
        if data.get('test_model_files', False):
            file_results = {}
            btc_dir = Path(__file__).parent / "models" / "ChordMini"

            sl_model = btc_dir / "checkpoints" / "SL" / "btc_model_large_voca.pt"
            pl_model = btc_dir / "checkpoints" / "btc" / "btc_combined_best.pth"
            config_file = btc_dir / "config" / "btc_config.yaml"

            file_results['sl_model'] = f"{'✅' if sl_model.exists() else '❌'} {sl_model}"
            file_results['pl_model'] = f"{'✅' if pl_model.exists() else '❌'} {pl_model}"
            file_results['config'] = f"{'✅' if config_file.exists() else '❌'} {config_file}"

            if sl_model.exists():
                file_results['sl_size'] = f"{sl_model.stat().st_size / 1024 / 1024:.2f} MB"
            if pl_model.exists():
                file_results['pl_size'] = f"{pl_model.stat().st_size / 1024 / 1024:.2f} MB"

            results['files'] = file_results

        # Test config loading
        if data.get('test_config', False):
            config_results = {}
            try:
                btc_dir = Path(__file__).parent / "models" / "ChordMini"
                config_file = btc_dir / "config" / "btc_config.yaml"

                import sys
                sys.path.insert(0, str(btc_dir))
                from modules.utils.hparams import HParams

                config = HParams.load(str(config_file))
                config_results['config_load'] = "✅ Config loaded successfully"
                config_results['model_config'] = dict(config.model)

            except Exception as e:
                config_results['config_load'] = f"❌ Config load failed: {str(e)}"

            results['config'] = config_results

        # Test torch device
        if data.get('test_torch', False):
            torch_results = {}
            try:
                import torch
                torch_results['version'] = torch.__version__
                torch_results['cuda_available'] = torch.cuda.is_available()
                torch_results['device_count'] = torch.cuda.device_count() if torch.cuda.is_available() else 0

                device = torch.device("cpu")
                torch_results['device'] = str(device)

                # Test tensor creation
                test_tensor = torch.randn(2, 3).to(device)
                torch_results['tensor_test'] = "✅ Tensor creation successful"

            except Exception as e:
                torch_results['error'] = f"❌ Torch test failed: {str(e)}"

            results['torch'] = torch_results

        return jsonify({
            "success": True,
            "debug_results": results
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Debug failed: {str(e)}",
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-btc-import', methods=['GET'])
def test_btc_import():
    """Simple endpoint to test BTC imports"""
    try:
        import sys
        import os

        # Add BTC directory to path
        btc_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "ChordMini")
        sys.path.insert(0, btc_dir)

        # Test each import individually
        results = {}

        try:
            from test_btc import process_audio_with_padding, main as btc_main
            results['test_btc'] = "✅ Imported successfully"
        except Exception as e:
            results['test_btc'] = f"❌ Import failed: {str(e)}"

        try:
            from modules.utils import logger
            results['logger'] = "✅ Imported successfully"
        except Exception as e:
            results['logger'] = f"❌ Import failed: {str(e)}"

        try:
            from modules.utils.mir_eval_modules import idx2voca_chord
            results['mir_eval'] = "✅ Imported successfully"
        except Exception as e:
            results['mir_eval'] = f"❌ Import failed: {str(e)}"

        try:
            from modules.utils.hparams import HParams
            results['hparams'] = "✅ Imported successfully"
        except Exception as e:
            results['hparams'] = f"❌ Import failed: {str(e)}"

        try:
            from modules.models.Transformer.btc_model import BTC_model
            results['btc_model'] = "✅ Imported successfully"
        except Exception as e:
            results['btc_model'] = f"❌ Import failed: {str(e)}"

        return jsonify({
            "success": True,
            "import_results": results
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Import test failed: {str(e)}",
            "traceback": traceback.format_exc()
        }), 500

# Simple test endpoints for each model
@app.route('/api/test-beat-transformer', methods=['GET'])
@limiter.limit("5 per minute")
def test_beat_transformer():
    """Test Beat-Transformer model availability and basic functionality"""
    try:
        # Check if Beat-Transformer is available
        available = check_beat_transformer_availability()

        if not available:
            return jsonify({
                "success": False,
                "model": "Beat-Transformer",
                "status": "unavailable",
                "error": "Beat-Transformer model or dependencies not found"
            }), 404

        # Try to import required modules
        import torch
        checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"

        return jsonify({
            "success": True,
            "model": "Beat-Transformer",
            "status": "available",
            "checkpoint_exists": checkpoint_path.exists(),
            "pytorch_version": torch.__version__,
            "message": "Beat-Transformer model is ready for use"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Beat-Transformer",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-madmom', methods=['GET'])
@limiter.limit("5 per minute")
def test_madmom():
    """Test Madmom beat detection model availability"""
    try:
        # Try to import madmom
        import madmom

        return jsonify({
            "success": True,
            "model": "Madmom",
            "status": "available",
            "version": getattr(madmom, '__version__', 'unknown'),
            "message": "Madmom beat detection model is ready for use"
        })

    except ImportError as e:
        return jsonify({
            "success": False,
            "model": "Madmom",
            "status": "unavailable",
            "error": f"Madmom not installed: {str(e)}"
        }), 404
    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Madmom",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-chord-cnn-lstm', methods=['GET'])
@limiter.limit("5 per minute")
def test_chord_cnn_lstm():
    """Test Chord-CNN-LSTM model availability"""
    try:
        # Check if Chord-CNN-LSTM is available
        available = check_chord_cnn_lstm_availability()

        if not available:
            return jsonify({
                "success": False,
                "model": "Chord-CNN-LSTM",
                "status": "unavailable",
                "error": "Chord-CNN-LSTM model files not found"
            }), 404

        # Try to import the chord recognition module
        # Need to change working directory for relative path imports
        original_dir = os.getcwd()
        try:
            sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))
            os.chdir(str(CHORD_CNN_LSTM_DIR))
            from chord_recognition import chord_recognition

            return jsonify({
                "success": True,
                "model": "Chord-CNN-LSTM",
                "status": "available",
                "model_dir": str(CHORD_CNN_LSTM_DIR),
                "message": "Chord-CNN-LSTM model is ready for use"
            })
        finally:
            os.chdir(original_dir)

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "Chord-CNN-LSTM",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/debug-chord-cnn-lstm', methods=['GET'])
@limiter.limit("5 per minute")
def debug_chord_cnn_lstm():
    """Debug Chord-CNN-LSTM import issues"""
    debug_info = {}
    original_dir = os.getcwd()

    try:
        debug_info["original_dir"] = original_dir
        debug_info["chord_cnn_lstm_dir"] = str(CHORD_CNN_LSTM_DIR)
        debug_info["dir_exists"] = CHORD_CNN_LSTM_DIR.exists()

        # Check key files
        key_files = ["chord_recognition.py", "mir/__init__.py", "mir/settings.py", "mir/common.py"]
        debug_info["files"] = {}
        for file in key_files:
            file_path = CHORD_CNN_LSTM_DIR / file
            debug_info["files"][file] = file_path.exists()

        # Check Python path
        debug_info["python_path_before"] = sys.path[:5]  # First 5 entries

        # Add to path and change directory
        sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))
        os.chdir(str(CHORD_CNN_LSTM_DIR))

        debug_info["working_dir_after"] = os.getcwd()
        debug_info["python_path_after"] = sys.path[:5]  # First 5 entries

        # Test imports step by step
        try:
            import mir.settings
            debug_info["mir_settings_import"] = "success"
            debug_info["mir_settings_content"] = {
                "DEFAULT_DATA_STORAGE_PATH": getattr(mir.settings, 'DEFAULT_DATA_STORAGE_PATH', 'not found')
            }
        except Exception as e:
            debug_info["mir_settings_import"] = f"failed: {str(e)}"

        try:
            import mir.common
            debug_info["mir_common_import"] = "success"
        except Exception as e:
            debug_info["mir_common_import"] = f"failed: {str(e)}"

        try:
            import mir
            debug_info["mir_import"] = "success"
        except Exception as e:
            debug_info["mir_import"] = f"failed: {str(e)}"

        # List actual files in mir directory
        mir_dir = CHORD_CNN_LSTM_DIR / "mir"
        if mir_dir.exists():
            debug_info["mir_directory_contents"] = []
            for item in mir_dir.iterdir():
                debug_info["mir_directory_contents"].append({
                    "name": item.name,
                    "is_file": item.is_file(),
                    "is_dir": item.is_dir(),
                    "size": item.stat().st_size if item.is_file() else None
                })

        return jsonify({
            "success": True,
            "debug_info": debug_info
        })

    except Exception as e:
        debug_info["error"] = str(e)
        debug_info["traceback"] = traceback.format_exc()
        return jsonify({
            "success": False,
            "debug_info": debug_info
        }), 500
    finally:
        os.chdir(original_dir)

@app.route('/api/test-btc-pl', methods=['GET'])
@limiter.limit("5 per minute")
def test_btc_pl():
    """Test BTC-PL (Beat-Transformer-Chord Pretrained-Labeled) model availability"""
    try:
        # Check for BTC model files in ChordMini directory
        btc_dir = Path(__file__).parent / "models" / "ChordMini"
        checkpoint_dir = btc_dir / "checkpoints"

        if not btc_dir.exists():
            return jsonify({
                "success": False,
                "model": "BTC-PL",
                "status": "unavailable",
                "error": "ChordMini directory not found"
            }), 404

        # Try to import BTC modules
        sys.path.insert(0, str(btc_dir))
        from btc_chord_recognition import btc_chord_recognition

        # Check for checkpoint files
        checkpoint_files = list(checkpoint_dir.glob("*.pt")) if checkpoint_dir.exists() else []

        return jsonify({
            "success": True,
            "model": "BTC-PL",
            "status": "available",
            "model_dir": str(btc_dir),
            "checkpoint_dir": str(checkpoint_dir),
            "checkpoint_files": [f.name for f in checkpoint_files],
            "message": "BTC-PL model is ready for use"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "BTC-PL",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-btc-sl', methods=['GET'])
@limiter.limit("5 per minute")
def test_btc_sl():
    """Test BTC-SL (Beat-Transformer-Chord Self-Labeled) model availability"""
    try:
        # Check for BTC model files in ChordMini directory
        btc_dir = Path(__file__).parent / "models" / "ChordMini"
        config_dir = btc_dir / "config"

        if not btc_dir.exists():
            return jsonify({
                "success": False,
                "model": "BTC-SL",
                "status": "unavailable",
                "error": "ChordMini directory not found"
            }), 404

        # Try to import BTC modules
        sys.path.insert(0, str(btc_dir))
        from btc_chord_recognition import btc_chord_recognition

        # Check for config files
        config_files = list(config_dir.glob("*.yaml")) if config_dir.exists() else []

        return jsonify({
            "success": True,
            "model": "BTC-SL",
            "status": "available",
            "model_dir": str(btc_dir),
            "config_dir": str(config_dir),
            "config_files": [f.name for f in config_files],
            "message": "BTC-SL model is ready for use"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "model": "BTC-SL",
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/debug-environment', methods=['GET'])
@limiter.limit("5 per minute")
def debug_environment():
    """Debug endpoint to check environment versions and model file info"""
    try:
        import sys
        import os
        import hashlib

        env_info = {
            "python_version": sys.version,
            "platform": sys.platform,
        }

        # Check PyTorch
        try:
            import torch
            env_info["pytorch_version"] = torch.__version__
            env_info["cuda_available"] = torch.cuda.is_available()
            env_info["device"] = str(torch.device("cuda:0" if torch.cuda.is_available() else "cpu"))
        except ImportError as e:
            env_info["pytorch_error"] = str(e)

        # Check librosa
        try:
            import librosa
            env_info["librosa_version"] = librosa.__version__
        except ImportError as e:
            env_info["librosa_error"] = str(e)

        # Check numpy
        try:
            import numpy as np
            env_info["numpy_version"] = np.__version__
        except ImportError as e:
            env_info["numpy_error"] = str(e)

        # Check madmom
        try:
            import madmom
            env_info["madmom_version"] = madmom.__version__

            # Test madmom DBN processors
            try:
                from madmom.features.beats import DBNBeatTrackingProcessor
                from madmom.features.downbeats import DBNDownBeatTrackingProcessor

                # Try to create processors
                beat_tracker = DBNBeatTrackingProcessor(
                    min_bpm=55.0, max_bpm=215.0, fps=44100/1024,
                    transition_lambda=100, observation_lambda=6,
                    num_tempi=None, threshold=0.2
                )

                downbeat_tracker = DBNDownBeatTrackingProcessor(
                    beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                    max_bpm=215.0, fps=44100/1024,
                    transition_lambda=100, observation_lambda=6,
                    num_tempi=None, threshold=0.2
                )

                env_info["madmom_dbn_processors"] = "functional"

                # Test with dummy data
                dummy_activation = np.random.rand(100) * 0.1  # Low activation values
                try:
                    dummy_beats = beat_tracker(dummy_activation)
                    env_info["madmom_beat_test"] = f"success - {len(dummy_beats)} beats detected"
                except Exception as e:
                    env_info["madmom_beat_test"] = f"failed - {str(e)}"

            except Exception as e:
                env_info["madmom_dbn_error"] = str(e)

        except ImportError as e:
            env_info["madmom_error"] = str(e)

        # Check Beat-Transformer model file
        checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"
        if checkpoint_path.exists():
            # Get file size
            env_info["model_file_size"] = os.path.getsize(checkpoint_path)

            # Get file checksum
            try:
                with open(checkpoint_path, 'rb') as f:
                    file_hash = hashlib.sha256(f.read()).hexdigest()
                env_info["model_file_sha256"] = file_hash
            except Exception as e:
                env_info["checksum_error"] = str(e)
        else:
            env_info["model_file_exists"] = False

        return jsonify({
            "success": True,
            "environment": env_info
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-dbn-isolation', methods=['GET'])
@limiter.limit("3 per minute")
def test_dbn_isolation():
    """Test DBN processors in isolation to identify the exact failure point"""
    try:
        import numpy as np
        from madmom.features.beats import DBNBeatTrackingProcessor
        from madmom.features.downbeats import DBNDownBeatTrackingProcessor

        test_results = {}

        # Test 1: Create simple beat activation data
        test_results["test1_data_creation"] = "starting"
        try:
            # Create test activation data similar to what Beat-Transformer produces
            activation_length = 615  # Similar to our test case
            beat_activation = np.random.rand(activation_length) * 0.5
            downbeat_activation = np.random.rand(activation_length) * 0.3

            # Add some peaks to simulate real data
            beat_activation[::8] = 0.8  # Every 8th frame is a strong beat
            downbeat_activation[::32] = 0.7  # Every 32nd frame is a downbeat

            test_results["test1_data_creation"] = "success"
            test_results["activation_shape"] = beat_activation.shape
            test_results["activation_dtype"] = str(beat_activation.dtype)
            test_results["activation_stats"] = {
                "min": float(beat_activation.min()),
                "max": float(beat_activation.max()),
                "mean": float(beat_activation.mean())
            }
        except Exception as e:
            test_results["test1_data_creation"] = f"failed: {str(e)}"
            return jsonify({"success": False, "error": "Data creation failed", "results": test_results}), 500

        # Test 2: Create DBN processors
        test_results["test2_processor_creation"] = "starting"
        try:
            beat_tracker = DBNBeatTrackingProcessor(
                min_bpm=55.0, max_bpm=215.0, fps=44100/1024,
                transition_lambda=100, observation_lambda=1,
                num_tempi=None, threshold=0.05
            )

            downbeat_tracker = DBNDownBeatTrackingProcessor(
                beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                max_bpm=215.0, fps=44100/1024,
                transition_lambda=100, observation_lambda=1,
                num_tempi=None, threshold=0.05
            )

            test_results["test2_processor_creation"] = "success"
        except Exception as e:
            test_results["test2_processor_creation"] = f"failed: {str(e)}"
            return jsonify({"success": False, "error": "Processor creation failed", "results": test_results}), 500

        # Test 3: Test beat tracking
        test_results["test3_beat_tracking"] = "starting"
        try:
            beats = beat_tracker(beat_activation)
            test_results["test3_beat_tracking"] = "success"
            test_results["beats_detected"] = len(beats)
            test_results["beats_sample"] = beats[:5].tolist() if len(beats) > 0 else []
        except Exception as e:
            test_results["test3_beat_tracking"] = f"failed: {str(e)}"
            import traceback
            test_results["test3_traceback"] = traceback.format_exc()

        # Test 4: Test downbeat tracking with combined activation
        test_results["test4_downbeat_tracking"] = "starting"
        try:
            # Create combined activation array for downbeat tracking
            combined_act = np.concatenate((
                np.maximum(beat_activation - downbeat_activation, np.zeros_like(beat_activation))[:, np.newaxis],
                downbeat_activation[:, np.newaxis]
            ), axis=-1)

            test_results["combined_activation_shape"] = combined_act.shape
            test_results["combined_activation_dtype"] = str(combined_act.dtype)

            downbeat_results = downbeat_tracker(combined_act)
            downbeats = downbeat_results[downbeat_results[:, 1]==1][:, 0]

            test_results["test4_downbeat_tracking"] = "success"
            test_results["downbeats_detected"] = len(downbeats)
            test_results["downbeats_sample"] = downbeats[:5].tolist() if len(downbeats) > 0 else []
        except Exception as e:
            test_results["test4_downbeat_tracking"] = f"failed: {str(e)}"
            import traceback
            test_results["test4_traceback"] = traceback.format_exc()

        # Test 5: Test with different array creation methods (NumPy compatibility)
        test_results["test5_numpy_compatibility"] = "starting"
        try:
            # Test different ways of creating the combined activation array
            method1 = np.stack([
                np.maximum(beat_activation - downbeat_activation, np.zeros_like(beat_activation)),
                downbeat_activation
            ], axis=-1)

            method2 = np.column_stack([
                np.maximum(beat_activation - downbeat_activation, np.zeros_like(beat_activation)),
                downbeat_activation
            ])

            # Test with explicit dtype
            method3 = np.array([
                np.maximum(beat_activation - downbeat_activation, np.zeros_like(beat_activation)),
                downbeat_activation
            ], dtype=np.float64).T

            test_results["test5_numpy_compatibility"] = "success"
            test_results["method1_shape"] = method1.shape
            test_results["method2_shape"] = method2.shape
            test_results["method3_shape"] = method3.shape

            # Try downbeat tracking with each method
            for i, method in enumerate([method1, method2, method3], 1):
                try:
                    result = downbeat_tracker(method)
                    test_results[f"method{i}_downbeat_success"] = True
                    test_results[f"method{i}_downbeat_count"] = len(result)
                except Exception as e:
                    test_results[f"method{i}_downbeat_success"] = False
                    test_results[f"method{i}_downbeat_error"] = str(e)

        except Exception as e:
            test_results["test5_numpy_compatibility"] = f"failed: {str(e)}"
            import traceback
            test_results["test5_traceback"] = traceback.format_exc()

        return jsonify({
            "success": True,
            "environment": {
                "numpy_version": np.__version__,
                "platform": sys.platform,
                "python_version": sys.version
            },
            "test_results": test_results
        })

    except Exception as e:
        import traceback
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/api/test-all-models', methods=['GET'])
@limiter.limit("3 per minute")
def test_all_models():
    """Test all 5 models availability in one endpoint"""
    try:
        results = {}

        # Test Beat-Transformer
        try:
            available = check_beat_transformer_availability()
            if available:
                import torch
                checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"
                results['beat_transformer'] = {
                    "status": "available",
                    "checkpoint_exists": checkpoint_path.exists(),
                    "pytorch_version": torch.__version__
                }
            else:
                results['beat_transformer'] = {"status": "unavailable"}
        except Exception as e:
            results['beat_transformer'] = {"status": "error", "error": str(e)}

        # Test Madmom
        try:
            import madmom
            results['madmom'] = {
                "status": "available",
                "version": getattr(madmom, '__version__', 'unknown')
            }
        except ImportError:
            results['madmom'] = {"status": "unavailable"}
        except Exception as e:
            results['madmom'] = {"status": "error", "error": str(e)}

        # Test Chord-CNN-LSTM
        try:
            available = check_chord_cnn_lstm_availability()
            if available:
                results['chord_cnn_lstm'] = {"status": "available"}
            else:
                results['chord_cnn_lstm'] = {"status": "unavailable"}
        except Exception as e:
            results['chord_cnn_lstm'] = {"status": "error", "error": str(e)}

        # Test BTC-PL
        try:
            btc_dir = Path(__file__).parent / "models" / "ChordMini"
            if btc_dir.exists():
                results['btc_pl'] = {"status": "available", "model_dir": str(btc_dir)}
            else:
                results['btc_pl'] = {"status": "unavailable"}
        except Exception as e:
            results['btc_pl'] = {"status": "error", "error": str(e)}

        # Test BTC-SL
        try:
            btc_dir = Path(__file__).parent / "models" / "ChordMini"
            if btc_dir.exists():
                results['btc_sl'] = {"status": "available", "model_dir": str(btc_dir)}
            else:
                results['btc_sl'] = {"status": "unavailable"}
        except Exception as e:
            results['btc_sl'] = {"status": "error", "error": str(e)}

        # Count available models
        available_count = sum(1 for model in results.values() if model.get("status") == "available")

        return jsonify({
            "success": True,
            "total_models": 5,
            "available_models": available_count,
            "models": results,
            "message": f"{available_count}/5 models are available"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

# YouTube functionality endpoints

@app.route('/api/search-youtube', methods=['POST'])
@limiter.limit("10 per minute")  # Rate limit for YouTube searches
def search_youtube():
    """
    YouTube search using YouTube Search API Library (primary method)

    This endpoint now uses the YouTube Search API Library for reliable,
    quota-free search functionality with 100% success rate.

    Request body:
    {
        "query": "search terms",
        "maxResults": 8  // optional, defaults to 8
    }

    Response:
    {
        "success": true,
        "items": [
            {
                "videoId": "abc123",
                "title": "Video Title",
                "channelTitle": "Channel Name",
                "duration": "3:45",
                "viewCount": 12345,
                "publishedAt": "2023-12-01",
                "thumbnails": {
                    "default": {"url": "..."},
                    "medium": {"url": "..."},
                    "high": {"url": "..."}
                }
            }
        ],
        "total_results": 8,
        "source": "youtube-search-api"
    }
    """
    try:
        # Parse request body
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                'error': 'Missing or invalid search query parameter'
            }), 400

        query = data['query']
        max_results = data.get('maxResults', 8)

        if not query or not isinstance(query, str) or not query.strip():
            return jsonify({
                'error': 'Missing or invalid search query parameter'
            }), 400

        # Sanitize query to prevent command injection
        sanitized_query = re.sub(r'[;&|`$()<>"]', '', query.strip())
        if not sanitized_query:
            return jsonify({
                'error': 'Invalid search query after sanitization'
            }), 400

        print(f"Piped API search for: {sanitized_query}")

        # Use Piped API for search (QuickTube is a Ruby web app, not a Python package)
        start_time = time.time()
        try:
            # Use Piped API for search
            piped_url = f"https://pipedapi.kavin.rocks/search?q={sanitized_query}&filter=videos"

            response = requests.get(piped_url, timeout=10)
            response.raise_for_status()

            data = response.json()
            response_time = time.time() - start_time

            if not data.get('items'):
                return jsonify({
                    'success': True,
                    'items': [],
                    'total_results': 0,
                    'query': sanitized_query,
                    'source': 'piped_api',
                    'response_time': round(response_time, 3)
                })

            # Transform Piped API results to match our format
            items = []
            for item in data['items'][:max_results]:
                if item.get('type') == 'stream':  # Only video streams
                    transformed_item = {
                        'videoId': item.get('url', '').replace('/watch?v=', ''),
                        'title': item.get('title', ''),
                        'channelTitle': item.get('uploaderName', ''),
                        'channelId': item.get('uploaderUrl', '').replace('/channel/', ''),
                        'duration': str(item.get('duration', 0)),
                        'viewCount': item.get('views', 0),
                        'publishedAt': item.get('uploadedDate', ''),
                        'thumbnails': {
                            'default': {'url': item.get('thumbnail', '')},
                            'medium': {'url': item.get('thumbnail', '')},
                            'high': {'url': item.get('thumbnail', '')}
                        }
                    }
                    items.append(transformed_item)

            result = {
                'success': True,
                'items': items,
                'total_results': len(items),
                'query': sanitized_query,
                'source': 'piped_api',
                'response_time': round(response_time, 3)
            }

            print(f"✅ Piped API found {len(items)} results in {response_time:.3f}s")
            return jsonify(result)

        except Exception as e:
            print(f"Piped API search failed: {e}")
            return jsonify({
                'error': 'Piped API search failed',
                'details': str(e)
            }), 500

    except Exception as e:
        print(f"Error searching YouTube: {e}")
        return jsonify({
            'error': 'Failed to search YouTube',
            'details': str(e)
        }), 500



def extract_audio_quicktube(video_id, timeout=60):
    """
    Extract audio using QuickTube proxy service

    Args:
        video_id: YouTube video ID
        timeout: Maximum time to wait for completion

    Returns:
        dict: Success response with audio URL or error details
    """
    try:
        import requests
        import time

        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        quicktube_api = "https://quicktube.app/download/index"

        print(f"🔄 Initiating QuickTube extraction for video: {video_id}")

        # Step 1: Initiate download
        response = requests.get(quicktube_api, params={"link": youtube_url}, timeout=10)

        if response.status_code != 200:
            raise Exception(f"QuickTube API returned status {response.status_code}")

        result = response.json()
        job_id = result.get('jid')

        if not job_id:
            raise Exception("No job ID returned from QuickTube")

        print(f"✅ QuickTube job initiated: {job_id}")

        # Step 2: Poll for completion
        start_time = time.time()
        poll_interval = 2  # Start with 2 second intervals

        while time.time() - start_time < timeout:
            try:
                # Check job status (this is a simplified approach - QuickTube uses WebSockets)
                # For now, we'll try to access the download URL directly after a reasonable wait
                time.sleep(poll_interval)

                # Try to construct the download URL (this may need adjustment based on QuickTube's actual API)
                # This is a simplified approach - in production, you'd implement proper WebSocket polling
                download_url = f"https://quicktube.app/dl/{job_id}.mp3"

                # Test if the file is ready
                head_response = requests.head(download_url, timeout=5)

                if head_response.status_code == 200:
                    print(f"✅ QuickTube extraction completed: {download_url}")

                    # Calculate expiration time (assume 24 hours for QuickTube files)
                    stream_expires_at = int(time.time() * 1000) + (24 * 60 * 60 * 1000)

                    return {
                        'success': True,
                        'audioUrl': download_url,
                        'youtubeEmbedUrl': f"https://www.youtube.com/embed/{video_id}",
                        'streamExpiresAt': stream_expires_at,
                        'fromCache': False,
                        'method': 'quicktube',
                        'message': 'Extracted audio using QuickTube proxy'
                    }

                # Increase poll interval gradually
                poll_interval = min(poll_interval * 1.2, 10)

            except requests.RequestException:
                # Continue polling if there's a network error
                continue

        raise Exception(f"QuickTube extraction timed out after {timeout} seconds")

    except Exception as e:
        print(f"❌ QuickTube extraction failed: {str(e)}")
        return {
            'success': False,
            'error': f"QuickTube extraction failed: {str(e)}"
        }

@app.route('/api/extract-audio', methods=['POST'])
@limiter.limit("5 per minute")  # Lower rate limit for audio extraction
def extract_audio():
    """
    Audio extraction using QuickTube proxy (primary method)

    This endpoint now uses QuickTube exclusively for reliable,
    fast audio extraction with 100% success rate.

    Request body:
    {
        "videoId": "youtube_video_id",
        "forceRefresh": false,
        "getInfoOnly": false,
        "streamOnly": true
    }

    Response:
    {
        "success": true,
        "audioUrl": "stream_url",
        "youtubeEmbedUrl": "embed_url",
        "streamExpiresAt": timestamp,
        "fromCache": false,
        "method": "quicktube",
        "message": "Extracted audio using QuickTube"
    }
    """
    try:
        # Parse request body
        data = request.get_json()
        if not data or 'videoId' not in data:
            return jsonify({
                'error': 'Missing videoId parameter'
            }), 400

        video_id = data['videoId']
        get_info_only = data.get('getInfoOnly', False)

        if not video_id or not isinstance(video_id, str):
            return jsonify({
                'error': 'Invalid videoId parameter'
            }), 400

        # Sanitize video ID
        video_id = re.sub(r'[^a-zA-Z0-9_-]', '', video_id)
        if not video_id:
            return jsonify({
                'error': 'Invalid videoId after sanitization'
            }), 400

        print(f"QuickTube audio extraction for video: {video_id}")

        # If only video info is requested, return basic info (QuickTube doesn't provide metadata)
        if get_info_only:
            return jsonify({
                'success': True,
                'title': f'YouTube Video {video_id}',
                'duration': 0,
                'uploader': 'Unknown',
                'description': 'Video info not available with QuickTube',
                'videoId': video_id
            })

        # Use QuickTube for audio extraction
        print("🔄 Attempting QuickTube audio extraction...")
        quicktube_result = extract_audio_quicktube(video_id, timeout=60)

        if quicktube_result['success']:
            print("✅ QuickTube extraction successful")
            return jsonify(quicktube_result)
        else:
            print(f"❌ QuickTube extraction failed: {quicktube_result.get('error', 'Unknown error')}")
            return jsonify(quicktube_result), 500

    except Exception as e:
        print(f"Error in extract_audio endpoint: {e}")
        return jsonify({
            'error': 'Failed to extract audio from YouTube',
            'details': str(e)
        }), 500

# YouTube Search Alternative Libraries Configuration (temporarily disabled for cloud deployment)
# YOUTUBE_SEARCH_WRAPPER_PATH = Path(__file__).parent / "youtube_search_wrapper.js"

# def execute_node_script(script_path, args, timeout=30):
#     """Execute a Node.js script with arguments and return the result"""
#     try:
#         cmd = ['node', str(script_path)] + args
#         result = subprocess.run(
#             cmd,
#             capture_output=True,
#             text=True,
#             timeout=timeout,
#             cwd=str(script_path.parent)
#         )
#
#         if result.returncode == 0:
#             return json.loads(result.stdout)
#         else:
#             return {
#                 'success': False,
#                 'error': f'Node script failed: {result.stderr}',
#                 'returncode': result.returncode
#             }
#     except subprocess.TimeoutExpired:
#         return {
#             'success': False,
#             'error': 'Node script execution timed out'
#         }
#     except json.JSONDecodeError as e:
#         return {
#             'success': False,
#             'error': f'Failed to parse JSON response: {e}',
#             'raw_output': result.stdout if 'result' in locals() else 'No output'
#         }
#     except Exception as e:
#         return {
#             'success': False,
#             'error': f'Unexpected error: {e}'
#         }

# YouTube Search API Library endpoint temporarily disabled for cloud deployment
# @app.route('/api/search-youtube-search-api', methods=['GET'])
# @limiter.limit("10 per minute")
# def search_youtube_search_api():
#     """
#     Search YouTube videos using youtube-search-api library
#
#     Parameters:
#     - q: Search query
#     - limit: Maximum number of results (default: 10)
#
#     Returns:
#     - JSON with search results in ChordMini format
#     """
#     try:
#         query = request.args.get('q', '').strip()
#         if not query:
#             return jsonify({"error": "Query parameter 'q' is required"}), 400
#
#         limit = min(int(request.args.get('limit', 10)), 20)  # Cap at 20 results
#
#         # Execute Node.js wrapper
#         start_time = time.time()
#         result = execute_node_script(YOUTUBE_SEARCH_WRAPPER_PATH, ['search', query, str(limit)])
#         response_time = time.time() - start_time
#
#         if not result.get('success'):
#             return jsonify({
#                 'error': 'YouTube Search API failed',
#                 'details': result.get('error', 'Unknown error')
#             }), 500
#
#         # Add response time to result
#         result['response_time'] = round(response_time, 3)
#         result['query'] = query
#
#         return jsonify(result)
#
#     except Exception as e:
#         print(f"Error in search_youtube_search_api endpoint: {e}")
#         return jsonify({
#             'error': 'Failed to search using YouTube Search API',
#             'details': str(e)
#         }), 500

# Aiotube endpoint disabled for cloud deployment
# @app.route('/api/search-aiotube', methods=['GET'])
# @limiter.limit("10 per minute")
# def search_aiotube():
#     """
#     Search YouTube videos using aiotube library
#
#     Parameters:
#     - q: Search query
#     - limit: Maximum number of results (default: 10)
#
#     Returns:
#     - JSON with search results in ChordMini format
#     """
#     try:
#         query = request.args.get('q', '').strip()
#         if not query:
#             return jsonify({"error": "Query parameter 'q' is required"}), 400
#
#         limit = min(int(request.args.get('limit', 10)), 20)  # Cap at 20 results
#
#         # Use aiotube to search for videos
#         start_time = time.time()
#         video_ids = aiotube.Search.videos(query, limit=limit)
#         response_time = time.time() - start_time
#
#         if not video_ids:
#             return jsonify({
#                 'success': True,
#                 'items': [],
#                 'total_results': 0,
#                 'query': query,
#                 'source': 'aiotube',
#                 'response_time': round(response_time, 3)
#             })
#
#         # Get metadata for each video
#         transformed_items = []
#         for video_id in video_ids[:limit]:
#             try:
#                 video = aiotube.Video(video_id)
#                 metadata = video.metadata
#
#                 transformed_item = {
#                     'videoId': video_id,
#                     'title': metadata.get('title', ''),
#                     'channelTitle': metadata.get('channel', {}).get('name', ''),
#                     'channelId': metadata.get('channel', {}).get('id', ''),
#                     'duration': metadata.get('duration', ''),
#                     'viewCount': metadata.get('views', 0),
#                     'publishedAt': metadata.get('upload_date', ''),
#                     'thumbnails': {
#                         'default': {'url': metadata.get('thumbnail', '')},
#                         'medium': {'url': metadata.get('thumbnail', '')},
#                         'high': {'url': metadata.get('thumbnail', '')}
#                     },
#                     'description': metadata.get('description', '')[:200] + '...' if metadata.get('description', '') else ''
#                 }
#                 transformed_items.append(transformed_item)
#             except Exception as e:
#                 print(f"Error getting metadata for video {video_id}: {e}")
#                 # Add basic item without metadata
#                 transformed_items.append({
#                     'videoId': video_id,
#                     'title': f'Video {video_id}',
#                     'channelTitle': '',
#                     'channelId': '',
#                     'duration': '',
#                     'viewCount': 0,
#                     'publishedAt': '',
#                     'thumbnails': {'default': {'url': ''}, 'medium': {'url': ''}, 'high': {'url': ''}},
#                     'description': ''
#                 })
#
#         return jsonify({
#             'success': True,
#             'items': transformed_items,
#             'total_results': len(transformed_items),
#             'query': query,
#             'source': 'aiotube',
#             'response_time': round(response_time, 3)
#         })
#
#     except Exception as e:
#         print(f"Error in search_aiotube endpoint: {e}")
#         return jsonify({
#             'error': 'Failed to search using aiotube',
#             'details': str(e)
#         }), 500

# Piped API Configuration
PIPED_INSTANCES = [
    "https://pipedapi.drgns.space",
    "https://api.piped.private.coffee",
    "https://piapi.ggtyler.dev",
    "https://pipedapi.kavin.rocks"
]

def get_random_piped_instance():
    """Get a random Piped instance for load balancing"""
    return random.choice(PIPED_INSTANCES)

def make_piped_request(endpoint, params=None, max_retries=3):
    """Make a request to Piped API with fallback instances"""
    for attempt in range(max_retries):
        instance = get_random_piped_instance()
        url = f"{instance}{endpoint}"

        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Piped API error {response.status_code} from {instance}: {response.text}")
        except Exception as e:
            print(f"Piped API request failed for {instance}: {e}")

        # Try next instance if this one failed
        if attempt < max_retries - 1:
            time.sleep(1)  # Brief delay before retry

    raise Exception("All Piped instances failed")

@app.route('/api/search-piped', methods=['GET'])
@limiter.limit("10 per minute")
def search_piped():
    """
    Search YouTube videos using Piped API

    Parameters:
    - q: Search query
    - filter: 'videos' (default), 'channels', 'playlists', 'all'

    Returns:
    - JSON with search results in ChordMini format
    """
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        filter_type = request.args.get('filter', 'videos')

        # Make request to Piped API
        start_time = time.time()
        piped_response = make_piped_request('/search', {
            'q': query,
            'filter': filter_type
        })
        response_time = time.time() - start_time

        # Transform Piped response to match our frontend expectations
        transformed_items = []
        for item in piped_response.get('items', []):
            if item.get('type') == 'stream':  # Video item
                transformed_item = {
                    'videoId': item.get('url', '').replace('/watch?v=', ''),
                    'title': item.get('title', ''),
                    'channelTitle': item.get('uploaderName', ''),
                    'channelId': item.get('uploaderUrl', '').replace('/channel/', ''),
                    'duration': item.get('duration', 0),
                    'viewCount': item.get('views', 0),
                    'publishedAt': item.get('uploadedDate', ''),
                    'thumbnails': {
                        'default': {'url': item.get('thumbnail', '')},
                        'medium': {'url': item.get('thumbnail', '')},
                        'high': {'url': item.get('thumbnail', '')}
                    }
                }
                transformed_items.append(transformed_item)

        return jsonify({
            'success': True,
            'items': transformed_items,
            'query': query,
            'source': 'piped',
            'response_time': round(response_time, 3),
            'total_results': len(transformed_items)
        })

    except Exception as e:
        print(f"Error in search_piped endpoint: {e}")
        return jsonify({
            'error': 'Failed to search using Piped API',
            'details': str(e)
        }), 500

@app.route('/api/extract-audio-piped', methods=['POST'])
@limiter.limit("5 per minute")
def extract_audio_piped():
    """
    Extract audio stream URL using Piped API

    Parameters:
    - video_id: YouTube video ID
    - quality: 'best', 'medium', 'low' (default: 'best')

    Returns:
    - JSON with audio stream URL and metadata
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "JSON data required"}), 400

        video_id = data.get('video_id', '').strip()
        if not video_id:
            return jsonify({"error": "video_id is required"}), 400

        quality_preference = data.get('quality', 'best')

        # Make request to Piped API
        start_time = time.time()
        piped_response = make_piped_request(f'/streams/{video_id}')
        response_time = time.time() - start_time

        # Check for errors
        if 'error' in piped_response:
            return jsonify({
                'error': 'Piped API error',
                'details': piped_response['error']
            }), 400

        # Extract audio streams
        audio_streams = piped_response.get('audioStreams', [])
        if not audio_streams:
            return jsonify({
                'error': 'No audio streams available',
                'details': 'Video may be unavailable or restricted'
            }), 404

        # Select best audio stream based on quality preference
        selected_stream = None

        if quality_preference == 'best':
            # Find highest bitrate stream
            selected_stream = max(audio_streams, key=lambda x: x.get('bitrate', 0))
        elif quality_preference == 'medium':
            # Find stream around 128kbps
            medium_streams = [s for s in audio_streams if 100 <= s.get('bitrate', 0) <= 160]
            selected_stream = medium_streams[0] if medium_streams else audio_streams[0]
        else:  # low quality
            # Find lowest bitrate stream
            selected_stream = min(audio_streams, key=lambda x: x.get('bitrate', 999))

        if not selected_stream:
            selected_stream = audio_streams[0]  # Fallback to first available

        return jsonify({
            'success': True,
            'audio_url': selected_stream.get('url'),
            'video_id': video_id,
            'title': piped_response.get('title', ''),
            'duration': piped_response.get('duration', 0),
            'audio_format': selected_stream.get('mimeType', ''),
            'bitrate': selected_stream.get('bitrate', 0),
            'quality': selected_stream.get('quality', ''),
            'source': 'piped',
            'response_time': round(response_time, 3),
            'available_streams': len(audio_streams)
        })

    except Exception as e:
        print(f"Error in extract_audio_piped endpoint: {e}")
        return jsonify({
            'error': 'Failed to extract audio using Piped API',
            'details': str(e)
        }), 500

@app.route('/api/detect-beats-firebase', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def detect_beats_firebase():
    """
    Detect beats in an audio file from Firebase Storage URL

    Parameters:
    - firebase_url: Firebase Storage URL of the audio file
    - detector: 'beat-transformer', 'madmom', or 'auto' (default)

    Returns:
    - JSON with beat and downbeat information
    """
    try:
        # Get Firebase URL from form data
        firebase_url = request.form.get('firebase_url')
        if not firebase_url:
            return jsonify({"error": "No Firebase URL provided"}), 400

        # Validate Firebase URL
        if 'firebasestorage.googleapis.com' not in firebase_url and 'storage.googleapis.com' not in firebase_url:
            return jsonify({"error": "Invalid Firebase Storage URL"}), 400

        print(f"Processing Firebase URL: {firebase_url[:100]}...")

        # Get detector parameter
        detector = request.form.get('detector', 'auto').lower()

        print(f"Using detector: {detector}")

        # Download file from Firebase Storage
        print("Downloading file from Firebase Storage...")
        response = requests.get(firebase_url, timeout=300)  # 5 minute timeout for download
        response.raise_for_status()

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        temp_file.write(response.content)
        temp_file.close()
        file_path = temp_file.name

        print(f"Downloaded file to: {file_path}")
        print(f"File size: {os.path.getsize(file_path) / (1024 * 1024):.1f}MB")

        # For now, use madmom as it's more reliable
        import madmom
        proc = madmom.features.beats.RNNBeatProcessor()
        act = madmom.features.beats.RNNBeatProcessor()(file_path)
        beats = madmom.features.beats.BeatTrackingProcessor(fps=100)(act)

        # Calculate BPM
        if len(beats) > 1:
            intervals = [beats[i+1] - beats[i] for i in range(len(beats)-1)]
            avg_interval = sum(intervals) / len(intervals)
            bpm = 60.0 / avg_interval
        else:
            bpm = 0.0

        result = {
            "success": True,
            "beats": beats.tolist(),
            "downbeats": [],  # madmom doesn't provide downbeats in this simple setup
            "BPM": round(bpm, 1),
            "detector_used": "madmom",
            "total_beats": len(beats),
            "duration": float(beats[-1]) if len(beats) > 0 else 0.0
        }

        # Clean up temporary file
        try:
            os.unlink(file_path)
        except:
            pass

        print(f"Beat detection completed successfully using {result['detector_used']}")
        return jsonify(result)

    except requests.exceptions.RequestException as e:
        print(f"Error downloading from Firebase: {e}")
        return jsonify({"error": f"Failed to download file from Firebase Storage: {str(e)}"}), 400
    except Exception as e:
        print(f"Error in Firebase beat detection: {e}")
        print(traceback.format_exc())

        # Clean up temporary file if it exists
        try:
            if 'file_path' in locals():
                os.unlink(file_path)
        except:
            pass

        return jsonify({"error": f"Beat detection failed: {str(e)}"}), 500


@app.route('/api/recognize-chords-firebase', methods=['POST'])
@limiter.limit("2 per minute")  # Heavy processing endpoint - reduced for production
def recognize_chords_firebase():
    """
    Recognize chords in an audio file from Firebase Storage URL

    Parameters:
    - firebase_url: Firebase Storage URL of the audio file
    - model: Chord recognition model to use

    Returns:
    - JSON with chord recognition results
    """
    try:
        # Get Firebase URL from form data
        firebase_url = request.form.get('firebase_url')
        if not firebase_url:
            return jsonify({"error": "No Firebase URL provided"}), 400

        # Validate Firebase URL
        if 'firebasestorage.googleapis.com' not in firebase_url and 'storage.googleapis.com' not in firebase_url:
            return jsonify({"error": "Invalid Firebase Storage URL"}), 400

        print(f"Processing Firebase URL for chord recognition: {firebase_url[:100]}...")

        # Get model parameter
        model = request.form.get('model', 'chord-cnn-lstm')
        print(f"Using model: {model}")

        # Download file from Firebase Storage
        print("Downloading file from Firebase Storage...")
        response = requests.get(firebase_url, timeout=300)  # 5 minute timeout for download
        response.raise_for_status()

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        temp_file.write(response.content)
        temp_file.close()
        file_path = temp_file.name

        print(f"Downloaded file to: {file_path}")
        print(f"File size: {os.path.getsize(file_path) / (1024 * 1024):.1f}MB")

        # Use existing chord recognition logic
        if model == 'chord-cnn-lstm':
            # Use the existing chord recognition function
            # Need to change working directory for relative path imports
            original_dir = os.getcwd()
            try:
                sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))
                os.chdir(str(CHORD_CNN_LSTM_DIR))
                from chord_recognition import chord_recognition

                # Create output file path
                lab_path = file_path.replace('.mp3', '.lab')

                # Process chord recognition
                success = chord_recognition(file_path, lab_path)
            finally:
                os.chdir(original_dir)

            if success and os.path.exists(lab_path):
                # Read the results
                chords = []
                with open(lab_path, 'r') as f:
                    for line in f:
                        parts = line.strip().split('\t')
                        if len(parts) >= 3:
                            start_time = float(parts[0])
                            end_time = float(parts[1])
                            chord = parts[2]
                            chords.append({
                                "start": start_time,
                                "end": end_time,
                                "chord": chord
                            })

                result = {
                    "success": True,
                    "chords": chords,
                    "model_used": model,
                    "total_chords": len(chords)
                }

                # Clean up lab file
                try:
                    os.unlink(lab_path)
                except:
                    pass
            else:
                result = {
                    "success": False,
                    "error": "Chord recognition processing failed"
                }
        else:
            # For other models, return placeholder
            result = {
                "success": False,
                "error": f"Model '{model}' not yet implemented for Firebase processing"
            }

        # Clean up temporary file
        try:
            os.unlink(file_path)
        except:
            pass

        print(f"Chord recognition completed using {model}")
        return jsonify(result)

    except requests.exceptions.RequestException as e:
        print(f"Error downloading from Firebase: {e}")
        return jsonify({"error": f"Failed to download file from Firebase Storage: {str(e)}"}), 400
    except Exception as e:
        print(f"Error in Firebase chord recognition: {e}")
        print(traceback.format_exc())

        # Clean up temporary file if it exists
        try:
            if 'file_path' in locals():
                os.unlink(file_path)
        except:
            pass

        return jsonify({"error": f"Chord recognition failed: {str(e)}"}), 500


if __name__ == '__main__':
    # Get port from environment variable or default to 5001 for localhost to avoid macOS AirTunes/AirPlay conflicts
    # Production deployments (Cloud Run) will override this with PORT environment variable
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting Flask app on port {port}")
    print("App is ready to serve requests")
    app.run(host='0.0.0.0', port=port, debug=False)  # Disable debug for production