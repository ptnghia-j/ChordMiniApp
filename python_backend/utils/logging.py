"""
Centralized logging utilities for the ChordMini Flask application.

This module provides consistent logging functions that adapt to production
vs development environments.
"""

import logging
import os


# Production mode detection
PRODUCTION_MODE = (
    os.environ.get('FLASK_ENV', 'production') == 'production' or
    os.environ.get('PORT') is not None
)
# Unified debug switch across backend
DEBUG_ENABLED = (
    os.environ.get('FLASK_ENV') == 'development' or
    str(os.environ.get('DEBUG', 'false')).lower() == 'true'
)

def is_debug_enabled() -> bool:
    """Return True when debug logging should be enabled regardless of PROD/DEV."""
    return DEBUG_ENABLED


# Get logger for this module
logger = logging.getLogger(__name__)


def log_info(message: str) -> None:
    """
    Log info message - use logger in production, print in development.

    Args:
        message: Message to log
    """
    if PRODUCTION_MODE:
        logger.info(message)
    else:
        print(message)


def log_error(message: str) -> None:
    """
    Log error message - use logger in production, print in development.

    Args:
        message: Error message to log
    """
    if PRODUCTION_MODE:
        logger.error(message)
    else:
        print(message)


def log_debug(message: str) -> None:
    """Log debug messages when debug is enabled. No-op otherwise."""
    if not DEBUG_ENABLED:
        return
    if PRODUCTION_MODE:
        logger.debug(message)
    else:
        print(f"DEBUG: {message}")


def log_warning(message: str) -> None:
    """
    Log warning message - use logger in production, print in development.

    Args:
        message: Warning message to log
    """
    if PRODUCTION_MODE:
        logger.warning(message)
    else:
        print(f"WARNING: {message}")


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a specific module.

    Args:
        name: Logger name (usually __name__)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)