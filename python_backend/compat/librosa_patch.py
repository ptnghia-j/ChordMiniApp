"""
Librosa compatibility patches.

This module patches librosa to fix compatibility issues with newer
versions of SciPy and NumPy, particularly around beat tracking functionality.
"""

import inspect
import warnings
import numpy as np


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