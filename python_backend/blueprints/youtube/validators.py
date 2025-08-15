"""
Request validation utilities for YouTube search endpoints.

This module provides validation functions for YouTube search requests
including parameter validation and error handling.
"""

import re
from typing import Tuple, Optional, Dict, Any
from flask import request


def validate_youtube_search_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a YouTube search request.

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

    # Extract and validate query
    query = data.get('query')
    if not query:
        return False, "Missing or invalid search query parameter", {}

    if not isinstance(query, str) or not query.strip():
        return False, "Missing or invalid search query parameter", {}

    # Sanitize query to prevent command injection
    sanitized_query = re.sub(r'[;&|`$()<>"]', '', query.strip())
    if not sanitized_query:
        return False, "Invalid search query after sanitization", {}

    # Validate query length
    if len(sanitized_query) > 500:
        return False, "Search query too long (max 500 characters)", {}

    # Extract and validate maxResults
    max_results = data.get('maxResults', 8)
    if not isinstance(max_results, int):
        return False, "maxResults parameter must be an integer", {}

    if max_results < 1:
        return False, "maxResults must be at least 1", {}

    if max_results > 50:
        return False, "maxResults cannot exceed 50", {}

    params = {
        'query': sanitized_query,
        'max_results': max_results
    }

    return True, None, params


def validate_search_query(query: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a search query string.

    Args:
        query: Search query to validate

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    if not query:
        return False, "Search query is required"

    if not isinstance(query, str):
        return False, "Search query must be a string"

    if not query.strip():
        return False, "Search query cannot be empty"

    if len(query.strip()) > 500:
        return False, "Search query too long (max 500 characters)"

    # Check for potentially dangerous characters
    dangerous_chars = ['&', ';', '|', '`', '$', '(', ')', '<', '>', '"']
    if any(char in query for char in dangerous_chars):
        return False, "Search query contains invalid characters"

    return True, None


def sanitize_search_query(query: str) -> str:
    """
    Sanitize a search query by removing dangerous characters.

    Args:
        query: Raw search query

    Returns:
        str: Sanitized search query
    """
    if not query:
        return ""

    # Remove dangerous characters that could be used for injection
    sanitized = re.sub(r'[;&|`$()<>"]', '', query.strip())
    
    # Limit length
    if len(sanitized) > 500:
        sanitized = sanitized[:500]
    
    return sanitized


def validate_max_results(max_results: Any) -> Tuple[bool, Optional[str], int]:
    """
    Validate maxResults parameter.

    Args:
        max_results: Max results value to validate

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - int: Validated max results value
    """
    if max_results is None:
        return True, None, 8  # Default value

    if not isinstance(max_results, (int, float)):
        return False, "maxResults must be a number", 8

    max_results_int = int(max_results)

    if max_results_int < 1:
        return False, "maxResults must be at least 1", 8

    if max_results_int > 50:
        return False, "maxResults cannot exceed 50", 8

    return True, None, max_results_int


def get_search_source_display_name(source: str) -> str:
    """
    Get a human-readable display name for a search source.

    Args:
        source: Search source name

    Returns:
        str: Display name
    """
    display_names = {
        'piped_api': 'Piped API',
        'youtube_api': 'YouTube Data API',
        'fallback': 'Fallback Method'
    }
    return display_names.get(source.lower(), source)
