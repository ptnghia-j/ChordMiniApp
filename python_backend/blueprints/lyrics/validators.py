"""
Request validation utilities for lyrics endpoints.

This module provides validation functions for lyrics requests
including parameter validation and error handling.
"""

from typing import Tuple, Optional, Dict, Any
from flask import request


def validate_lyrics_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a lyrics request for both Genius and LRClib endpoints.

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

    # Extract parameters
    artist = data.get('artist', '').strip()
    title = data.get('title', '').strip()
    search_query = data.get('search_query', '').strip()

    # Validate that we have either search_query or both artist and title
    if not search_query and (not artist or not title):
        return False, "Either 'search_query' or both 'artist' and 'title' must be provided", {}

    # Validate string lengths
    if search_query and len(search_query) > 500:
        return False, "Search query too long (max 500 characters)", {}
    
    if artist and len(artist) > 200:
        return False, "Artist name too long (max 200 characters)", {}
    
    if title and len(title) > 200:
        return False, "Title too long (max 200 characters)", {}

    params = {
        'artist': artist if artist else None,
        'title': title if title else None,
        'search_query': search_query if search_query else None
    }

    return True, None, params


def validate_genius_api_key(api_key: str) -> Tuple[bool, Optional[str]]:
    """
    Validate Genius API key format.

    Args:
        api_key: Genius API key to validate

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    if not api_key:
        return False, "Genius API key is required"
    
    if not isinstance(api_key, str):
        return False, "Genius API key must be a string"
    
    # Basic format validation - Genius API keys are typically long alphanumeric strings
    if len(api_key) < 20:
        return False, "Genius API key appears to be invalid (too short)"
    
    # Check for common invalid patterns
    if api_key.lower() in ['your_api_key', 'api_key', 'genius_api_key']:
        return False, "Please provide a valid Genius API key"
    
    return True, None


def sanitize_search_params(artist: Optional[str], title: Optional[str], search_query: Optional[str]) -> Dict[str, str]:
    """
    Sanitize and prepare search parameters for API calls.

    Args:
        artist: Artist name
        title: Song title
        search_query: Custom search query

    Returns:
        Dict containing sanitized parameters
    """
    result = {}
    
    if search_query:
        # Clean up search query
        result['search_query'] = search_query.strip()
    else:
        # Clean up artist and title
        if artist:
            result['artist'] = artist.strip()
        if title:
            result['title'] = title.strip()
    
    return result


def validate_provider_name(provider: str) -> bool:
    """
    Validate lyrics provider name.

    Args:
        provider: Provider name to validate

    Returns:
        bool: True if the provider name is valid
    """
    valid_providers = ['genius', 'lrclib']
    return provider.lower() in valid_providers


def get_provider_display_name(provider: str) -> str:
    """
    Get a human-readable display name for a lyrics provider.

    Args:
        provider: Provider name

    Returns:
        str: Display name
    """
    display_names = {
        'genius': 'Genius.com',
        'lrclib': 'LRClib.net'
    }
    return display_names.get(provider.lower(), provider)
