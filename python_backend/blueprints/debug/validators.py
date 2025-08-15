"""
Request validation utilities for debug endpoints.

This module provides validation functions for debug and testing requests
including parameter validation and error handling.
"""

from typing import Tuple, Optional, Dict, Any
from flask import request
from config import get_config

# Get configuration
config = get_config()


def validate_debug_request() -> Tuple[bool, Optional[str]]:
    """
    Validate that debug endpoints are allowed.

    Returns:
        Tuple containing:
        - bool: Whether debug is allowed
        - Optional[str]: Error message if not allowed
    """
    # Check if we're in production mode
    if config.get('PRODUCTION_MODE', False):
        return False, "Debug endpoints disabled in production"
    
    return True, None


def validate_model_test_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a model testing request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check debug access first
    debug_allowed, debug_error = validate_debug_request()
    if not debug_allowed:
        return False, debug_error, {}

    # For model tests, we don't need specific parameters
    # Just return success with empty params
    return True, None, {}


def validate_environment_debug_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate an environment debug request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check debug access first
    debug_allowed, debug_error = validate_debug_request()
    if not debug_allowed:
        return False, debug_error, {}

    # Environment debug doesn't need specific parameters
    return True, None, {}


def validate_file_debug_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a file debug request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check debug access first
    debug_allowed, debug_error = validate_debug_request()
    if not debug_allowed:
        return False, debug_error, {}

    # File debug doesn't need specific parameters
    return True, None, {}


def validate_btc_debug_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a BTC model debug request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check debug access first
    debug_allowed, debug_error = validate_debug_request()
    if not debug_allowed:
        return False, debug_error, {}

    # BTC debug doesn't need specific parameters
    return True, None, {}


def is_production_mode() -> bool:
    """
    Check if the application is running in production mode.

    Returns:
        bool: True if in production mode
    """
    return config.get('PRODUCTION_MODE', False)


def get_debug_rate_limit() -> str:
    """
    Get the rate limit string for debug endpoints.

    Returns:
        str: Rate limit string
    """
    # Debug endpoints should have more restrictive rate limiting
    return config.get_rate_limit('moderate_processing')  # Use moderate instead of light


def sanitize_debug_output(data: Any, max_items: int = 100) -> Any:
    """
    Sanitize debug output to prevent excessive data exposure.

    Args:
        data: Data to sanitize
        max_items: Maximum number of items in lists/dicts

    Returns:
        Any: Sanitized data
    """
    if isinstance(data, dict):
        if len(data) > max_items:
            # Truncate large dictionaries
            items = list(data.items())[:max_items]
            result = dict(items)
            result['_truncated'] = f"Showing {max_items} of {len(data)} items"
            return result
        else:
            # Recursively sanitize dictionary values
            return {k: sanitize_debug_output(v, max_items) for k, v in data.items()}
    
    elif isinstance(data, list):
        if len(data) > max_items:
            # Truncate large lists
            result = data[:max_items]
            result.append(f"_truncated: Showing {max_items} of {len(data)} items")
            return result
        else:
            # Recursively sanitize list items
            return [sanitize_debug_output(item, max_items) for item in data]
    
    elif isinstance(data, str):
        # Truncate very long strings
        if len(data) > 1000:
            return data[:1000] + "... (truncated)"
        return data
    
    else:
        # Return other types as-is
        return data


def format_debug_response(data: Dict[str, Any], endpoint_name: str) -> Dict[str, Any]:
    """
    Format a debug response with metadata.

    Args:
        data: Debug data
        endpoint_name: Name of the debug endpoint

    Returns:
        Dict[str, Any]: Formatted response
    """
    import time
    
    response = {
        'debug_endpoint': endpoint_name,
        'timestamp': time.time(),
        'production_mode': is_production_mode(),
        'data': sanitize_debug_output(data)
    }
    
    return response
