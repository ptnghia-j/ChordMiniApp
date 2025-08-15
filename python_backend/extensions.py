"""
Flask extensions initialization.

This module centralizes the initialization of Flask extensions:
- CORS (Cross-Origin Resource Sharing)
- Rate limiting (Flask-Limiter)
- Logging configuration
"""

import logging
from flask import Flask
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


# Initialize extensions (will be configured in app factory)
cors = CORS()
limiter = Limiter(key_func=get_remote_address)


def init_cors(app: Flask, config) -> None:
    """
    Initialize CORS with configuration.

    Args:
        app: Flask application instance
        config: Configuration object with CORS settings
    """
    cors_origins = config.get_cors_origins()

    cors.init_app(
        app,
        origins=cors_origins,
        supports_credentials=True
    )

    app.logger.info(f"CORS configured with origins: {cors_origins}")


def init_limiter(app: Flask, config) -> None:
    """
    Initialize rate limiter with configuration.

    Args:
        app: Flask application instance
        config: Configuration object with rate limiting settings
    """
    # Configure rate limiting storage
    if config.REDIS_URL:
        limiter.init_app(
            app,
            storage_uri=config.REDIS_URL
        )
        app.logger.info(f"Rate limiting configured with Redis: {config.REDIS_URL}")
    else:
        limiter.init_app(app)
        app.logger.info("Rate limiting configured with in-memory storage")


def init_logging(app: Flask, config) -> None:
    """
    Initialize logging configuration.

    Args:
        app: Flask application instance
        config: Configuration object with logging settings
    """
    # Configure logging level and format
    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL),
        format=config.LOG_FORMAT
    )

    # Set Flask app logger level
    app.logger.setLevel(getattr(logging, config.LOG_LEVEL))

    app.logger.info(f"Logging configured with level: {config.LOG_LEVEL}")


def init_extensions(app: Flask, config) -> None:
    """
    Initialize all Flask extensions.

    Args:
        app: Flask application instance
        config: Configuration object
    """
    init_logging(app, config)
    init_cors(app, config)
    init_limiter(app, config)

    app.logger.info("All extensions initialized successfully")