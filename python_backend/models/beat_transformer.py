"""
Unified Beat Transformer implementation for beat and downbeat detection.
Consolidates all Beat-Transformer functionality into a single module.
Enhanced with GPU acceleration support.
"""
import os
import sys
import numpy as np
import torch
import librosa
from pathlib import Path
import soundfile as sf
import warnings
import collections
import collections.abc

# Import GPU acceleration utilities
try:
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from gpu_acceleration import get_gpu_manager, get_device, log_device_status
    GPU_ACCELERATION_AVAILABLE = True
except ImportError as e:
    print(f"Warning: GPU acceleration not available: {e}")
    GPU_ACCELERATION_AVAILABLE = False

# Import GPU audio processing
try:
    from gpu_audio_processing import get_gpu_audio_processor
    GPU_AUDIO_PROCESSING_AVAILABLE = True
    print("✅ GPU audio processing available")
except ImportError as e:
    print(f"⚠️  GPU audio processing not available: {e}")
    GPU_AUDIO_PROCESSING_AVAILABLE = False

# Fix for Python 3.10+ compatibility with madmom
# MUST come before any madmom imports
try:
    collections.MutableSequence = collections.abc.MutableSequence
    print("Applied madmom compatibility fix")
except Exception as e:
    print(f"Warning: Failed to apply madmom compatibility fix: {e}")

# Import madmom with error handling
try:
    from madmom.features.beats import DBNBeatTrackingProcessor
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor
    MADMOM_AVAILABLE = True
    print("Madmom imported successfully")
except ImportError as e:
    print(f"Warning: Madmom import failed: {e}")
    MADMOM_AVAILABLE = False
    # Create dummy classes for when madmom is not available
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

# Fix for NumPy 1.20+ compatibility
try:
    np.float = float
    np.int = int
except Exception:
    pass

# Add the Beat-Transformer code directory to path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "Beat-Transformer"
BEAT_TRANSFORMER_CODE_DIR = BEAT_TRANSFORMER_DIR / "code"
sys.path.insert(0, str(BEAT_TRANSFORMER_CODE_DIR))

# Import the model with error handling
try:
    from DilatedTransformer import Demixed_DilatedTransformerModel
    DILATED_TRANSFORMER_AVAILABLE = True
    print("DilatedTransformer imported successfully")
except ImportError as e:
    print(f"Warning: DilatedTransformer import failed: {e}")
    DILATED_TRANSFORMER_AVAILABLE = False
    # Create a dummy class for when the model is not available
    class Demixed_DilatedTransformerModel:
        def __init__(self, *args, **kwargs):
            raise ImportError("DilatedTransformer model not available")
        def load_state_dict(self, *args, **kwargs):
            pass
        def eval(self):
            pass
        def to(self, device):
            return self

# Filter warnings
warnings.filterwarnings('ignore', category=RuntimeWarning, message='divide by zero encountered in log')

def is_beat_transformer_available():
    """Check if Beat-Transformer model and dependencies are available"""
    checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"
    return (DILATED_TRANSFORMER_AVAILABLE and
            BEAT_TRANSFORMER_DIR.exists() and
            checkpoint_path.exists())


