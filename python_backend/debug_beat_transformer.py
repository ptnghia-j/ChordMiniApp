#!/usr/bin/env python3
"""
Debug script to test Beat-Transformer imports and identify issues
"""
import sys
import os
from pathlib import Path

print("=== Beat-Transformer Debug Script ===")

# Add the Beat-Transformer code directory to path
BEAT_TRANSFORMER_DIR = Path(__file__).parent / "models" / "Beat-Transformer"
BEAT_TRANSFORMER_CODE_DIR = BEAT_TRANSFORMER_DIR / "code"

print(f"Beat-Transformer directory: {BEAT_TRANSFORMER_DIR}")
print(f"Beat-Transformer code directory: {BEAT_TRANSFORMER_CODE_DIR}")
print(f"Directory exists: {BEAT_TRANSFORMER_DIR.exists()}")
print(f"Code directory exists: {BEAT_TRANSFORMER_CODE_DIR.exists()}")

# Check if checkpoint file exists
checkpoint_path = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"
print(f"Checkpoint path: {checkpoint_path}")
print(f"Checkpoint exists: {checkpoint_path.exists()}")

if checkpoint_path.exists():
    print(f"Checkpoint size: {checkpoint_path.stat().st_size / (1024*1024):.1f} MB")

# Add to Python path
sys.path.insert(0, str(BEAT_TRANSFORMER_CODE_DIR))
print(f"Added to sys.path: {BEAT_TRANSFORMER_CODE_DIR}")

# Test basic imports
print("\n=== Testing Imports ===")

try:
    import torch
    print(f"✓ PyTorch imported successfully: {torch.__version__}")
except ImportError as e:
    print(f"✗ PyTorch import failed: {e}")
    sys.exit(1)

try:
    import numpy as np
    print(f"✓ NumPy imported successfully: {np.__version__}")
except ImportError as e:
    print(f"✗ NumPy import failed: {e}")

# Apply madmom compatibility fix
try:
    import collections
    import collections.abc
    collections.MutableSequence = collections.abc.MutableSequence
    print("✓ Applied madmom compatibility fix")
except Exception as e:
    print(f"✗ Failed to apply madmom compatibility fix: {e}")

try:
    from madmom.features.beats import DBNBeatTrackingProcessor
    print("✓ Madmom DBNBeatTrackingProcessor imported successfully")
except ImportError as e:
    print(f"✗ Madmom import failed: {e}")

try:
    from DilatedTransformerLayer import DilatedTransformerLayer
    print("✓ DilatedTransformerLayer imported successfully")
except ImportError as e:
    print(f"✗ DilatedTransformerLayer import failed: {e}")

try:
    from DilatedTransformer import Demixed_DilatedTransformerModel
    print("✓ Demixed_DilatedTransformerModel imported successfully")
except ImportError as e:
    print(f"✗ Demixed_DilatedTransformerModel import failed: {e}")

# Test model instantiation
print("\n=== Testing Model Instantiation ===")
try:
    model = Demixed_DilatedTransformerModel(
        attn_len=5, instr=5, ntoken=2,
        dmodel=256, nhead=8, d_hid=1024,
        nlayers=9, norm_first=True
    )
    print("✓ Model instantiated successfully")
    
    # Test checkpoint loading
    if checkpoint_path.exists():
        try:
            device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
            checkpoint = torch.load(checkpoint_path, map_location=device)
            print(f"✓ Checkpoint loaded successfully")
            print(f"  Checkpoint keys: {list(checkpoint.keys())}")
            
            if 'state_dict' in checkpoint:
                model.load_state_dict(checkpoint['state_dict'])
                print("✓ Model state loaded successfully")
            else:
                print("✗ No 'state_dict' key in checkpoint")
                
        except Exception as e:
            print(f"✗ Checkpoint loading failed: {e}")
    
except Exception as e:
    print(f"✗ Model instantiation failed: {e}")
    import traceback
    traceback.print_exc()

print("\n=== Debug Complete ===")
