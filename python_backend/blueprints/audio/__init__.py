"""
Audio extraction blueprint for ChordMini Flask application.

This blueprint provides audio extraction endpoints from YouTube videos
using QuickTube service with fallback strategies.
"""

from .routes import audio_bp

__all__ = ['audio_bp']
