"""
YouTube search blueprint for ChordMini Flask application.

This blueprint provides YouTube search endpoints using Piped API
with fallback strategies.
"""

from .routes import youtube_bp

__all__ = ['youtube_bp']
