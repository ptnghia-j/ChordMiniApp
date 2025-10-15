"""
NumPy compatibility patches.

This module patches NumPy to restore deprecated attributes for compatibility
with older packages like madmom that still use np.float, np.int, etc.
"""

import warnings
import numpy as np

# Suppress the deprecation warnings for numpy patches
warnings.filterwarnings("ignore", message=".*np.float.*deprecated.*")
warnings.filterwarnings("ignore", message=".*np.int.*deprecated.*")

warnings.filterwarnings("ignore", message=".*np.bool.*deprecated.*")
import os

_DEBUG = (os.getenv('FLASK_ENV') == 'development' or str(os.getenv('DEBUG', 'false')).lower() == 'true')
_LOGGED = False


def patch_numpy_compatibility():
    """
    Patch numpy to restore deprecated attributes for compatibility with older packages.

    This fixes compatibility issues with:
    - madmom (uses np.float in io/__init__.py)
    - other packages that rely on deprecated numpy attributes
    """
    global _LOGGED
    msgs = []

    # Restore deprecated numpy attributes if they don't exist
    if not hasattr(np, 'float'):
        np.float = np.float64
        msgs.append("Applied numpy patch: np.float -> np.float64")

    if not hasattr(np, 'int'):
        np.int = np.int_
        msgs.append("Applied numpy patch: np.int -> np.int_")

    if not hasattr(np, 'complex'):
        np.complex = np.complex128
        msgs.append("Applied numpy patch: np.complex -> np.complex128")

    if not hasattr(np, 'bool'):
        np.bool = np.bool_
        msgs.append("Applied numpy patch: np.bool -> np.bool_")

    if _DEBUG and not _LOGGED and msgs:
        for m in msgs:
            print(m)
    _LOGGED = True