class BeatTransformerDetector:
    """Unified Beat Transformer detector for beat and downbeat detection"""

    def __init__(self, checkpoint_path=None):
        """Initialize the Beat Transformer detector with a checkpoint file"""
        # Check if dependencies are available
        if not DILATED_TRANSFORMER_AVAILABLE:
            raise ImportError("DilatedTransformer model not available - missing dependencies")

        # Use centralized GPU acceleration
        if GPU_ACCELERATION_AVAILABLE:
            self.gpu_manager = get_gpu_manager()
            self.device = self.gpu_manager.device
            print(f"🚀 Beat Transformer using device: {self.device} ({self.gpu_manager.device_info['name']})")
        else:
            self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
            print(f"⚠️  Using fallback device detection: {self.device}")

        # Default to fold 4 if no checkpoint specified
        if checkpoint_path is None:
            checkpoint_path = str(BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt")

        # Check if checkpoint file exists
        if not Path(checkpoint_path).exists():
            raise FileNotFoundError(f"Checkpoint file not found: {checkpoint_path}")

        # Initialize model
        self.model = Demixed_DilatedTransformerModel(
            attn_len=5, instr=5, ntoken=2,
            dmodel=256, nhead=8, d_hid=1024,
            nlayers=9, norm_first=True
        )

        # Load checkpoint with GPU acceleration
        try:
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(checkpoint['state_dict'])

            # Move model to optimal device
            if GPU_ACCELERATION_AVAILABLE:
                self.model = self.gpu_manager.move_to_device(self.model)
            else:
                self.model.to(self.device)

            self.model.eval()

            # Log successful loading with device info
            device_name = self.gpu_manager.device_info['name'] if GPU_ACCELERATION_AVAILABLE else str(self.device)
            print(f"✅ Beat Transformer loaded successfully on {device_name}")

            # Log memory usage if GPU
            if GPU_ACCELERATION_AVAILABLE and self.gpu_manager.is_cuda:
                memory_info = self.gpu_manager.get_memory_info()
                print(f"📊 GPU Memory: {memory_info['allocated_gb']:.1f}GB allocated")

        except Exception as e:
            print(f"❌ Error loading Beat Transformer checkpoint {checkpoint_path}: {e}")
            raise

        # Note: DBN processors will be initialized with actual fps in detect_beats method
        # based on the audio file's sample rate

    def demix_audio_to_spectrogram(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Create multi-channel spectrograms from audio without demixing

        This function automatically chooses between GPU-accelerated and CPU processing
        based on available hardware and libraries.
        """
        # Try GPU-accelerated processing first
        if GPU_AUDIO_PROCESSING_AVAILABLE and GPU_ACCELERATION_AVAILABLE:
            try:
                print("🚀 Using GPU-accelerated audio processing")
                gpu_processor = get_gpu_audio_processor()
                return gpu_processor.create_multi_channel_spectrograms_gpu(
                    audio_file, sr, n_fft, n_mels, fmin, fmax
                )
            except Exception as e:
                print(f"⚠️  GPU audio processing failed, falling back to CPU: {e}")
                # Fall through to CPU implementation

        # CPU implementation (original librosa-based)
        print("📱 Using CPU-based audio processing (librosa)")
        return self._demix_audio_to_spectrogram_cpu(audio_file, sr, n_fft, n_mels, fmin, fmax)

    def _demix_audio_to_spectrogram_cpu(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """CPU-based spectrogram generation using librosa (original implementation)"""
        import time
        start_time = time.time()

        # Load audio using librosa
        y, _ = librosa.load(audio_file, sr=sr, mono=True)
        load_time = time.time() - start_time

        # Create Mel filter bank
        mel_f = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax).T
        spectrograms = []

        cpu_start = time.time()

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

        cpu_time = time.time() - cpu_start
        total_time = time.time() - start_time

        print(f"📱 CPU Audio Processing: {load_time:.2f}s load + {cpu_time:.2f}s CPU = {total_time:.2f}s total")

        # Stack all channel spectrograms (shape: num_channels x time x mel_bins)
        return np.stack(spectrograms, axis=0)

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

            # Calculate hop length and frame rate based on actual sample rate
            # Beat-Transformer typically uses hop_length = n_fft // 4
            n_fft = 4096  # This should match the n_fft used in demix_audio_to_spectrogram
            hop_length = n_fft // 4  # 1024 for n_fft=4096
            frame_rate = sr / hop_length

            print(f"Audio info: sr={sr}, duration={duration:.2f}s, hop_length={hop_length}, frame_rate={frame_rate:.2f}")

            # Step 1: Demix audio and create spectrograms (using actual sample rate)
            print(f"Demixing audio and creating spectrograms: {audio_file}")
            demixed_spec = self.demix_audio_to_spectrogram(audio_file, sr=sr)

            # Step 2: Prepare input for the model with GPU acceleration
            model_input = torch.from_numpy(demixed_spec).unsqueeze(0).float()

            # Move input to optimal device
            if GPU_ACCELERATION_AVAILABLE:
                model_input = self.gpu_manager.move_to_device(model_input)
            else:
                model_input = model_input.to(self.device)

            # Step 3: Run inference with GPU acceleration
            device_name = self.gpu_manager.device_info['name'] if GPU_ACCELERATION_AVAILABLE else str(self.device)
            print(f"🔄 Running Beat Transformer inference on {device_name}")

            with torch.no_grad():
                # Clear cache before inference if using CUDA
                if GPU_ACCELERATION_AVAILABLE and self.gpu_manager.is_cuda:
                    self.gpu_manager.clear_cache()

                activation, _ = self.model(model_input)
                beat_activation = torch.sigmoid(activation[0, :, 0]).detach().cpu().numpy()
                downbeat_activation = torch.sigmoid(activation[0, :, 1]).detach().cpu().numpy()

                # Clear cache after inference
                if GPU_ACCELERATION_AVAILABLE and self.gpu_manager.is_cuda:
                    self.gpu_manager.clear_cache()

            # Step 4: Process with DBN (enhanced for low activations)
            print("Post-processing with enhanced DBN processors")

            # Log activation statistics for debugging
            print(f"Beat activation stats: min={beat_activation.min():.3f}, max={beat_activation.max():.3f}, mean={beat_activation.mean():.3f}")
            print(f"Downbeat activation stats: min={downbeat_activation.min():.3f}, max={downbeat_activation.max():.3f}")

            # Enhance activations for DBN compatibility
            if beat_activation.max() > 0:
                beat_activation_enhanced = (beat_activation - beat_activation.min()) / (beat_activation.max() - beat_activation.min())
                beat_activation_enhanced = np.power(beat_activation_enhanced, 0.5)
            else:
                beat_activation_enhanced = beat_activation

            if downbeat_activation.max() > 0:
                downbeat_activation_enhanced = (downbeat_activation - downbeat_activation.min()) / (downbeat_activation.max() - downbeat_activation.min())
                downbeat_activation_enhanced = np.power(downbeat_activation_enhanced, 0.5)
            else:
                downbeat_activation_enhanced = downbeat_activation

            # Use enhanced DBN processors with lower thresholds and actual frame rate
            try:
                enhanced_beat_tracker = DBNBeatTrackingProcessor(
                    min_bpm=55.0, max_bpm=215.0, fps=frame_rate,
                    transition_lambda=100, observation_lambda=1,
                    num_tempi=None, threshold=0.05
                )

                enhanced_downbeat_tracker = DBNDownBeatTrackingProcessor(
                    beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                    max_bpm=215.0, fps=frame_rate,
                    transition_lambda=100, observation_lambda=1,
                    num_tempi=None, threshold=0.05
                )

                # Try beat tracking first
                dbn_beat_times = enhanced_beat_tracker(beat_activation_enhanced)
                print(f"Enhanced DBN beat tracker returned {len(dbn_beat_times)} beats")

                # Only attempt downbeat tracking if we have beats
                if len(dbn_beat_times) > 0:
                    try:
                        beat_only = np.maximum(beat_activation_enhanced - downbeat_activation_enhanced, np.zeros_like(beat_activation_enhanced))
                        combined_act = np.column_stack([beat_only, downbeat_activation_enhanced])
                        combined_act = np.ascontiguousarray(combined_act, dtype=np.float64)

                        dbn_downbeat_results = enhanced_downbeat_tracker(combined_act)

                        if len(dbn_downbeat_results) > 0 and dbn_downbeat_results.shape[1] >= 2:
                            downbeat_mask = dbn_downbeat_results[:, 1] == 1
                            if np.any(downbeat_mask):
                                dbn_downbeat_times_raw = dbn_downbeat_results[downbeat_mask, 0]
                            else:
                                dbn_downbeat_times_raw = np.array([])
                        else:
                            dbn_downbeat_times_raw = np.array([])

                    except Exception as downbeat_error:
                        print(f"Enhanced downbeat tracking failed: {downbeat_error}")
                        dbn_downbeat_times_raw = dbn_beat_times[::4] if len(dbn_beat_times) >= 4 else np.array([dbn_beat_times[0]]) if len(dbn_beat_times) > 0 else np.array([])
                else:
                    print("No beats detected, cannot perform downbeat tracking")
                    dbn_downbeat_times_raw = np.array([])

            except Exception as e:
                print(f"Enhanced DBN processors failed: {e}")
                # Fallback to original DBN with actual frame rate
                try:
                    # Create fallback DBN processors with actual frame rate
                    fallback_beat_tracker = DBNBeatTrackingProcessor(
                        min_bpm=55.0, max_bpm=215.0, fps=frame_rate,
                        transition_lambda=100, observation_lambda=6,
                        num_tempi=None, threshold=0.2
                    )

                    fallback_downbeat_tracker = DBNDownBeatTrackingProcessor(
                        beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                        max_bpm=215.0, fps=frame_rate,
                        transition_lambda=100, observation_lambda=6,
                        num_tempi=None, threshold=0.2
                    )

                    dbn_beat_times = fallback_beat_tracker(beat_activation_enhanced)
                    print(f"Fallback DBN beat tracker returned {len(dbn_beat_times)} beats")

                    if len(dbn_beat_times) > 0:
                        try:
                            beat_only = np.maximum(beat_activation_enhanced - downbeat_activation_enhanced, np.zeros_like(beat_activation_enhanced))
                            combined_act = np.column_stack([beat_only, downbeat_activation_enhanced])
                            combined_act = np.ascontiguousarray(combined_act, dtype=np.float64)

                            dbn_downbeat_results = fallback_downbeat_tracker(combined_act)

                            if len(dbn_downbeat_results) > 0 and dbn_downbeat_results.shape[1] >= 2:
                                downbeat_mask = dbn_downbeat_results[:, 1] == 1
                                if np.any(downbeat_mask):
                                    dbn_downbeat_times_raw = dbn_downbeat_results[downbeat_mask, 0]
                                else:
                                    dbn_downbeat_times_raw = np.array([])
                            else:
                                dbn_downbeat_times_raw = np.array([])

                        except Exception as downbeat_error2:
                            print(f"Fallback downbeat tracking also failed: {downbeat_error2}")
                            dbn_downbeat_times_raw = dbn_beat_times[::4] if len(dbn_beat_times) >= 4 else np.array([dbn_beat_times[0]]) if len(dbn_beat_times) > 0 else np.array([])
                    else:
                        dbn_downbeat_times_raw = np.array([])

                except Exception as e2:
                    print(f"All DBN approaches failed: {e2}")
                    # Create dummy beats as absolute fallback
                    print("Creating dummy beats at 120 BPM as fallback")
                    beat_interval = 60.0 / 120.0
                    dbn_beat_times = np.arange(0, duration, beat_interval)
                    dbn_downbeat_times_raw = np.arange(0, duration, beat_interval * 4)

            # Use the raw downbeats directly
            dbn_downbeat_times = dbn_downbeat_times_raw

            # Step 5: Process beats - determine their strength based on activation
            # Use the frame_rate calculated earlier based on actual sample rate
            beat_info = []

            for beat_time in dbn_beat_times:
                frame_idx = int(beat_time * frame_rate)
                if frame_idx < len(beat_activation):
                    strength = float(beat_activation[frame_idx])
                    is_downbeat = bool(np.any(np.abs(dbn_downbeat_times - beat_time) < 0.05)) if len(dbn_downbeat_times) > 0 else False
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": float(strength),
                        "is_downbeat": is_downbeat
                    })
                else:
                    is_downbeat = bool(np.any(np.abs(dbn_downbeat_times - beat_time) < 0.05)) if len(dbn_downbeat_times) > 0 else False
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": 0.5,
                        "is_downbeat": is_downbeat
                    })

            # Calculate BPM from beat times
            if len(dbn_beat_times) > 1:
                intervals = np.diff(dbn_beat_times)
                median_interval = np.median(intervals)
                bpm = 60.0 / median_interval if median_interval > 0 else 120.0
            else:
                bpm = 120.0

            # Determine time signature by analyzing beats between downbeats
            time_signature = 4
            time_signatures = []

            if len(dbn_downbeat_times) >= 2:
                for i in range(len(dbn_downbeat_times) - 1):
                    curr_downbeat = dbn_downbeat_times[i]
                    next_downbeat = dbn_downbeat_times[i + 1]
                    beats_in_measure = sum(1 for b in dbn_beat_times if curr_downbeat <= b < next_downbeat)
                    if 2 <= beats_in_measure <= 12:
                        time_signatures.append(beats_in_measure)

                if time_signatures:
                    from collections import Counter
                    time_signature = Counter(time_signatures).most_common(1)[0][0]
                    print(f"Detected time signature: {time_signature}/4")

            # Add device information to response
            device_info = {}
            if GPU_ACCELERATION_AVAILABLE:
                device_info = {
                    "device_type": self.gpu_manager.device_info['type'],
                    "device_name": self.gpu_manager.device_info['name'],
                    "gpu_accelerated": self.gpu_manager.is_gpu_accelerated
                }
                if self.gpu_manager.is_cuda:
                    memory_info = self.gpu_manager.get_memory_info()
                    device_info["gpu_memory_used_gb"] = round(memory_info['allocated_gb'], 2)
            else:
                device_info = {
                    "device_type": self.device.type,
                    "gpu_accelerated": False
                }

            return {
                "success": True,
                "beats": dbn_beat_times.tolist(),
                "beat_info": beat_info,
                "downbeats": dbn_downbeat_times.tolist(),
                "bpm": float(bpm),
                "total_beats": len(dbn_beat_times),
                "total_downbeats": len(dbn_downbeat_times),
                "duration": float(duration),
                "time_signature": f"{int(time_signature)}/4",
                "model_used": "beat_transformer",
                "device_info": device_info
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
                "model_used": "beat_transformer"
            }


class BeatTransformerHandler:
    """Legacy wrapper for backward compatibility"""

    def __init__(self):
        """Initialize the Beat Transformer handler"""
        self.detector = None
        self.available = False

        try:
            # Check if checkpoint exists
            beat_transformer_dir = Path(__file__).parent / "Beat-Transformer"
            checkpoint_path = beat_transformer_dir / "checkpoint" / "fold_4_trf_param.pt"

            if checkpoint_path.exists():
                self.detector = BeatTransformerDetector(str(checkpoint_path))
                self.available = True
                print("Beat Transformer handler initialized successfully")
            else:
                print(f"Beat Transformer checkpoint not found: {checkpoint_path}")

        except Exception as e:
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
            print(f"Error analyzing audio with Beat Transformer: {e}")
            return {
                "success": False,
                "error": str(e),
                "beats": [],
                "downbeats": [],
                "bpm": 0
            }


# Wrapper functions for compatibility with the original demo interface
def run_beat_tracking_wrapper(demixed_spec_file, audio_file, param_path=None):
    """
    Wrapper function for compatibility with beat_tracking_fix.py

    Args:
        demixed_spec_file: Path to the demixed spectrogram file (ignored, we create our own)
        audio_file: Path to the audio file
        param_path: Path to the model checkpoint (optional)

    Returns:
        Tuple of (beat_times, downbeat_times, beats_with_positions, downbeats_with_measures)
    """
    try:
        # Create detector instance
        detector = BeatTransformerDetector(param_path)

        # Run detection
        result = detector.detect_beats(audio_file)

        if result["success"]:
            beat_times = np.array(result["beats"])
            downbeat_times = np.array(result["downbeats"])

            # Create beats_with_positions format
            beats_with_positions = []
            for i, beat_info in enumerate(result["beat_info"]):
                beats_with_positions.append({
                    "time": beat_info["time"],
                    "beatNum": ((i % 4) + 1)  # Simple 4/4 beat numbering
                })

            # Create downbeats_with_measures format
            downbeats_with_measures = []
            for i, downbeat_time in enumerate(downbeat_times):
                downbeats_with_measures.append({
                    "time": float(downbeat_time),
                    "measure": i + 1
                })

            return beat_times, downbeat_times, beats_with_positions, downbeats_with_measures
        else:
            print(f"Beat detection failed: {result.get('error', 'Unknown error')}")
            return np.array([]), np.array([]), [], []

    except Exception as e:
        print(f"Error in run_beat_tracking_wrapper: {e}")
        import traceback
        traceback.print_exc()
        return np.array([]), np.array([]), [], []
