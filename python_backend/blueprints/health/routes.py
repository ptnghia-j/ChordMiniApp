"""
Health check routes for ChordMini Flask application.

This module provides endpoints for health monitoring and basic API status.
"""

from flask import Blueprint, jsonify
from extensions import limiter
from config import get_config

# Create blueprint
health_bp = Blueprint('health', __name__)

# Get configuration for rate limits
config = get_config()


@health_bp.route('/')
@limiter.limit(config.get_rate_limit('health'))
def index():
    """Root endpoint - basic health check."""
    return jsonify({
        "status": "healthy",
        "message": "Audio analysis API is running"
    })


@health_bp.route('/health')
def health():
    """Simple health check endpoint for Cloud Run and load balancers."""
    return jsonify({"status": "healthy"}), 200