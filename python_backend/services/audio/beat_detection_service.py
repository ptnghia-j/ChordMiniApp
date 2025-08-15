"""
Beat detection service.

This module provides the main orchestration service for beat detection,
handling model selection, file size policies, and fallback strategies.
"""

import os
import time
from typing import Dict, Any, List, Optional
from utils.logging import log_info, log_error, log_debug
from services.detectors.beat_transformer_detector import BeatTransformerDetectorService
from services.detectors.madmom_detector import MadmomDetectorService
from services.detectors.librosa_detector import LibrosaDetectorService
from services.audio.audio_utils import validate_audio_file, get_audio_duration
from utils.paths import BEAT_TRANSFORMER_CHECKPOINT


class BeatDetectionService:
    """
    Main service for beat detection with model selection and orchestration.
    """

    def __init__(self):
        """Initialize the beat detection service with available detectors."""
        self.detectors = {
            'beat-transformer': BeatTransformerDetectorService(str(BEAT_TRANSFORMER_CHECKPOINT)),
            'madmom': MadmomDetectorService(),
            'librosa': LibrosaDetectorService()
        }

        # File size limits (in MB)
        self.size_limits = {
            'beat-transformer': 100,  # 100MB limit for Beat Transformer
            'madmom': 200,           # 200MB limit for madmom
            'librosa': 500           # 500MB limit for librosa
        }

    def get_available_detectors(self) -> List[str]:
        """
        Get list of available detectors.

        Returns:
            List[str]: Names of available detectors
        """
        available = []
        for name, detector in self.detectors.items():
            if detector.is_available():
                available.append(name)
        return available

    def select_detector(self, requested_detector: str, file_size_mb: float,
                       force: bool = False) -> str:
        """
        Select the best detector based on request, availability, and file size.

        Args:
            requested_detector: Requested detector ('beat-transformer', 'madmom', 'librosa', 'auto')
            file_size_mb: File size in megabytes
            force: Force use of requested detector even if file is large

        Returns:
            str: Selected detector name

        Raises:
            ValueError: If no suitable detector is available
        """
        available_detectors = self.get_available_detectors()

        if not available_detectors:
            raise ValueError("No beat detection models available")

        log_debug(f"Available detectors: {available_detectors}")
        log_debug(f"Requested: {requested_detector}, File size: {file_size_mb:.1f}MB, Force: {force}")

        # Handle specific detector requests
        if requested_detector in ['beat-transformer', 'madmom', 'librosa']:
            if requested_detector not in available_detectors:
                log_error(f"{requested_detector} requested but not available")
                # Fall back to best available option
                return self._select_fallback_detector(available_detectors, file_size_mb)

            # Check file size limits unless force is enabled
            if not force and file_size_mb > self.size_limits[requested_detector]:
                log_info(f"File too large for {requested_detector} ({file_size_mb:.1f}MB > {self.size_limits[requested_detector]}MB)")
                return self._select_fallback_detector(available_detectors, file_size_mb)

            return requested_detector

        # Handle 'auto' selection
        elif requested_detector == 'auto':
            return self._auto_select_detector(available_detectors, file_size_mb)

        else:
            log_error(f"Unknown detector '{requested_detector}', using auto selection")
            return self._auto_select_detector(available_detectors, file_size_mb)

    def _auto_select_detector(self, available_detectors: List[str], file_size_mb: float) -> str:
        """
        Automatically select the best detector based on availability and file size.

        Args:
            available_detectors: List of available detector names
            file_size_mb: File size in megabytes

        Returns:
            str: Selected detector name
        """
        # Preference order: beat-transformer > madmom > librosa
        # But consider file size limits

        if file_size_mb <= 50:  # Small files - prefer Beat Transformer
            if 'beat-transformer' in available_detectors:
                return 'beat-transformer'

        if file_size_mb <= 100:  # Medium files - Beat Transformer or madmom
            if 'beat-transformer' in available_detectors:
                return 'beat-transformer'
            elif 'madmom' in available_detectors:
                return 'madmom'

        # Large files - prefer madmom or librosa
        if 'madmom' in available_detectors and file_size_mb <= self.size_limits['madmom']:
            return 'madmom'
        elif 'librosa' in available_detectors and file_size_mb <= self.size_limits['librosa']:
            return 'librosa'

        # Fallback to any available detector
        return available_detectors[0]

    def _select_fallback_detector(self, available_detectors: List[str], file_size_mb: float) -> str:
        """
        Select a fallback detector when the requested one is not suitable.

        Args:
            available_detectors: List of available detector names
            file_size_mb: File size in megabytes

        Returns:
            str: Selected fallback detector name
        """
        # Find detectors that can handle the file size
        suitable_detectors = [
            detector for detector in available_detectors
            if file_size_mb <= self.size_limits[detector]
        ]

        if suitable_detectors:
            # Prefer madmom for large files, then librosa
            if 'madmom' in suitable_detectors:
                return 'madmom'
            elif 'librosa' in suitable_detectors:
                return 'librosa'
            else:
                return suitable_detectors[0]

        # If no detector can handle the file size, use the most permissive one
        return max(available_detectors, key=lambda d: self.size_limits[d])

    def detect_beats(self, file_path: str, detector: str = 'auto',
                    force: bool = False) -> Dict[str, Any]:
        """
        Detect beats in an audio file.

        Args:
            file_path: Path to the audio file
            detector: Detector to use ('beat-transformer', 'madmom', 'librosa', 'auto')
            force: Force use of requested detector even if file is large

        Returns:
            Dict containing beat detection results with normalized format
        """
        start_time = time.time()

        try:
            # Validate audio file
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": f"Audio file not found: {file_path}",
                    "processing_time": time.time() - start_time
                }

            if not validate_audio_file(file_path):
                return {
                    "success": False,
                    "error": "Invalid or corrupted audio file",
                    "processing_time": time.time() - start_time
                }

            # Get file size
            file_size_bytes = os.path.getsize(file_path)
            file_size_mb = file_size_bytes / (1024 * 1024)

            log_info(f"Processing audio file: {file_path} ({file_size_mb:.1f}MB)")

            # Select detector
            selected_detector = self.select_detector(detector, file_size_mb, force)
            log_info(f"Selected detector: {selected_detector}")

            # Run detection
            detector_service = self.detectors[selected_detector]
            result = detector_service.detect_beats(file_path)

            # Add metadata
            result['file_size_mb'] = file_size_mb
            result['detector_selected'] = selected_detector
            result['detector_requested'] = detector
            result['force_used'] = force

            # Add audio duration if not present
            if 'duration' not in result or result['duration'] == 0:
                try:
                    result['duration'] = get_audio_duration(file_path)
                except Exception as e:
                    log_error(f"Failed to get audio duration: {e}")
                    result['duration'] = 0.0

            total_time = time.time() - start_time
            result['total_processing_time'] = total_time

            if result.get('success'):
                log_info(f"Beat detection successful: {result['total_beats']} beats, "
                        f"{result['total_downbeats']} downbeats, "
                        f"BPM: {result['bpm']:.1f}, "
                        f"Time: {total_time:.2f}s")
            else:
                log_error(f"Beat detection failed: {result.get('error', 'Unknown error')}")

            return result

        except Exception as e:
            error_msg = f"Beat detection service error: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "processing_time": time.time() - start_time
            }

    def get_detector_info(self) -> Dict[str, Any]:
        """
        Get information about available detectors.

        Returns:
            Dict containing detector availability and capabilities
        """
        info = {
            "available_detectors": self.get_available_detectors(),
            "detectors": {}
        }

        for name, detector in self.detectors.items():
            info["detectors"][name] = {
                "available": detector.is_available(),
                "size_limit_mb": self.size_limits[name],
                "description": self._get_detector_description(name)
            }

            # Add device info for Beat Transformer
            if name == 'beat-transformer' and detector.is_available():
                try:
                    device_info = detector.get_device_info()
                    info["detectors"][name]["device_info"] = device_info
                except Exception as e:
                    info["detectors"][name]["device_error"] = str(e)

        return info

    def _get_detector_description(self, detector_name: str) -> str:
        """Get description for a detector."""
        descriptions = {
            'beat-transformer': "Deep learning model for beat tracking with downbeat detection",
            'madmom': "Neural network with good balance of accuracy and speed",
            'librosa': "Classical signal processing approach, fast but less accurate"
        }
        return descriptions.get(detector_name, "Unknown detector")