"""
BTC-SL (Self-Label) detector service.

This module provides a wrapper around the BTC Self-Label transformer model
with a normalized interface for the chord recognition service.
"""

import os
import sys
import time
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List
from utils.logging import log_info, log_error, log_debug


class BTCSLDetectorService:
    """
    Service wrapper for BTC-SL (Self-Label) with normalized interface.
    """
    
    def __init__(self, model_dir: Optional[str] = None):
        """
        Initialize the BTC-SL detector service.
        
        Args:
            model_dir: Path to the ChordMini model directory
        """
        self.model_dir = Path(model_dir) if model_dir else None
        self._available = None
        
    def is_available(self) -> bool:
        """
        Check if BTC-SL is available based on actual files in our repository layout.

        Returns:
            bool: True if the detector can be used
        """
        if self._available is not None:
            return self._available

        try:
            if not self.model_dir or not self.model_dir.exists():
                log_error("BTC-SL model directory not found")
                self._available = False
                return False

            # Check for required directories
            config_dir = self.model_dir / "config"
            checkpoints_dir = self.model_dir / "checkpoints"
            for path in [config_dir, checkpoints_dir]:
                if not path.exists():
                    log_error(f"Required BTC-SL path not found: {path}")
                    self._available = False
                    return False

            # Check for actual files we ship
            config_path = config_dir / "btc_config.yaml"
            checkpoint_path = checkpoints_dir / "SL" / "btc_model_large_voca.pt"
            if not config_path.exists():
                log_debug(f"BTC-SL config not found: {config_path}")
                self._available = False
                return False
            if not checkpoint_path.exists():
                log_debug(f"BTC-SL checkpoint not found: {checkpoint_path}")
                self._available = False
                return False

            # Try to import prerequisites and our btc wrapper
            try:
                import torch  # noqa: F401
                from btc_chord_recognition import btc_chord_recognition  # noqa: F401
            except Exception as e:
                log_error(f"BTC-SL import check failed: {e}")
                self._available = False
                return False

            self._available = True
            log_debug("BTC-SL availability: True")
            return True

        except Exception as e:
            log_error(f"Error checking BTC-SL availability: {e}")
            self._available = False
            return False
    
    def recognize_chords(self, file_path: str, chord_dict: str = 'large_voca', **kwargs) -> Dict[str, Any]:
        """
        Recognize chords in an audio file using BTC-SL.
        
        Args:
            file_path: Path to the audio file
            chord_dict: Chord dictionary to use (BTC-SL uses 'large_voca')
            **kwargs: Additional parameters
        
        Returns:
            Dict containing normalized chord recognition results
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "BTC-SL is not available",
                "model_used": "btc-sl",
                "model_name": "BTC SL (Self-Label)"
            }
        
        start_time = time.time()
        original_dir = os.getcwd()
        temp_lab_path = None
        
        try:
            log_info(f"Running BTC-SL recognition on: {file_path}")
            
            # Create temporary lab file
            temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
            temp_lab_path = temp_lab_file.name
            temp_lab_file.close()
            
            # Use our unified BTC wrapper to generate a .lab file
            sys.path.insert(0, str(self.model_dir))
            os.chdir(str(self.model_dir))

            from btc_chord_recognition import btc_chord_recognition

            ok = btc_chord_recognition(file_path, temp_lab_path, model_variant='sl')
            if not ok:
                raise RuntimeError("btc_chord_recognition returned False for SL variant")

            # Parse the lab file
            chord_data = self._parse_lab_file(temp_lab_path)

            # Calculate duration (using "end" field to match frontend expectations)
            duration = chord_data[-1]["end"] if chord_data else 0.0

            processing_time = time.time() - start_time

            log_info(f"BTC-SL recognition successful: {len(chord_data)} chords detected")

            return {
                "success": True,
                "chords": chord_data,
                "total_chords": len(chord_data),
                "duration": duration,
                "model_used": "btc-sl",
                "model_name": "BTC SL (Self-Label)",
                "chord_dict": "large_voca",
                "processing_time": processing_time
            }
            
        except Exception as e:
            error_msg = f"BTC-SL recognition error: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "model_used": "btc-sl",
                "model_name": "BTC SL (Self-Label)",
                "chord_dict": "large_voca",
                "processing_time": time.time() - start_time
            }
        finally:
            # Cleanup
            os.chdir(original_dir)
            if temp_lab_path and os.path.exists(temp_lab_path):
                try:
                    os.unlink(temp_lab_path)
                except Exception as e:
                    log_error(f"Failed to clean up temporary lab file: {e}")
    
    def _save_chord_sequence_to_lab(self, chord_sequence: List[str], lab_path: str, frame_rate: float = 10.0):
        """
        Save chord sequence to lab file format.
        
        Args:
            chord_sequence: List of chord labels
            lab_path: Output lab file path
            frame_rate: Frame rate for timing (frames per second)
        """
        try:
            with open(lab_path, 'w') as f:
                for i, chord in enumerate(chord_sequence):
                    start_time = i / frame_rate
                    end_time = (i + 1) / frame_rate
                    f.write(f"{start_time:.3f}\t{end_time:.3f}\t{chord}\n")
        except Exception as e:
            log_error(f"Error saving chord sequence to lab file: {e}")
            raise
    
    def _parse_lab_file(self, lab_path: str) -> List[Dict[str, Any]]:
        """
        Parse a lab file into chord annotations.
        
        Args:
            lab_path: Path to the lab file
            
        Returns:
            List of chord annotations
        """
        chord_data = []
        
        try:
            with open(lab_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        parts = line.split('\t')
                        if len(parts) >= 3:
                            start_time = float(parts[0])
                            end_time = float(parts[1])
                            chord = parts[2]
                            
                            chord_data.append({
                                "start": start_time,      # Frontend expects "start" not "start_time"
                                "end": end_time,          # Frontend expects "end" not "end_time"
                                "chord": chord,
                                "confidence": 1.0  # BTC models don't provide confidence scores
                            })
        except Exception as e:
            log_error(f"Error parsing lab file {lab_path}: {e}")
            
        return chord_data
    
    def get_supported_chord_dicts(self) -> List[str]:
        """
        Get list of supported chord dictionaries.
        
        Returns:
            List of supported chord dictionary names
        """
        return ['large_voca']
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get model information.
        
        Returns:
            Dict containing model information
        """
        return {
            "name": "BTC SL (Self-Label)",
            "description": "Transformer-based model trained with self-labeling, 170 chord vocabulary",
            "supported_chord_dicts": self.get_supported_chord_dicts(),
            "model_dir": str(self.model_dir) if self.model_dir else None,
            "available": self.is_available()
        }
