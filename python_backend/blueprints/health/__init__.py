"""
Health check blueprint for ChordMini Flask application.

This blueprint provides basic health check endpoints for monitoring
and load balancer health checks.
"""

from .routes import health_bp

__all__ = ['health_bp']