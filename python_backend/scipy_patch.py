"""
Patch for scipy/librosa/madmom compatibility issues.
This file patches compatibility issues with newer versions of scipy and numpy.
"""

import sys
import importlib
import inspect
import types
import warnings
import numpy as np

# Suppress the deprecation warnings for numpy patches
warnings.filterwarnings("ignore", message=".*np.float.*deprecated.*")
warnings.filterwarnings("ignore", message=".*np.int.*deprecated.*")

def patch_numpy_compatibility():
    """
    Patch numpy to restore deprecated attributes for compatibility with older packages.
    This fixes compatibility issues with:
    - madmom (uses np.float in io/__init__.py)
    - other packages that rely on deprecated numpy attributes
    """
    # Restore deprecated numpy attributes if they don't exist
    if not hasattr(np, 'float'):
        np.float = np.float64
        print("Applied numpy patch: np.float -> np.float64")
    if not hasattr(np, 'int'):
        np.int = np.int_
        print("Applied numpy patch: np.int -> np.int_")
    if not hasattr(np, 'complex'):
        np.complex = np.complex128
        print("Applied numpy patch: np.complex -> np.complex128")
    if not hasattr(np, 'bool'):
        np.bool = np.bool_
        print("Applied numpy patch: np.bool -> np.bool_")

def apply_scipy_patches():
    """
    Apply patches to make librosa work with newer versions of scipy.
    Specifically, this patches the __beat_tracker function in librosa.beat
    to use scipy.signal.windows.hann instead of scipy.signal.hann.
    """
    try:
        import scipy.signal
        import librosa.beat
        
        # Check if scipy.signal.hann exists
        if not hasattr(scipy.signal, 'hann') and hasattr(scipy.signal.windows, 'hann'):
            print("Applying patch: scipy.signal.hann -> scipy.signal.windows.hann")
            
            # Create a reference to the windows.hann function in the signal module
            scipy.signal.hann = scipy.signal.windows.hann
            
            # Reload librosa.beat to use the patched scipy.signal
            importlib.reload(librosa.beat)
            
            return True
    except Exception as e:
        warnings.warn(f"Failed to apply scipy patch: {e}")
        return False

def patch_librosa_beat_tracker():
    """
    Directly patch the __beat_tracker and __trim_beats functions in librosa.beat
    to use scipy.signal.windows.hann instead of scipy.signal.hann.
    """
    try:
        import librosa.beat
        import scipy.signal
        
        # Get the source code of the __trim_beats function
        trim_beats_source = inspect.getsource(librosa.beat.__trim_beats)
        
        # Replace scipy.signal.hann with scipy.signal.windows.hann
        if 'scipy.signal.hann' in trim_beats_source:
            new_source = trim_beats_source.replace('scipy.signal.hann', 'scipy.signal.windows.hann')
            
            # Compile the new function
            code = compile(new_source, '<string>', 'exec')
            
            # Create a new function object
            new_locals = {}
            exec(code, librosa.beat.__dict__, new_locals)
            
            # Replace the original function with our patched version
            librosa.beat.__trim_beats = new_locals['__trim_beats']
            
            print("Successfully patched librosa.beat.__trim_beats")
            return True
    except Exception as e:
        warnings.warn(f"Failed to patch librosa.beat.__trim_beats: {e}")
        return False

def monkey_patch_beat_track():
    """
    Create a monkey-patched version of librosa.beat.beat_track that doesn't use
    the problematic scipy.signal.hann function.
    """
    try:
        import librosa
        import numpy as np
        
        # Original beat_track function
        original_beat_track = librosa.beat.beat_track
        
        def patched_beat_track(y=None, sr=22050, onset_envelope=None, hop_length=512,
                              start_bpm=120.0, tightness=100, trim=True, bpm=None,
                              units='frames', prior=None, **kwargs):
            """
            Patched version of librosa.beat.beat_track that handles the scipy.signal.hann issue
            """
            # Use the original function to get tempo and beats
            tempo, beats = original_beat_track(y=y, sr=sr, onset_envelope=onset_envelope, 
                                              hop_length=hop_length, start_bpm=start_bpm,
                                              tightness=tightness, trim=False, bpm=bpm,
                                              units=units, prior=prior, **kwargs)
            
            # If trim is True, we need to handle the trimming ourselves
            if trim and len(beats) > 0:
                # Get the onset envelope if it wasn't provided
                if onset_envelope is None:
                    onset_envelope = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length, **kwargs)
                
                # Simple trimming without using scipy.signal.hann
                # Just keep beats where the onset strength is above the median
                if len(beats) > 0:
                    onset_strength_at_beats = onset_envelope[beats]
                    median_strength = np.median(onset_strength_at_beats)
                    beats = beats[onset_strength_at_beats >= median_strength]
            
            return tempo, beats
        
        # Replace the original function with our patched version
        librosa.beat.beat_track = patched_beat_track
        print("Successfully monkey-patched librosa.beat.beat_track")
        return True
    except Exception as e:
        warnings.warn(f"Failed to monkey-patch librosa.beat.beat_track: {e}")
        return False

# Apply numpy compatibility patches immediately when this module is imported
patch_numpy_compatibility()

if __name__ == "__main__":
    # Apply all patches
    patch_numpy_compatibility()
    apply_scipy_patches()
    patch_librosa_beat_tracker()
    monkey_patch_beat_track()
