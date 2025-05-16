import os
import sys
import numpy as np
import torch
import librosa
from pathlib import Path
import soundfile as sf
from madmom.features.beats import DBNBeatTrackingProcessor
from madmom.features.downbeats import DBNDownBeatTrackingProcessor

# Add the Beat-Transformer code directory to path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "Beat-Transformer"
BEAT_TRANSFORMER_CODE_DIR = BEAT_TRANSFORMER_DIR / "code"
sys.path.insert(0, str(BEAT_TRANSFORMER_CODE_DIR))

# Import the model
from DilatedTransformer import Demixed_DilatedTransformerModel

class BeatTransformerDetector:
    def __init__(self, checkpoint_path=None):
        """Initialize the Beat Transformer detector with a checkpoint file"""
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        
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
        
        self.downbeat_tracker = DBNDownBeatTrackingProcessor(
            beats_per_bar=[3, 4], min_bpm=55.0,
            max_bpm=215.0, fps=44100/1024,
            transition_lambda=100, observation_lambda=6,
            num_tempi=None, threshold=0.2
        )
    
    def demix_audio_to_spectrogram(self, audio_file, sr=44100, n_fft=4096, n_mels=128, fmin=30, fmax=11000):
        """Demix audio into 5 stems and convert to mel spectrograms"""
        # Dynamic import to avoid loading Spleeter until needed
        from spleeter.separator import Separator
        from spleeter.audio.adapter import AudioAdapter
        
        # Load audio using Spleeter's adapter
        audio_loader = AudioAdapter.default()
        try:
            waveform, _ = audio_loader.load(audio_file, sample_rate=sr)
        except Exception as e:
            print(f"Error loading audio file: {e}")
            # Fallback to librosa if Spleeter's loader fails
            y, _ = librosa.load(audio_file, sr=sr, mono=True)
            waveform = np.expand_dims(y, axis=1)
            
        # Initialize Spleeter for 5-stems demixing
        separator = Separator('spleeter:5stems')
        demixed = separator.separate(waveform)
        
        # Create Mel filter bank
        mel_f = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax).T
        spectrograms = []
        
        for key in demixed:
            # Compute spectral energy using Spleeter's STFT function
            stft = separator._stft(demixed[key])
            # Average over the final channel dimension to align shapes before dot
            stft_power = np.mean(np.abs(stft)**2, axis=-1)
            spec = np.dot(stft_power, mel_f)
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
            
            # Step 4: Process with DBN
            print("Post-processing with DBN")
            dbn_beat_times = self.beat_tracker(beat_activation)
            
            # Combined activation for downbeat tracking
            combined_act = np.concatenate((
                np.maximum(beat_activation - downbeat_activation, np.zeros_like(beat_activation))[:, np.newaxis],
                downbeat_activation[:, np.newaxis]
            ), axis=-1)
            
            dbn_downbeat_results = self.downbeat_tracker(combined_act)
            dbn_downbeat_times = dbn_downbeat_results[dbn_downbeat_results[:, 1]==1][:, 0]
            
            # Step 5: Process beats - determine their strength based on activation
            # For each beat time, find nearest frame in the beat activation
            frame_rate = 44100/1024  # This is the rate used in the model
            beat_info = []
            
            for beat_time in dbn_beat_times:
                frame_idx = int(beat_time * frame_rate)
                if frame_idx < len(beat_activation):
                    # Get activation at this frame as strength
                    strength = float(beat_activation[frame_idx])
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": float(strength)
                    })
                else:
                    # Fallback if frame_idx is out of bounds
                    beat_info.append({
                        "time": float(beat_time),
                        "strength": 0.5  # Default strength
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
            
            return {
                "success": True,
                "beats": dbn_beat_times.tolist(),
                "beat_info": beat_info,
                "downbeats": dbn_downbeat_times.tolist(),
                "bpm": float(bpm),
                "total_beats": len(dbn_beat_times),
                "total_downbeats": len(dbn_downbeat_times),
                "duration": float(duration)
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
                "duration": 0
            } 