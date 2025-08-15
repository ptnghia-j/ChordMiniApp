"""
Lyrics blueprint for ChordMini Flask application.

This blueprint provides lyrics fetching endpoints from multiple providers
including Genius and LRClib with fallback strategies.
"""

from .routes import lyrics_bp

__all__ = ['lyrics_bp']
