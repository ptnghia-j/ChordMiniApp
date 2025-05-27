import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import numpy as np
import soundfile as sf
import traceback
import sys
from pathlib import Path

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

# Apply scipy patches before importing librosa
from scipy_patch import apply_scipy_patches, patch_librosa_beat_tracker, monkey_patch_beat_track
apply_scipy_patches()
patch_librosa_beat_tracker()
monkey_patch_beat_track()

# Now it's safe to import librosa
import librosa

# Add the model directories to the Python path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "models" / "Beat-Transformer"
CHORD_CNN_LSTM_DIR = Path(__file__).parent / "models" / "Chord-CNN-LSTM"
AUDIO_DIR = Path(__file__).parent.parent / "public" / "audio"
print(f"Audio directory path: {AUDIO_DIR}")
sys.path.insert(0, str(BEAT_TRANSFORMER_DIR))
sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))

# Import the run_beat_tracking function from the demo script
try:
    from beat_tracking_fix import run_beat_tracking_wrapper
    print("Using beat_tracking_fix wrapper for improved reliability")
except ImportError:
    print("Warning: beat_tracking_fix not found, falling back to original implementation")
    from beat_tracking_demo import run_beat_tracking
    run_beat_tracking_wrapper = None

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure maximum content length from environment variable or default to 150MB
max_content_mb = int(os.environ.get('FLASK_MAX_CONTENT_LENGTH_MB', 150))
app.config['MAX_CONTENT_LENGTH'] = max_content_mb * 1024 * 1024
print(f"Setting maximum upload size to {max_content_mb}MB")

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

# Check if Spleeter is available and download the model if needed
try:
    # Try to import Spleeter
    import spleeter
    from spleeter.separator import Separator

    # Try to get version, but don't fail if not available
    try:
        version = spleeter.__version__
    except:
        version = "unknown"

    print(f"Spleeter is available (version {version})")

    # Check if the Spleeter model is downloaded
    import os
    from pathlib import Path

    # Get the Spleeter pretrained models path
    spleeter_models_dir = Path.home() / ".cache" / "spleeter"
    print(f"Checking for Spleeter models in: {spleeter_models_dir}")

    # Check if the 5stems model exists
    model_path = spleeter_models_dir / "5stems"
    if not model_path.exists():
        print("Spleeter 5stems model not found. Downloading...")
        # Create a temporary separator to trigger the download
        try:
            temp_separator = Separator('spleeter:5stems')
            print("Spleeter 5stems model downloaded successfully")
        except Exception as e:
            print(f"Error downloading Spleeter model: {e}")
    else:
        print("Spleeter 5stems model already downloaded")

    SPLEETER_AVAILABLE = True
except Exception as e:
    print(f"Spleeter is not available: {e}. Install with: pip install spleeter")
    SPLEETER_AVAILABLE = False

# Check if Beat-Transformer model is available
try:
    # Check if the checkpoint file exists
    checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"
    print(f"Looking for Beat Transformer checkpoint at: {checkpoint_path}")
    print(f"Checkpoint exists: {checkpoint_path.exists()}")

    if checkpoint_path.exists():
        # Check if PyTorch is available
        try:
            import torch
            print(f"PyTorch is available, version: {torch.__version__}")
            print(f"CUDA is available: {torch.cuda.is_available()}")

            # Check if madmom is available
            try:
                # Try importing madmom after patching
                import madmom
                print(f"madmom is available, version: {madmom.__version__}")
                USE_BEAT_TRANSFORMER = True
                USE_BEAT_TRANSFORMER_LIGHT = True
                print(f"Beat Transformer checkpoint found and dependencies available")
            except ImportError as e:
                print(f"madmom import failed: {e}")
                USE_BEAT_TRANSFORMER = True  # Still try to use Beat-Transformer even without madmom
                USE_BEAT_TRANSFORMER_LIGHT = True
                print(f"Will try to use Beat Transformer without madmom")
        except ImportError as e:
            print(f"PyTorch import failed: {e}")
            USE_BEAT_TRANSFORMER = False
            USE_BEAT_TRANSFORMER_LIGHT = False
            print(f"Beat Transformer requires PyTorch")
    else:
        USE_BEAT_TRANSFORMER = False
        USE_BEAT_TRANSFORMER_LIGHT = False
        print(f"Beat Transformer checkpoint not found at: {checkpoint_path}")
except Exception as e:
    print(f"Warning: Could not check Beat Transformer checkpoint: {e}")
    USE_BEAT_TRANSFORMER = False
    USE_BEAT_TRANSFORMER_LIGHT = False

# Check if Chord-CNN-LSTM model is available
try:
    # Add the Chord-CNN-LSTM directory to the Python path
    sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))

    # Change the working directory temporarily to load the model
    original_dir = os.getcwd()
    os.chdir(str(CHORD_CNN_LSTM_DIR))

    try:
        # Import the real chord recognition module
        from chord_recognition import chord_recognition
        print("Successfully imported real chord_recognition module")
        USE_CHORD_CNN_LSTM = True
    finally:
        # Change back to the original directory
        os.chdir(original_dir)
