"""
Models package for ChordMiniApp Python backend.

This package contains machine learning models for:
- Beat detection (Beat-Transformer, madmom)
- Chord recognition (Chord-CNN-LSTM, BTC models)
"""

# Make key classes available at package level
try:
    from .beat_transformer import BeatTransformerDetector, BeatTransformerHandler, is_beat_transformer_available
    __all__ = ['BeatTransformerDetector', 'BeatTransformerHandler', 'is_beat_transformer_available']
except ImportError as e:
    print(f"Warning: Could not import beat_transformer classes: {e}")
    __all__ = []
