"""
Chord recognition blueprint for ChordMini Flask application.

This blueprint provides chord recognition endpoints including model testing
and information endpoints.
"""

from .routes import chords_bp

__all__ = ['chords_bp']