except ImportError as e:
    print(f"Error importing chord_recognition module: {e}")
    USE_CHORD_CNN_LSTM = False
except Exception as e:
    print(f"Error with chord_recognition module: {e}")
    USE_CHORD_CNN_LSTM = False

@app.route('/')
def index():
    return jsonify({
        "status": "healthy",
        "message": "Audio analysis API is running",
        "beat_model": "Beat-Transformer" if USE_BEAT_TRANSFORMER else "librosa",
        "chord_model": "Chord-CNN-LSTM" if USE_CHORD_CNN_LSTM else "None"
    })

@app.route('/api/detect-beats', methods=['POST'])
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

        # Determine which detector to use
        use_beat_transformer = False
        use_madmom = False

        print(f"Detector requested: {detector}, USE_BEAT_TRANSFORMER: {USE_BEAT_TRANSFORMER}, madmom_available: {madmom_available}")

        # Initialize new variable for lightweight model
        use_beat_transformer_light = False

        # Select detector based on request and availability
        if detector == 'beat-transformer':
            if USE_BEAT_TRANSFORMER:
                use_beat_transformer = True
                print("Will use Beat-Transformer as requested")
            else:
                print("Beat-Transformer requested but not available, falling back to next best option")
                if USE_BEAT_TRANSFORMER_LIGHT:
                    use_beat_transformer_light = True
                    print("Falling back to Beat-Transformer Light")
                elif madmom_available:
                    use_madmom = True
                    print("Falling back to madmom")
                else:
                    return jsonify({
                        "success": False,
                        "error": "No beat detection models available"
                    }), 500
        elif detector == 'beat-transformer-light':
            if USE_BEAT_TRANSFORMER_LIGHT:
                use_beat_transformer_light = True
                print("Will use Beat-Transformer Light as requested")
            else:
                print("Beat-Transformer Light requested but not available, falling back to next best option")
                if USE_BEAT_TRANSFORMER:
                    use_beat_transformer = True
                    print("Falling back to full Beat-Transformer")
                elif madmom_available:
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

            # Prefer beat-transformer-light for all file sizes if available
            if USE_BEAT_TRANSFORMER_LIGHT:
                use_beat_transformer_light = True
                print(f"Auto-selected Beat-Transformer Light (file size: {file_size_mb:.1f}MB)")
            # For smaller files, use full beat-transformer if available
            elif file_size_mb <= 50 and USE_BEAT_TRANSFORMER:
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
            if USE_BEAT_TRANSFORMER:
                use_beat_transformer = True
                print(f"Unknown detector '{detector}', falling back to Beat-Transformer")
            elif USE_BEAT_TRANSFORMER_LIGHT:
                use_beat_transformer_light = True
                print(f"Unknown detector '{detector}', falling back to Beat-Transformer Light")
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
                    # If lightweight model is available, switch to it for large files
                    if USE_BEAT_TRANSFORMER_LIGHT:
                        print(f"Switching to Beat-Transformer Light for large file ({file_size / (1024 * 1024):.1f}MB)")
                        use_beat_transformer = False
                        use_beat_transformer_light = True
                    else:
                        use_beat_transformer = False
            else:
                use_beat_transformer = True

        # Check size limits for Beat-Transformer Light
        if use_beat_transformer_light:
            # Higher size limit for lightweight model
            size_limit_mb = 150  # 150MB
            if file_size > size_limit_mb * 1024 * 1024:
                print(f"File size is {file_size / (1024 * 1024):.1f}MB - exceeds {size_limit_mb}MB limit for Beat-Transformer Light")
                print("File is too large for Beat-Transformer Light without force parameter")

                # Allow forcing Beat-Transformer Light for large files if explicitly requested
                force_param = request.args.get('force', request.form.get('force', '')).lower()
                if force_param == 'true':
                    print("Force parameter detected - using Beat-Transformer Light despite large file size")
                    use_beat_transformer_light = True
                else:
                    use_beat_transformer_light = False
            else:
                use_beat_transformer_light = True

        if use_beat_transformer or use_beat_transformer_light:
            try:
                # Create a temporary file for the spectrogram
                temp_spec_file = tempfile.NamedTemporaryFile(delete=False, suffix='.npy')
                temp_spec_path = temp_spec_file.name
                temp_spec_file.close()

                # Set paths for Beat-Transformer
                checkpoint_path = str(BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt")

                # Add the Beat-Transformer directory to the Python path
                import sys
                import os
                beat_transformer_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'Beat-Transformer')
                if beat_transformer_dir not in sys.path:
                    sys.path.append(beat_transformer_dir)
                    print(f"Added {beat_transformer_dir} to Python path")

                if use_beat_transformer:
                    # First, demix the audio and create spectrogram
                    print(f"Using Beat-Transformer (Full) for beat detection on: {file_path}")

                    # Run the demixing process
                    try:
                        # Try to import from the correct path
                        from demix_spectrogram import demix_audio_to_spectrogram
                        print("Successfully imported demix_audio_to_spectrogram")
                    except ImportError as e:
                        print(f"Error importing demix_audio_to_spectrogram: {e}")
                        raise

                    print(f"Calling demix_audio_to_spectrogram with {file_path} -> {temp_spec_path}")
                    demix_audio_to_spectrogram(file_path, temp_spec_path)

                elif use_beat_transformer_light:
                    # Use the lightweight version
                    print(f"Using Beat-Transformer (Light) for beat detection on: {file_path}")

                    # Run the lightweight spectrogram generation
                    try:
                        # Try to import from the correct path
                        from demix_spectrogram_light import demix_audio_to_spectrogram_light
                        print("Successfully imported demix_audio_to_spectrogram_light")
                    except ImportError as e:
                        print(f"Error importing demix_audio_to_spectrogram_light: {e}")
                        raise

                    print(f"Calling demix_audio_to_spectrogram_light with {file_path} -> {temp_spec_path}")
                    demix_audio_to_spectrogram_light(file_path, temp_spec_path)

                # Run the beat tracking function
                try:
                    # Use the original function with our fixes
                    print("Using run_beat_tracking function with fixes")

                    # Check audio duration first
                    y, sr = librosa.load(file_path, sr=None)
                    duration = librosa.get_duration(y=y, sr=sr)
                    print(f"Audio duration: {duration:.2f} seconds")

                    # Fix numpy float issue
                    import numpy as np
                    if not hasattr(np, 'float'):
                        np.float = float
                    if not hasattr(np, 'int'):
                        np.int = int

                    # For long audio (over 150 seconds), split and process in chunks
                    if duration > 150:
                        print("Long audio detected. Processing in chunks...")

                        # Process in chunks of 120 seconds with 30 second overlap
                        chunk_duration = 120  # seconds
                        overlap_duration = 30  # seconds
                        all_beat_times = []
                        all_downbeat_times = []

                        # Process each chunk
                        print(f"\nDEBUG - Audio duration: {duration:.2f}s")
                        print(f"DEBUG - Will process in chunks of {chunk_duration}s with {overlap_duration}s overlap")

                        # Calculate how many chunks we'll need
                        chunk_step = chunk_duration - overlap_duration
                        num_chunks = (int(duration) + chunk_step - 1) // chunk_step
                        print(f"DEBUG - Estimated number of chunks: {num_chunks}")

                        chunk_count = 0
                        for start_time in range(0, int(duration), chunk_duration - overlap_duration):
                            chunk_count += 1
                            end_time = min(start_time + chunk_duration, duration)
                            print(f"\nDEBUG - Processing chunk {chunk_count}/{num_chunks} from {start_time}s to {end_time}s (duration: {end_time-start_time:.2f}s)")

                            # Extract chunk
                            start_sample = int(start_time * sr)
                            end_sample = int(end_time * sr)
                            y_chunk = y[start_sample:end_sample]

                            # Create temporary file for this chunk
                            temp_chunk_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                            temp_chunk_path = temp_chunk_file.name
                            temp_chunk_file.close()

                            # Save chunk to temporary file
                            sf.write(temp_chunk_path, y_chunk, sr)

                            # Create spectrogram for this chunk
                            temp_chunk_spec_file = tempfile.NamedTemporaryFile(delete=False, suffix='.npy')
                            temp_chunk_spec_path = temp_chunk_spec_file.name
                            temp_chunk_spec_file.close()

                            # Run demixing on chunk based on selected model
                            if use_beat_transformer_light:
                                # Use the lightweight version for chunks
                                demix_audio_to_spectrogram_light(temp_chunk_path, temp_chunk_spec_path)
                            else:
                                # Use the full version for chunks
                                demix_audio_to_spectrogram(temp_chunk_path, temp_chunk_spec_path)

                            # Process chunk
                            # Calculate max_time for this chunk (relative to chunk start)
                            chunk_max_time = min(end_time - start_time, 120)  # Limit to 120 seconds per chunk

                            # Import the beat tracking function if not already imported
                            try:
                                # The path should already be in sys.path from the demix_spectrogram import
                                from beat_tracking_demo import run_beat_tracking
                                print("Successfully imported run_beat_tracking")
                            except ImportError as e:
                                print(f"Error importing run_beat_tracking: {e}")
                                raise

                            # Fix numpy float issue for each chunk
                            import numpy as np
                            if not hasattr(np, 'float'):
                                np.float = float
                            if not hasattr(np, 'int'):
                                np.int = int

                            print(f"Calling run_beat_tracking for chunk with:")
                            print(f"  - demixed_spec_file: {temp_chunk_spec_path}")
                            print(f"  - audio_file: {temp_chunk_path}")
                            print(f"  - param_path: {checkpoint_path}")
                            print(f"  - max_time: {chunk_max_time}")

                            chunk_beat_times, chunk_downbeat_times = run_beat_tracking(
                                demixed_spec_file=temp_chunk_spec_path,
                                audio_file=temp_chunk_path,
                                param_path=checkpoint_path,
                                max_time=chunk_max_time
                            )

                            # Debug: Print chunk results
                            print(f"DEBUG - Chunk {chunk_count} results:")
                            print(f"  - Found {len(chunk_beat_times)} beats, time range: ", end="")
                            if len(chunk_beat_times) > 0:
                                print(f"{chunk_beat_times[0]:.2f}s to {chunk_beat_times[-1]:.2f}s")
                            else:
                                print("N/A (no beats found)")

                            print(f"  - Found {len(chunk_downbeat_times)} downbeats, time range: ", end="")
                            if len(chunk_downbeat_times) > 0:
                                print(f"{chunk_downbeat_times[0]:.2f}s to {chunk_downbeat_times[-1]:.2f}s")
                            else:
                                print("N/A (no downbeats found)")

                            # Adjust times to global timeline
                            chunk_beat_times = chunk_beat_times + start_time
                            chunk_downbeat_times = chunk_downbeat_times + start_time

                            # Debug: Print adjusted times
                            print(f"DEBUG - Chunk {chunk_count} adjusted to global timeline:")
                            if len(chunk_beat_times) > 0:
                                print(f"  - Beats: {chunk_beat_times[0]:.2f}s to {chunk_beat_times[-1]:.2f}s")
                            if len(chunk_downbeat_times) > 0:
                                print(f"  - Downbeats: {chunk_downbeat_times[0]:.2f}s to {chunk_downbeat_times[-1]:.2f}s")

                            # For all chunks except the first, remove beats in the overlap region
                            # that are too close to beats from the previous chunk
                            if start_time > 0 and len(all_beat_times) > 0:
                                # Only keep beats that are at least 0.1s after the last beat of previous chunk
                                min_time = all_beat_times[-1] + 0.1
                                chunk_beat_times = chunk_beat_times[chunk_beat_times > min_time]

                                # Only keep downbeats that are at least 0.5s after the last downbeat
                                if len(all_downbeat_times) > 0:
                                    min_downbeat_time = all_downbeat_times[-1] + 0.5
                                    chunk_downbeat_times = chunk_downbeat_times[chunk_downbeat_times > min_downbeat_time]

                            # Add to overall results
                            all_beat_times.extend(chunk_beat_times)
                            all_downbeat_times.extend(chunk_downbeat_times)

                            # Clean up temporary files
                            try:
                                os.unlink(temp_chunk_path)
                                os.unlink(temp_chunk_spec_path)
                            except Exception as e:
                                print(f"Warning: Failed to clean up temporary chunk files: {e}")

                        # Sort and convert to numpy arrays
                        beat_times = np.array(sorted(all_beat_times))
                        downbeat_times = np.array(sorted(all_downbeat_times))

                        print(f"\nDEBUG - Final combined results:")
                        print(f"Total beats after chunking: {len(beat_times)}")
                        print(f"Total downbeats after chunking: {len(downbeat_times)}")

                        # Print time range of beats and downbeats
                        if len(beat_times) > 0:
                            print(f"Beat time range: {beat_times[0]:.2f}s to {beat_times[-1]:.2f}s")
                        if len(downbeat_times) > 0:
                            print(f"Downbeat time range: {downbeat_times[0]:.2f}s to {downbeat_times[-1]:.2f}s")

                        # Print the last 10 beats and downbeats
                        print("\nDEBUG - Last 10 beats from combined results:")
                        for i in range(max(0, len(beat_times) - 10), len(beat_times)):
                            print(f"Beat {i+1}: {beat_times[i]:.2f}s")

                        print("\nDEBUG - Last 10 downbeats from combined results:")
                        for i in range(max(0, len(downbeat_times) - 10), len(downbeat_times)):
                            print(f"Downbeat {i+1}: {downbeat_times[i]:.2f}s")
                    else:
                        # For shorter audio, process normally
                        # Import the beat tracking function if not already imported
                        try:
                            # The path should already be in sys.path from the demix_spectrogram import
                            from beat_tracking_demo import run_beat_tracking
                            print("Successfully imported run_beat_tracking")
                        except ImportError as e:
                            print(f"Error importing run_beat_tracking: {e}")
                            raise

                        # Fix numpy float issue for full audio
                        import numpy as np
                        if not hasattr(np, 'float'):
                            np.float = float
                        if not hasattr(np, 'int'):
                            np.int = int

                        print(f"Calling run_beat_tracking for full audio with:")
                        print(f"  - demixed_spec_file: {temp_spec_path}")
                        print(f"  - audio_file: {file_path}")
                        print(f"  - param_path: {checkpoint_path}")

                        beat_times, downbeat_times = run_beat_tracking(
                            demixed_spec_file=temp_spec_path,
                            audio_file=file_path,
                            param_path=checkpoint_path
                        )

                    # IMPORTANT: Get the time signature from the Beat-Transformer model FIRST
                    # before generating beat positions
                    model_time_signature = 4  # Default fallback
                    try:
                        # Import the detector with correct path
                        import sys
                        models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
                        if models_dir not in sys.path:
                            sys.path.insert(0, models_dir)

                        if use_beat_transformer_light:
                            from beat_transformer_detector_light import BeatTransformerDetectorLight
                            detector = BeatTransformerDetectorLight(checkpoint_path)
                        else:
                            from beat_transformer_detector import BeatTransformerDetector
                            detector = BeatTransformerDetector(checkpoint_path)

                        # Call the detector to get the full result including time signature
                        detector_result = detector.detect_beats(file_path)

                        if detector_result and detector_result.get("success") and "time_signature" in detector_result:
                            model_time_signature = detector_result["time_signature"]
                            print(f"DEBUG: Beat-Transformer model detected time signature: {model_time_signature}/4")
                        else:
                            print(f"DEBUG: Could not get time signature from Beat-Transformer detector, using default 4/4")

                    except Exception as e:
                        print(f"DEBUG: Error calling Beat-Transformer detector for time signature: {e}")
                        print(f"DEBUG: Using default 4/4 time signature")

                    # For long audio processed in chunks, we need to generate the beat positions ourselves
                    if duration > 150:
                        print("Generating beat and downbeat positions for chunked audio...")

                        # Generate downbeat positions first
                        downbeats_with_measures = []
                        for i, downbeat_time in enumerate(downbeat_times):
                            downbeats_with_measures.append({
                                "time": float(downbeat_time),
                                "measureNum": i + 1  # Measure numbers start from 1
                            })

                        # Generate beat positions using the model's detected time signature
                        beats_with_positions = []

                        # Try to read the correct pattern from the first chunk
                        first_chunk_pattern = []
                        try:
                            with open('beats_with_positions.txt', 'r') as f:
                                for line in f:
                                    parts = line.strip().split('\t')
                                    if len(parts) >= 2:
                                        beat_num_part = parts[1].strip().replace('beatNum: ', '')
                                        try:
                                            beat_num = int(beat_num_part)
                                            first_chunk_pattern.append(beat_num)
                                        except (ValueError, TypeError):
                                            continue

                            print(f"DEBUG: Loaded pattern from first chunk: {first_chunk_pattern[:20]}")

                            # Detect time signature from the first chunk pattern
                            if len(first_chunk_pattern) >= 10:
                                # Analyze the pattern to detect time signature
                                detected_time_sig = detect_time_signature_from_pattern(first_chunk_pattern)
                                if detected_time_sig:
                                    model_time_signature = detected_time_sig
                                    print(f"DEBUG: Detected time signature from first chunk pattern: {model_time_signature}/4")
                                    print(f"DEBUG: Overriding detector time signature with pattern-detected time signature")

                        except FileNotFoundError:
                            print("Warning: beats_with_positions.txt not found, will generate pattern")
                            first_chunk_pattern = []

                        # Now generate beat positions for ALL beats using the correct pattern
                        if first_chunk_pattern and len(first_chunk_pattern) >= 10:
                            # Use the pattern from the first chunk to generate positions for all beats
                            print(f"DEBUG: Applying first chunk pattern to all {len(beat_times)} beats")

                            # Detect the repeating cycle from the first chunk pattern
                            detected_cycle = None
                            pickup_count = 0

                            # Try to find the repeating pattern - FIXED to handle pickup beats
                            for cycle_len in range(2, 13):  # Test cycle lengths from 2 to 12
                                if len(first_chunk_pattern) >= cycle_len * 2:
                                    # Look for the pattern starting at different offsets
                                    for start_offset in range(min(5, len(first_chunk_pattern) - cycle_len * 2)):
                                        pattern_slice = first_chunk_pattern[start_offset:]
                                        first_cycle = pattern_slice[:cycle_len]
                                        second_cycle = pattern_slice[cycle_len:cycle_len*2]

                                        # PICKUP BEAT FIX: Check if it's a valid repeating beat pattern
                                        # Allow patterns that don't start with 1 (pickup beats)
                                        if first_cycle == second_cycle:
                                            # Check if this is a valid beat sequence (consecutive numbers in any order)
                                            sorted_cycle = sorted(first_cycle)
                                            expected_sequence = list(range(1, cycle_len + 1))

                                            if sorted_cycle == expected_sequence:
                                                # This is a valid beat pattern, possibly with pickup beats
                                                detected_cycle = expected_sequence  # Use the canonical [1,2,3] form
                                                pickup_count = start_offset

                                                # Calculate actual pickup beats based on where the pattern starts
                                                first_beat_num = first_cycle[0]
                                                if first_beat_num != 1:
                                                    # Pattern starts with pickup beats
                                                    actual_pickup_count = cycle_len - first_beat_num + 1
                                                    pickup_count = actual_pickup_count
                                                    print(f"DEBUG: Found {cycle_len}-beat cycle with pickup beats. First beat: {first_beat_num}, pickup count: {pickup_count}")
                                                else:
                                                    print(f"DEBUG: Found {cycle_len}-beat cycle starting at offset {start_offset}: {detected_cycle}")
                                                break
                                    if detected_cycle:
                                        break

                            if detected_cycle:
                                # Use the detected cycle
                                regular_cycle = detected_cycle
                                print(f"DEBUG: Using detected cycle with {pickup_count} pickup beats: {regular_cycle}")
                            else:
                                # Fallback: use the model's detected time signature
                                regular_cycle = list(range(1, model_time_signature + 1))
                                pickup_count = 0
                                print(f"DEBUG: Using fallback pattern based on time signature {model_time_signature}/4: {regular_cycle}")

                            # Generate beat positions with proper pickup beat handling
                            print(f"\n=== BEAT NUMBERING WITH PICKUP HANDLING (Beat-Transformer) ===")
                            print(f"Processing {len(beat_times)} beats with {pickup_count} pickup beats")
                            print(f"Time signature: {model_time_signature}/4")
                            print(f"Regular cycle: {regular_cycle}")

                            # Strategy: For pickup beats, assign them the FINAL beat numbers of the time signature
                            # Then start regular measures from beat 1
                            for i, beat_time in enumerate(beat_times):
                                if i < pickup_count:
                                    # Pickup beats get the final beat numbers of the time signature
                                    # For 3/4 time with 1 pickup: beat gets number 3
                                    # For 4/4 time with 2 pickups: beats get numbers 3, 4
                                    pickup_beat_number = model_time_signature - pickup_count + i + 1
                                    beat_num = pickup_beat_number
                                else:
                                    # Regular beats: start fresh cycle from beat 1 after pickup beats
                                    regular_beat_index = i - pickup_count
                                    cycle_position = regular_beat_index % model_time_signature
                                    beat_num = cycle_position + 1  # Beat numbers are 1-indexed

                                beats_with_positions.append({
                                    "time": float(beat_time),
                                    "beatNum": int(beat_num)
                                })

                            # Debug output with timestamps for first few beats
                            print(f"First 10 beats with timestamps:")
                            for i in range(min(10, len(beats_with_positions))):
                                bp = beats_with_positions[i]
                                beat_type = "PICKUP" if i < pickup_count else f"REGULAR-{i-pickup_count+1}"
                                print(f"  Beat {i}: time={bp['time']:.3f}s, beatNum={bp['beatNum']} ({beat_type})")

                            # Show beat pattern
                            beat_pattern = [bp["beatNum"] for bp in beats_with_positions[:15]]
                            print(f"Beat number pattern (first 15): {beat_pattern}")

                            # Verify the pattern is correct
                            if pickup_count > 0:
                                expected_pickup = list(range(model_time_signature - pickup_count + 1, model_time_signature + 1))
                                actual_pickup = beat_pattern[:pickup_count]
                                print(f"Pickup verification: expected={expected_pickup}, actual={actual_pickup}")

                                if len(beat_pattern) > pickup_count + model_time_signature:
                                    first_measure = beat_pattern[pickup_count:pickup_count + model_time_signature]
                                    expected_measure = list(range(1, model_time_signature + 1))
                                    print(f"First full measure: expected={expected_measure}, actual={first_measure}")

                            print(f"=== END BEAT NUMBERING ===\n")

                        else:
                            print("DEBUG: Falling back to generation method")
                            # Don't hardcode time signature here - it will be set by the model detection

                            # Identify pickup beats (beats before the first downbeat)
                            pickup_beats = []
                            if len(downbeat_times) > 0:
                                first_downbeat = downbeat_times[0]
                                pickup_beats = [b for b in beat_times if b < first_downbeat]
                                print(f"DEBUG: Found {len(pickup_beats)} pickup beats before first downbeat at {first_downbeat:.2f}s")

                            # For each beat, determine its position within its measure
                            for i, beat_time in enumerate(beat_times):
                                # Handle pickup beats specially
                                if beat_time in pickup_beats:
                                    beat_num = 1  # All pickup beats are numbered as 1
                                else:
                                    # Find which measure this beat belongs to
                                    measure_idx = 0
                                    while measure_idx < len(downbeat_times) - 1 and beat_time >= downbeat_times[measure_idx + 1]:
                                        measure_idx += 1

                                    if measure_idx < len(downbeat_times):
                                        curr_downbeat = downbeat_times[measure_idx]

                                        # Count beats from the current downbeat up to (but not including) this beat
                                        beats_before = sum(1 for b in beat_times if curr_downbeat <= b < beat_time)
                                        beat_num = beats_before + 1

                                        # Ensure beat numbers are within the model's detected time signature
                                        beat_num = ((beat_num - 1) % model_time_signature) + 1
                                    else:
                                        # For beats in the last measure, use modulo model's time signature
                                        beat_num = ((i % model_time_signature) + 1)

                                beats_with_positions.append({
                                    "time": float(beat_time),
                                    "beatNum": int(beat_num)
                                })

                        # Debug: Print the first 20 beats to verify the pattern
                        print("\nDEBUG - First 20 beats with corrected positions:")
                        for i in range(min(20, len(beats_with_positions))):
                            beat = beats_with_positions[i]
                            print(f"Beat {i+1}: time={beat['time']:.2f}s, beatNum={beat['beatNum']}")

                        # Save the generated positions to files for consistency
                        with open('beats_with_positions.txt', 'w') as f:
                            for beat in beats_with_positions:
                                f.write(f"time: {beat['time']:.2f} \t beatNum: {beat['beatNum']}\n")

                        with open('downbeats_measures.txt', 'w') as f:
                            for entry in downbeats_with_measures:
                                f.write(f"time: {entry['time']:.2f} \t measureNum: {entry['measureNum']}\n")

                        # Debug: Print the last 10 downbeats to verify we're getting data beyond 167s
                        print("\nDEBUG - Last 10 downbeats:")
                        for i in range(max(0, len(downbeats_with_measures) - 10), len(downbeats_with_measures)):
                            print(f"Downbeat {i+1}: time={downbeats_with_measures[i]['time']:.2f}s, measure={downbeats_with_measures[i]['measureNum']}")

                        # Debug: Print the last 10 beats
                        print("\nDEBUG - Last 10 beats:")
                        for i in range(max(0, len(beats_with_positions) - 10), len(beats_with_positions)):
                            print(f"Beat {i+1}: time={beats_with_positions[i]['time']:.2f}s, beat={beats_with_positions[i]['beatNum']}")

                        print(f"Generated {len(beats_with_positions)} beat positions")
                        print(f"Generated {len(downbeats_with_measures)} downbeat positions")

                    else:
                        # For shorter audio, read from the generated files as before
                        # Read the beat positions from the generated file
                        beats_with_positions = []
                        try:
                            with open('beats_with_positions.txt', 'r') as f:
                                for line in f:
                                    parts = line.strip().split('\t')
                                    if len(parts) >= 2:
                                        time_part = parts[0].strip().replace('time: ', '')
                                        beat_num_part = parts[1].strip().replace('beatNum: ', '')
                                        try:
                                            time = float(time_part)
                                            beat_num = int(beat_num_part)
                                            beats_with_positions.append({
                                                "time": time,
                                                "beatNum": beat_num
                                            })
                                        except (ValueError, TypeError):
                                            print(f"Warning: Could not parse line: {line}")
                        except FileNotFoundError:
                            print("Warning: beats_with_positions.txt not found")
                            # Create simple beat positions if file not found
                            beats_with_positions = [
                                {"time": float(time), "beatNum": ((i % 4) + 1)}
                                for i, time in enumerate(beat_times)
                            ]

                        # Read downbeat positions
                        downbeats_with_measures = []
                        try:
                            with open('downbeats_measures.txt', 'r') as f:
                                for line in f:
                                    parts = line.strip().split('\t')
                                    if len(parts) >= 2:
                                        time_part = parts[0].strip().replace('time: ', '')
                                        measure_part = parts[1].strip().replace('measureNum: ', '')
                                        try:
                                            time = float(time_part)
                                            measure = int(measure_part)
                                            downbeats_with_measures.append({
                                                "time": time,
                                                "measureNum": measure
                                            })
                                        except (ValueError, TypeError):
                                            print(f"Warning: Could not parse line: {line}")
                        except FileNotFoundError:
                            print("Warning: downbeats_measures.txt not found")
                            # Create simple downbeat positions if file not found
                            downbeats_with_measures = [
                                {"time": float(time), "measureNum": i + 1}
                                for i, time in enumerate(downbeat_times)
                            ]
                except Exception as e:
                    print(f"Error using run_beat_tracking: {e}")
                    print(traceback.format_exc())

                    # Fall back to madmom beat detection
                    print("Falling back to madmom beat detection")

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

                    except Exception as e:
                        print(f"Error using madmom: {e}")
                        print(traceback.format_exc())

                        # Fall back to librosa as a last resort
                        print("Falling back to librosa beat detection as last resort")
                        y, sr = librosa.load(file_path, sr=None)
                        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
                        beat_times = librosa.frames_to_time(beats, sr=sr)

                        # Create simple beat positions
                        beats_with_positions = [
                            {"time": float(time), "beatNum": ((i % 4) + 1)}
                            for i, time in enumerate(beat_times)
                        ]

                        # Create simple downbeats (every 4th beat)
                        downbeat_times = beat_times[::4]
                        downbeats_with_measures = [
                            {"time": float(time), "measureNum": i + 1}
                            for i, time in enumerate(downbeat_times)
                        ]

                # Create beat_info with strength based on beat number
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

                # Calculate BPM from beat times
                if len(beat_times) > 1:
                    # Calculate intervals between beats
                    intervals = np.diff(beat_times)

                    # For long audio, calculate BPM in segments to detect changes
                    if duration > 150:
                        print("Calculating BPM for long audio...")

                        # Use a sliding window to calculate local BPM
                        window_size = 20  # beats
                        if len(intervals) >= window_size:
                            # Calculate BPM for each window
                            window_bpms = []
                            for i in range(0, len(intervals) - window_size + 1, window_size // 2):
                                window = intervals[i:i+window_size]
                                local_median = np.median(window)
                                local_bpm = 60.0 / local_median if local_median > 0 else 120.0
                                window_bpms.append(local_bpm)

                            # Use median of all window BPMs
                            bpm = np.median(window_bpms)
                            print(f"Calculated BPM from {len(window_bpms)} windows: {bpm:.2f}")
                        else:
                            # Calculate median interval in seconds
                            median_interval = np.median(intervals)
                            # Convert to BPM
                            bpm = 60.0 / median_interval if median_interval > 0 else 120.0
                    else:
                        # For shorter audio, use the standard approach
                        # Calculate median interval in seconds
                        median_interval = np.median(intervals)
                        # Convert to BPM
                        bpm = 60.0 / median_interval if median_interval > 0 else 120.0
                else:
                    bpm = 120.0  # Default BPM if not enough beats

                # Load audio to get duration
                audio, sr = librosa.load(file_path, sr=None)
                duration = librosa.get_duration(y=audio, sr=sr)

                # Clean up temporary files
                try:
                    os.unlink(temp_spec_path)
                    # Clean up the trimmed audio file
                    if 'original_file_path' in locals():
                        os.unlink(file_path)  # This is the trimmed file
                        print(f"Cleaned up trimmed audio file: {file_path}")
                    # Clean up the original uploaded file if it exists
                    if 'file' in request.files and 'original_file_path' in locals():
                        os.unlink(original_file_path)
                        print(f"Cleaned up original uploaded file: {original_file_path}")
                except Exception as e:
                    print(f"Warning: Failed to clean up temporary files: {e}")

                # Use the model's time signature that was detected earlier
                time_signature = model_time_signature
                print(f"DEBUG: Final time signature from Beat-Transformer model: {time_signature}/4")
                print(f"DEBUG: model_time_signature source: {'pattern detection' if model_time_signature != 4 else 'detector or default'}")

                # Prepare response
                response_data = {
                    "success": True,
                    "beats": beat_times.tolist(),
                    "beat_info": beat_info,
                    "downbeats": downbeat_times.tolist(),
                    "downbeats_with_measures": downbeats_with_measures,
                    "beats_with_positions": beats_with_positions,
                    "bpm": float(bpm),
                    "total_beats": len(beat_times),
                    "total_downbeats": len(downbeat_times),
                    "duration": float(duration),
                    "model": "beat-transformer-light" if use_beat_transformer_light else "beat-transformer",
                    "time_signature": int(time_signature)  # Use the model's detected time signature
                }

                # Debug: Log the final response data
                print(f"DEBUG: Final Beat-Transformer response data:")
                print(f"  time_signature: {response_data['time_signature']}")
                print(f"  bpm: {response_data['bpm']}")
                print(f"  model: {response_data['model']}")
                print(f"  total_beats: {response_data['total_beats']}")

                # Add chunking information for long audio
                if duration > 150:
                    response_data["processing_method"] = "chunked"
                    response_data["chunk_size"] = chunk_duration
                    response_data["chunk_overlap"] = overlap_duration

                return jsonify(response_data)

            except Exception as e:
                print(f"Error using Beat-Transformer: {e}")
                traceback.print_exc()

                # Clean up temporary files
                try:
                    if os.path.exists(temp_spec_path):
                        os.unlink(temp_spec_path)
                except Exception:
                    pass

                use_beat_transformer = False



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
                "time_signature": int(time_signature)  # Include the detected time signature
            }

            # Debug: Log the final response data
            print(f"DEBUG: Final Madmom response data:")
            print(f"  time_signature: {response_data['time_signature']}")
            print(f"  bpm: {response_data['bpm']}")
            print(f"  model: {response_data['model']}")
            print(f"  total_beats: {response_data['total_beats']}")

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

