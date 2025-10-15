"""
Madmom compatibility patches.

This module patches compatibility issues with madmom for Python 3.10+.
Specifically, it fixes the collections.MutableSequence issue.
"""

import sys
from utils.logging import log_debug, is_debug_enabled


def patch_madmom_compatibility():
    """
    Fix for Python 3.10+ compatibility with madmom.

    In Python 3.10+, collections.MutableSequence was moved to collections.abc.
    This patch ensures madmom can find the MutableSequence class.
    """
    try:
        import collections
        import collections.abc

        # Fix collections.MutableSequence for madmom compatibility
        if not hasattr(collections, 'MutableSequence'):
            collections.MutableSequence = collections.abc.MutableSequence
            if is_debug_enabled():
                log_debug("Applied madmom patch: collections.MutableSequence -> collections.abc.MutableSequence")

        return True

    except Exception as e:
        print(f"Failed to apply madmom compatibility patch: {e}")
        return False