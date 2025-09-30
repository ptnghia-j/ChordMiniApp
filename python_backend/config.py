"""
Configuration classes for the ChordMini Flask application.

This module centralizes all configuration settings including:
- Environment detection (production vs development)
- Feature toggles for ML models
- CORS origins and rate limiting
- File upload limits and timeouts
- External service configurations
"""

import os
from typing import List, Optional


class Config:
    """Base configuration class with common settings."""

    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

    # Production mode detection
    PRODUCTION_MODE = (
        os.environ.get('FLASK_ENV', 'production') == 'production' or
        os.environ.get('PORT') is not None
    )

    # File upload settings
    MAX_CONTENT_LENGTH_MB = int(os.environ.get('FLASK_MAX_CONTENT_LENGTH_MB', 150))
    MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH_MB * 1024 * 1024

    # CORS settings
    CORS_ORIGINS = [
        "http://localhost:3000",  # Development
        "http://127.0.0.1:3000",  # Development
        "http://chordmini-frontend:3000",  # Docker container (internal network)
        "http://0.0.0.0:3000",  # Docker bind address
        "https://*.vercel.app",   # Vercel deployments
        "https://chord-mini-app.vercel.app",  # Specific Vercel deployment
    ]

    # Add custom CORS origins from environment
    custom_origins = os.environ.get('CORS_ORIGINS')
    if custom_origins:
        CORS_ORIGINS.extend(custom_origins.split(','))

    # Rate limiting settings
    REDIS_URL = os.environ.get('REDIS_URL')
    DEFAULT_RATE_LIMITS = ["100 per hour"]

    # Rate limit strings for different endpoint types
    RATE_LIMITS = {
        'health': "30 per minute",
        'docs': "50 per minute",
        'heavy_processing': "2 per minute",  # Beat detection, chord recognition
        'moderate_processing': "10 per minute",  # Lyrics, external APIs
        'light_processing': "20 per minute",  # Model info, availability checks
        'debug': "5 per minute",
        'test': "3 per minute",
    }

    # Feature toggles - defer to runtime availability checks
    USE_BEAT_TRANSFORMER = True
    USE_CHORD_CNN_LSTM = True
    USE_SPLEETER = True
    USE_GENIUS = True
    # DEPLOYMENT UPDATE: Disable BTC models for this deployment
    USE_BTC_SL = False
    USE_BTC_PL = False

    # External service timeouts (seconds)
    EXTERNAL_API_TIMEOUT = 30
    YOUTUBE_API_TIMEOUT = 15
    AUDIO_EXTRACTION_TIMEOUT = 60

    # File size limits for different operations (MB)
    BEAT_TRANSFORMER_SIZE_LIMIT_MB = 100
    DIRECT_UPLOAD_SIZE_LIMIT_MB = 50

    # Audio processing settings
    DEFAULT_AUDIO_SAMPLE_RATE = 44100
    SILENCE_TRIM_TOP_DB = 20

    # Model paths (relative to python_backend/)
    BEAT_TRANSFORMER_DIR = "models/Beat-Transformer"
    CHORD_CNN_LSTM_DIR = "models/Chord-CNN-LSTM"
    CHORDMINI_DIR = "models/ChordMini"
    AUDIO_DIR = "../public/audio"

    # Logging configuration
    LOG_LEVEL = "INFO"
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

    @classmethod
    def get_cors_origins(cls) -> List[str]:
        """Get CORS origins with environment variable support."""
        return cls.CORS_ORIGINS.copy()

    @classmethod
    def get_rate_limit(cls, endpoint_type: str) -> str:
        """Get rate limit string for endpoint type."""
        return cls.RATE_LIMITS.get(endpoint_type, "10 per minute")


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True
    PRODUCTION_MODE = False

    # More lenient rate limits for development
    RATE_LIMITS = {
        'health': "100 per minute",
        'docs': "100 per minute",
        'heavy_processing': "10 per minute",
        'moderate_processing': "30 per minute",
        'light_processing': "50 per minute",
        'debug': "20 per minute",
        'test': "10 per minute",
    }

    # Enable debug endpoints
    ENABLE_DEBUG_ENDPOINTS = True

    # Logging
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False
    PRODUCTION_MODE = True

    # Strict rate limits for production
    RATE_LIMITS = {
        'health': "30 per minute",
        'docs': "50 per minute",
        'heavy_processing': "2 per minute",
        'moderate_processing': "10 per minute",
        'light_processing': "20 per minute",
        'debug': "1 per minute",  # Very restrictive
        'test': "1 per minute",   # Very restrictive
    }

    # Disable debug endpoints in production
    ENABLE_DEBUG_ENDPOINTS = False

    # Production logging
    LOG_LEVEL = "INFO"


class TestingConfig(Config):
    """Testing configuration."""

    TESTING = True
    DEBUG = True
    PRODUCTION_MODE = False

    # Disable rate limiting for tests
    RATE_LIMITS = {
        'health': "1000 per minute",
        'docs': "1000 per minute",
        'heavy_processing': "1000 per minute",
        'moderate_processing': "1000 per minute",
        'light_processing': "1000 per minute",
        'debug': "1000 per minute",
        'test': "1000 per minute",
    }

    # Enable all debug features for testing
    ENABLE_DEBUG_ENDPOINTS = True

    # Smaller file limits for faster tests
    MAX_CONTENT_LENGTH_MB = 10
    MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH_MB * 1024 * 1024
    BEAT_TRANSFORMER_SIZE_LIMIT_MB = 5
    DIRECT_UPLOAD_SIZE_LIMIT_MB = 5

    # Shorter timeouts for tests
    EXTERNAL_API_TIMEOUT = 5
    YOUTUBE_API_TIMEOUT = 3
    AUDIO_EXTRACTION_TIMEOUT = 10


# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(config_name: Optional[str] = None) -> Config:
    """
    Get configuration class based on environment.

    Args:
        config_name: Configuration name ('development', 'production', 'testing')
                    If None, auto-detect from environment variables

    Returns:
        Configuration class instance
    """
    if config_name is None:
        # Auto-detect configuration from environment
        if os.environ.get('FLASK_ENV') == 'production' or os.environ.get('PORT'):
            config_name = 'production'
        elif os.environ.get('TESTING') == '1':
            config_name = 'testing'
        else:
            config_name = 'development'

    return config.get(config_name, DevelopmentConfig)()