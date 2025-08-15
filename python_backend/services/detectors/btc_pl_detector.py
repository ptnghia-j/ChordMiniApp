"""
BTC-PL (Pseudo-Label) detector service.

This module provides a wrapper around the BTC Pseudo-Label transformer model
with a normalized interface for the chord recognition service.
"""

import os
import sys
import time
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List
from utils.logging import log_info, log_error, log_debug


class BTCPLDetectorService:
    """
    Service wrapper for BTC-PL (Pseudo-Label) with normalized interface.
    """
    
    def __init__(self, model_dir: Optional[str] = None):
        """
        Initialize the BTC-PL detector service.
        
        Args:
            model_dir: Path to the ChordMini model directory
        """
        self.model_dir = Path(model_dir) if model_dir else None
        self._available = None
        
    def is_available(self) -> bool:
        """
        Check if BTC-PL is available.
        
        Returns:
            bool: True if the detector can be used
        """
        if self._available is not None:
            return self._available
            
        try:
            if not self.model_dir or not self.model_dir.exists():
                log_error("BTC-PL model directory not found")
                self._available = False
                return False
                
            # Check for BTC-PL specific files
            config_dir = self.model_dir / "config"
            checkpoints_dir = self.model_dir / "checkpoints"
            
            required_paths = [config_dir, checkpoints_dir]
            for path in required_paths:
                if not path.exists():
                    log_error(f"Required BTC-PL path not found: {path}")
                    self._available = False
                    return False
            
            # Check for specific BTC-PL files
            required_files = [
                "config/btc_model_large_voca_pl.yaml",
                "checkpoints/btc_model_large_voca_pl.pt"
            ]
            
            for file in required_files:
                if not (self.model_dir / file).exists():
                    log_debug(f"BTC-PL file not found: {file}")
                    self._available = False
                    return False
            
            # Try to import BTC modules
            try:
                original_dir = os.getcwd()
                sys.path.insert(0, str(self.model_dir))
                os.chdir(str(self.model_dir))
                
                # Test basic imports
                import torch
                from btc.model import BTC
                from btc.utils import load_model
                
                self._available = True
                log_debug("BTC-PL availability: True")
                return True
                
            except ImportError as e:
                log_error(f"BTC-PL import failed: {e}")
                self._available = False
                return False
            finally:
                os.chdir(original_dir)
                
        except Exception as e:
            log_error(f"Error checking BTC-PL availability: {e}")
            self._available = False
            return False
    
    def recognize_chords(self, file_path: str, chord_dict: str = 'large_voca', **kwargs) -> Dict[str, Any]:
        """
        Recognize chords in an audio file using BTC-PL.
        
        Args:
            file_path: Path to the audio file
            chord_dict: Chord dictionary to use (BTC-PL uses 'large_voca')
            **kwargs: Additional parameters
        
        Returns:
            Dict containing normalized chord recognition results
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "BTC-PL is not available",
                "model_used": "btc-pl",
                "model_name": "BTC PL (Pseudo-Label)"
            }
        
        start_time = time.time()
        original_dir = os.getcwd()
        temp_lab_path = None
        
        try:
            log_info(f"Running BTC-PL recognition on: {file_path}")
            
            # Create temporary lab file
            temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
            temp_lab_path = temp_lab_file.name
            temp_lab_file.close()
            
            # Change to model directory and run recognition
            sys.path.insert(0, str(self.model_dir))
            os.chdir(str(self.model_dir))
            
            # Import BTC modules
            import torch
            from btc.model import BTC
            from btc.utils import load_model, audio_file_to_features, predict, decode_chord
            
            # Load model
            config_path = self.model_dir / "config" / "btc_model_large_voca_pl.yaml"
            checkpoint_path = self.model_dir / "checkpoints" / "btc_model_large_voca_pl.pt"
            
            model = load_model(str(config_path), str(checkpoint_path))
            
            # Process audio
            features = audio_file_to_features(file_path)
            
            # Predict chords
            with torch.no_grad():
                predictions = predict(model, features)
            
            # Decode predictions to chord labels
            chord_sequence = decode_chord(predictions)
            
            # Convert to lab format and save
            self._save_chord_sequence_to_lab(chord_sequence, temp_lab_path)
            
            # Parse the lab file
            chord_data = self._parse_lab_file(temp_lab_path)
            
            # Calculate duration (using "end" field to match frontend expectations)
            duration = chord_data[-1]["end"] if chord_data else 0.0
            
            processing_time = time.time() - start_time
            
            log_info(f"BTC-PL recognition successful: {len(chord_data)} chords detected")
            
            return {
                "success": True,
                "chords": chord_data,
                "total_chords": len(chord_data),
                "duration": duration,
                "model_used": "btc-pl",
                "model_name": "BTC PL (Pseudo-Label)",
                "chord_dict": "large_voca",
                "processing_time": processing_time
            }
            
        except Exception as e:
            error_msg = f"BTC-PL recognition error: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "model_used": "btc-pl",
                "model_name": "BTC PL (Pseudo-Label)",
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
            "name": "BTC PL (Pseudo-Label)",
            "description": "Transformer-based model trained with pseudo-labeling, 170 chord vocabulary",
            "supported_chord_dicts": self.get_supported_chord_dicts(),
            "model_dir": str(self.model_dir) if self.model_dir else None,
            "available": self.is_available()
        }
