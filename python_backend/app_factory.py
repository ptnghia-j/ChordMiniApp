"""
Flask application factory for ChordMini.

This module implements the application factory pattern, creating and configuring
Flask applications with proper separation of concerns.
"""

from flask import Flask
from typing import Optional

# Import compatibility patches first
import compat

# Import configuration
from config import get_config

# Import extensions
from extensions import init_extensions

# Import error handlers
from error_handlers import register_error_handlers, register_custom_error_handlers

# Import utilities
from utils.logging import log_info, log_debug, is_debug_enabled


def create_app(config_name: Optional[str] = None) -> Flask:
    """
    Create and configure Flask application using the application factory pattern.

    Args:
        config_name: Configuration name ('development', 'production', 'testing')
                    If None, auto-detect from environment

    Returns:
        Configured Flask application instance
    """
    # Apply compatibility patches before any heavy imports
    compat.apply_all()

    # Create Flask application
    app = Flask(__name__, template_folder='templates')

    # Load configuration
    config = get_config(config_name)
    app.config.from_object(config)

    log_info(f"Creating Flask app with config: {config.__class__.__name__}")

    # Initialize extensions
    init_extensions(app, config)

    # Register error handlers
    register_error_handlers(app)
    register_custom_error_handlers(app)

    # Register blueprints
    register_blueprints(app, config)

    # Initialize service container
    init_services(app, config)

    log_info("Flask application created successfully")

    return app


def register_blueprints(app: Flask, config) -> None:
    """
    Register all blueprints with the Flask application.

    Args:
        app: Flask application instance
        config: Configuration object
    """
    # Import blueprints
    from blueprints.health import health_bp
    from blueprints.docs import docs_bp
    from blueprints.beats import beats_bp
    from blueprints.chords import chords_bp
    from blueprints.lyrics import lyrics_bp
    from blueprints.audio import audio_bp
    from blueprints.youtube import youtube_bp
    from blueprints.debug import debug_bp

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(docs_bp)
    app.register_blueprint(beats_bp)
    app.register_blueprint(chords_bp)
    app.register_blueprint(lyrics_bp)
    app.register_blueprint(audio_bp)
    app.register_blueprint(youtube_bp)

    # Register debug blueprint only in non-production mode
    if not config.PRODUCTION_MODE:
        app.register_blueprint(debug_bp)
        log_info("Debug blueprint registered (non-production mode)")
    else:
        log_info("Debug blueprint skipped (production mode)")

    log_info("Blueprints registered successfully")


def init_services(app: Flask, config) -> None:
    """
    Initialize service container with dependency injection.

    Args:
        app: Flask application instance
        config: Configuration object
    """
    # Setup model paths for imports
    from utils.paths import setup_model_paths
    setup_model_paths()

    # Create a simple service container
    services = {}

    # Initialize beat detection service
    try:
        from services.audio.beat_detection_service import BeatDetectionService
        services['beat_detection'] = BeatDetectionService()
        log_info("Beat detection service initialized")
    except Exception as e:
        log_info(f"Failed to initialize beat detection service: {e}")
        # Create a dummy service that returns errors
        services['beat_detection'] = None

    # Initialize chord recognition service
    try:
        from services.audio.chord_recognition_service import ChordRecognitionService
        services['chord_recognition'] = ChordRecognitionService()
        log_info("Chord recognition service initialized")
    except Exception as e:
        log_info(f"Failed to initialize chord recognition service: {e}")
        # Create a dummy service that returns errors
        services['chord_recognition'] = None

    # Initialize lyrics service
    try:
        from services.lyrics.orchestrator import LyricsOrchestrator
        services['lyrics'] = LyricsOrchestrator(config)
        log_info("Lyrics service initialized")
    except Exception as e:
        log_info(f"Failed to initialize lyrics service: {e}")
        # Create a dummy service that returns errors
        services['lyrics'] = None

    # Initialize audio extraction service
    try:
        from services.extraction.audio_extraction_service import AudioExtractionService
        services['audio_extraction'] = AudioExtractionService(config)
        log_info("Audio extraction service initialized")
    except Exception as e:
        log_info(f"Failed to initialize audio extraction service: {e}")
        services['audio_extraction'] = None

    # Initialize YouTube search service
    try:
        from services.youtube.youtube_search_service import YouTubeSearchService
        services['youtube'] = YouTubeSearchService(config)
        log_info("YouTube search service initialized")
    except Exception as e:
        log_info(f"Failed to initialize YouTube search service: {e}")
        services['youtube'] = None

    # Store services in app extensions
    app.extensions['services'] = services

    log_info("Service container initialized")