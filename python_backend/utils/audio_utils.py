"""
Audio processing utilities for ChordMini Flask application.

This module provides audio processing functions including silence trimming,
audio format conversion, and other audio manipulation utilities.
"""

import librosa
import numpy as np
from utils.logging import log_info, log_error, log_debug


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

        log_debug(f"Audio trimming results:")
        log_debug(f"  - Original duration: {len(y) / sr:.3f}s")
        log_debug(f"  - Trimmed duration: {len(y_trimmed) / sr:.3f}s")
        log_debug(f"  - Trimmed from start: {trim_start_time:.3f}s")
        log_debug(f"  - Trimmed from end: {len(y) / sr - trim_end_time:.3f}s")

        # Save the trimmed audio if output path is provided
        if output_path:
            try:
                import soundfile as sf
                sf.write(output_path, y_trimmed, sr)
                log_debug(f"Saved trimmed audio to: {output_path}")
            except ImportError:
                log_error("soundfile library not available for saving audio")
                raise ImportError("soundfile library is required for saving audio files")

        return y_trimmed, sr, trim_start_time, trim_end_time

    except Exception as e:
        log_error(f"Failed to trim silence from audio: {e}")
        # Return original audio if trimming fails
        try:
            y, sr = librosa.load(audio_path, sr=None)
            return y, sr, 0.0, len(y) / sr
        except Exception as load_error:
            log_error(f"Failed to load audio file: {load_error}")
            raise


def get_audio_duration(audio_path):
    """
    Get the duration of an audio file without loading the entire file.

    Args:
        audio_path: Path to the audio file

    Returns:
        float: Duration in seconds
    """
    try:
        duration = librosa.get_duration(filename=audio_path)
        return duration
    except Exception as e:
        log_error(f"Failed to get audio duration: {e}")
        return 0.0


def resample_audio(audio_data, original_sr, target_sr):
    """
    Resample audio data to a target sample rate.

    Args:
        audio_data: Audio data as numpy array
        original_sr: Original sample rate
        target_sr: Target sample rate

    Returns:
        numpy.ndarray: Resampled audio data
    """
    try:
        if original_sr == target_sr:
            return audio_data
        
        resampled = librosa.resample(audio_data, orig_sr=original_sr, target_sr=target_sr)
        log_debug(f"Resampled audio from {original_sr}Hz to {target_sr}Hz")
        return resampled
    except Exception as e:
        log_error(f"Failed to resample audio: {e}")
        return audio_data


def normalize_audio(audio_data, target_peak=0.95):
    """
    Normalize audio data to a target peak level.

    Args:
        audio_data: Audio data as numpy array
        target_peak: Target peak level (0.0 to 1.0)

    Returns:
        numpy.ndarray: Normalized audio data
    """
    try:
        if len(audio_data) == 0:
            return audio_data
            
        current_peak = np.max(np.abs(audio_data))
        if current_peak > 0:
            normalization_factor = target_peak / current_peak
            normalized = audio_data * normalization_factor
            log_debug(f"Normalized audio: peak {current_peak:.3f} → {target_peak:.3f}")
            return normalized
        else:
            log_debug("Audio data is silent, no normalization needed")
            return audio_data
    except Exception as e:
        log_error(f"Failed to normalize audio: {e}")
        return audio_data


def convert_to_mono(audio_data):
    """
    Convert stereo audio to mono by averaging channels.

    Args:
        audio_data: Audio data as numpy array (can be 1D or 2D)

    Returns:
        numpy.ndarray: Mono audio data
    """
    try:
        if audio_data.ndim == 1:
            # Already mono
            return audio_data
        elif audio_data.ndim == 2:
            # Convert stereo to mono by averaging channels
            mono = np.mean(audio_data, axis=0)
            log_debug("Converted stereo audio to mono")
            return mono
        else:
            log_error(f"Unsupported audio shape: {audio_data.shape}")
            return audio_data
    except Exception as e:
        log_error(f"Failed to convert audio to mono: {e}")
        return audio_data


def validate_audio_file(audio_path):
    """
    Validate that an audio file exists and can be loaded.

    Args:
        audio_path: Path to the audio file

    Returns:
        dict: Validation results with 'valid', 'error', 'duration', 'sample_rate'
    """
    try:
        import os
        
        if not os.path.exists(audio_path):
            return {
                'valid': False,
                'error': 'File does not exist',
                'duration': 0.0,
                'sample_rate': 0
            }
        
        # Try to load a small portion to validate
        y, sr = librosa.load(audio_path, duration=1.0)
        duration = librosa.get_duration(filename=audio_path)
        
        return {
            'valid': True,
            'error': None,
            'duration': duration,
            'sample_rate': sr
        }
        
    except Exception as e:
        return {
            'valid': False,
            'error': str(e),
            'duration': 0.0,
            'sample_rate': 0
        }
