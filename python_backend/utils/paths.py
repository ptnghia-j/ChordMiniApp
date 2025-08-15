"""
Path constants and utilities for the ChordMini application.

This module centralizes all path-related constants and provides utilities
for path resolution and validation.
"""

import os
import sys
from pathlib import Path
from utils.logging import log_info


# Base directories
BACKEND_DIR = Path(__file__).parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Model directories
BEAT_TRANSFORMER_DIR = BACKEND_DIR / "models" / "Beat-Transformer"
CHORD_CNN_LSTM_DIR = BACKEND_DIR / "models" / "Chord-CNN-LSTM"
CHORDMINI_DIR = BACKEND_DIR / "models" / "ChordMini"

# Chord model specific directories
BTC_SL_CONFIG_DIR = CHORDMINI_DIR / "config"
BTC_SL_CHECKPOINTS_DIR = CHORDMINI_DIR / "checkpoints"
BTC_PL_CONFIG_DIR = CHORDMINI_DIR / "config"
BTC_PL_CHECKPOINTS_DIR = CHORDMINI_DIR / "checkpoints"

# Audio directory
AUDIO_DIR = PROJECT_ROOT / "public" / "audio"

# Model checkpoint paths
BEAT_TRANSFORMER_CHECKPOINT = BEAT_TRANSFORMER_DIR / "checkpoint" / "fold_4_trf_param.pt"

# Chord model checkpoint paths
BTC_SL_CONFIG_PATH = BTC_SL_CONFIG_DIR / "btc_model_large_voca_sl.yaml"
BTC_SL_CHECKPOINT_PATH = BTC_SL_CHECKPOINTS_DIR / "btc_model_large_voca_sl.pt"
BTC_PL_CONFIG_PATH = BTC_PL_CONFIG_DIR / "btc_model_large_voca_pl.yaml"
BTC_PL_CHECKPOINT_PATH = BTC_PL_CHECKPOINTS_DIR / "btc_model_large_voca_pl.pt"

# Template directory
TEMPLATES_DIR = BACKEND_DIR / "templates"


def setup_model_paths():
    """
    Add model directories to Python path for imports.

    This function should be called during application initialization
    to ensure model modules can be imported.
    """
    model_dirs = [
        str(BEAT_TRANSFORMER_DIR),
        str(CHORD_CNN_LSTM_DIR),
        str(CHORDMINI_DIR)
    ]

    for model_dir in model_dirs:
        if model_dir not in sys.path:
            sys.path.insert(0, model_dir)
            log_info(f"Added {model_dir} to Python path")


def get_model_checkpoint_path(model_name: str) -> Path:
    """
    Get the checkpoint path for a specific model.

    Args:
        model_name: Name of the model ('beat-transformer', 'chord-cnn-lstm', 'btc-sl', 'btc-pl')

    Returns:
        Path: Path to the model checkpoint
    """
    if model_name == 'beat-transformer':
        return BEAT_TRANSFORMER_CHECKPOINT
    elif model_name == 'chord-cnn-lstm':
        return CHORD_CNN_LSTM_DIR  # Directory contains the model
    elif model_name == 'btc-sl':
        return BTC_SL_CHECKPOINT_PATH
    elif model_name == 'btc-pl':
        return BTC_PL_CHECKPOINT_PATH
    else:
        raise ValueError(f"Unknown model: {model_name}")


def get_model_config_path(model_name: str) -> Path:
    """
    Get the config path for a specific model.

    Args:
        model_name: Name of the model ('btc-sl', 'btc-pl')

    Returns:
        Path: Path to the model config file
    """
    if model_name == 'btc-sl':
        return BTC_SL_CONFIG_PATH
    elif model_name == 'btc-pl':
        return BTC_PL_CONFIG_PATH
    else:
        raise ValueError(f"Model {model_name} does not have a config file")


def ensure_directories_exist():
    """
    Ensure that required directories exist.

    Creates directories if they don't exist.
    """
    directories = [
        AUDIO_DIR,
        TEMPLATES_DIR
    ]

    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        log_info(f"Ensured directory exists: {directory}")


def get_audio_file_path(filename: str) -> Path:
    """
    Get the full path to an audio file in the audio directory.

    Args:
        filename: Name of the audio file

    Returns:
        Path: Full path to the audio file
    """
    return AUDIO_DIR / filename


def validate_model_paths() -> dict:
    """
    Validate that model paths exist and are accessible.

    Returns:
        dict: Validation results for each model
    """
    results = {}

    # Check Beat Transformer
    results['beat_transformer'] = {
        'dir_exists': BEAT_TRANSFORMER_DIR.exists(),
        'checkpoint_exists': BEAT_TRANSFORMER_CHECKPOINT.exists(),
        'checkpoint_path': str(BEAT_TRANSFORMER_CHECKPOINT)
    }

    # Check Chord CNN LSTM
    results['chord_cnn_lstm'] = {
        'dir_exists': CHORD_CNN_LSTM_DIR.exists(),
        'dir_path': str(CHORD_CNN_LSTM_DIR),
        'required_files': ['chord_recognition.py']
    }

    # Check ChordMini (BTC models)
    results['chordmini'] = {
        'dir_exists': CHORDMINI_DIR.exists(),
        'dir_path': str(CHORDMINI_DIR)
    }

    # Check BTC-SL
    results['btc_sl'] = {
        'config_exists': BTC_SL_CONFIG_PATH.exists(),
        'checkpoint_exists': BTC_SL_CHECKPOINT_PATH.exists(),
        'config_path': str(BTC_SL_CONFIG_PATH),
        'checkpoint_path': str(BTC_SL_CHECKPOINT_PATH)
    }

    # Check BTC-PL
    results['btc_pl'] = {
        'config_exists': BTC_PL_CONFIG_PATH.exists(),
        'checkpoint_exists': BTC_PL_CHECKPOINT_PATH.exists(),
        'config_path': str(BTC_PL_CONFIG_PATH),
        'checkpoint_path': str(BTC_PL_CHECKPOINT_PATH)
    }

    # Check audio directory
    results['audio_dir'] = {
        'exists': AUDIO_DIR.exists(),
        'path': str(AUDIO_DIR)
    }

    return results


# Initialize paths on import
log_info(f"Audio directory path: {AUDIO_DIR}")
log_info(f"Beat Transformer directory: {BEAT_TRANSFORMER_DIR}")
log_info(f"Chord CNN LSTM directory: {CHORD_CNN_LSTM_DIR}")