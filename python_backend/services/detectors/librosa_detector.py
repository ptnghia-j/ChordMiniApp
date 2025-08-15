"""
Librosa detector service.

This module provides a wrapper around librosa beat detection
with a normalized interface for the beat detection service.
"""

import time
import numpy as np
from typing import Dict, Any, List
from utils.logging import log_info, log_error, log_debug


class LibrosaDetectorService:
    """
    Service wrapper for librosa beat detection with normalized interface.
    """

    def __init__(self):
        """Initialize the librosa detector service."""
        self._available = None

    def is_available(self) -> bool:
        """
        Check if librosa is available.

        Returns:
            bool: True if librosa can be used
        """
        if self._available is not None:
            return self._available

        try:
            import librosa
            self._available = True
            log_debug(f"Librosa availability: {self._available}, version: {getattr(librosa, '__version__', 'unknown')}")
            return True
        except ImportError as e:
            log_error(f"Librosa import failed: {e}")
            self._available = False
            return False

    def detect_beats(self, file_path: str, **kwargs) -> Dict[str, Any]:
        """
        Detect beats in an audio file using librosa.

        Args:
            file_path: Path to the audio file
            **kwargs: Additional parameters (unused for librosa)

        Returns:
            Dict containing normalized beat detection results:
            {
                "success": bool,
                "beats": List[float],           # Beat positions in seconds
                "downbeats": List[float],       # Downbeat positions in seconds
                "total_beats": int,
                "total_downbeats": int,
                "bpm": float,
                "time_signature": str,
                "duration": float,
                "model_used": str,
                "model_name": str,
                "processing_time": float,
                "error": str (if success=False)
            }
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Librosa is not available",
                "model_used": "librosa",
                "model_name": "Librosa"
            }

        start_time = time.time()

        try:
            log_info(f"Running librosa detection on: {file_path}")

            import librosa

            # Load audio
            y, sr = librosa.load(file_path, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)

            # Detect beats
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            beat_times = librosa.frames_to_time(beats, sr=sr)

            # Estimate downbeats (every 4th beat as a simple heuristic)
            downbeat_times = beat_times[::4]

            # Simple time signature detection (default to 4/4)
            time_signature = 4

            processing_time = time.time() - start_time

            log_info(f"Librosa detection successful: {len(beat_times)} beats, {len(downbeat_times)} downbeats")

            return {
                "success": True,
                "beats": beat_times.tolist() if hasattr(beat_times, 'tolist') else list(beat_times),
                "downbeats": downbeat_times.tolist() if hasattr(downbeat_times, 'tolist') else list(downbeat_times),
                "total_beats": len(beat_times),
                "total_downbeats": len(downbeat_times),
                "bpm": float(tempo),
                "time_signature": f"{time_signature}/4",
                "duration": float(duration),
                "model_used": "librosa",
                "model_name": "Librosa",
                "processing_time": processing_time
            }

        except Exception as e:
            error_msg = f"Librosa detection error: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "model_used": "librosa",
                "model_name": "Librosa",
                "processing_time": time.time() - start_time
            }