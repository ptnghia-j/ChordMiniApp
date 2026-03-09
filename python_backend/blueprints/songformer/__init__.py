"""SongFormer blueprint.

Provides lightweight endpoints for audio-backed song-form inference.
"""

from .routes import songformer_bp

__all__ = ['songformer_bp']