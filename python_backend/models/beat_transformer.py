"""
Simple Beat Transformer handler for the minimal deployment
"""
import os
import sys
from pathlib import Path

class BeatTransformerHandler:
    def __init__(self):
        """Initialize the Beat Transformer handler"""
        self.detector = None
        self.available = False
        
        try:
            # Import the detector
            from beat_transformer_detector import BeatTransformerDetector
            
            # Check if checkpoint exists
            beat_transformer_dir = Path(__file__).parent / "Beat-Transformer"
            checkpoint_path = beat_transformer_dir / "checkpoint" / "fold_4_trf_param.pt"
            
            if checkpoint_path.exists():
                self.detector = BeatTransformerDetector(str(checkpoint_path))
                self.available = True
                print("Beat Transformer handler initialized successfully")
            else:
                print(f"Beat Transformer checkpoint not found: {checkpoint_path}")
                
        except Exception as e:
            print(f"Failed to initialize Beat Transformer: {e}")
            self.available = False
    
    def is_available(self):
        """Check if the model is available"""
        return self.available
    
    def analyze(self, audio_path):
        """Analyze audio file for beat detection
        
        Args:
            audio_path (str): Path to the audio file
            
        Returns:
            dict: Analysis results with beats, downbeats, BPM, etc.
        """
        if not self.available:
            return {
                "success": False,
                "error": "Beat Transformer model is not available",
                "beats": [],
                "downbeats": [],
                "bpm": 0
            }
        
        try:
            # Use the detector to analyze the audio
            result = self.detector.detect_beats(audio_path)
            return result
            
        except Exception as e:
            print(f"Error analyzing audio with Beat Transformer: {e}")
            return {
                "success": False,
                "error": str(e),
                "beats": [],
                "downbeats": [],
                "bpm": 0
            }
