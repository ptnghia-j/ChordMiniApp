"""
Centralized error handling for the ChordMini Flask application.

This module provides consistent JSON error responses for common HTTP errors
and application-specific exceptions.
"""

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException
import traceback


def register_error_handlers(app: Flask) -> None:
    """
    Register error handlers for the Flask application.

    Args:
        app: Flask application instance
    """

    @app.errorhandler(400)
    def bad_request(error):
        """Handle 400 Bad Request errors."""
        return jsonify({
            "error": "Bad Request",
            "message": "The request could not be understood by the server due to malformed syntax.",
            "status_code": 400
        }), 400

    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 Not Found errors."""
        return jsonify({
            "error": "Not Found",
            "message": f"The requested URL {request.url} was not found on the server.",
            "status_code": 404
        }), 404

    @app.errorhandler(413)
    def request_entity_too_large(error):
        """Handle 413 Request Entity Too Large errors."""
        return jsonify({
            "error": "Request Entity Too Large",
            "message": "The uploaded file is too large. Please use a smaller file.",
            "status_code": 413
        }), 413

    @app.errorhandler(429)
    def ratelimit_handler(error):
        """Handle 429 Rate Limit Exceeded errors."""
        return jsonify({
            "error": "Rate limit exceeded",
            "message": "Too many requests. Please wait before trying again.",
            "retry_after": getattr(error, 'retry_after', None),
            "status_code": 429
        }), 429

    @app.errorhandler(500)
    def internal_server_error(error):
        """Handle 500 Internal Server Error."""
        # Log the full traceback for debugging
        app.logger.error(f"Internal server error: {error}")
        app.logger.error(traceback.format_exc())

        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred. Please try again later.",
            "status_code": 500
        }), 500

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle generic HTTP exceptions."""
        return jsonify({
            "error": error.name,
            "message": error.description,
            "status_code": error.code
        }), error.code

    @app.errorhandler(Exception)
    def handle_generic_exception(error):
        """Handle unexpected exceptions."""
        # Log the full traceback for debugging
        app.logger.error(f"Unexpected error: {error}")
        app.logger.error(traceback.format_exc())

        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred. Please try again later.",
            "status_code": 500
        }), 500

    app.logger.info("Error handlers registered successfully")


# Custom exception classes for application-specific errors
class ChordMiniException(Exception):
    """Base exception class for ChordMini application."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ModelUnavailableError(ChordMiniException):
    """Raised when a required ML model is not available."""

    def __init__(self, model_name: str):
        message = f"Model '{model_name}' is not available. Please check server configuration."
        super().__init__(message, status_code=503)


class FileTooLargeError(ChordMiniException):
    """Raised when uploaded file exceeds size limits."""

    def __init__(self, file_size_mb: float, limit_mb: float):
        message = f"File size ({file_size_mb:.1f}MB) exceeds limit ({limit_mb}MB)."
        super().__init__(message, status_code=413)


class AudioProcessingError(ChordMiniException):
    """Raised when audio processing fails."""

    def __init__(self, operation: str, details: str = None):
        message = f"Audio processing failed during {operation}"
        if details:
            message += f": {details}"
        super().__init__(message, status_code=500)


class ExternalServiceError(ChordMiniException):
    """Raised when external service calls fail."""

    def __init__(self, service_name: str, details: str = None):
        message = f"External service '{service_name}' is unavailable"
        if details:
            message += f": {details}"
        super().__init__(message, status_code=503)


def register_custom_error_handlers(app: Flask) -> None:
    """
    Register handlers for custom application exceptions.

    Args:
        app: Flask application instance
    """

    @app.errorhandler(ChordMiniException)
    def handle_chordmini_exception(error):
        """Handle custom ChordMini exceptions."""
        app.logger.error(f"ChordMini error: {error.message}")

        return jsonify({
            "error": error.__class__.__name__,
            "message": error.message,
            "status_code": error.status_code
        }), error.status_code

    app.logger.info("Custom error handlers registered successfully")