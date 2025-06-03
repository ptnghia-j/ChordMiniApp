import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import numpy as np
import soundfile as sf
import traceback
import sys
from pathlib import Path

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
                print(f"Beat Transformer checkpoint found and dependencies available")
            except ImportError as e:
                print(f"madmom import failed: {e}")
                USE_BEAT_TRANSFORMER = True  # Still try to use Beat-Transformer even without madmom
                print(f"Will try to use Beat Transformer without madmom")
        except ImportError as e:
            print(f"PyTorch import failed: {e}")
            USE_BEAT_TRANSFORMER = False
            print(f"Beat Transformer requires PyTorch")
    else:
        USE_BEAT_TRANSFORMER = False
        print(f"Beat Transformer checkpoint not found at: {checkpoint_path}")
except Exception as e:
    print(f"Warning: Could not check Beat Transformer checkpoint: {e}")
    USE_BEAT_TRANSFORMER = False

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

# Check if Genius API is available
try:
    import lyricsgenius
    GENIUS_AVAILABLE = True
    print("lyricsgenius library is available")
except ImportError:
    GENIUS_AVAILABLE = False
    print("lyricsgenius library not available. Install with: pip install lyricsgenius")

@app.route('/')
def index():
    return jsonify({
        "status": "healthy",
        "message": "Audio analysis API is running",
        "beat_model": "Beat-Transformer" if USE_BEAT_TRANSFORMER else "librosa",
        "chord_model": "Chord-CNN-LSTM" if USE_CHORD_CNN_LSTM else "None",
        "genius_available": GENIUS_AVAILABLE
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



        # Select detector based on request and availability
        if detector == 'beat-transformer':
            if USE_BEAT_TRANSFORMER:
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
            if file_size_mb <= 50 and USE_BEAT_TRANSFORMER:
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

                    # OPTIMIZATION: Remove high-level chunking for better accuracy
                    # Allow the Beat-Transformer model to handle its own chunking internally
                    # This eliminates one layer of chunking that was causing timing issues

                    # Check if we should force single-pass processing
                    FORCE_SINGLE_PASS_PROCESSING = True  # Set to True to eliminate high-level chunking
                    MAX_SINGLE_PASS_DURATION = 600  # Maximum duration (10 minutes) for single-pass

                    if duration > MAX_SINGLE_PASS_DURATION and not FORCE_SINGLE_PASS_PROCESSING:
                        print(f"Very long audio detected ({duration:.2f}s). Processing in chunks...")

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
                    elif FORCE_SINGLE_PASS_PROCESSING:
                        print(f"OPTIMIZATION: Processing entire audio ({duration:.2f}s) in single pass")
                        print("High-level chunking disabled - letting Beat-Transformer handle internal chunking")

                    if duration > MAX_SINGLE_PASS_DURATION and not FORCE_SINGLE_PASS_PROCESSING:
                        # Only execute chunking logic if we're not forcing single-pass
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

                            # Run demixing on chunk
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
                            print(f"DEBUG - Chunk {chunk_count} results (relative to chunk start):")
                            print(f"  - Found {len(chunk_beat_times)} beats, time range: ", end="")
                            if len(chunk_beat_times) > 0:
                                print(f"{chunk_beat_times[0]:.3f}s to {chunk_beat_times[-1]:.3f}s")
                                print(f"  - First 3 beats: {chunk_beat_times[:3]}")
                            else:
                                print("N/A (no beats found)")

                            print(f"  - Found {len(chunk_downbeat_times)} downbeats, time range: ", end="")
                            if len(chunk_downbeat_times) > 0:
                                print(f"{chunk_downbeat_times[0]:.3f}s to {chunk_downbeat_times[-1]:.3f}s")
                            else:
                                print("N/A (no downbeats found)")

                            # Adjust times to global timeline
                            chunk_beat_times = chunk_beat_times + start_time
                            chunk_downbeat_times = chunk_downbeat_times + start_time

                            # Debug: Print adjusted times
                            print(f"DEBUG - Chunk {chunk_count} adjusted to global timeline:")
                            if len(chunk_beat_times) > 0:
                                print(f"  - Beats: {chunk_beat_times[0]:.3f}s to {chunk_beat_times[-1]:.3f}s")
                                print(f"  - First 3 global beats: {chunk_beat_times[:3]}")
                            if len(chunk_downbeat_times) > 0:
                                print(f"  - Downbeats: {chunk_downbeat_times[0]:.3f}s to {chunk_downbeat_times[-1]:.3f}s")

                            # Pure model output - no overlap filtering or beat adjustment

                            # Add to overall results
                            all_beat_times.extend(chunk_beat_times)
                            all_downbeat_times.extend(chunk_downbeat_times)

                            # Debug: Show cumulative results
                            print(f"DEBUG - Cumulative results after chunk {chunk_count}:")
                            print(f"  - Total beats so far: {len(all_beat_times)}")
                            if len(all_beat_times) > 0:
                                print(f"  - First beat overall: {all_beat_times[0]:.3f}s")
                                print(f"  - Last beat overall: {all_beat_times[-1]:.3f}s")

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
                        # OPTIMIZATION: Single-pass processing (no high-level chunking)
                        # This allows the Beat-Transformer model to handle its own internal chunking
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

                        print(f"SINGLE-PASS: Calling run_beat_tracking for full audio ({duration:.2f}s) with:")
                        print(f"  - demixed_spec_file: {temp_spec_path}")
                        print(f"  - audio_file: {file_path}")
                        print(f"  - param_path: {checkpoint_path}")
                        print("  - Internal model chunking will be handled by Beat-Transformer")

                        beat_times, downbeat_times, beat_time_range_start, beat_time_range_end = run_beat_tracking(
                            demixed_spec_file=temp_spec_path,
                            audio_file=file_path,
                            param_path=checkpoint_path
                        )

                        print(f"SINGLE-PASS: Completed processing {duration:.2f}s audio")
                        print(f"  - Detected {len(beat_times)} beats")
                        print(f"  - Detected {len(downbeat_times)} downbeats")
                        print(f"  - Beat time range: {beat_time_range_start:.3f}s to {beat_time_range_end:.3f}s")

                    # Pure model outputs - no time signature detection or post-processing

                    # Pure model outputs - no beat position generation
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

                # Simple BPM calculation from raw beat times
                if len(beat_times) > 1:
                    intervals = np.diff(beat_times)
                    median_interval = np.median(intervals)
                    bpm = 60.0 / median_interval if median_interval > 0 else 120.0
                else:
                    bpm = 120.0

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

                # Get time signature from the Beat-Transformer model
                time_signature = 4  # Default fallback
                try:
                    # Import the detector to get time signature
                    import sys
                    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
                    if models_dir not in sys.path:
                        sys.path.insert(0, models_dir)

                    from beat_transformer_detector import BeatTransformerDetector
                    detector = BeatTransformerDetector(checkpoint_path)

                    # Call the detector to get the full result including time signature
                    detector_result = detector.detect_beats(file_path)

                    if detector_result and detector_result.get("success") and "time_signature" in detector_result:
                        time_signature = detector_result["time_signature"]
                        print(f"DEBUG: Beat-Transformer detected time signature: {time_signature}/4")
                    else:
                        print(f"DEBUG: Could not get time signature from Beat-Transformer, using default 4/4")

                except Exception as e:
                    print(f"DEBUG: Error getting time signature from Beat-Transformer: {e}")
                    print(f"DEBUG: Using default 4/4 time signature")

                # Use beat time range from the model (already calculated in single-pass processing)
                # For chunked processing, calculate from the combined results
                if FORCE_SINGLE_PASS_PROCESSING:
                    # beat_time_range_start and beat_time_range_end already set from run_beat_tracking
                    first_detected_beat = float(beat_times[0]) if len(beat_times) > 0 else 0.0
                else:
                    # For chunked processing, calculate from combined results
                    first_detected_beat = float(beat_times[0]) if len(beat_times) > 0 else 0.0
                    beat_time_range_start = first_detected_beat
                    beat_time_range_end = float(beat_times[-1]) if len(beat_times) > 0 else duration

                # Debug: Log the beat time range calculation
                print(f"DEBUG: Beat time range calculation:")
                print(f"  First detected beat: {first_detected_beat:.3f}s")
                print(f"  Beat time range start: {beat_time_range_start:.3f}s")
                print(f"  Beat time range end: {beat_time_range_end:.3f}s")

                # REMOVED: Timing offset calculation - no longer needed
                print(f"  Using direct model outputs without timing offset")

                # Prepare pure model output response
                response_data = {
                    "success": True,
                    "beats": beat_times.tolist(),
                    "downbeats": downbeat_times.tolist(),
                    "bpm": float(bpm),
                    "total_beats": len(beat_times),
                    "total_downbeats": len(downbeat_times),
                    "duration": float(duration),
                    "model": "beat-transformer",
                    "time_signature": int(time_signature),  # Include the detected time signature
                    "beat_time_range_start": beat_time_range_start,  # Start of beat time range
                    "beat_time_range_end": beat_time_range_end       # End of beat time range
                }

                # Debug: Log the pure model output response
                print(f"DEBUG: Pure model output response:")
                print(f"  bpm: {response_data['bpm']}")
                print(f"  model: {response_data['model']}")
                print(f"  total_beats: {response_data['total_beats']}")
                print(f"  total_downbeats: {response_data['total_downbeats']}")
                print(f"  duration: {response_data['duration']}")
                print(f"  time_signature: {response_data['time_signature']}/4")
                print(f"  beat_time_range: {response_data['beat_time_range_start']:.3f}s to {response_data['beat_time_range_end']:.3f}s")

                # Add processing method information
                if FORCE_SINGLE_PASS_PROCESSING:
                    response_data["processing_method"] = "single-pass"
                elif duration > MAX_SINGLE_PASS_DURATION:
                    response_data["processing_method"] = "chunked"
                else:
                    response_data["processing_method"] = "single-pass"

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
        # Check if BTC model is available
        if model_variant == 'sl' and not USE_BTC_SL:
            return jsonify({
                "error": "BTC SL model is not available. Please check the server logs for details."
            }), 500
        elif model_variant == 'pl' and not USE_BTC_PL:
            return jsonify({
                "error": "BTC PL model is not available. Please check the server logs for details."
            }), 500

        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({"error": f"File not found: {file_path}"}), 404

        # Create a temporary file for the lab output
        temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
        lab_path = temp_lab_file.name
        temp_lab_file.close()

        # Run BTC chord recognition
        try:
            # Import the BTC module directly from the python_backend directory
            from btc_chord_recognition import btc_chord_recognition
            print(f"Running BTC {model_variant.upper()} chord recognition on {file_path}")
            success = btc_chord_recognition(file_path, lab_path, model_variant)
            if not success:
                return jsonify({
                    "error": f"BTC {model_variant.upper()} chord recognition failed. See server logs for details."
                }), 500
        except Exception as e:
            print(f"Error in BTC chord_recognition: {e}")
            traceback.print_exc()
            return jsonify({
                "error": f"BTC {model_variant.upper()} chord recognition failed: {str(e)}"
            }), 500

        # Parse the lab file to extract chord data
        chord_data = []
        try:
            with open(lab_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        parts = line.split()
                        if len(parts) >= 3:
                            start_time = float(parts[0])
                            end_time = float(parts[1])
                            chord_name = ' '.join(parts[2:])  # Handle chord names with spaces

                            chord_data.append({
                                'start': start_time,
                                'end': end_time,
                                'chord': chord_name,
                                'confidence': 0.9  # Default confidence for BTC models
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

        # Prepare response
        response_data = {
            "success": True,
            "chords": chord_data,
            "total_chords": len(chord_data),
            "model": f"btc-{model_variant}",
            "chord_dict": "large_voca"
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

        # Get Genius API key from environment
        genius_api_key = os.environ.get('GENIUS_API_KEY')
        if not genius_api_key:
            return jsonify({
                "success": False,
                "error": "Genius API key not configured. Please set GENIUS_API_KEY environment variable."
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

@app.route('/api/lrclib-lyrics', methods=['POST'])
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

if __name__ == '__main__':
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)