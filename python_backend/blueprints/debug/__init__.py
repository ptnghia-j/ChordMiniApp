"""
Debug and testing blueprint for ChordMini Flask application.

This blueprint provides debug and testing endpoints for troubleshooting
model availability, environment issues, and system diagnostics.
"""

from .routes import debug_bp

__all__ = ['debug_bp']
