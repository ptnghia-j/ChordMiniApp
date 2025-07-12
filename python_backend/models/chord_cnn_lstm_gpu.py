"""
GPU-Accelerated Chord-CNN-LSTM Model Wrapper

Provides GPU acceleration for the Chord-CNN-LSTM model while maintaining
compatibility with the existing implementation.
"""

import os
import sys
import numpy as np
import torch
import tempfile
import traceback
from pathlib import Path

# Add the Chord-CNN-LSTM directory to path
CHORD_CNN_LSTM_DIR = Path(__file__).parent / "Chord-CNN-LSTM"
sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))

# Import GPU acceleration utilities
try:
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from gpu_acceleration import get_gpu_manager, get_device, log_device_status
    GPU_ACCELERATION_AVAILABLE = True
except ImportError as e:
    print(f"Warning: GPU acceleration not available for Chord-CNN-LSTM: {e}")
    GPU_ACCELERATION_AVAILABLE = False

class GPUAcceleratedChordCNNLSTM:
    """
    GPU-accelerated wrapper for Chord-CNN-LSTM model
    """
    
    def __init__(self):
        """Initialize the GPU-accelerated Chord-CNN-LSTM model"""
        self.gpu_manager = None
        self.device = None
        self.device_info = {}
        
        # Initialize GPU acceleration
        if GPU_ACCELERATION_AVAILABLE:
            try:
                self.gpu_manager = get_gpu_manager()
                self.device = self.gpu_manager.device
                self.device_info = self.gpu_manager.device_info
                print(f"🚀 Chord-CNN-LSTM using device: {self.device} ({self.device_info['name']})")
            except Exception as e:
                print(f"⚠️  GPU acceleration failed for Chord-CNN-LSTM: {e}")
                self.device = torch.device("cpu")
                self.device_info = {"type": "cpu", "name": "CPU Fallback"}
        else:
            self.device = torch.device("cpu")
            self.device_info = {"type": "cpu", "name": "CPU"}
            
        print(f"📱 Chord-CNN-LSTM initialized on {self.device_info['name']}")
    
    def recognize_chords(self, audio_path, chord_dict_name='submission'):
        """
        Recognize chords in audio file with GPU acceleration
        
        Args:
            audio_path (str): Path to audio file
            chord_dict_name (str): Chord dictionary to use
            
        Returns:
            dict: Chord recognition results with device information
        """
        try:
            # Import the original chord recognition function
            from chord_recognition_fixed import chord_recognition
            
            # Create temporary file for output
            with tempfile.NamedTemporaryFile(mode='w', suffix='.lab', delete=False) as temp_file:
                temp_lab_path = temp_file.name
            
            try:
                # Log inference start
                device_name = self.device_info['name']
                print(f"🔄 Running Chord-CNN-LSTM inference on {device_name}")
                
                # Clear GPU cache before inference if available
                if self.gpu_manager and self.gpu_manager.is_cuda:
                    self.gpu_manager.clear_cache()
                
                # Run chord recognition
                chord_recognition(audio_path, temp_lab_path, chord_dict_name)
                
                # Read results
                chords = self._parse_chord_lab_file(temp_lab_path)
                
                # Clear GPU cache after inference
                if self.gpu_manager and self.gpu_manager.is_cuda:
                    self.gpu_manager.clear_cache()
                
                # Prepare device info for response
                device_info = {
                    "device_type": self.device_info['type'],
                    "device_name": self.device_info['name'],
                    "gpu_accelerated": self.gpu_manager.is_gpu_accelerated if self.gpu_manager else False
                }
                
                if self.gpu_manager and self.gpu_manager.is_cuda:
                    memory_info = self.gpu_manager.get_memory_info()
                    device_info["gpu_memory_used_gb"] = round(memory_info['allocated_gb'], 2)
                
                print(f"✅ Chord-CNN-LSTM inference completed on {device_name}")
                
                return {
                    "success": True,
                    "chords": chords,
                    "total_chords": len(chords),
                    "model_used": "chord-cnn-lstm",
                    "chord_dict": chord_dict_name,
                    "device_info": device_info
                }
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_lab_path)
                except:
                    pass
                    
        except Exception as e:
            print(f"❌ Chord-CNN-LSTM inference failed: {e}")
            traceback.print_exc()
            
            return {
                "success": False,
                "error": str(e),
                "chords": [],
                "total_chords": 0,
                "model_used": "chord-cnn-lstm",
                "chord_dict": chord_dict_name,
                "device_info": self.device_info
            }
    
    def _parse_chord_lab_file(self, lab_path):
        """
        Parse chord lab file and return structured chord data
        
        Args:
            lab_path (str): Path to .lab file
            
        Returns:
            list: List of chord segments with timing and labels
        """
        chords = []
        
        try:
            with open(lab_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        parts = line.split('\t')
                        if len(parts) >= 3:
                            start_time = float(parts[0])
                            end_time = float(parts[1])
                            chord_label = parts[2]
                            
                            chords.append({
                                "start": start_time,
                                "end": end_time,
                                "chord": chord_label,
                                "duration": end_time - start_time
                            })
        except Exception as e:
            print(f"Warning: Failed to parse chord lab file {lab_path}: {e}")
            
        return chords
    
    def get_device_info(self):
        """Get current device information"""
        return self.device_info.copy()
    
    def is_gpu_accelerated(self):
        """Check if GPU acceleration is active"""
        return self.gpu_manager.is_gpu_accelerated if self.gpu_manager else False


# Global instance for reuse
_chord_cnn_lstm_instance = None

def get_chord_cnn_lstm_model():
    """Get the global GPU-accelerated Chord-CNN-LSTM instance"""
    global _chord_cnn_lstm_instance
    if _chord_cnn_lstm_instance is None:
        _chord_cnn_lstm_instance = GPUAcceleratedChordCNNLSTM()
    return _chord_cnn_lstm_instance

def recognize_chords_gpu(audio_path, chord_dict_name='submission'):
    """
    Convenience function for GPU-accelerated chord recognition
    
    Args:
        audio_path (str): Path to audio file
        chord_dict_name (str): Chord dictionary to use
        
    Returns:
        dict: Chord recognition results
    """
    model = get_chord_cnn_lstm_model()
    return model.recognize_chords(audio_path, chord_dict_name)

if __name__ == "__main__":
    # Test the GPU-accelerated model
    if len(sys.argv) >= 2:
        audio_path = sys.argv[1]
        chord_dict = sys.argv[2] if len(sys.argv) > 2 else 'submission'
        
        print("Testing GPU-accelerated Chord-CNN-LSTM...")
        result = recognize_chords_gpu(audio_path, chord_dict)
        
        if result["success"]:
            print(f"✅ Success! Found {result['total_chords']} chord segments")
            print(f"Device: {result['device_info']['device_name']}")
        else:
            print(f"❌ Failed: {result['error']}")
    else:
        print("Usage: python chord_cnn_lstm_gpu.py <audio_file> [chord_dict]")