@app.route('/api/model-info', methods=['GET'])
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
    if USE_BEAT_TRANSFORMER_LIGHT:
        available_models.append("beat-transformer-light")
    if madmom_available:
        available_models.append("madmom")

    # Set beat-transformer-light as the default model if available
    if USE_BEAT_TRANSFORMER_LIGHT:
        default_model = "beat-transformer-light"
    elif USE_BEAT_TRANSFORMER:
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

    return jsonify({
        "success": True,
        "default_beat_model": default_model,
        "available_beat_models": available_models,
        "beat_transformer_available": USE_BEAT_TRANSFORMER,
        "beat_transformer_light_available": USE_BEAT_TRANSFORMER_LIGHT,
        "madmom_available": madmom_available,
        "chord_cnn_lstm_available": USE_CHORD_CNN_LSTM,
        "default_chord_model": "chord-cnn-lstm" if USE_CHORD_CNN_LSTM else "none",
        "available_chord_models": chord_models,
        "spleeter_info": spleeter_info,
        "file_size_limits": {
            "upload_limit_mb": 50,
            "local_file_limit_mb": 100,
            "beat_transformer_limit_mb": 100,
            "beat_transformer_light_limit_mb": 150,  # Light version can handle larger files
            "force_parameter_available": True
        },
        "beat_model_info": {
            "beat-transformer": {
                "name": "Beat-Transformer (Full)",
                "description": "High-precision ML model with 5-channel audio separation",
                "channels": 5,
                "performance": "High accuracy, slower processing",
                "uses_spleeter": True
            },
            "beat-transformer-light": {
                "name": "Beat-Transformer (Light)",
                "description": "Optimized version with single-channel processing",
                "channels": 1,
                "performance": "Good accuracy, faster processing",
                "uses_spleeter": False
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
                "available_chord_dicts": ["full", "ismir2017", "submission", "extended"]
            }
        }
    })

if __name__ == '__main__':
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)