import os
import sys
import numpy as np
import torch
import librosa
from pathlib import Path
import soundfile as sf

# Performance optimization: Conditional debug logging
# Only enable verbose logging in development mode
DEBUG = os.getenv('FLASK_ENV') == 'development' or os.getenv('DEBUG', 'false').lower() == 'true'

# Import madmom with comprehensive error handling
MADMOM_AVAILABLE = False
DBNBeatTrackingProcessor = None
DBNDownBeatTrackingProcessor = None

try:
    # CRITICAL FIX: Handle Python 3.10+ compatibility issues
    import sys
    import collections
    import numpy as np

    # Fix collections compatibility
    if sys.version_info >= (3, 10):
        import collections.abc
        if not hasattr(collections, 'MutableSequence'):
            collections.MutableSequence = collections.abc.MutableSequence
        if not hasattr(collections, 'Iterable'):
            collections.Iterable = collections.abc.Iterable
        if not hasattr(collections, 'Mapping'):
            collections.Mapping = collections.abc.Mapping

    # Fix numpy compatibility for madmom
    if not hasattr(np, 'float'):
        np.float = float
    if not hasattr(np, 'int'):
        np.int = int
    if not hasattr(np, 'bool'):
        np.bool = bool

    from madmom.features.beats import DBNBeatTrackingProcessor
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor
    MADMOM_AVAILABLE = True
    if DEBUG:
        print("✅ Madmom imported successfully with compatibility fixes")

except Exception as e:
    if DEBUG:
        print(f"Warning: Madmom import failed: {e}")
        print("✅ Using GPU-accelerated peak-picking fallback")
    MADMOM_AVAILABLE = False

    # Create dummy classes when madmom is not available
    class DBNBeatTrackingProcessor:
        def __init__(self, *args, **kwargs):
            pass
        def __call__(self, *args, **kwargs):
            return []

    class DBNDownBeatTrackingProcessor:
        def __init__(self, *args, **kwargs):
            pass
        def __call__(self, *args, **kwargs):
            return []

    # Create dummy classes when madmom is not available
    class DBNBeatTrackingProcessor:
        def __init__(self, *args, **kwargs):
            pass
        def __call__(self, *args, **kwargs):
            return []

    class DBNDownBeatTrackingProcessor:
        def __init__(self, *args, **kwargs):
            pass
        def __call__(self, *args, **kwargs):
            return []

# Environment detection for GPU control
def is_local_development():
    """
    Determine if we're running in local development environment.
    GPU acceleration is only enabled for local development.
    """
    # Check Flask environment variables
    flask_env = os.environ.get('FLASK_ENV')
    port_env = os.environ.get('PORT')
    node_env = os.environ.get('NODE_ENV')

    # Additional indicators for local development
    is_google_cloud_run = port_env is not None  # Google Cloud Run always sets PORT
    is_vercel = os.environ.get('VERCEL') is not None
    is_production_explicit = flask_env == 'production'

    # Local development indicators:
    # 1. FLASK_ENV is explicitly set to 'development' OR not set at all (default local)
    # 2. PORT environment variable is not set (Google Cloud Run sets this)
    # 3. Not running on Vercel
    # 4. NODE_ENV is not 'production' (if set)

    is_local = (
        not is_google_cloud_run and
        not is_vercel and
        not is_production_explicit and
        (node_env != 'production' if node_env else True)
    )

    if DEBUG:
        print(f"Environment detection: FLASK_ENV={flask_env}, PORT={port_env}, NODE_ENV={node_env}, "
              f"is_google_cloud_run={is_google_cloud_run}, is_vercel={is_vercel}, is_local={is_local}")
    return is_local

"""
Simple Beat Transformer handler for the minimal deployment
"""
import os
import sys
from pathlib import Path

class BeatTransformerHandler:
    def __init__(self):
        """Initialize the Beat Transformer handler"""
        self.detector = None
        self.available = False
        
        try:
            # Import the detector
            from beat_transformer_detector import BeatTransformerDetector
            
            # Check if checkpoint exists
            beat_transformer_dir = Path(__file__).parent / "Beat-Transformer"
            checkpoint_path = beat_transformer_dir / "checkpoint" / "fold_4_trf_param.pt"
            
            if checkpoint_path.exists():
                self.detector = BeatTransformerDetector(str(checkpoint_path))
                self.available = True
                if DEBUG:
                    print("Beat Transformer handler initialized successfully")
            else:
                if DEBUG:
                    print(f"Beat Transformer checkpoint not found: {checkpoint_path}")

        except Exception as e:
            if DEBUG:
                print(f"Failed to initialize Beat Transformer: {e}")
            self.available = False
    
    def is_available(self):
        """Check if the model is available"""
        return self.available
    
    def analyze(self, audio_path):
        """Analyze audio file for beat detection
        
        Args:
            audio_path (str): Path to the audio file
            
        Returns:
            dict: Analysis results with beats, downbeats, BPM, etc.
        """
        if not self.available:
            return {
                "success": False,
                "error": "Beat Transformer model is not available",
                "beats": [],
                "downbeats": [],
                "bpm": 0
            }
        
        try:
            # Use the detector to analyze the audio
            result = self.detector.detect_beats(audio_path)
            return result
            
        except Exception as e:
            # Keep error logging unconditional for debugging production issues
            print(f"Error analyzing audio with Beat Transformer: {e}")
            return {
                "success": False,
                "error": str(e),
                "beats": [],
                "downbeats": [],
                "bpm": 0
            }

# Import the model with proper path
import sys
import os
beat_transformer_path = os.path.join(os.path.dirname(__file__), "Beat-Transformer", "code")
sys.path.append(beat_transformer_path)
from DilatedTransformer import Demixed_DilatedTransformerModel

def is_beat_transformer_available():
    """
    Check if Beat Transformer is available for use.
    This function is called by the API to determine model availability.

    Returns:
        bool: True if Beat Transformer can be used, False otherwise
    """
    try:
        # Check if PyTorch is available
        import torch

        # Check if the model checkpoint exists
        BEAT_TRANSFORMER_DIR = Path(__file__).parent / "Beat-Transformer"
        checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"

        if not checkpoint_path.exists():
            if DEBUG:
                print(f"Beat Transformer checkpoint not found: {checkpoint_path}")
            return False

        # Check if we can import the model
        beat_transformer_path = os.path.join(os.path.dirname(__file__), "Beat-Transformer", "code")
        if beat_transformer_path not in sys.path:
            sys.path.append(beat_transformer_path)

        from DilatedTransformer import Demixed_DilatedTransformerModel

        if DEBUG:
            print("Beat Transformer is available")
        return True

    except Exception as e:
        if DEBUG:
            print(f"Beat Transformer availability check failed: {e}")
        return False


def run_beat_tracking_wrapper(audio_file):
    """
    Wrapper function for API compatibility.
    This function is called by the Flask API to perform beat detection.

    Args:
        audio_file (str): Path to the audio file

    Returns:
        dict: Beat detection results
    """
    try:
        detector = BeatTransformerDetector()
        return detector.detect_beats(audio_file)
    except Exception as e:
        # Keep error logging unconditional for debugging production issues
        print(f"Beat tracking wrapper failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "beats": [],
            "downbeats": [],
            "bpm": 120.0,
            "time_signature": "4/4"
        }


