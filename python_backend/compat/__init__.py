"""
Compatibility patches for ChordMini Flask application.

This package contains patches for compatibility issues with:
- NumPy (deprecated attributes)
- SciPy (signal module changes)
- Madmom (collections.MutableSequence)
- Librosa (beat tracker issues)

Import order is critical - these patches must be applied before
importing the affected libraries.
"""

from .numpy_patch import patch_numpy_compatibility
from .scipy_patch import apply_scipy_patches
from .madmom_patch import patch_madmom_compatibility
from .librosa_patch import patch_librosa_beat_tracker, monkey_patch_beat_track
from utils.logging import log_debug, is_debug_enabled


def apply_all():
    """
    Apply all compatibility patches in the correct order.

    This function should be called early in the application startup,
    before importing any heavy libraries that might be affected.
    """
    # Apply patches in dependency order
    patch_numpy_compatibility()
    patch_madmom_compatibility()
    apply_scipy_patches()
    patch_librosa_beat_tracker()
    monkey_patch_beat_track()

    if is_debug_enabled():
        log_debug("All compatibility patches applied successfully")