"""
Lyrics routes for ChordMini Flask application.

This module provides lyrics fetching endpoints from multiple providers
including Genius and LRClib with fallback strategies.
"""

import traceback
from flask import Blueprint, request, jsonify, current_app
from config import get_config
from extensions import limiter
from utils.logging import log_info, log_error, log_debug
from .validators import validate_lyrics_request

# Create blueprint
lyrics_bp = Blueprint('lyrics', __name__)

# Get configuration
config = get_config()


@lyrics_bp.route('/api/genius-lyrics', methods=['POST'])
@limiter.limit(config.get_rate_limit('moderate_processing'))
def get_genius_lyrics():
    """
    Get lyrics from Genius.com API.

    Parameters (JSON):
    - artist: Artist name (optional if search_query provided)
    - title: Song title (optional if search_query provided)
    - search_query: Custom search query (optional if artist and title provided)

    Returns:
    - JSON with lyrics data from Genius
    """
    try:
        # Validate request
        is_valid, error_msg, params = validate_lyrics_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get lyrics service
        lyrics_service = current_app.extensions['services']['lyrics']
        if not lyrics_service:
            return jsonify({
                "error": "Lyrics service is not available"
            }), 503

        log_info(f"Processing Genius lyrics request: artist={params.get('artist')}, "
                f"title={params.get('title')}, search_query={params.get('search_query')}")

        # Call Genius service
        result = lyrics_service.fetch_from_genius(
            artist=params.get('artist'),
            title=params.get('title'),
            search_query=params.get('search_query')
        )

        if result.get('success'):
            log_info(f"Genius lyrics fetch successful: found={result.get('found', False)}")
        else:
            log_error(f"Genius lyrics fetch failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except Exception as e:
        error_msg = f"Error fetching Genius lyrics: {str(e)}"
        log_error(f"{error_msg}\n{traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500


@lyrics_bp.route('/api/lrclib-lyrics', methods=['POST'])
@limiter.limit(config.get_rate_limit('moderate_processing'))
def get_lrclib_lyrics():
    """
    Get lyrics from LRClib.net API.

    Parameters (JSON):
    - artist: Artist name (optional if search_query provided)
    - title: Song title (optional if search_query provided)
    - search_query: Custom search query (optional if artist and title provided)

    Returns:
    - JSON with lyrics data from LRClib
    """
    try:
        # Validate request
        is_valid, error_msg, params = validate_lyrics_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get lyrics service
        lyrics_service = current_app.extensions['services']['lyrics']
        if not lyrics_service:
            return jsonify({
                "error": "Lyrics service is not available"
            }), 503

        log_info(f"Processing LRClib lyrics request: artist={params.get('artist')}, "
                f"title={params.get('title')}, search_query={params.get('search_query')}")

        # Call LRClib service
        result = lyrics_service.fetch_from_lrclib(
            artist=params.get('artist'),
            title=params.get('title'),
            search_query=params.get('search_query')
        )

        if result.get('success'):
            log_info(f"LRClib lyrics fetch successful: found={result.get('found', False)}")
        else:
            log_error(f"LRClib lyrics fetch failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except Exception as e:
        error_msg = f"Error fetching LRClib lyrics: {str(e)}"
        log_error(f"{error_msg}\n{traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500
