import os
import sys
import numpy as np
import torch
import librosa
from pathlib import Path
import soundfile as sf
# Import madmom with error handling
try:
    from madmom.features.beats import DBNBeatTrackingProcessor
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor
    MADMOM_AVAILABLE = True
    print("Madmom imported successfully")
except ImportError as e:
    print(f"Warning: Madmom import failed: {e}")
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
            print(f"Beat Transformer checkpoint not found: {checkpoint_path}")
            return False

        # Check if we can import the model
        beat_transformer_path = os.path.join(os.path.dirname(__file__), "Beat-Transformer", "code")
        if beat_transformer_path not in sys.path:
            sys.path.append(beat_transformer_path)

        from DilatedTransformer import Demixed_DilatedTransformerModel

        print("Beat Transformer is available")
        return True

    except Exception as e:
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
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

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

        # Load checkpoint
        try:
            self.model.load_state_dict(torch.load(checkpoint_path, map_location=self.device)['state_dict'])
            self.model.to(self.device)
            self.model.eval()
            print(f"Successfully loaded Beat Transformer checkpoint: {checkpoint_path}")
        except Exception as e:
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

    def demix_audio_to_spectrogram(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Create multi-channel spectrograms from audio without demixing

        This simplified version creates multiple spectrograms from the same audio
        with different processing to simulate multi-channel input for Beat-Transformer.
        """
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

            # Step 1: Demix audio and create spectrograms
            print(f"Demixing audio and creating spectrograms: {audio_file}")
            demixed_spec = self.demix_audio_to_spectrogram(audio_file)

            # Step 2: Prepare input for the model
            model_input = torch.from_numpy(demixed_spec).unsqueeze(0).float().to(self.device)

            # Step 3: Run inference
            print("Running Beat Transformer inference")
            with torch.no_grad():
                activation, _ = self.model(model_input)
                beat_activation = torch.sigmoid(activation[0, :, 0]).detach().cpu().numpy()
                downbeat_activation = torch.sigmoid(activation[0, :, 1]).detach().cpu().numpy()

            # Step 4: Process with DBN (enhanced for low activations)
            print("Post-processing with enhanced DBN processors")

            # Log activation statistics for debugging
            print(f"Beat activation stats: min={beat_activation.min():.3f}, max={beat_activation.max():.3f}, mean={beat_activation.mean():.3f}, std={beat_activation.std():.3f}")
            print(f"Downbeat activation stats: min={downbeat_activation.min():.3f}, max={downbeat_activation.max():.3f}, mean={downbeat_activation.mean():.3f}, std={downbeat_activation.std():.3f}")

            # Enhance activations for DBN compatibility
            # Scale and normalize activations to work better with DBN processors
            if beat_activation.max() > 0:
                # Normalize to 0-1 range and apply power scaling to enhance peaks
                beat_activation_enhanced = (beat_activation - beat_activation.min()) / (beat_activation.max() - beat_activation.min())
                beat_activation_enhanced = np.power(beat_activation_enhanced, 0.5)  # Square root to enhance small values
            else:
                beat_activation_enhanced = beat_activation

            if downbeat_activation.max() > 0:
                downbeat_activation_enhanced = (downbeat_activation - downbeat_activation.min()) / (downbeat_activation.max() - downbeat_activation.min())
                downbeat_activation_enhanced = np.power(downbeat_activation_enhanced, 0.5)
            else:
                downbeat_activation_enhanced = downbeat_activation

            print(f"Enhanced beat activation stats: min={beat_activation_enhanced.min():.3f}, max={beat_activation_enhanced.max():.3f}")
            print(f"Enhanced downbeat activation stats: min={downbeat_activation_enhanced.min():.3f}, max={downbeat_activation_enhanced.max():.3f}")

            # Use enhanced DBN processors or peak-picking algorithm
            if not MADMOM_AVAILABLE:
                print("Madmom not available, using peak-picking algorithm")
                # Simple peak-picking algorithm as fallback
                from scipy import signal as scipy_signal

                # Find peaks in beat activation with detailed analysis
                frame_rate = 44100 / 1024  # ~43.066 Hz
                min_distance = int(frame_rate * 60 / 200)  # Minimum 200 BPM

                print(f"Peak-picking parameters: frame_rate={frame_rate:.3f}Hz, min_distance={min_distance} frames")

                beat_peaks, beat_properties = scipy_signal.find_peaks(
                    beat_activation_enhanced,
                    height=0.3,  # Minimum height threshold
                    distance=min_distance,
                    prominence=0.1  # Add prominence to avoid spurious peaks
                )
                dbn_beat_times = beat_peaks / frame_rate
                print(f"Beat detection: {len(beat_peaks)} peaks found, heights: min={beat_activation_enhanced[beat_peaks].min():.3f}, max={beat_activation_enhanced[beat_peaks].max():.3f}")

                # Find peaks in downbeat activation with much more conservative parameters
                # Downbeats should be much less frequent than beats (typically every 3-4 beats)
                downbeat_min_distance = int(frame_rate * 60 / 60)  # Minimum 60 BPM for downbeats (very conservative)

                downbeat_peaks, downbeat_properties = scipy_signal.find_peaks(
                    downbeat_activation_enhanced,
                    height=0.4,  # Much higher threshold for downbeats - only strong peaks
                    distance=downbeat_min_distance,
                    prominence=0.2  # Much higher prominence for downbeats
                )
                dbn_downbeat_times_raw = downbeat_peaks / frame_rate
                print(f"Downbeat detection: {len(downbeat_peaks)} peaks found, heights: min={downbeat_activation_enhanced[downbeat_peaks].min():.3f}, max={downbeat_activation_enhanced[downbeat_peaks].max():.3f}")
                print(f"Downbeat min_distance: {downbeat_min_distance} frames ({60*frame_rate/downbeat_min_distance:.1f} max BPM)")

                # Calculate expected beats per measure
                if len(downbeat_peaks) > 0:
                    expected_beats_per_measure = len(beat_peaks) / len(downbeat_peaks)
                    print(f"Expected beats per measure: {expected_beats_per_measure:.2f}")

            else:
                # Use madmom DBN processors
                try:
                    # Create DBN processors with more sensitive parameters
                    enhanced_beat_tracker = DBNBeatTrackingProcessor(
                        min_bpm=55.0, max_bpm=215.0, fps=44100/1024,
                        transition_lambda=100, observation_lambda=1,  # Lower observation_lambda for sensitivity
                        num_tempi=None, threshold=0.05  # Much lower threshold
                    )

                    enhanced_downbeat_tracker = DBNDownBeatTrackingProcessor(
                        beats_per_bar=[2, 3, 4, 5, 6, 7, 8, 9, 12], min_bpm=55.0,
                        max_bpm=215.0, fps=44100/1024,
                        transition_lambda=100, observation_lambda=1,  # Lower observation_lambda for sensitivity
                        num_tempi=None, threshold=0.05  # Much lower threshold
                    )

                    dbn_beat_times = enhanced_beat_tracker(beat_activation_enhanced)
                    print(f"Enhanced DBN beat tracker returned {len(dbn_beat_times)} beats")

                    # Combined activation for downbeat tracking
                    combined_act = np.concatenate((
                        np.maximum(beat_activation_enhanced - downbeat_activation_enhanced, np.zeros_like(beat_activation_enhanced))[:, np.newaxis],
                        downbeat_activation_enhanced[:, np.newaxis]
                    ), axis=-1)

                    dbn_downbeat_results = enhanced_downbeat_tracker(combined_act)
                    dbn_downbeat_times_raw = dbn_downbeat_results[dbn_downbeat_results[:, 1]==1][:, 0]
                    print(f"Enhanced DBN downbeat tracker returned {len(dbn_downbeat_times_raw)} downbeats")

                except Exception as e:
                    print(f"Enhanced DBN processors failed: {e}")
                    # Fallback to original DBN with even lower thresholds
                    try:
                        dbn_beat_times = self.beat_tracker(beat_activation_enhanced)
                        print(f"Original DBN beat tracker with enhanced activations returned {len(dbn_beat_times)} beats")

                        combined_act = np.concatenate((
                            np.maximum(beat_activation_enhanced - downbeat_activation_enhanced, np.zeros_like(beat_activation_enhanced))[:, np.newaxis],
                            downbeat_activation_enhanced[:, np.newaxis]
                        ), axis=-1)

                        dbn_downbeat_results = self.downbeat_tracker(combined_act)
                        dbn_downbeat_times_raw = dbn_downbeat_results[dbn_downbeat_results[:, 1]==1][:, 0]
                        print(f"Original DBN downbeat tracker with enhanced activations returned {len(dbn_downbeat_times_raw)} downbeats")

                    except Exception as e2:
                        print(f"All madmom DBN approaches failed: {e2}")
                        print("Falling back to peak-picking algorithm")
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
                        print(f"Fallback peak-picking beat tracker found {len(dbn_beat_times)} beats")

                        downbeat_peaks, _ = scipy_signal.find_peaks(
                            downbeat_activation_enhanced,
                            height=0.4,  # Higher threshold
                            distance=downbeat_min_distance,
                            prominence=0.2  # Higher prominence
                        )
                        dbn_downbeat_times_raw = downbeat_peaks / frame_rate
                        print(f"Fallback peak-picking downbeat tracker found {len(dbn_downbeat_times_raw)} downbeats")

            # Use the raw downbeats directly (simplified approach)
            dbn_downbeat_times = dbn_downbeat_times_raw
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
            time_signature = 4  # Default to 4/4
            time_signatures = []  # Store time signatures for each measure

            if len(dbn_downbeat_times) >= 2:
                for i in range(len(dbn_downbeat_times) - 1):
                    curr_downbeat = dbn_downbeat_times[i]
                    next_downbeat = dbn_downbeat_times[i + 1]

                    # Count beats in this measure
                    beats_in_measure = sum(1 for b in dbn_beat_times if curr_downbeat <= b < next_downbeat)

                    # Only consider reasonable time signatures
                    if 2 <= beats_in_measure <= 12:
                        time_signatures.append(beats_in_measure)

                # Use the most common time signature if we have enough data
                if time_signatures:
                    from collections import Counter
                    time_signature = Counter(time_signatures).most_common(1)[0][0]
                    print(f"Detected time signature: {time_signature}/4")
                    print(f"Time signatures found in measures: {time_signatures}")
                    print(f"Most common time signature: {time_signature}/4")

            return {
                "success": True,
                "beats": dbn_beat_times.tolist(),
                "beat_info": beat_info,
                "downbeats": dbn_downbeat_times.tolist(),
                "bpm": float(bpm),
                "total_beats": len(dbn_beat_times),
                "total_downbeats": len(dbn_downbeat_times),
                "duration": float(duration),
                "time_signature": f"{int(time_signature)}/4",  # Format as string like "4/4"
                "model_used": "beat_transformer"
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