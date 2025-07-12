#!/usr/bin/env python3
"""
Debug script to test Chord-CNN-LSTM imports and identify issues
"""
import sys
import os
from pathlib import Path

print("=== Chord-CNN-LSTM Debug Script ===")

# Add the Chord-CNN-LSTM directory to path
CHORD_CNN_LSTM_DIR = Path(__file__).parent / "models" / "Chord-CNN-LSTM"

print(f"Chord-CNN-LSTM directory: {CHORD_CNN_LSTM_DIR}")
print(f"Directory exists: {CHORD_CNN_LSTM_DIR.exists()}")

# Check if key files exist
key_files = [
    "chord_recognition.py",
    "mir/__init__.py", 
    "mir/settings.py",
    "mir/common.py"
]

for file in key_files:
    file_path = CHORD_CNN_LSTM_DIR / file
    print(f"{file}: {'✓' if file_path.exists() else '✗'}")

# Add to Python path
sys.path.insert(0, str(CHORD_CNN_LSTM_DIR))
print(f"Added to sys.path: {CHORD_CNN_LSTM_DIR}")

# Test basic imports
print("\n=== Testing Imports ===")

try:
    import torch
    print(f"✓ PyTorch imported successfully: {torch.__version__}")
except ImportError as e:
    print(f"✗ PyTorch import failed: {e}")

try:
    import numpy as np
    print(f"✓ NumPy imported successfully: {np.__version__}")
except ImportError as e:
    print(f"✗ NumPy import failed: {e}")

try:
    import librosa
    print(f"✓ Librosa imported successfully: {librosa.__version__}")
except ImportError as e:
    print(f"✗ Librosa import failed: {e}")

# Test mir package imports step by step
print("\n=== Testing mir Package Imports ===")

try:
    # First test if we can import mir.settings directly
    import mir.settings
    print("✓ mir.settings imported successfully")
    print(f"  DEFAULT_DATA_STORAGE_PATH: {getattr(mir.settings, 'DEFAULT_DATA_STORAGE_PATH', 'Not found')}")
except ImportError as e:
    print(f"✗ mir.settings import failed: {e}")
    import traceback
    traceback.print_exc()

try:
    # Test mir.common import
    import mir.common
    print("✓ mir.common imported successfully")
    print(f"  WORKING_PATH: {getattr(mir.common, 'WORKING_PATH', 'Not found')}")
    print(f"  PACKAGE_PATH: {getattr(mir.common, 'PACKAGE_PATH', 'Not found')}")
except ImportError as e:
    print(f"✗ mir.common import failed: {e}")
    import traceback
    traceback.print_exc()

try:
    # Test mir package import
    import mir
    print("✓ mir package imported successfully")
except ImportError as e:
    print(f"✗ mir package import failed: {e}")
    import traceback
    traceback.print_exc()

# Test chord recognition imports with working directory change
print("\n=== Testing Chord Recognition Imports (with working directory change) ===")

original_dir = os.getcwd()
try:
    # Change to the Chord-CNN-LSTM directory
    os.chdir(str(CHORD_CNN_LSTM_DIR))
    print(f"Changed working directory to: {os.getcwd()}")

    try:
        from chordnet_ismir_naive import ChordNet
        print("✓ ChordNet imported successfully")
    except ImportError as e:
        print(f"✗ ChordNet import failed: {e}")
        import traceback
        traceback.print_exc()

    try:
        from settings import DEFAULT_SR, DEFAULT_HOP_LENGTH
        print(f"✓ settings imported successfully: SR={DEFAULT_SR}, HOP={DEFAULT_HOP_LENGTH}")
    except ImportError as e:
        print(f"✗ settings import failed: {e}")
        import traceback
        traceback.print_exc()

    try:
        # Test the main chord_recognition function import
        from chord_recognition import chord_recognition
        print("✓ chord_recognition function imported successfully")
    except ImportError as e:
        print(f"✗ chord_recognition function import failed: {e}")
        import traceback
        traceback.print_exc()

finally:
    # Always change back to original directory
    os.chdir(original_dir)
    print(f"Changed back to original directory: {os.getcwd()}")

print("\n=== Debug Complete ===")
