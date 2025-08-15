"""
Audio extraction routes for ChordMini Flask application.

This module provides audio extraction endpoints from YouTube videos
using QuickTube service with fallback strategies.
"""

import traceback
from flask import Blueprint, request, jsonify, current_app
from config import get_config
from extensions import limiter
from utils.logging import log_info, log_error, log_debug
from .validators import validate_audio_extraction_request

# Create blueprint
audio_bp = Blueprint('audio', __name__)

# Get configuration
config = get_config()


@audio_bp.route('/api/extract-audio', methods=['POST'])
@limiter.limit(config.get_rate_limit('light_processing'))
def extract_audio():
    """
    Extract audio from YouTube videos using QuickTube service.

    Parameters (JSON):
    - videoId: YouTube video ID (required)
    - getInfoOnly: Return only video info without extraction (optional, default: false)
    - forceRefresh: Force re-extraction even if cached (optional, default: false)
    - streamOnly: Return stream URL only (optional, default: true)

    Returns:
    - JSON with audio extraction results or error message
    """
    try:
        # Validate request
        is_valid, error_msg, params = validate_audio_extraction_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get audio extraction service
        audio_service = current_app.extensions['services']['audio_extraction']
        if not audio_service:
            return jsonify({
                "error": "Audio extraction service is not available"
            }), 503

        log_info(f"Processing audio extraction request: video_id={params['video_id']}, "
                f"get_info_only={params['get_info_only']}, force_refresh={params['force_refresh']}")

        # Handle info-only requests
        if params['get_info_only']:
            result = audio_service.get_video_info(params['video_id'])
        else:
            # Extract audio
            result = audio_service.extract_audio(
                video_id=params['video_id'],
                force_refresh=params['force_refresh'],
                stream_only=params['stream_only']
            )

        if result.get('success'):
            log_info(f"Audio extraction successful: method={result.get('method', 'unknown')}")
        else:
            log_error(f"Audio extraction failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except Exception as e:
        error_msg = f"Error in audio extraction endpoint: {str(e)}"
        log_error(f"{error_msg}\n{traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500
