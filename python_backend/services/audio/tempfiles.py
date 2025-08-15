"""
Temporary file management utilities.

This module provides context managers and utilities for safe temporary file handling
with automatic cleanup.
"""

import os
import tempfile
from contextlib import contextmanager
from typing import Generator, Optional
from utils.logging import log_info, log_error, log_debug


@contextmanager
def temporary_file(suffix: str = '.tmp', prefix: str = 'chordmini_',
                  delete: bool = True) -> Generator[str, None, None]:
    """
    Context manager for creating and cleaning up temporary files.

    Args:
        suffix: File suffix/extension
        prefix: File prefix
        delete: Whether to delete the file on exit (default: True)

    Yields:
        str: Path to the temporary file
    """
    temp_file = None
    try:
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix=prefix)
        temp_file.close()  # Close file handle to prevent Windows file locking
        file_path = temp_file.name

        log_debug(f"Created temporary file: {file_path}")
        yield file_path

    except Exception as e:
        log_error(f"Error with temporary file: {e}")
        raise
    finally:
        # Clean up temporary file
        if temp_file and delete:
            try:
                if os.path.exists(temp_file.name):
                    os.unlink(temp_file.name)
                    log_debug(f"Cleaned up temporary file: {temp_file.name}")
            except Exception as e:
                log_error(f"Failed to clean up temporary file {temp_file.name}: {e}")


@contextmanager
def temporary_audio_file(suffix: str = '.mp3') -> Generator[str, None, None]:
    """
    Context manager specifically for temporary audio files.

    Args:
        suffix: Audio file extension (default: .mp3)

    Yields:
        str: Path to the temporary audio file
    """
    with temporary_file(suffix=suffix, prefix='audio_') as temp_path:
        yield temp_path


@contextmanager
def temporary_directory(prefix: str = 'chordmini_dir_') -> Generator[str, None, None]:
    """
    Context manager for creating and cleaning up temporary directories.

    Args:
        prefix: Directory prefix

    Yields:
        str: Path to the temporary directory
    """
    temp_dir = None
    try:
        # Create temporary directory
        temp_dir = tempfile.mkdtemp(prefix=prefix)
        log_debug(f"Created temporary directory: {temp_dir}")
        yield temp_dir

    except Exception as e:
        log_error(f"Error with temporary directory: {e}")
        raise
    finally:
        # Clean up temporary directory
        if temp_dir:
            try:
                import shutil
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
                    log_debug(f"Cleaned up temporary directory: {temp_dir}")
            except Exception as e:
                log_error(f"Failed to clean up temporary directory {temp_dir}: {e}")


def cleanup_temp_file(file_path: str) -> bool:
    """
    Manually clean up a temporary file.

    Args:
        file_path: Path to the file to delete

    Returns:
        bool: True if cleanup was successful, False otherwise
    """
    try:
        if os.path.exists(file_path):
            os.unlink(file_path)
            log_debug(f"Manually cleaned up file: {file_path}")
            return True
        return True  # File doesn't exist, consider it cleaned up
    except Exception as e:
        log_error(f"Failed to clean up file {file_path}: {e}")
        return False


def get_temp_file_path(suffix: str = '.tmp', prefix: str = 'chordmini_') -> str:
    """
    Get a temporary file path without creating the file.

    Args:
        suffix: File suffix/extension
        prefix: File prefix

    Returns:
        str: Path to a temporary file location
    """
    temp_file = tempfile.NamedTemporaryFile(delete=True, suffix=suffix, prefix=prefix)
    temp_path = temp_file.name
    temp_file.close()  # This will delete the file since delete=True
    return temp_path