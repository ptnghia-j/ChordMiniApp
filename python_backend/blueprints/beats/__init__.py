"""
Beat detection blueprint for ChordMini Flask application.

This blueprint provides beat detection endpoints including model testing
and information endpoints.
"""

from .routes import beats_bp

__all__ = ['beats_bp']