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
    """
    Log debug message - only in development mode.

    Args:
        message: Debug message to log
    """
    if not PRODUCTION_MODE:
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