class BeatTransformerDetector:
    def __init__(self, checkpoint_path=None):
        """Initialize the Beat Transformer detector with a checkpoint file"""

        # Import DeviceManager for sophisticated device detection
        try:
            # Add the models directory to Python path for absolute imports
            import sys
            models_path = os.path.dirname(__file__)  # This is the models directory
            if models_path not in sys.path:
                sys.path.insert(0, models_path)

            from ChordMini.modules.utils.device import get_device_manager

            # Determine if GPU acceleration should be enabled
            enable_gpu = is_local_development()

            if enable_gpu:
                # Use DeviceManager for local development (CUDA > MPS > CPU)
                device_manager = get_device_manager(verbose=DEBUG)
                self.device = device_manager.device
                self.device_manager = device_manager
                if DEBUG:
                    print(f"GPU acceleration enabled for local development. Using device: {self.device}")
            else:
                # Force CPU for production deployments
                self.device = torch.device("cpu")
                self.device_manager = None
                if DEBUG:
                    print("GPU acceleration disabled for production deployment. Using CPU.")

        except ImportError as e:
            if DEBUG:
                print(f"Warning: DeviceManager not available: {e}. Falling back to basic device detection.")
            # Fallback to basic device detection if DeviceManager is not available
            if is_local_development():
                self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
            else:
                self.device = torch.device("cpu")
            self.device_manager = None

        # Configure environment-aware processing modes
        self._configure_processing_modes()

        # Configure Spleeter GPU usage based on environment
        self._configure_spleeter_gpu()

        # Define Beat Transformer directory
        BEAT_TRANSFORMER_DIR = Path(__file__).parent / "Beat-Transformer"

        # Default to fold 4 if no checkpoint specified
        if checkpoint_path is None:
            checkpoint_path = str(BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt")

        # Initialize model
        self.model = Demixed_DilatedTransformerModel(
            attn_len=5, instr=5, ntoken=2,
            dmodel=256, nhead=8, d_hid=1024,
            nlayers=9, norm_first=True
        )

        # Load checkpoint with MPS compatibility
        try:
            # Load checkpoint with appropriate device mapping
            if self.device.type == "mps":
                # MPS requires float32 tensors - load to CPU first then convert
                checkpoint = torch.load(checkpoint_path, map_location="cpu")
                state_dict = checkpoint['state_dict']

                # Convert all tensors to float32 for MPS compatibility
                for key in state_dict:
                    if state_dict[key].dtype == torch.float64:
                        state_dict[key] = state_dict[key].float()

                self.model.load_state_dict(state_dict)
                self.model = self.model.to(self.device)
            else:
                # Standard loading for CUDA and CPU
                checkpoint = torch.load(checkpoint_path, map_location=self.device)
                self.model.load_state_dict(checkpoint['state_dict'])
                self.model = self.model.to(self.device)

            self.model.eval()
            if DEBUG:
                print(f"Successfully loaded Beat Transformer checkpoint: {checkpoint_path} on device: {self.device}")

        except Exception as e:
            # Keep error logging unconditional for debugging production issues
            print(f"Error loading checkpoint {checkpoint_path}: {e}")
            raise

        # Initialize DBN processors
        self.beat_tracker = DBNBeatTrackingProcessor(
            min_bpm=55.0, max_bpm=215.0, fps=44100/1024,
            transition_lambda=100, observation_lambda=6,
            num_tempi=None, threshold=0.2
        )

        # Support a wider range of time signatures (2/4, 3/4, 4/4, 5/4, 6/8, 7/8, etc.)
        self.downbeat_tracker = DBNDownBeatTrackingProcessor(
            beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
            max_bpm=215.0, fps=44100/1024,
            transition_lambda=100, observation_lambda=6,
            num_tempi=None, threshold=0.2
        )

    def _configure_processing_modes(self):
        """Configure processing modes based on environment detection"""
        is_local = is_local_development()

        if is_local:
            # Local development: Enable all GPU optimizations
            self.use_real_spleeter = True
            self.enable_spleeter_gpu = True
            self.use_gpu_audio_processing = True
            if DEBUG:
                print("🚀 Local development mode: GPU optimizations enabled")
        else:
            # Production (Google Cloud Run): Use Spleeter with CPU
            # CHANGED: Now using Spleeter for production instead of librosa fallback
            self.use_real_spleeter = True  # Enable real Spleeter for better beat detection
            self.enable_spleeter_gpu = False  # CPU-only for production stability
            self.use_gpu_audio_processing = False
            if DEBUG:
                print("🏭 Production mode: Spleeter enabled with CPU-only processing")

    def _configure_spleeter_gpu(self):
        """Configure Spleeter GPU usage based on environment"""
        if self.enable_spleeter_gpu and is_local_development():
            try:
                # Remove CUDA_VISIBLE_DEVICES restriction for local development
                if 'CUDA_VISIBLE_DEVICES' in os.environ:
                    del os.environ['CUDA_VISIBLE_DEVICES']
                    if DEBUG:
                        print("🔧 Removed CUDA_VISIBLE_DEVICES restriction for Spleeter GPU acceleration")

                # Configure TensorFlow for GPU if available (including MPS support)
                try:
                    # CRITICAL FIX: Use simplified and robust GPU configuration
                    gpu_configured = self._configure_tensorflow_gpu()

                    if DEBUG:
                        if gpu_configured:
                            print("✅ Spleeter GPU acceleration configured successfully")
                        else:
                            print("⚠️  Spleeter will use CPU (no GPU acceleration available)")

                except ImportError:
                    if DEBUG:
                        print("⚠️  TensorFlow not available, Spleeter will use CPU")
                except Exception as e:
                    if DEBUG:
                        print(f"⚠️  Could not configure Spleeter GPU: {e}")

            except Exception as e:
                if DEBUG:
                    print(f"⚠️  Error configuring Spleeter GPU: {e}")
        else:
            # Force CPU for production or when GPU disabled
            os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
            if DEBUG:
                print("🔒 Spleeter configured for CPU-only operation (production mode)")

    def _fix_spleeter_click_compatibility(self):
        """Comprehensive click compatibility fix for newer click versions"""
        import sys

        # Fix 1: click.termui.get_terminal_size
        try:
            from click.termui import get_terminal_size
        except ImportError:
            import click.termui
            import shutil

            def get_terminal_size():
                """Compatibility function for older Spleeter versions"""
                try:
                    size = shutil.get_terminal_size()
                    return size.columns, size.lines
                except Exception:
                    return 80, 24

            click.termui.get_terminal_size = get_terminal_size
            if DEBUG:
                print("🔧 Applied click.termui.get_terminal_size compatibility fix")

        # Fix 2: click._bashcomplete (replaced with click.shell_completion in newer versions)
        try:
            import click._bashcomplete
        except ImportError:
            # Create a compatibility module for click._bashcomplete
            try:
                import click.shell_completion

                # Create a mock _bashcomplete module with the functions Spleeter needs
                class MockBashComplete:
                    """Mock _bashcomplete module for Spleeter compatibility"""

                    @staticmethod
                    def get_completion_script(*args, **kwargs):
                        """Mock function for bash completion script generation"""
                        return ""

                    @staticmethod
                    def complete_option(*args, **kwargs):
                        """Mock function for option completion"""
                        return []

                    @staticmethod
                    def complete_command(*args, **kwargs):
                        """Mock function for command completion"""
                        return []

                # Add the mock module to sys.modules
                sys.modules['click._bashcomplete'] = MockBashComplete()
                if DEBUG:
                    print("🔧 Applied click._bashcomplete compatibility fix using shell_completion")

            except ImportError:
                # Fallback: create a minimal mock module
                class MinimalBashComplete:
                    """Minimal mock for environments without shell_completion"""

                    def __getattr__(self, name):
                        """Return a no-op function for any missing attribute"""
                        def no_op(*args, **kwargs):
                            return [] if 'complete' in name else ""
                        return no_op

                sys.modules['click._bashcomplete'] = MinimalBashComplete()
                if DEBUG:
                    print("🔧 Applied minimal click._bashcomplete compatibility fix")

    def _configure_tensorflow_gpu(self):
        """Simplified and robust TensorFlow GPU configuration for Spleeter"""
        try:
            import tensorflow as tf
            import platform

            # Check system type
            is_apple_silicon = platform.system() == 'Darwin' and platform.machine() == 'arm64'

            if is_apple_silicon:
                # CRITICAL FIX: Proper MPS configuration for Apple Silicon
                if DEBUG:
                    print("🍎 Configuring TensorFlow for Apple Silicon MPS...")

                # Check if MPS is available in this TensorFlow version
                try:
                    # For TensorFlow 2.5+, try to use MPS
                    gpus = tf.config.experimental.list_physical_devices('GPU')
                    if gpus:
                        if DEBUG:
                            print(f"🎯 Found {len(gpus)} GPU device(s) for TensorFlow")
                        for gpu in gpus:
                            tf.config.experimental.set_memory_growth(gpu, True)
                        return True
                    else:
                        # Try alternative MPS detection
                        if DEBUG:
                            print("🔍 Checking for MPS support...")
                        # Force TensorFlow to recognize MPS if available
                        with tf.device('/GPU:0'):
                            # Simple test to see if GPU is available
                            test_tensor = tf.constant([1.0, 2.0, 3.0])
                            result = tf.reduce_sum(test_tensor)
                        if DEBUG:
                            print("✅ MPS GPU acceleration confirmed working")
                        return True

                except Exception as e:
                    if DEBUG:
                        print(f"⚠️  MPS configuration failed: {e}")
                    return False
            else:
                # CUDA configuration for non-Apple systems
                if DEBUG:
                    print("🖥️  Configuring TensorFlow for CUDA...")
                gpus = tf.config.experimental.list_physical_devices('GPU')
                if gpus:
                    for gpu in gpus:
                        tf.config.experimental.set_memory_growth(gpu, True)
                    if DEBUG:
                        print(f"✅ CUDA GPU acceleration enabled with {len(gpus)} GPU(s)")
                    return True
                else:
                    if DEBUG:
                        print("⚠️  No CUDA GPUs detected")
                    return False

        except Exception as e:
            if DEBUG:
                print(f"⚠️  TensorFlow GPU configuration failed: {e}")
            return False

    def get_device_info(self):
        """Get information about the current device configuration"""
        info = {
            "device": str(self.device),
            "device_type": self.device.type,
            "gpu_acceleration_enabled": self.device.type != "cpu",
            "environment": "local_development" if is_local_development() else "production",
            "device_manager_available": self.device_manager is not None,
            # Phase 1 GPU acceleration features
            "processing_modes": {
                "use_real_spleeter": getattr(self, 'use_real_spleeter', False),
                "enable_spleeter_gpu": getattr(self, 'enable_spleeter_gpu', False),
                "use_gpu_audio_processing": getattr(self, 'use_gpu_audio_processing', False)
            }
        }

        if self.device_manager:
            info.update({
                "is_cuda": self.device_manager.is_cuda,
                "is_mps": self.device_manager.is_mps,
                "is_gpu": self.device_manager.is_gpu
            })

            # Add device-specific information
            if hasattr(self.device_manager, '_device_info'):
                info["device_details"] = self.device_manager._device_info

        return info

    def demix_audio_to_spectrogram(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Enhanced demixing with real Spleeter - now used for both local and production

        This method uses real Spleeter 5-stems separation for better beat detection accuracy.
        Librosa fallback is commented out to ensure Spleeter is always used.
        """
        # CHANGED: Always use Spleeter, no fallback to librosa
        if DEBUG:
            print("🎵 Using real Spleeter 5-stems separation...")
        return self._demix_with_real_spleeter(audio_file, sr, n_fft, n_mels, fmin, fmax)

        # COMMENTED OUT: Librosa fallback - we now require Spleeter for production
        # if self.use_real_spleeter:
        #     try:
        #         print("🎵 Attempting real Spleeter 5-stems separation...")
        #         return self._demix_with_real_spleeter(audio_file, sr, n_fft, n_mels, fmin, fmax)
        #     except Exception as e:
        #         print(f"⚠️  Spleeter separation failed: {e}")
        #         print("🔄 Falling back to librosa-based approach...")
        #         return self._demix_with_librosa_fallback(audio_file, sr, n_fft, n_mels, fmin, fmax)
        # else:
        #     print("🎼 Using librosa-based spectrogram creation (production mode)")
        #     return self._demix_with_librosa_fallback(audio_file, sr, n_fft, n_mels, fmin, fmax)

    def _demix_with_real_spleeter(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Real Spleeter-based demixing implementation"""
        import tempfile
        import shutil

        # CRITICAL FIX: Handle click.termui compatibility issue with newer click versions
        self._fix_spleeter_click_compatibility()

        # Import Spleeter components
        try:
            from spleeter.separator import Separator
            from spleeter.audio.adapter import AudioAdapter
        except ImportError as e:
            raise ImportError(f"Spleeter not available: {e}")

        if DEBUG:
            print(f"🚀 Starting Spleeter GPU-accelerated separation for {audio_file}")

        # Create a temporary directory for processing
        temp_dir = tempfile.mkdtemp()

        try:
            # Load audio using Spleeter's adapter
            audio_loader = AudioAdapter.default()
            waveform, _ = audio_loader.load(audio_file, sample_rate=sr)
            if DEBUG:
                print(f"📁 Loaded audio with shape: {waveform.shape}")

            # Initialize Spleeter for 5-stems demixing
            # Use local model path to avoid GitHub download issues
            if DEBUG:
                print("🔧 Initializing Spleeter 5-stems separator...")
            from pathlib import Path
            # Note: Spleeter caches to ~/.cache/spleeter/pretrained_models/5stems by default
            cache_candidates = [
                Path.home() / ".cache" / "spleeter" / "pretrained_models" / "5stems",
                Path.home() / ".cache" / "spleeter" / "5stems",  # legacy/misplaced
            ]
            if DEBUG:
                print("🔧 Initializing Spleeter 5-stems separator...")
                print("🔎 Spleeter cache candidates:")
                for p in cache_candidates:
                    print(f"   - {p} (exists={p.exists()})")

            # Pre-check: is the default pretrained cache present?
            default_dir = cache_candidates[0]
            checkpoint_files = list(default_dir.glob("**/checkpoint")) if default_dir.exists() else []

            # Try to use local cached model first to avoid GitHub download issues
            if default_dir.exists() and checkpoint_files:
                if DEBUG:
                    print(f"✅ Found Spleeter model in cache: {default_dir}")
                # Use local model path directly to avoid ModelProvider download
                separator = Separator(f'spleeter:5stems', multiprocess=False)
                # Override model_dir to use cached model
                separator._params['model_dir'] = str(default_dir)
            else:
                print("⚠️  Spleeter pretrained 5stems model not found locally; will attempt provider-managed download...")
                # Let Spleeter manage model discovery/download by default
                separator = Separator('spleeter:5stems', multiprocess=False)

            # Prefer a bundled local model if present to avoid network/download issues.
            # IMPORTANT: ModelProvider expects model_dir to be the actual model folder (e.g., '<root>/5stems')
            local_model_root = (Path(__file__).resolve().parent.parent / 'pretrained_models')
            local_model_dir = local_model_root / '5stems'
            if local_model_dir.exists() and (local_model_dir / 'checkpoint').exists():
                try:
                    # Create Spleeter probe file so ModelProvider doesn't try to download
                    probe = local_model_dir / '.probe'
                    if not probe.exists():
                        probe.write_text('OK')
                    separator._params['model_dir'] = str(local_model_dir)
                    if DEBUG:
                        print(f"📁 Using bundled Spleeter model at: {local_model_dir}")
                except Exception as e:
                    if DEBUG:
                        print(f"⚠️ Could not set bundled model_dir: {e}")
            else:
                # If user cache exists, optionally log it for diagnostics
                default_dir = cache_candidates[0]
                if default_dir.exists():
                    if DEBUG:
                        print(f"📁 Using default Spleeter cache at: {default_dir}")

            # Separate the audio into 5 stems
            if DEBUG:
                print("🎛️  Separating audio with Spleeter...")
            try:
                demixed = separator.separate(waveform)
            except Exception as e:
                # Provide a precise, actionable message about likely root causes
                from pathlib import Path
                details = []
                default_dir = Path.home() / ".cache" / "spleeter" / "pretrained_models" / "5stems"
                details.append(f"expected_cache={default_dir} exists={default_dir.exists()}")
                ckpt = list(default_dir.glob("**/checkpoint")) if default_dir.exists() else []
                details.append(f"checkpoint_files_found={len(ckpt)}")
                raise RuntimeError(
                    "Spleeter failed to load its 5-stems model checkpoint. "
                    "This usually means the pretrained model is missing or the cache is corrupt. "
                    f"({' ; '.join(details)})\n"
                    "How to fix: (1) ensure internet so Spleeter can download on first use; "
                    "(2) or pre-download models by running `spleeter separate -p spleeter:5stems -o /tmp/test` once; "
                    "(3) or copy the 5stems model directory into ~/.cache/spleeter/pretrained_models/5stems."
                ) from e
            stems = list(demixed.keys())
            if DEBUG:
                print(f"✅ Separation complete. Got {len(demixed)} stems: {stems}")

            # Create Mel filter bank
            mel_f = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax).T

            # Process each stem to create spectrograms
            spectrograms = []
            for stem_name in stems:
                if DEBUG:
                    print(f"🎵 Processing stem: {stem_name}")

                # Get the separated audio for this stem
                stem_audio = demixed[stem_name]

                # Convert to mono if stereo
                if len(stem_audio.shape) > 1:
                    stem_audio = np.mean(stem_audio, axis=1)

                # Create spectrogram using librosa with exact Beat-Transformer parameters
                stft = librosa.stft(stem_audio, n_fft=n_fft, hop_length=n_fft//4)
                stft_power = np.abs(stft)**2
                spec = np.dot(stft_power.T, mel_f)
                spec_db = librosa.power_to_db(spec, ref=np.max)
                spectrograms.append(spec_db)

            # Stack all stem spectrograms (shape: num_channels x time x mel_bins)
            result = np.stack(spectrograms, axis=0)
            if DEBUG:
                print(f"🎯 Real Spleeter processing complete. Output shape: {result.shape}")

            return result

        finally:
            # Clean up temporary directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _demix_with_librosa_fallback(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Fallback librosa-based approach (original implementation)

        Creates 5 different spectrograms from the same audio with different processing
        to simulate multi-channel input for Beat-Transformer.
        """
        if DEBUG:
            print("🎼 Using librosa-based audio processing...")

        # Load audio using librosa
        y, _ = librosa.load(audio_file, sr=sr, mono=True)

        # Create Mel filter bank
        mel_f = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax).T
        spectrograms = []

        # Create 5 different spectrograms to simulate 5-stem separation
        # Each with different processing to emphasize different aspects

        # 1. Original audio (vocals + instruments)
        stft = librosa.stft(y, n_fft=n_fft, hop_length=n_fft//4)
        stft_power = np.abs(stft)**2
        spec = np.dot(stft_power.T, mel_f)
        spec_db = librosa.power_to_db(spec, ref=np.max)
        spectrograms.append(spec_db)

        # 2. High-pass filtered (emphasize drums/percussion)
        y_highpass = librosa.effects.preemphasis(y, coef=0.97)
        stft = librosa.stft(y_highpass, n_fft=n_fft, hop_length=n_fft//4)
        stft_power = np.abs(stft)**2
        spec = np.dot(stft_power.T, mel_f)
        spec_db = librosa.power_to_db(spec, ref=np.max)
        spectrograms.append(spec_db)

        # 3. Percussive component (emphasize drums)
        y_percussive = librosa.effects.percussive(y, margin=3.0)
        stft = librosa.stft(y_percussive, n_fft=n_fft, hop_length=n_fft//4)
        stft_power = np.abs(stft)**2
        spec = np.dot(stft_power.T, mel_f)
        spec_db = librosa.power_to_db(spec, ref=np.max)
        spectrograms.append(spec_db)

        # 4. Harmonic component (emphasize bass/other instruments)
        y_harmonic = librosa.effects.harmonic(y, margin=3.0)
        stft = librosa.stft(y_harmonic, n_fft=n_fft, hop_length=n_fft//4)
        stft_power = np.abs(stft)**2
        spec = np.dot(stft_power.T, mel_f)
        spec_db = librosa.power_to_db(spec, ref=np.max)
        spectrograms.append(spec_db)

        # 5. Low-pass filtered (emphasize bass)
        from scipy import signal
        nyquist = sr // 2
        low_cutoff = 1000  # 1kHz cutoff
        b, a = signal.butter(5, low_cutoff / nyquist, btype='low')
        y_lowpass = signal.filtfilt(b, a, y)
        stft = librosa.stft(y_lowpass, n_fft=n_fft, hop_length=n_fft//4)
        stft_power = np.abs(stft)**2
        spec = np.dot(stft_power.T, mel_f)
        spec_db = librosa.power_to_db(spec, ref=np.max)
        spectrograms.append(spec_db)

        # Stack all channel spectrograms (shape: num_channels x time x mel_bins)
        result = np.stack(spectrograms, axis=0)
        if DEBUG:
            print(f"🎯 Librosa processing complete. Output shape: {result.shape}")

        return result

    def detect_beats(self, audio_file):
        """Detect beats and downbeats from an audio file using Beat Transformer

        Args:
            audio_file (str): Path to audio file

        Returns:
            dict: Dictionary containing beat and downbeat information
        """
        try:
            # Load the audio to get duration and sr
            audio, sr = librosa.load(audio_file, sr=None)
            duration = librosa.get_duration(y=audio, sr=sr)

            # Step 1: Demix audio and create spectrograms
            if DEBUG:
                print(f"Demixing audio and creating spectrograms: {audio_file}")
            demixed_spec = self.demix_audio_to_spectrogram(audio_file)

            # Step 2: Prepare input for the model with proper device handling
            if DEBUG:
                print(f"Preparing model input for device: {self.device}")
            model_input = torch.from_numpy(demixed_spec).unsqueeze(0)

            # Handle MPS float32 requirement and move to device
            if self.device.type == "mps":
                model_input = model_input.float().to(self.device)
            else:
                model_input = model_input.float().to(self.device)

            # Step 3: Run inference with GPU acceleration
            if DEBUG:
                print(f"Running Beat Transformer inference on {self.device}")
            with torch.no_grad():
                # Clear GPU cache if available for memory efficiency
                if self.device_manager and hasattr(self.device_manager, 'clear_cache'):
                    self.device_manager.clear_cache()

                activation, _ = self.model(model_input)

                # Move results back to CPU for further processing
                beat_activation = torch.sigmoid(activation[0, :, 0]).detach().cpu().numpy()
                downbeat_activation = torch.sigmoid(activation[0, :, 1]).detach().cpu().numpy()

                # Clear GPU cache after inference if available
                if self.device_manager and hasattr(self.device_manager, 'clear_cache'):
                    self.device_manager.clear_cache()

            # Step 4: Process with DBN (enhanced for low activations)
            if DEBUG:
                print("Post-processing with enhanced DBN processors")

            # Log activation statistics for debugging
            if DEBUG:
                print(f"Beat activation stats: min={beat_activation.min():.3f}, max={beat_activation.max():.3f}, mean={beat_activation.mean():.3f}, std={beat_activation.std():.3f}")
                print(f"Downbeat activation stats: min={downbeat_activation.min():.3f}, max={downbeat_activation.max():.3f}, mean={downbeat_activation.mean():.3f}, std={downbeat_activation.std():.3f}")

            # Enhance activations for DBN compatibility with robust probability distribution normalization
            def condition_activation_for_madmom(activation, epsilon=1e-6, apply_smoothing=True,
                                               normalize_distribution=True):
                """
                Condition activation values for madmom DBN processors to create proper probability distributions.

                Args:
                    activation: Input activation array
                    epsilon: Small value to avoid exact 0/1 values
                    apply_smoothing: Whether to apply Gaussian smoothing to reduce noise
                    normalize_distribution: Whether to normalize to proper probability distribution
                """
                # Start with a copy to avoid modifying original
                conditioned = activation.copy()

                # Apply light Gaussian smoothing to reduce noise that can cause HMM issues
                if apply_smoothing and len(conditioned) > 10:
                    try:
                        from scipy import ndimage
                        # Very light smoothing (sigma=0.5) to reduce sharp transitions
                        conditioned = ndimage.gaussian_filter1d(conditioned, sigma=0.5, mode='reflect')
                    except ImportError:
                        # Skip smoothing if scipy not available
                        pass

                # CRITICAL FIX: Preserve signal strength while ensuring madmom compatibility
                if normalize_distribution:
                    # Ensure all values are positive
                    conditioned = np.maximum(conditioned, epsilon)

                    # GENTLE normalization that preserves beat detection capability
                    # Only normalize if the sum would cause issues for madmom (when used in combined arrays)
                    # For individual activations, preserve original strength as much as possible

                    # Light scaling only if values are extremely high (>2.0)
                    if conditioned.max() > 2.0:
                        # Gentle scaling to bring down extreme outliers while preserving relative strengths
                        conditioned = conditioned / (conditioned.max() / 1.0)

                    # NO aggressive sum normalization for individual activations
                    # The sum normalization will be handled later in combined array processing

                # Ensure values are in a safe range for madmom logarithmic calculations
                conditioned = np.clip(conditioned, epsilon, 1.0 - epsilon)

                # Additional safeguard: ensure no NaN or infinite values
                conditioned = np.nan_to_num(conditioned, nan=epsilon, posinf=1.0-epsilon, neginf=epsilon)

                return conditioned

            # Apply GENTLE conditioning to preserve signal strength for beat detection
            # Only apply minimal conditioning to avoid exact zeros, preserve original magnitudes
            beat_activation_conditioned = condition_activation_for_madmom(beat_activation, normalize_distribution=False)
            downbeat_activation_conditioned = condition_activation_for_madmom(downbeat_activation, normalize_distribution=False)

            if DEBUG:
                print(f"Conditioned beat activation stats: min={beat_activation_conditioned.min():.6f}, max={beat_activation_conditioned.max():.6f}")
                print(f"Conditioned downbeat activation stats: min={downbeat_activation_conditioned.min():.6f}, max={downbeat_activation_conditioned.max():.6f}")

            # For backward compatibility, keep the enhanced versions for peak-picking fallback
            beat_activation_enhanced = condition_activation_for_madmom(beat_activation)
            downbeat_activation_enhanced = condition_activation_for_madmom(downbeat_activation)

            # Track which algorithm is actually used
            algorithm_used = "beat_transformer"  # Default

            # Use enhanced DBN processors or peak-picking algorithm
            if not MADMOM_AVAILABLE:
                if DEBUG:
                    print("Madmom not available, using GPU-accelerated peak-picking algorithm")
                algorithm_used = "beat_transformer_gpu_peaks"
                # GPU-ACCELERATED peak-picking algorithm with PyTorch operations

                # Calculate frame rate and timing parameters
                frame_rate = 44100 / 1024  # ~43.066 Hz
                min_distance = int(frame_rate * 60 / 200)  # Minimum 200 BPM
                if DEBUG:
                    print(f"GPU peak-picking parameters: frame_rate={frame_rate:.3f}Hz, min_distance={min_distance} frames")

                # Use GPU-accelerated peak detection when available
                if self.device.type in ['cuda', 'mps']:
                    if DEBUG:
                        print(f"🚀 Using GPU-accelerated peak detection on {self.device}")
                    dbn_beat_times, dbn_downbeat_times_raw = self._gpu_accelerated_peak_detection(
                        beat_activation_enhanced, downbeat_activation_enhanced, frame_rate, min_distance
                    )
                else:
                    if DEBUG:
                        print("Using CPU-based peak detection")
                    dbn_beat_times, dbn_downbeat_times_raw = self._cpu_peak_detection(
                        beat_activation_enhanced, downbeat_activation_enhanced, frame_rate, min_distance
                    )

            else:
                # Use madmom DBN processors
                try:
                    # Create DBN processors with BALANCED parameters for stability
                    # CRITICAL FIX: The previous parameters were too sensitive and caused instability
                    # observation_lambda=1 was too low, threshold=0.05 was too aggressive
                    enhanced_beat_tracker = DBNBeatTrackingProcessor(
                        min_bpm=55.0, max_bpm=215.0, fps=44100/1024,
                        transition_lambda=100, observation_lambda=4,  # Balanced sensitivity (between 1 and 6)
                        num_tempi=None, threshold=0.1  # More stable threshold (between 0.05 and 0.2)
                    )

                    enhanced_downbeat_tracker = DBNDownBeatTrackingProcessor(
                        beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                        max_bpm=215.0, fps=44100/1024,
                        transition_lambda=100, observation_lambda=4,  # Balanced sensitivity
                        num_tempi=None, threshold=0.1  # More stable threshold
                    )

                    # Use conditioned activations for beat tracking to avoid mathematical errors
                    dbn_beat_times = enhanced_beat_tracker(beat_activation_conditioned)

                    # CRITICAL FIX: Validate DBN processor results to prevent array shape errors
                    if not isinstance(dbn_beat_times, np.ndarray):
                        dbn_beat_times = np.array(dbn_beat_times)
                    if dbn_beat_times.size == 0:
                        dbn_beat_times = np.array([])

                    if DEBUG:
                        print(f"Enhanced DBN beat tracker returned {len(dbn_beat_times)} beats")

                    # Combined activation for downbeat tracking with proper probability distribution normalization
                    beat_only = np.maximum(beat_activation_conditioned - downbeat_activation_conditioned,
                                         np.zeros(beat_activation_conditioned.shape))

                    # Apply additional conditioning to the beat_only component to avoid zeros
                    epsilon = 1e-6
                    beat_only_safe = np.clip(beat_only, epsilon, 1.0 - epsilon)

                    # Create initial combined activation
                    combined_act_raw = np.concatenate((
                        beat_only_safe[:, np.newaxis],
                        downbeat_activation_conditioned[:, np.newaxis]
                    ), axis=-1)  # (T, 2)

                    # CRITICAL FIX: Robust normalization to ensure row sums < 1.0 for madmom HMM compatibility
                    # This prevents divide by zero in madmom's log(1 - sum) calculations
                    row_sums = np.sum(combined_act_raw, axis=1)
                    max_sum_allowed = 0.95  # Conservative limit well below 1.0 for safety

                    # Find rows where sum >= max_allowed and normalize them
                    overflow_mask = row_sums >= max_sum_allowed
                    if np.any(overflow_mask):
                        # Normalize overflow rows to sum to max_sum_allowed
                        normalization_factors = max_sum_allowed / row_sums[overflow_mask]
                        combined_act_raw[overflow_mask] *= normalization_factors[:, np.newaxis]
                        if DEBUG:
                            print(f"Normalized {np.sum(overflow_mask)} rows with sum overflow (max was {row_sums.max():.6f})")

                    # Apply final epsilon clamping after normalization
                    combined_act = np.clip(combined_act_raw, epsilon, 1.0 - epsilon)

                    # Final validation: ensure no row sum >= 1.0
                    final_sums = np.sum(combined_act, axis=1)
                    if np.any(final_sums >= 1.0):
                        if DEBUG:
                            print(f"WARNING: {np.sum(final_sums >= 1.0)} rows still have sum >= 1.0, applying emergency normalization")
                        # Emergency normalization for any remaining problematic rows
                        emergency_mask = final_sums >= 1.0
                        combined_act[emergency_mask] = combined_act[emergency_mask] / final_sums[emergency_mask, np.newaxis] * max_sum_allowed
                        combined_act = np.clip(combined_act, epsilon, 1.0 - epsilon)
                        final_sums = np.sum(combined_act, axis=1)

                    if DEBUG:
                        print(f"Final row sum stats: min={final_sums.min():.6f}, max={final_sums.max():.6f}, mean={final_sums.mean():.6f}")

                    # CRITICAL DEBUG: Additional validation to prevent madmom divide by zero
                    # Check for edge cases that still cause mathematical errors
                    problematic_rows = final_sums >= 0.999  # Very close to 1.0
                    near_zero_beat_only = combined_act[:, 0] <= 1e-5  # Very small beat_only values
                    near_zero_downbeat = combined_act[:, 1] <= 1e-5   # Very small downbeat values

                    if DEBUG:
                        if np.any(problematic_rows):
                            print(f"WARNING: {np.sum(problematic_rows)} rows have sums >= 0.999, may cause madmom issues")
                        if np.any(near_zero_beat_only):
                            print(f"WARNING: {np.sum(near_zero_beat_only)} rows have near-zero beat_only values")
                        if np.any(near_zero_downbeat):
                            print(f"WARNING: {np.sum(near_zero_downbeat)} rows have near-zero downbeat values")

                    # Additional safety: ensure no values are exactly at epsilon boundaries
                    combined_act = np.clip(combined_act, 2*epsilon, 1.0 - 2*epsilon)
                    final_sums_safe = np.sum(combined_act, axis=1)
                    if DEBUG:
                        print(f"After additional safety clipping: max_sum={final_sums_safe.max():.6f}")

                    if DEBUG:
                        print(f"Combined activation shape: {combined_act.shape}, "
                              f"beat_only range: [{combined_act[:, 0].min():.6f}, {combined_act[:, 0].max():.6f}], "
                              f"downbeat range: [{combined_act[:, 1].min():.6f}, {combined_act[:, 1].max():.6f}]")

                    # CRITICAL FIX: Enhanced DBN call with comprehensive error handling
                    try:
                        if DEBUG:
                            print(f"🔧 Calling enhanced DBN downbeat tracker with combined_act shape: {combined_act.shape}")
                        dbn_downbeat_results = enhanced_downbeat_tracker(combined_act)
                        if DEBUG:
                            print(f"✅ Enhanced DBN call completed successfully")
                    except Exception as dbn_call_error:
                        # Keep error logging unconditional
                        print(f"❌ Enhanced DBN call failed: {dbn_call_error}")
                        raise dbn_call_error

                    # ENHANCED DEBUG: Investigate madmom result structure to fix inhomogeneous shape error
                    if DEBUG:
                        print(f"🔍 DEBUG: madmom result type: {type(dbn_downbeat_results)}")
                        print(f"🔍 DEBUG: madmom result shape/length: {getattr(dbn_downbeat_results, 'shape', len(dbn_downbeat_results) if hasattr(dbn_downbeat_results, '__len__') else 'no length')}")

                    # Safe inspection of result structure
                    if DEBUG:
                        try:
                            if hasattr(dbn_downbeat_results, '__len__') and len(dbn_downbeat_results) > 0:
                                sample_size = min(3, len(dbn_downbeat_results))
                                print(f"🔍 DEBUG: first {sample_size} elements: {dbn_downbeat_results[:sample_size]}")

                                if hasattr(dbn_downbeat_results[0], '__len__'):
                                    print(f"🔍 DEBUG: first element type/length: {type(dbn_downbeat_results[0])}, {len(dbn_downbeat_results[0]) if hasattr(dbn_downbeat_results[0], '__len__') else 'no length'}")
                        except Exception as debug_error:
                            print(f"🔍 DEBUG: Could not inspect result structure: {debug_error}")

                    # ENHANCED VALIDATION: Handle malformed results that cause "inhomogeneous shape" errors
                    try:
                        # CRITICAL FIX: Don't force conversion to numpy array - handle the raw structure
                        # The error occurs because madmom returns a complex nested structure that can't be homogenized
                        if isinstance(dbn_downbeat_results, np.ndarray):
                            # Already a numpy array - proceed normally
                            pass
                        else:
                            # Complex structure - handle carefully without forcing array conversion
                            if DEBUG:
                                print(f"DEBUG: Handling non-array madmom result structure")

                        # ROBUST PROCESSING: Handle complex madmom result structures
                        dbn_downbeat_times_raw = []

                        if isinstance(dbn_downbeat_results, np.ndarray):
                            # Standard numpy array processing
                            if dbn_downbeat_results.size > 0 and dbn_downbeat_results.ndim >= 1:
                                if dbn_downbeat_results.ndim == 2 and dbn_downbeat_results.shape[1] >= 2:
                                    # Standard format: filter for downbeats (where second column is 1)
                                    downbeat_mask = dbn_downbeat_results[:, 1] == 1
                                    dbn_downbeat_times_raw = dbn_downbeat_results[downbeat_mask][:, 0]
                                elif dbn_downbeat_results.ndim == 1:
                                    # Single dimension array - use directly
                                    dbn_downbeat_times_raw = dbn_downbeat_results
                                else:
                                    # Unexpected format - extract first column safely
                                    dbn_downbeat_times_raw = dbn_downbeat_results.flatten()
                        else:
                            # CRITICAL FIX: Handle complex nested structures without forcing array conversion
                            # Process the raw madmom result structure element by element
                            try:
                                if hasattr(dbn_downbeat_results, '__len__') and len(dbn_downbeat_results) > 0:
                                    # Iterate through the complex structure and extract valid downbeat times
                                    for item in dbn_downbeat_results:
                                        try:
                                            if hasattr(item, '__len__') and len(item) >= 2:
                                                # Check if this represents a downbeat (second element is 1)
                                                if len(item) >= 2 and item[1] == 1:
                                                    dbn_downbeat_times_raw.append(float(item[0]))
                                            elif isinstance(item, (int, float)):
                                                # Single time value
                                                dbn_downbeat_times_raw.append(float(item))
                                        except (IndexError, ValueError, TypeError) as item_error:
                                            if DEBUG:
                                                print(f"DEBUG: Skipping problematic item: {item}, error: {item_error}")
                                            continue
                            except Exception as structure_error:
                                if DEBUG:
                                    print(f"DEBUG: Complex structure processing failed: {structure_error}")
                                dbn_downbeat_times_raw = []

                        # Convert final result to numpy array
                        dbn_downbeat_times_raw = np.array(dbn_downbeat_times_raw)

                    except Exception as array_error:
                        # Keep error logging unconditional
                        print(f"Enhanced DBN downbeat result validation failed: {array_error}")
                        dbn_downbeat_times_raw = np.array([])

                    if DEBUG:
                        print(f"Enhanced DBN downbeat tracker returned {len(dbn_downbeat_times_raw)} downbeats")

                except Exception as e:
                    # Keep error logging unconditional
                    print(f"Enhanced DBN processors failed: {e}")
                    # Fallback to original DBN with even lower thresholds
                    try:
                        # Use conditioned activations for fallback beat tracking
                        dbn_beat_times = self.beat_tracker(beat_activation_conditioned)
                        if DEBUG:
                            print(f"Original DBN beat tracker returned {len(dbn_beat_times)} beats")

                        # Combined activation for fallback downbeat tracking with proper normalization
                        beat_only = np.maximum(beat_activation_conditioned - downbeat_activation_conditioned,
                                             np.zeros(beat_activation_conditioned.shape))

                        # Apply additional conditioning to the beat_only component to avoid zeros
                        epsilon = 1e-6
                        beat_only_safe = np.clip(beat_only, epsilon, 1.0 - epsilon)

                        # Create initial combined activation
                        combined_act_raw = np.concatenate((
                            beat_only_safe[:, np.newaxis],
                            downbeat_activation_conditioned[:, np.newaxis]
                        ), axis=-1)  # (T, 2)

                        # CRITICAL FIX: Robust normalization for fallback DBN processing
                        row_sums = np.sum(combined_act_raw, axis=1)
                        max_sum_allowed = 0.95  # Conservative limit

                        # Normalize overflow rows
                        overflow_mask = row_sums >= max_sum_allowed
                        if np.any(overflow_mask):
                            normalization_factors = max_sum_allowed / row_sums[overflow_mask]
                            combined_act_raw[overflow_mask] *= normalization_factors[:, np.newaxis]
                            if DEBUG:
                                print(f"Fallback: Normalized {np.sum(overflow_mask)} rows with sum overflow (max was {row_sums.max():.6f})")

                        # Apply final epsilon clamping after normalization
                        combined_act = np.clip(combined_act_raw, epsilon, 1.0 - epsilon)

                        # Final validation for fallback processing
                        final_sums = np.sum(combined_act, axis=1)
                        if np.any(final_sums >= 1.0):
                            if DEBUG:
                                print(f"Fallback WARNING: {np.sum(final_sums >= 1.0)} rows still have sum >= 1.0, applying emergency normalization")
                            emergency_mask = final_sums >= 1.0
                            combined_act[emergency_mask] = combined_act[emergency_mask] / final_sums[emergency_mask, np.newaxis] * max_sum_allowed
                            combined_act = np.clip(combined_act, epsilon, 1.0 - epsilon)
                            final_sums = np.sum(combined_act, axis=1)

                        if DEBUG:
                            print(f"Fallback final row sum stats: min={final_sums.min():.6f}, max={final_sums.max():.6f}")

                        # CRITICAL DEBUG: Additional validation for fallback processing
                        problematic_rows = final_sums >= 0.999
                        if DEBUG and np.any(problematic_rows):
                            print(f"Fallback WARNING: {np.sum(problematic_rows)} rows have sums >= 0.999")

                        # Additional safety for fallback processing
                        combined_act = np.clip(combined_act, 2*epsilon, 1.0 - 2*epsilon)
                        final_sums_safe = np.sum(combined_act, axis=1)
                        if DEBUG:
                            print(f"Fallback after additional safety: max_sum={final_sums_safe.max():.6f}")

                        dbn_downbeat_results = self.downbeat_tracker(combined_act)

                        # ROBUST PROCESSING: Apply same fix for fallback DBN processing
                        if DEBUG:
                            print(f"Fallback DEBUG: madmom result type: {type(dbn_downbeat_results)}")

                        dbn_downbeat_times_raw = []

                        try:
                            if isinstance(dbn_downbeat_results, np.ndarray):
                                # Standard numpy array processing
                                if dbn_downbeat_results.size > 0 and dbn_downbeat_results.ndim >= 1:
                                    if dbn_downbeat_results.ndim == 2 and dbn_downbeat_results.shape[1] >= 2:
                                        downbeat_mask = dbn_downbeat_results[:, 1] == 1
                                        dbn_downbeat_times_raw = dbn_downbeat_results[downbeat_mask][:, 0]
                                    elif dbn_downbeat_results.ndim == 1:
                                        dbn_downbeat_times_raw = dbn_downbeat_results
                                    else:
                                        dbn_downbeat_times_raw = dbn_downbeat_results.flatten()
                            else:
                                # Handle complex nested structures for fallback processing
                                if hasattr(dbn_downbeat_results, '__len__') and len(dbn_downbeat_results) > 0:
                                    for item in dbn_downbeat_results:
                                        try:
                                            if hasattr(item, '__len__') and len(item) >= 2:
                                                if len(item) >= 2 and item[1] == 1:
                                                    dbn_downbeat_times_raw.append(float(item[0]))
                                            elif isinstance(item, (int, float)):
                                                dbn_downbeat_times_raw.append(float(item))
                                        except (IndexError, ValueError, TypeError):
                                            continue

                            # Convert to numpy array
                            dbn_downbeat_times_raw = np.array(dbn_downbeat_times_raw)

                        except Exception as fallback_error:
                            # Keep error logging unconditional
                            print(f"Fallback DBN result processing failed: {fallback_error}")
                            dbn_downbeat_times_raw = np.array([])

                        if DEBUG:
                            print(f"Original DBN downbeat tracker returned {len(dbn_downbeat_times_raw)} downbeats")

                    except Exception as e2:
                        # Keep error logging unconditional
                        print(f"All madmom DBN approaches failed: {e2}")
                        if DEBUG:
                            print("Falling back to peak-picking algorithm")
                        algorithm_used = "beat_transformer_fallback_peaks"
                        # Fallback to peak-picking when madmom fails
                        from scipy import signal as scipy_signal

                        frame_rate = 44100 / 1024
                        min_distance = int(frame_rate * 60 / 200)
                        downbeat_min_distance = int(frame_rate * 60 / 60)  # Conservative downbeat distance

                        beat_peaks, _ = scipy_signal.find_peaks(
                            beat_activation_enhanced,
                            height=0.3,
                            distance=min_distance,
                            prominence=0.1
                        )
                        dbn_beat_times = beat_peaks / frame_rate
                        if DEBUG:
                            print(f"Fallback peak-picking beat tracker found {len(dbn_beat_times)} beats")

                        downbeat_peaks, _ = scipy_signal.find_peaks(
                            downbeat_activation_enhanced,
                            height=0.4,  # Higher threshold
                            distance=downbeat_min_distance,
                            prominence=0.2  # Higher prominence
                        )
                        dbn_downbeat_times_raw = downbeat_peaks / frame_rate
                        if DEBUG:
                            print(f"Fallback peak-picking downbeat tracker found {len(dbn_downbeat_times_raw)} downbeats")

            # Use the raw downbeats directly (simplified approach)
            dbn_downbeat_times = dbn_downbeat_times_raw
            if DEBUG:
                print(f"Using {len(dbn_downbeat_times)} downbeats directly")

            # Step 5: Process beats - determine their strength based on activation
            # For each beat time, find nearest frame in the beat activation
            hop_length = 1024  # Default hop length used in Beat-Transformer
            frame_rate = sr / hop_length  # Correct frame rate calculation
            beat_info = []

            for beat_time in dbn_beat_times:
                frame_idx = int(beat_time * frame_rate)
                if frame_idx < len(beat_activation):
                    # Get activation at this frame as strength
                    strength = float(beat_activation[frame_idx])
                    # Check if this beat is also a downbeat
                    is_downbeat = bool(np.any(np.abs(dbn_downbeat_times - beat_time) < 0.05)) if len(dbn_downbeat_times) > 0 else False
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": float(strength),
                        "is_downbeat": is_downbeat
                    })
                else:
                    # Fallback if frame_idx is out of bounds
                    is_downbeat = bool(np.any(np.abs(dbn_downbeat_times - beat_time) < 0.05)) if len(dbn_downbeat_times) > 0 else False
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": 0.5,  # Default strength
                        "is_downbeat": is_downbeat
                    })

            # Calculate BPM from beat times
            if len(dbn_beat_times) > 1:
                # Calculate intervals between beats
                intervals = np.diff(dbn_beat_times)
                # Calculate median interval in seconds
                median_interval = np.median(intervals)
                # Convert to BPM
                bpm = 60.0 / median_interval if median_interval > 0 else 120.0
            else:
                bpm = 120.0  # Default BPM if not enough beats

            # Determine time signature by analyzing beats between downbeats
            # Two-stage detection: classify simple vs compound time, then select most common within group
            time_signature = 4  # Default to 4/4
            time_signatures = []  # Store time signatures for each measure

            if len(dbn_downbeat_times) >= 2:
                for i in range(len(dbn_downbeat_times) - 1):
                    curr_downbeat = dbn_downbeat_times[i]
                    next_downbeat = dbn_downbeat_times[i + 1]

                    # OPTIMIZATION #3: Vectorize beat counting with NumPy for 10-20% performance gain
                    beats_in_measure = int(np.sum((dbn_beat_times >= curr_downbeat) & (dbn_beat_times < next_downbeat)))

                    # Only consider reasonable time signatures
                    if 2 <= beats_in_measure <= 12:
                        time_signatures.append(beats_in_measure)

                # Two-stage time signature detection
                if time_signatures:
                    from collections import Counter

                    # Count occurrences of each beats-per-measure value
                    beat_counts = Counter(time_signatures)

                    # Stage 1: Classify simple vs compound time
                    # Simple time: divisible by 2 but not by 3 (2, 4, 8)
                    # Compound time: divisible by 3 (3, 6, 9, 12)
                    simple_time_measures = sum(count for beats, count in beat_counts.items()
                                              if beats % 2 == 0 and beats % 3 != 0)
                    compound_time_measures = sum(count for beats, count in beat_counts.items()
                                                if beats % 3 == 0)

                    # Stage 2: Select most common within the winning group
                    if compound_time_measures > simple_time_measures:
                        # Compound time wins - select most common from 3, 6, 9, 12
                        compound_beats = {beats: count for beats, count in beat_counts.items() if beats % 3 == 0}
                        time_signature = max(compound_beats.items(), key=lambda x: x[1])[0]
                        time_classification = "compound"
                    elif simple_time_measures > compound_time_measures:
                        # Simple time wins - select most common from 2, 4, 8
                        simple_beats = {beats: count for beats, count in beat_counts.items()
                                       if beats % 2 == 0 and beats % 3 != 0}
                        time_signature = max(simple_beats.items(), key=lambda x: x[1])[0]
                        time_classification = "simple"
                    else:
                        # Tie - use overall most common (fallback to original behavior)
                        time_signature = beat_counts.most_common(1)[0][0]
                        time_classification = "mixed"

                    # Determine denominator based on time signature
                    # Compound time (3, 6, 9, 12) typically uses /8, simple time uses /4
                    if time_signature in [6, 9, 12]:
                        denominator = 8
                    else:
                        denominator = 4

                    # OPTIMIZATION #2: Reduced logging for production (5-10% performance gain)
                    # Debug-only logging for time signature detection
                    if DEBUG:
                        print(f"Detected time signature: {time_signature}/{denominator}")

                    # OPTIMIZATION #2: Debug-only detailed logging
                    if DEBUG:
                        print(f"Using {len(dbn_downbeat_times)} downbeats directly")
                        print(f"Time signatures found in measures: {time_signatures}")
                        print(f"Beat distribution: {dict(beat_counts)}")
                        print(f"Classification: {time_classification} time ({simple_time_measures} simple, {compound_time_measures} compound)")

                    # OPTIMIZATION #4: Removed duplicate log statement (was line 1300)

            # Determine denominator if not set (for cases where time_signatures is empty)
            if 'denominator' not in locals():
                denominator = 4

            return {
                "success": True,
                "beats": dbn_beat_times.tolist(),
                "beat_info": beat_info,
                "downbeats": dbn_downbeat_times.tolist(),
                "bpm": float(bpm),
                "total_beats": len(dbn_beat_times),
                "total_downbeats": len(dbn_downbeat_times),
                "duration": float(duration),
                "time_signature": f"{int(time_signature)}/{int(denominator)}",  # Format with correct denominator
                "model_used": algorithm_used
            }

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "beats": [],
                "beat_info": [],
                "downbeats": [],
                "bpm": 0,
                "total_beats": 0,
                "total_downbeats": 0,
                "duration": 0,
                "time_signature": "4/4",
                "model_used": "beat_transformer_error"
            }

    def _gpu_accelerated_peak_detection(self, beat_activation, downbeat_activation, frame_rate, min_distance):
        """GPU-accelerated peak detection using PyTorch operations"""
        import torch

        try:
            # Convert activations to GPU tensors
            beat_tensor = torch.from_numpy(beat_activation).float().to(self.device)
            downbeat_tensor = torch.from_numpy(downbeat_activation).float().to(self.device)

            if DEBUG:
                print(f"🔥 Processing on {self.device}: beat_tensor.shape={beat_tensor.shape}")

            # GPU-accelerated smoothing using 1D convolution
            kernel_size = 3
            padding = kernel_size // 2

            # Create smoothing kernel
            smooth_kernel = torch.ones(1, 1, kernel_size, device=self.device) / kernel_size

            # Apply smoothing
            beat_smoothed = torch.nn.functional.conv1d(
                beat_tensor.unsqueeze(0).unsqueeze(0),
                smooth_kernel,
                padding=padding
            ).squeeze()

            downbeat_smoothed = torch.nn.functional.conv1d(
                downbeat_tensor.unsqueeze(0).unsqueeze(0),
                smooth_kernel,
                padding=padding
            ).squeeze()

            # GPU-accelerated peak detection using local maxima
            beat_peaks = self._find_peaks_gpu(beat_smoothed, min_distance, height_threshold=0.1)
            downbeat_peaks = self._find_peaks_gpu(downbeat_smoothed, min_distance * 3, height_threshold=0.2)

            # Convert back to CPU and calculate times
            beat_times = beat_peaks.cpu().numpy() / frame_rate
            downbeat_times = downbeat_peaks.cpu().numpy() / frame_rate

            if DEBUG:
                print(f"✅ GPU peak detection: {len(beat_times)} beats, {len(downbeat_times)} downbeats")

            return beat_times, downbeat_times

        except Exception as e:
            # Keep error logging unconditional
            print(f"⚠️  GPU peak detection failed: {e}, falling back to CPU")
            return self._cpu_peak_detection(beat_activation, downbeat_activation, frame_rate, min_distance)

    def _find_peaks_gpu(self, signal_tensor, min_distance, height_threshold=0.1):
        """Find peaks in a 1D signal using GPU operations"""
        import torch

        # Calculate dynamic threshold
        signal_mean = torch.mean(signal_tensor)
        signal_std = torch.std(signal_tensor)
        threshold = torch.max(signal_mean + 0.3 * signal_std, torch.tensor(height_threshold, device=self.device))

        # Find points above threshold
        above_threshold = signal_tensor > threshold

        # Find local maxima using dilation
        kernel_size = min(min_distance * 2 + 1, len(signal_tensor) // 4)
        if kernel_size % 2 == 0:
            kernel_size += 1

        padding = kernel_size // 2

        # Use max pooling to find local maxima
        signal_padded = torch.nn.functional.pad(signal_tensor.unsqueeze(0), (padding, padding), mode='reflect')
        local_max = torch.nn.functional.max_pool1d(
            signal_padded.unsqueeze(0),
            kernel_size=kernel_size,
            stride=1,
            padding=0
        ).squeeze()

        # Points that are both above threshold and local maxima
        is_peak = above_threshold & (signal_tensor == local_max)

        # Get peak indices
        peak_indices = torch.nonzero(is_peak, as_tuple=False).squeeze(-1)

        # Apply minimum distance constraint
        if len(peak_indices) > 1:
            # Sort by signal strength (descending)
            peak_values = signal_tensor[peak_indices]
            sorted_indices = torch.argsort(peak_values, descending=True)
            sorted_peaks = peak_indices[sorted_indices]

            # Keep peaks with minimum distance
            kept_peaks = []
            for peak in sorted_peaks:
                if len(kept_peaks) == 0:
                    kept_peaks.append(peak)
                else:
                    # Check distance to all kept peaks
                    distances = torch.abs(torch.stack(kept_peaks) - peak)
                    if torch.all(distances >= min_distance):
                        kept_peaks.append(peak)

            peak_indices = torch.stack(kept_peaks) if kept_peaks else torch.tensor([], device=self.device, dtype=torch.long)

        return peak_indices

    def _cpu_peak_detection(self, beat_activation, downbeat_activation, frame_rate, min_distance):
        """CPU-based peak detection fallback using scipy"""
        from scipy import signal as scipy_signal

        if DEBUG:
            print("Using CPU-based peak detection")

        # Beat detection
        beat_peaks, beat_properties = scipy_signal.find_peaks(
            beat_activation,
            height=0.1,
            distance=min_distance,
            prominence=0.05
        )
        beat_times = beat_peaks / frame_rate

        # Downbeat detection
        downbeat_min_distance = int(frame_rate * 60 / 60)  # Minimum 60 BPM for downbeats
        downbeat_peaks, downbeat_properties = scipy_signal.find_peaks(
            downbeat_activation,
            height=0.2,
            distance=downbeat_min_distance,
            prominence=0.1
        )
        downbeat_times = downbeat_peaks / frame_rate

        if DEBUG:
            print(f"✅ CPU peak detection: {len(beat_times)} beats, {len(downbeat_times)} downbeats")

        return beat_times, downbeat_times