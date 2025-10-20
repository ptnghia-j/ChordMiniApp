"""
Madmom detector service.

This module provides a wrapper around madmom beat detection
with a normalized interface for the beat detection service.
"""

import time
import numpy as np
from typing import Dict, Any, List
from utils.logging import log_info, log_error, log_debug


class MadmomDetectorService:
    """
    Service wrapper for madmom beat detection with normalized interface.
    """

    def __init__(self):
        """Initialize the madmom detector service."""
        self._available = None

    def is_available(self) -> bool:
        """
        Check if madmom is available.

        Returns:
            bool: True if madmom can be used
        """
        if self._available is not None:
            return self._available

        try:
            import madmom
            self._available = True
            log_debug(f"Madmom availability: {self._available}, version: {getattr(madmom, '__version__', 'unknown')}")
            return True
        except ImportError as e:
            log_error(f"Madmom import failed: {e}")
            self._available = False
            return False

    def detect_beats(self, file_path: str, **kwargs) -> Dict[str, Any]:
        """
        Detect beats in an audio file using madmom.

        Args:
            file_path: Path to the audio file
            **kwargs: Additional parameters (unused for madmom)

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
                "error": "Madmom is not available",
                "model_used": "madmom",
                "model_name": "Madmom"
            }

        start_time = time.time()

        try:
            log_info(f"Running madmom detection on: {file_path}")

            # Import madmom modules
            from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
            import librosa

            # Process beat detection (beats only)
            beat_proc = RNNBeatProcessor()
            beat_activation = beat_proc(file_path)

            # Track beats with DBN
            beat_tracker = DBNBeatTrackingProcessor(fps=100)
            beat_times = beat_tracker(beat_activation)

            # Heuristic downbeat candidates: assume either 3 or 4 beats per bar
            downbeats4 = beat_times[::4]
            downbeats3 = beat_times[::3]

            # For backward compatibility, expose a default downbeats array (4/4)
            downbeat_times = downbeats4

            # Calculate BPM
            bpm = 120.0  # Default
            if len(beat_times) > 1:
                intervals = np.diff(beat_times)
                median_interval = np.median(intervals)
                bpm = 60.0 / median_interval if median_interval > 0 else 120.0

            # Get audio duration
            y, sr = librosa.load(file_path, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)

            # Time signature will be selected on the frontend via heuristic comparison of candidates.
            # Keep a backward-compatible placeholder; default to 4/4 here.
            # (Frontend will override and cache the selected meter.)

            processing_time = time.time() - start_time

            log_info(
                f"Madmom detection successful: {len(beat_times)} beats, "
                f"{len(downbeat_times)} default-downbeats (4/4), candidates: 3/4={len(downbeats3)}, 4/4={len(downbeats4)}"
            )

            return {
                "success": True,
                "beats": beat_times.tolist() if hasattr(beat_times, 'tolist') else list(beat_times),
                "downbeats": downbeat_times.tolist() if hasattr(downbeat_times, 'tolist') else list(downbeat_times),
                "downbeat_candidates": {
                    "3": downbeats3.tolist() if hasattr(downbeats3, 'tolist') else list(downbeats3),
                    "4": downbeats4.tolist() if hasattr(downbeats4, 'tolist') else list(downbeats4),
                },
                "downbeat_candidates_meta": {
                    "default": 4,
                    "strategy": "heuristic_slices_from_beats"
                },
                "total_beats": len(beat_times),
                "total_downbeats": len(downbeat_times),
                "bpm": float(bpm),
                "time_signature": "4/4",
                "duration": float(duration),
                "model_used": "madmom",
                "model_name": "Madmom",
                "processing_time": processing_time
            }

        except Exception as e:
            error_msg = f"Madmom detection error: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "model_used": "madmom",
                "model_name": "Madmom",
                "processing_time": time.time() - start_time
            }

