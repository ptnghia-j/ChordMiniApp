"""
GPU-Accelerated Audio Processing for Beat-Transformer

This module provides GPU-accelerated alternatives to CPU-bound librosa operations
for the Beat-Transformer audio preprocessing pipeline.

Key optimizations:
1. GPU-accelerated STFT computation using PyTorch
2. GPU-based mel-scale filtering
3. Batch processing of multiple spectrograms
4. Memory-efficient tensor operations
"""

import torch
import torch.nn.functional as F
import numpy as np
import librosa
import warnings
from typing import Tuple, Optional, List
import time

# Import GPU acceleration utilities
try:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from gpu_acceleration import get_gpu_manager
    GPU_ACCELERATION_AVAILABLE = True
except ImportError:
    GPU_ACCELERATION_AVAILABLE = False

class GPUAudioProcessor:
    """
    GPU-accelerated audio processing for Beat-Transformer preprocessing
    
    Provides GPU alternatives to librosa operations:
    - STFT computation
    - Mel-scale filtering
    - Audio effects (harmonic/percussive separation)
    - Batch spectrogram generation
    """
    
    def __init__(self):
        """Initialize GPU audio processor"""
        self.gpu_manager = None
        self.device = torch.device("cpu")
        
        if GPU_ACCELERATION_AVAILABLE:
            try:
                self.gpu_manager = get_gpu_manager()
                self.device = self.gpu_manager.device
                print(f"🚀 GPU Audio Processor initialized on {self.device}")
            except Exception as e:
                print(f"⚠️  GPU Audio Processor falling back to CPU: {e}")
        else:
            print("📱 GPU Audio Processor using CPU (no GPU acceleration)")
    
    def create_mel_filter_bank(self, sr: int, n_fft: int, n_mels: int, 
                              fmin: float = 30, fmax: float = 11000) -> torch.Tensor:
        """
        Create mel filter bank on GPU
        
        Args:
            sr: Sample rate
            n_fft: FFT size
            n_mels: Number of mel bins
            fmin: Minimum frequency
            fmax: Maximum frequency
            
        Returns:
            Mel filter bank tensor on GPU
        """
        # Use librosa to create the filter bank (CPU)
        mel_f = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax)
        
        # Convert to PyTorch tensor and move to GPU
        mel_tensor = torch.from_numpy(mel_f.T).float()
        if self.gpu_manager:
            mel_tensor = self.gpu_manager.move_to_device(mel_tensor)
        else:
            mel_tensor = mel_tensor.to(self.device)
            
        return mel_tensor
    
    def gpu_stft(self, audio: torch.Tensor, n_fft: int, hop_length: int, 
                 window: str = 'hann') -> torch.Tensor:
        """
        Compute STFT on GPU using PyTorch
        
        Args:
            audio: Audio tensor on GPU
            n_fft: FFT size
            hop_length: Hop length
            window: Window function
            
        Returns:
            STFT tensor (complex) on GPU
        """
        # Create window
        if window == 'hann':
            window_tensor = torch.hann_window(n_fft, device=self.device)
        else:
            window_tensor = torch.ones(n_fft, device=self.device)
        
        # Compute STFT
        stft = torch.stft(
            audio, 
            n_fft=n_fft, 
            hop_length=hop_length,
            window=window_tensor,
            return_complex=True,
            center=True,
            pad_mode='reflect'
        )
        
        return stft
    
    def gpu_power_to_db(self, spec: torch.Tensor, ref: Optional[float] = None) -> torch.Tensor:
        """
        Convert power spectrogram to dB scale on GPU
        
        Args:
            spec: Power spectrogram tensor
            ref: Reference value (if None, uses max)
            
        Returns:
            dB-scale spectrogram
        """
        if ref is None:
            ref = torch.max(spec)
        
        # Avoid log(0) by adding small epsilon
        spec_db = 10.0 * torch.log10(torch.clamp(spec / ref, min=1e-10))
        return spec_db
    
    def gpu_preemphasis(self, audio: torch.Tensor, coef: float = 0.97) -> torch.Tensor:
        """
        Apply preemphasis filter on GPU
        
        Args:
            audio: Audio tensor
            coef: Preemphasis coefficient
            
        Returns:
            Preemphasized audio
        """
        # Create preemphasis filter: y[n] = x[n] - coef * x[n-1]
        padded = F.pad(audio.unsqueeze(0), (1, 0), mode='constant', value=0)
        filtered = audio - coef * padded[0, :-1]
        return filtered
    
    def gpu_harmonic_percussive_separation(self, stft: torch.Tensor, 
                                         margin: float = 3.0) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Simplified harmonic/percussive separation on GPU
        
        This is a simplified version that uses spectral characteristics
        rather than the full librosa implementation.
        
        Args:
            stft: STFT tensor (complex)
            margin: Separation margin
            
        Returns:
            Tuple of (harmonic_stft, percussive_stft)
        """
        # Get magnitude spectrogram
        mag = torch.abs(stft)
        
        # Simple harmonic/percussive separation based on spectral characteristics
        # Harmonic: emphasize horizontal continuity (frequency bins)
        # Percussive: emphasize vertical continuity (time frames)
        
        # Median filtering approximation using convolution
        kernel_size = 5
        
        # Harmonic component: smooth across time (horizontal)
        harmonic_mask = F.avg_pool2d(
            mag.unsqueeze(0), 
            kernel_size=(1, kernel_size), 
            stride=1, 
            padding=(0, kernel_size//2)
        ).squeeze(0)
        
        # Percussive component: smooth across frequency (vertical)
        percussive_mask = F.avg_pool2d(
            mag.unsqueeze(0), 
            kernel_size=(kernel_size, 1), 
            stride=1, 
            padding=(kernel_size//2, 0)
        ).squeeze(0)
        
        # Normalize masks
        total_mask = harmonic_mask + percussive_mask + 1e-8
        harmonic_mask = harmonic_mask / total_mask
        percussive_mask = percussive_mask / total_mask
        
        # Apply masks to original STFT
        harmonic_stft = stft * harmonic_mask
        percussive_stft = stft * percussive_mask
        
        return harmonic_stft, percussive_stft
    
    def gpu_lowpass_filter(self, audio: torch.Tensor, sr: int, cutoff: float = 1000) -> torch.Tensor:
        """
        Simple lowpass filter on GPU using frequency domain
        
        Args:
            audio: Audio tensor
            sr: Sample rate
            cutoff: Cutoff frequency in Hz
            
        Returns:
            Filtered audio
        """
        # FFT
        audio_fft = torch.fft.fft(audio)
        
        # Create lowpass mask
        freqs = torch.fft.fftfreq(len(audio), 1/sr, device=self.device)
        mask = torch.abs(freqs) <= cutoff
        
        # Apply filter
        filtered_fft = audio_fft * mask
        
        # IFFT and take real part
        filtered_audio = torch.fft.ifft(filtered_fft).real
        
        return filtered_audio
    
    def create_multi_channel_spectrograms_gpu(self, audio_file: str, sr: int = 44100, 
                                            n_fft: int = 4096, n_mels: int = 128,
                                            fmin: float = 30, fmax: float = 11000) -> np.ndarray:
        """
        Create 5-channel spectrograms using GPU acceleration
        
        This is the GPU-accelerated version of demix_audio_to_spectrogram
        
        Args:
            audio_file: Path to audio file
            sr: Sample rate
            n_fft: FFT size
            n_mels: Number of mel bins
            fmin: Minimum frequency
            fmax: Maximum frequency
            
        Returns:
            Multi-channel spectrogram array (5 x time x mel_bins)
        """
        start_time = time.time()
        
        # Load audio (still need librosa for file loading)
        y, _ = librosa.load(audio_file, sr=sr, mono=True)
        load_time = time.time() - start_time
        
        # Convert to PyTorch tensor and move to GPU
        audio_tensor = torch.from_numpy(y).float()
        if self.gpu_manager:
            audio_tensor = self.gpu_manager.move_to_device(audio_tensor)
        else:
            audio_tensor = audio_tensor.to(self.device)
        
        # Create mel filter bank on GPU
        mel_filter = self.create_mel_filter_bank(sr, n_fft, n_mels, fmin, fmax)
        
        hop_length = n_fft // 4
        spectrograms = []
        
        gpu_start = time.time()
        
        # 1. Original audio
        stft = self.gpu_stft(audio_tensor, n_fft, hop_length)
        stft_power = torch.abs(stft) ** 2
        spec = torch.matmul(stft_power.T, mel_filter)
        spec_db = self.gpu_power_to_db(spec)
        spectrograms.append(spec_db.cpu().numpy())
        
        # 2. High-pass filtered (preemphasis)
        audio_highpass = self.gpu_preemphasis(audio_tensor, coef=0.97)
        stft = self.gpu_stft(audio_highpass, n_fft, hop_length)
        stft_power = torch.abs(stft) ** 2
        spec = torch.matmul(stft_power.T, mel_filter)
        spec_db = self.gpu_power_to_db(spec)
        spectrograms.append(spec_db.cpu().numpy())
        
        # 3. & 4. Harmonic and Percussive components
        stft_orig = self.gpu_stft(audio_tensor, n_fft, hop_length)
        harmonic_stft, percussive_stft = self.gpu_harmonic_percussive_separation(stft_orig)
        
        # Percussive component
        stft_power = torch.abs(percussive_stft) ** 2
        spec = torch.matmul(stft_power.T, mel_filter)
        spec_db = self.gpu_power_to_db(spec)
        spectrograms.append(spec_db.cpu().numpy())
        
        # Harmonic component
        stft_power = torch.abs(harmonic_stft) ** 2
        spec = torch.matmul(stft_power.T, mel_filter)
        spec_db = self.gpu_power_to_db(spec)
        spectrograms.append(spec_db.cpu().numpy())
        
        # 5. Low-pass filtered
        audio_lowpass = self.gpu_lowpass_filter(audio_tensor, sr, cutoff=1000)
        stft = self.gpu_stft(audio_lowpass, n_fft, hop_length)
        stft_power = torch.abs(stft) ** 2
        spec = torch.matmul(stft_power.T, mel_filter)
        spec_db = self.gpu_power_to_db(spec)
        spectrograms.append(spec_db.cpu().numpy())
        
        gpu_time = time.time() - gpu_start
        total_time = time.time() - start_time
        
        # Clear GPU cache
        if self.gpu_manager and self.gpu_manager.is_cuda:
            self.gpu_manager.clear_cache()
        
        print(f"⚡ GPU Audio Processing: {load_time:.2f}s load + {gpu_time:.2f}s GPU = {total_time:.2f}s total")
        
        # Stack all spectrograms
        return np.stack(spectrograms, axis=0)


# Global instance for reuse
_gpu_audio_processor = None

def get_gpu_audio_processor() -> GPUAudioProcessor:
    """Get the global GPU audio processor instance"""
    global _gpu_audio_processor
    if _gpu_audio_processor is None:
        _gpu_audio_processor = GPUAudioProcessor()
    return _gpu_audio_processor
