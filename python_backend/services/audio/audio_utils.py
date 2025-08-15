"""
Audio processing utilities.

This module provides utility functions for audio processing including
silence trimming, duration calculation, and audio format handling.
"""

from typing import Tuple, Optional
from utils.logging import log_info, log_error, log_debug


def trim_silence_from_audio(audio_path: str, output_path: Optional[str] = None,
                          top_db: int = 20, frame_length: int = 2048,
                          hop_length: int = 512) -> Tuple[any, int, float, float]:
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
        import librosa
        import soundfile as sf

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
            sf.write(output_path, y_trimmed, sr)
            log_debug(f"Saved trimmed audio to: {output_path}")

        return y_trimmed, sr, trim_start_time, trim_end_time

    except Exception as e:
        log_error(f"Failed to trim silence from audio: {e}")
        # Return original audio if trimming fails
        try:
            import librosa
            y, sr = librosa.load(audio_path, sr=None)
            return y, sr, 0.0, len(y) / sr
        except Exception as load_error:
            log_error(f"Failed to load audio file: {load_error}")
            raise


def get_audio_duration(audio_path: str) -> float:
    """
    Get the duration of an audio file in seconds.

    Args:
        audio_path: Path to the audio file

    Returns:
        float: Duration in seconds
    """
    try:
        import librosa
        y, sr = librosa.load(audio_path, sr=None)
        duration = librosa.get_duration(y=y, sr=sr)
        return float(duration)
    except Exception as e:
        log_error(f"Failed to get audio duration: {e}")
        return 0.0


def resample_audio(audio_path: str, target_sr: int = 44100) -> Tuple[any, int]:
    """
    Resample audio to a target sample rate.

    Args:
        audio_path: Path to the audio file
        target_sr: Target sample rate (default: 44100Hz)

    Returns:
        tuple: (resampled_audio, sample_rate)
    """
    try:
        import librosa
        y, sr = librosa.load(audio_path, sr=target_sr)
        log_debug(f"Resampled audio from {sr}Hz to {target_sr}Hz")
        return y, sr
    except Exception as e:
        log_error(f"Failed to resample audio: {e}")
        raise


def validate_audio_file(audio_path: str) -> bool:
    """
    Validate that an audio file can be loaded and processed.

    Args:
        audio_path: Path to the audio file

    Returns:
        bool: True if the file is valid, False otherwise
    """
    try:
        import librosa
        y, sr = librosa.load(audio_path, sr=None, duration=1.0)  # Load only first second
        return len(y) > 0 and sr > 0
    except ImportError:
        # If librosa is not available, just check if file exists
        import os
        return os.path.exists(audio_path) and os.path.getsize(audio_path) > 0
    except Exception as e:
        log_error(f"Audio file validation failed: {e}")
        return False