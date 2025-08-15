"""
YouTube search routes for ChordMini Flask application.

This module provides YouTube search endpoints using Piped API
with fallback strategies.
"""

import traceback
from flask import Blueprint, request, jsonify, current_app
from config import get_config
from extensions import limiter
from utils.logging import log_info, log_error, log_debug
from .validators import validate_youtube_search_request

# Create blueprint
youtube_bp = Blueprint('youtube', __name__)

# Get configuration
config = get_config()


@youtube_bp.route('/api/search-youtube', methods=['POST'])
@limiter.limit(config.get_rate_limit('light_processing'))
def search_youtube():
    """
    Search YouTube videos using Piped API.

    Parameters (JSON):
    - query: Search terms (required)
    - maxResults: Maximum number of results (optional, default: 8, max: 50)

    Returns:
    - JSON with search results or error message
    """
    try:
        # Validate request
        is_valid, error_msg, params = validate_youtube_search_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get YouTube search service
        youtube_service = current_app.extensions['services']['youtube']
        if not youtube_service:
            return jsonify({
                "error": "YouTube search service is not available"
            }), 503

        log_info(f"Processing YouTube search request: query='{params['query']}', "
                f"max_results={params['max_results']}")

        # Perform search
        result = youtube_service.search_videos(
            query=params['query'],
            max_results=params['max_results']
        )

        if result.get('success'):
            log_info(f"YouTube search successful: found {result.get('total_results', 0)} results "
                    f"using {result.get('source', 'unknown')} in {result.get('response_time', 0):.3f}s")
        else:
            log_error(f"YouTube search failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except Exception as e:
        error_msg = f"Error in YouTube search endpoint: {str(e)}"
        log_error(f"{error_msg}\n{traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500
