"""
Spleeter audio separation service.

This module provides audio separation functionality using Spleeter
with GPU acceleration support and proper resource management.
"""

import os
import tempfile
import time
from pathlib import Path
from typing import Dict, Any, Optional, List
from utils.logging import log_info, log_error, log_debug
from services.audio.tempfiles import temporary_directory


class SpleeterService:
    """
    Service for audio source separation using Spleeter.
    """
    
    def __init__(self):
        """Initialize the Spleeter service."""
        self._available = None
        self._separator = None
        
    def is_available(self) -> bool:
        """
        Check if Spleeter is available.
        
        Returns:
            bool: True if Spleeter can be used
        """
        if self._available is not None:
            return self._available
            
        try:
            import spleeter
            from spleeter.separator import Separator
            self._available = True
            log_debug(f"Spleeter availability: True, version: {getattr(spleeter, '__version__', 'unknown')}")
            return True
        except ImportError as e:
            log_error(f"Spleeter import failed: {e}")
            self._available = False
            return False
    
    def get_separator(self, model_name: str = '2stems-16kHz') -> Any:
        """
        Get or create a Spleeter separator instance.
        
        Args:
            model_name: Spleeter model to use ('2stems-16kHz', '4stems-16kHz', '5stems-16kHz')
            
        Returns:
            Spleeter Separator instance
        """
        if not self.is_available():
            raise RuntimeError("Spleeter is not available")
            
        # Create new separator for each request to avoid memory issues
        try:
            from spleeter.separator import Separator
            separator = Separator(f'spleeter:{model_name}')
            log_debug(f"Created Spleeter separator with model: {model_name}")
            return separator
        except Exception as e:
            log_error(f"Failed to create Spleeter separator: {e}")
            raise
    
    def separate_audio(self, audio_path: str, model_name: str = '2stems-16kHz', 
                      output_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Separate audio into stems using Spleeter.
        
        Args:
            audio_path: Path to the input audio file
            model_name: Spleeter model to use
            output_dir: Output directory (if None, uses temporary directory)
            
        Returns:
            Dict containing separation results:
            {
                "success": bool,
                "stems": Dict[str, str],     # stem_name -> file_path
                "output_dir": str,
                "model_used": str,
                "processing_time": float,
                "error": str (if success=False)
            }
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Spleeter is not available",
                "model_used": model_name
            }
        
        start_time = time.time()
        temp_dir_created = False
        
        try:
            log_info(f"Running Spleeter separation on: {audio_path} with model: {model_name}")
            
            # Create output directory if not provided
            if output_dir is None:
                output_dir = tempfile.mkdtemp(prefix='spleeter_')
                temp_dir_created = True
                log_debug(f"Created temporary output directory: {output_dir}")
            
            # Get separator
            separator = self.get_separator(model_name)
            
            # Perform separation
            import librosa
            
            # Load audio
            waveform, sample_rate = librosa.load(audio_path, sr=None, mono=False)
            
            # Ensure stereo format for Spleeter
            if waveform.ndim == 1:
                waveform = waveform[None, :]  # Add channel dimension
            if waveform.shape[0] == 1:
                waveform = waveform.repeat(2, axis=0)  # Duplicate mono to stereo
            
            # Transpose to (time, channels) format expected by Spleeter
            waveform = waveform.T
            
            # Separate audio
            prediction = separator.separate(waveform)
            
            # Save separated stems
            stems = {}
            audio_name = Path(audio_path).stem
            
            for stem_name, stem_audio in prediction.items():
                stem_filename = f"{audio_name}_{stem_name}.wav"
                stem_path = os.path.join(output_dir, stem_filename)
                
                # Save stem audio
                import soundfile as sf
                sf.write(stem_path, stem_audio, sample_rate)
                
                stems[stem_name] = stem_path
                log_debug(f"Saved stem '{stem_name}' to: {stem_path}")
            
            processing_time = time.time() - start_time
            
            log_info(f"Spleeter separation successful: {len(stems)} stems created in {processing_time:.2f}s")
            
            return {
                "success": True,
                "stems": stems,
                "output_dir": output_dir,
                "model_used": model_name,
                "processing_time": processing_time,
                "temp_dir_created": temp_dir_created
            }
            
        except Exception as e:
            error_msg = f"Spleeter separation error: {str(e)}"
            log_error(error_msg)
            
            # Cleanup temporary directory on error
            if temp_dir_created and output_dir:
                try:
                    import shutil
                    shutil.rmtree(output_dir)
                    log_debug(f"Cleaned up temporary directory after error: {output_dir}")
                except Exception as cleanup_error:
                    log_error(f"Failed to cleanup temporary directory: {cleanup_error}")
            
            return {
                "success": False,
                "error": error_msg,
                "model_used": model_name,
                "processing_time": time.time() - start_time
            }
    
    def extract_vocals(self, audio_path: str, output_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract vocals from audio using 2-stem separation.
        
        Args:
            audio_path: Path to the input audio file
            output_dir: Output directory (if None, uses temporary directory)
            
        Returns:
            Dict containing extraction results with vocals and accompaniment paths
        """
        result = self.separate_audio(audio_path, '2stems-16kHz', output_dir)
        
        if result.get("success"):
            stems = result.get("stems", {})
            result["vocals_path"] = stems.get("vocals")
            result["accompaniment_path"] = stems.get("accompaniment")
        
        return result
    
    def extract_instruments(self, audio_path: str, output_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract individual instruments using 4-stem separation.
        
        Args:
            audio_path: Path to the input audio file
            output_dir: Output directory (if None, uses temporary directory)
            
        Returns:
            Dict containing extraction results with individual instrument paths
        """
        result = self.separate_audio(audio_path, '4stems-16kHz', output_dir)
        
        if result.get("success"):
            stems = result.get("stems", {})
            result["vocals_path"] = stems.get("vocals")
            result["drums_path"] = stems.get("drums")
            result["bass_path"] = stems.get("bass")
            result["other_path"] = stems.get("other")
        
        return result
    
    def cleanup_stems(self, stems_info: Dict[str, Any]) -> bool:
        """
        Clean up separated stem files.
        
        Args:
            stems_info: Result from separate_audio containing stem paths
            
        Returns:
            bool: True if cleanup was successful
        """
        try:
            if stems_info.get("temp_dir_created") and stems_info.get("output_dir"):
                import shutil
                shutil.rmtree(stems_info["output_dir"])
                log_debug(f"Cleaned up Spleeter output directory: {stems_info['output_dir']}")
                return True
            elif stems_info.get("stems"):
                # Clean up individual stem files
                for stem_path in stems_info["stems"].values():
                    if os.path.exists(stem_path):
                        os.unlink(stem_path)
                        log_debug(f"Cleaned up stem file: {stem_path}")
                return True
            return True
        except Exception as e:
            log_error(f"Failed to cleanup Spleeter stems: {e}")
            return False
    
    def get_available_models(self) -> List[str]:
        """
        Get list of available Spleeter models.
        
        Returns:
            List of available model names
        """
        if not self.is_available():
            return []
        
        return ['2stems-16kHz', '4stems-16kHz', '5stems-16kHz']
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about Spleeter models.
        
        Returns:
            Dict containing model information
        """
        return {
            "available": self.is_available(),
            "models": {
                "2stems-16kHz": {
                    "description": "Separates vocals and accompaniment",
                    "stems": ["vocals", "accompaniment"]
                },
                "4stems-16kHz": {
                    "description": "Separates vocals, drums, bass, and other",
                    "stems": ["vocals", "drums", "bass", "other"]
                },
                "5stems-16kHz": {
                    "description": "Separates vocals, drums, bass, piano, and other",
                    "stems": ["vocals", "drums", "bass", "piano", "other"]
                }
            }
        }
