"""
Chord recognition service.

This module provides the main orchestration service for chord recognition,
handling model selection, chord dictionary selection, and fallback strategies.
"""

import os
import time
from typing import Dict, Any, List, Optional
from utils.logging import log_info, log_error, log_debug
from services.detectors.chord_cnn_lstm_detector import ChordCNNLSTMDetectorService
from services.detectors.btc_sl_detector import BTCSLDetectorService
from services.detectors.btc_pl_detector import BTCPLDetectorService
from services.audio.audio_utils import validate_audio_file, get_audio_duration
from services.audio.spleeter_service import SpleeterService
from utils.chord_mappings import (
    get_supported_chord_dicts, 
    get_default_chord_dict, 
    validate_chord_dict_for_model
)
from utils.paths import CHORD_CNN_LSTM_DIR, CHORDMINI_DIR


class ChordRecognitionService:
    """
    Main service for chord recognition with model selection and orchestration.
    """
    
    def __init__(self):
        """Initialize the chord recognition service with available detectors."""
        self.detectors = {
            'chord-cnn-lstm': ChordCNNLSTMDetectorService(str(CHORD_CNN_LSTM_DIR)),
            'btc-sl': BTCSLDetectorService(str(CHORDMINI_DIR)),
            'btc-pl': BTCPLDetectorService(str(CHORDMINI_DIR))
        }
        
        # File size limits (in MB)
        self.size_limits = {
            'chord-cnn-lstm': 100,  # 100MB limit for Chord-CNN-LSTM
            'btc-sl': 50,          # 50MB limit for BTC-SL
            'btc-pl': 50           # 50MB limit for BTC-PL
        }
        
        # Initialize Spleeter service
        self.spleeter_service = SpleeterService()
    
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
            requested_detector: Requested detector ('chord-cnn-lstm', 'btc-sl', 'btc-pl', 'auto')
            file_size_mb: File size in megabytes
            force: Force use of requested detector even if file is large
            
        Returns:
            str: Selected detector name
            
        Raises:
            ValueError: If no suitable detector is available
        """
        available_detectors = self.get_available_detectors()
        
        if not available_detectors:
            raise ValueError("No chord recognition models available")
        
        log_debug(f"Available detectors: {available_detectors}")
        log_debug(f"Requested: {requested_detector}, File size: {file_size_mb:.1f}MB, Force: {force}")
        
        # Handle specific detector requests
        if requested_detector in ['chord-cnn-lstm', 'btc-sl', 'btc-pl']:
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
        # Preference order: chord-cnn-lstm > btc-sl > btc-pl
        # But consider file size limits
        
        if file_size_mb <= 50:  # Small files - prefer BTC models for better accuracy
            if 'btc-sl' in available_detectors:
                return 'btc-sl'
            elif 'btc-pl' in available_detectors:
                return 'btc-pl'
        
        if file_size_mb <= 100:  # Medium files - Chord-CNN-LSTM or BTC models
            if 'chord-cnn-lstm' in available_detectors:
                return 'chord-cnn-lstm'
            elif 'btc-sl' in available_detectors:
                return 'btc-sl'
            elif 'btc-pl' in available_detectors:
                return 'btc-pl'
        
        # Large files - prefer Chord-CNN-LSTM
        if 'chord-cnn-lstm' in available_detectors and file_size_mb <= self.size_limits['chord-cnn-lstm']:
            return 'chord-cnn-lstm'
        
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
            # Prefer chord-cnn-lstm for large files, then BTC models
            if 'chord-cnn-lstm' in suitable_detectors:
                return 'chord-cnn-lstm'
            elif 'btc-sl' in suitable_detectors:
                return 'btc-sl'
            elif 'btc-pl' in suitable_detectors:
                return 'btc-pl'
            else:
                return suitable_detectors[0]
        
        # If no detector can handle the file size, use the most permissive one
        return max(available_detectors, key=lambda d: self.size_limits[d])
    
    def recognize_chords(self, file_path: str, detector: str = 'auto', 
                        chord_dict: str = None, force: bool = False,
                        use_spleeter: bool = False) -> Dict[str, Any]:
        """
        Recognize chords in an audio file.
        
        Args:
            file_path: Path to the audio file
            detector: Detector to use ('chord-cnn-lstm', 'btc-sl', 'btc-pl', 'auto')
            chord_dict: Chord dictionary to use (if None, uses model default)
            force: Force use of requested detector even if file is large
            use_spleeter: Whether to use Spleeter for audio separation
            
        Returns:
            Dict containing chord recognition results with normalized format
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
            
            # Get detector service
            detector_service = self.detectors[selected_detector]
            
            # Determine chord dictionary
            if chord_dict is None:
                chord_dict = get_default_chord_dict(selected_detector)
            
            # Validate chord dictionary for the selected model
            if not validate_chord_dict_for_model(chord_dict, selected_detector):
                supported_dicts = get_supported_chord_dicts(selected_detector)
                log_error(f"Chord dictionary '{chord_dict}' not supported by {selected_detector}")
                chord_dict = supported_dicts[0] if supported_dicts else 'submission'
                log_info(f"Using fallback chord dictionary: {chord_dict}")
            
            # Process with Spleeter if requested
            audio_file_to_process = file_path
            spleeter_info = None
            
            if use_spleeter and self.spleeter_service.is_available():
                log_info("Using Spleeter for audio separation")
                spleeter_result = self.spleeter_service.extract_vocals(file_path)
                if spleeter_result.get("success"):
                    # Use the vocals track for chord recognition
                    audio_file_to_process = spleeter_result.get("vocals_path", file_path)
                    spleeter_info = {
                        "used": True,
                        "model": "2stems-16kHz",
                        "processing_time": spleeter_result.get("processing_time", 0.0)
                    }
                    log_info(f"Using separated vocals: {audio_file_to_process}")
                else:
                    log_error(f"Spleeter separation failed: {spleeter_result.get('error')}")
                    spleeter_info = {"used": False, "error": spleeter_result.get("error")}
            
            # Run chord recognition
            result = detector_service.recognize_chords(audio_file_to_process, chord_dict)
            
            # Add metadata
            result['file_size_mb'] = file_size_mb
            result['detector_selected'] = selected_detector
            result['detector_requested'] = detector
            result['force_used'] = force
            result['spleeter_info'] = spleeter_info
            
            # Add audio duration if not present
            if 'duration' not in result or result['duration'] == 0:
                try:
                    result['duration'] = get_audio_duration(file_path)
                except Exception as e:
                    log_error(f"Failed to get audio duration: {e}")
                    result['duration'] = 0.0
            
            total_time = time.time() - start_time
            result['total_processing_time'] = total_time
            
            # Cleanup Spleeter files if used
            if spleeter_info and spleeter_info.get("used"):
                try:
                    self.spleeter_service.cleanup_stems(spleeter_result)
                except Exception as e:
                    log_error(f"Failed to cleanup Spleeter files: {e}")
            
            if result.get('success'):
                log_info(f"Chord recognition successful: {result['total_chords']} chords, "
                        f"Model: {result['model_used']}, "
                        f"Dict: {result['chord_dict']}, "
                        f"Time: {total_time:.2f}s")
            else:
                log_error(f"Chord recognition failed: {result.get('error', 'Unknown error')}")
            
            return result
            
        except Exception as e:
            error_msg = f"Chord recognition service error: {str(e)}"
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
            "detectors": {},
            "spleeter_available": self.spleeter_service.is_available()
        }
        
        for name, detector in self.detectors.items():
            detector_info = detector.get_model_info()
            detector_info["size_limit_mb"] = self.size_limits[name]
            detector_info["supported_chord_dicts"] = get_supported_chord_dicts(name)
            detector_info["default_chord_dict"] = get_default_chord_dict(name)
            info["detectors"][name] = detector_info
        
        # Add Spleeter info
        if self.spleeter_service.is_available():
            info["spleeter_info"] = self.spleeter_service.get_model_info()
        
        return info