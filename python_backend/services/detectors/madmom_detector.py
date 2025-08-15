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
            from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
            import librosa

            # Process beat detection
            beat_proc = RNNBeatProcessor()
            beat_activation = beat_proc(file_path)

            # Track beats with DBN
            beat_tracker = DBNBeatTrackingProcessor(fps=100)
            beat_times = beat_tracker(beat_activation)

            # Process downbeat detection
            downbeat_times = []
            try:
                downbeat_proc = RNNDownBeatProcessor()
                downbeat_activation = downbeat_proc(file_path)

                downbeat_tracker = DBNDownBeatTrackingProcessor(fps=100)
                downbeat_times = downbeat_tracker(downbeat_activation)
            except Exception as e:
                log_error(f"Error in downbeat tracking: {e}")
                # Fall back to using every 4th beat as a downbeat
                downbeat_times = beat_times[::4]

            # Calculate BPM
            bpm = 120.0  # Default
            if len(beat_times) > 1:
                intervals = np.diff(beat_times)
                median_interval = np.median(intervals)
                bpm = 60.0 / median_interval if median_interval > 0 else 120.0

            # Get audio duration
            y, sr = librosa.load(file_path, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)

            # Detect time signature from beat pattern
            time_signature = self._detect_time_signature(beat_times, downbeat_times)

            processing_time = time.time() - start_time

            log_info(f"Madmom detection successful: {len(beat_times)} beats, {len(downbeat_times)} downbeats")

            return {
                "success": True,
                "beats": beat_times.tolist() if hasattr(beat_times, 'tolist') else list(beat_times),
                "downbeats": downbeat_times.tolist() if hasattr(downbeat_times, 'tolist') else list(downbeat_times),
                "total_beats": len(beat_times),
                "total_downbeats": len(downbeat_times),
                "bpm": float(bpm),
                "time_signature": f"{time_signature}/4",
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

    def _detect_time_signature(self, beat_times: List[float], downbeat_times: List[float]) -> int:
        """
        Detect time signature from beat and downbeat patterns.

        Args:
            beat_times: List of beat positions in seconds
            downbeat_times: List of downbeat positions in seconds

        Returns:
            int: Detected time signature (beats per measure)
        """
        # Default to 4/4
        time_signature = 4

        if len(downbeat_times) >= 2:
            # Analyze beats between downbeats
            time_signatures = []
            for i in range(len(downbeat_times) - 1):
                curr_downbeat = downbeat_times[i]
                next_downbeat = downbeat_times[i + 1]

                # Count beats in this measure
                beats_in_measure = sum(1 for b in beat_times if curr_downbeat <= b < next_downbeat)
                if 2 <= beats_in_measure <= 12:
                    time_signatures.append(beats_in_measure)

            # Use the most common time signature
            if time_signatures:
                from collections import Counter
                time_signature = Counter(time_signatures).most_common(1)[0][0]
                log_debug(f"Detected time signature from downbeat analysis: {time_signature}/4")

        return time_signature