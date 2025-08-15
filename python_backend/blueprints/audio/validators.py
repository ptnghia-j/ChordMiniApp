"""
Request validation utilities for audio extraction endpoints.

This module provides validation functions for audio extraction requests
including parameter validation and error handling.
"""

import re
from typing import Tuple, Optional, Dict, Any
from flask import request


def validate_audio_extraction_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate an audio extraction request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check if request has JSON data
    if not request.is_json:
        return False, "Request must be JSON", {}

    try:
        data = request.get_json()
        if not data:
            return False, "Request body is required", {}
    except Exception:
        return False, "Invalid JSON in request body", {}

    # Extract and validate videoId
    video_id = data.get('videoId')
    if not video_id:
        return False, "Missing videoId parameter", {}

    if not isinstance(video_id, str):
        return False, "Invalid videoId parameter", {}

    # Sanitize video ID (YouTube video IDs are 11 characters, alphanumeric with - and _)
    sanitized_video_id = re.sub(r'[^a-zA-Z0-9_-]', '', video_id)
    if not sanitized_video_id:
        return False, "Invalid videoId after sanitization", {}

    if len(sanitized_video_id) != 11:
        return False, "Invalid videoId length (must be 11 characters)", {}

    # Extract optional parameters
    get_info_only = data.get('getInfoOnly', False)
    force_refresh = data.get('forceRefresh', False)
    stream_only = data.get('streamOnly', True)

    # Validate boolean parameters
    if not isinstance(get_info_only, bool):
        return False, "getInfoOnly parameter must be boolean", {}

    if not isinstance(force_refresh, bool):
        return False, "forceRefresh parameter must be boolean", {}

    if not isinstance(stream_only, bool):
        return False, "streamOnly parameter must be boolean", {}

    params = {
        'video_id': sanitized_video_id,
        'get_info_only': get_info_only,
        'force_refresh': force_refresh,
        'stream_only': stream_only
    }

    return True, None, params


def validate_video_id(video_id: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a YouTube video ID format.

    Args:
        video_id: Video ID to validate

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    if not video_id:
        return False, "Video ID is required"

    if not isinstance(video_id, str):
        return False, "Video ID must be a string"

    # YouTube video IDs are exactly 11 characters
    if len(video_id) != 11:
        return False, "Video ID must be exactly 11 characters"

    # Check for valid characters (alphanumeric, dash, underscore)
    if not re.match(r'^[a-zA-Z0-9_-]+$', video_id):
        return False, "Video ID contains invalid characters"

    return True, None


def sanitize_video_id(video_id: str) -> str:
    """
    Sanitize a video ID by removing invalid characters.

    Args:
        video_id: Raw video ID

    Returns:
        str: Sanitized video ID
    """
    if not video_id:
        return ""

    # Remove any characters that aren't alphanumeric, dash, or underscore
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '', video_id)
    
    # Ensure it's exactly 11 characters
    if len(sanitized) == 11:
        return sanitized
    
    return ""


def validate_timeout_parameter(timeout: Any) -> Tuple[bool, Optional[str], int]:
    """
    Validate timeout parameter.

    Args:
        timeout: Timeout value to validate

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - int: Validated timeout value
    """
    if timeout is None:
        return True, None, 60  # Default timeout

    if not isinstance(timeout, (int, float)):
        return False, "Timeout must be a number", 60

    timeout_int = int(timeout)

    if timeout_int < 10:
        return False, "Timeout must be at least 10 seconds", 60

    if timeout_int > 300:
        return False, "Timeout cannot exceed 300 seconds (5 minutes)", 60

    return True, None, timeout_int


def get_extraction_display_name(method: str) -> str:
    """
    Get a human-readable display name for an extraction method.

    Args:
        method: Extraction method name

    Returns:
        str: Display name
    """
    display_names = {
        'quicktube': 'QuickTube',
        'yt-dlp': 'yt-dlp',
        'fallback': 'Fallback Method'
    }
    return display_names.get(method.lower(), method)
