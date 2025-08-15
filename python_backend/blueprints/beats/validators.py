"""
Request validation utilities for beat detection endpoints.

This module provides validation functions for beat detection requests
including file validation, parameter validation, and error handling.
"""

from typing import Tuple, Optional, Dict, Any
from flask import request
from werkzeug.datastructures import FileStorage


def validate_beat_detection_request() -> Tuple[bool, Optional[str], Optional[FileStorage], Dict[str, Any]]:
    """
    Validate a beat detection request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Optional[FileStorage]: Uploaded file if present
        - Dict[str, Any]: Validated parameters
    """
    # Check if we have either a file upload or audio_path
    file = request.files.get('file')
    audio_path = request.form.get('audio_path')

    if not file and not audio_path:
        return False, "No audio file provided. Please upload a file or provide audio_path.", None, {}

    # Validate detector parameter
    detector = request.form.get('detector', 'auto').lower()
    valid_detectors = ['beat-transformer', 'madmom', 'librosa', 'auto']
    if detector not in valid_detectors:
        return False, f"Invalid detector '{detector}'. Must be one of: {', '.join(valid_detectors)}", file, {}

    # Validate force parameter
    force_param = request.args.get('force', request.form.get('force', '')).lower()
    force = force_param == 'true'

    # Validate file if provided
    if file and file.filename == '':
        return False, "No file selected", None, {}

    params = {
        'detector': detector,
        'force': force,
        'audio_path': audio_path
    }

    return True, None, file, params


def validate_firebase_beat_detection_request() -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate a Firebase beat detection request.

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
        - Dict[str, Any]: Validated parameters
    """
    # Check for Firebase URL
    firebase_url = request.form.get('firebase_url')
    if not firebase_url:
        return False, "No Firebase URL provided", {}

    # Validate detector parameter
    detector = request.form.get('detector', 'auto').lower()
    valid_detectors = ['beat-transformer', 'madmom', 'librosa', 'auto']
    if detector not in valid_detectors:
        return False, f"Invalid detector '{detector}'. Must be one of: {', '.join(valid_detectors)}", {}

    params = {
        'firebase_url': firebase_url,
        'detector': detector
    }

    return True, None, params


def get_file_size_mb(file: FileStorage) -> float:
    """
    Get file size in megabytes.

    Args:
        file: Uploaded file

    Returns:
        float: File size in MB
    """
    # Save current position
    current_pos = file.tell()

    # Seek to end to get size
    file.seek(0, 2)  # Seek to end
    size_bytes = file.tell()

    # Restore original position
    file.seek(current_pos)

    return size_bytes / (1024 * 1024)


def validate_file_size(file: FileStorage, detector: str, force: bool) -> Tuple[bool, Optional[str]]:
    """
    Validate file size based on detector and force parameter.

    Args:
        file: Uploaded file
        detector: Selected detector
        force: Whether force parameter is enabled

    Returns:
        Tuple containing:
        - bool: Whether validation passed
        - Optional[str]: Error message if validation failed
    """
    file_size_mb = get_file_size_mb(file)

    # Size limits based on detector
    size_limits = {
        'beat-transformer': 50,  # 50MB for uploads
        'madmom': 100,          # 100MB for madmom
        'librosa': 200          # 200MB for librosa
    }

    # Check size limits unless force is enabled
    if not force:
        if detector == 'beat-transformer' and file_size_mb > size_limits['beat-transformer']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['beat-transformer']}MB). Use detector='madmom' or 'librosa', or add 'force=true'."
        elif detector == 'madmom' and file_size_mb > size_limits['madmom']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['madmom']}MB). Use detector='librosa' or add 'force=true'."
        elif detector == 'librosa' and file_size_mb > size_limits['librosa']:
            return False, f"File too large ({file_size_mb:.1f}MB > {size_limits['librosa']}MB)."
        elif detector == 'auto' and file_size_mb > 50:
            # For auto, suggest alternatives for large files
            return False, f"File too large ({file_size_mb:.1f}MB > 50MB). Specify detector='madmom' or 'librosa' for larger files, or add 'force=true'."

    return True, None