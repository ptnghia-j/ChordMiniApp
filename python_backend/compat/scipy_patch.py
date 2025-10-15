"""
SciPy compatibility patches.

This module patches SciPy to fix compatibility issues with librosa
when using newer versions of SciPy where signal functions were moved
to the windows submodule.
"""

import importlib
import warnings

import os

_DEBUG = (os.getenv('FLASK_ENV') == 'development' or str(os.getenv('DEBUG', 'false')).lower() == 'true')
_PATCH_LOGGED = False


def apply_scipy_patches():
    """
    Apply patches to make librosa work with newer versions of scipy.

    Specifically, this patches the scipy.signal module to provide
    backward compatibility for functions that were moved to scipy.signal.windows.
    """
    global _PATCH_LOGGED

    try:
        import scipy.signal
        import librosa.beat

        # Check if scipy.signal.hann exists
        if not hasattr(scipy.signal, 'hann') and hasattr(scipy.signal.windows, 'hann'):
            if _DEBUG and not _PATCH_LOGGED:
                print("Applying patch: scipy.signal.hann -> scipy.signal.windows.hann")

            # Create a reference to the windows.hann function in the signal module
            scipy.signal.hann = scipy.signal.windows.hann

            # Reload librosa.beat to use the patched scipy.signal
            importlib.reload(librosa.beat)

            _PATCH_LOGGED = True
            return True

    except Exception as e:
        if _DEBUG:
            warnings.warn(f"Failed to apply scipy patch: {e}")
        return False