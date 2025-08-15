"""
Model availability checking utilities for ChordMini Flask application.

This module provides functions to check the availability of various ML models
and their dependencies without actually loading the models.
"""

from pathlib import Path
from utils.logging import log_info, log_error, log_debug


def check_spleeter_availability():
    """
    Check if Spleeter is available without loading models.
    
    Returns:
        bool: True if Spleeter is available
    """
    try:
        import spleeter
        log_debug("Spleeter is available")
        return True
    except ImportError as e:
        log_debug(f"Spleeter not available: {e}")
        return False


def check_beat_transformer_availability():
    """
    Check if Beat-Transformer is available without loading it.
    
    Returns:
        bool: True if Beat-Transformer is available
    """
    try:
        from models.beat_transformer import is_beat_transformer_available
        available = is_beat_transformer_available()
        log_debug(f"Beat-Transformer availability: {available}")
        return available
    except Exception as e:
        log_debug(f"Beat-Transformer availability check failed: {e}")
        return False


def check_chord_cnn_lstm_availability():
    """
    Check if Chord-CNN-LSTM is available without loading it.
    
    Returns:
        bool: True if Chord-CNN-LSTM is available
    """
    try:
        # Get the model directory path
        chord_cnn_lstm_dir = Path(__file__).parent.parent / "models" / "Chord-CNN-LSTM"
        
        # Check if the model directory exists and has required files
        if chord_cnn_lstm_dir.exists():
            # Check for key files that indicate the model is present
            required_files = ['chord_recognition.py']
            for file in required_files:
                if not (chord_cnn_lstm_dir / file).exists():
                    log_debug(f"Chord-CNN-LSTM missing required file: {file}")
                    return False
            log_debug("Chord-CNN-LSTM is available")
            return True
        else:
            log_debug(f"Chord-CNN-LSTM directory not found: {chord_cnn_lstm_dir}")
            return False
    except Exception as e:
        log_debug(f"Chord-CNN-LSTM availability check failed: {e}")
        return False


def check_genius_availability():
    """
    Check if Genius API is available.
    
    Returns:
        bool: True if lyricsgenius library is available
    """
    try:
        import lyricsgenius
        log_debug("Genius API (lyricsgenius) is available")
        return True
    except ImportError as e:
        log_debug(f"Genius API not available: {e}")
        return False


def check_btc_availability():
    """
    Check if BTC models and dependencies are available.
    
    Returns:
        dict: Detailed availability information for BTC models
    """
    try:
        btc_dir = Path(__file__).parent.parent / "models" / "ChordMini"

        # Check for model files
        sl_model = btc_dir / "checkpoints" / "SL" / "btc_model_large_voca.pt"
        pl_model = btc_dir / "checkpoints" / "btc" / "btc_combined_best.pth"
        config_file = btc_dir / "config" / "btc_config.yaml"

        sl_available = sl_model.exists()
        pl_available = pl_model.exists()
        config_available = config_file.exists()

        # Check for required Python modules
        try:
            import torch
            import numpy as np
            torch_available = True
            log_debug("PyTorch and NumPy are available for BTC models")
        except ImportError as e:
            torch_available = False
            log_debug(f"PyTorch/NumPy not available for BTC models: {e}")

        result = {
            'sl_available': sl_available and config_available and torch_available,
            'pl_available': pl_available and config_available and torch_available,
            'sl_model_path': str(sl_model),
            'pl_model_path': str(pl_model),
            'config_path': str(config_file)
        }
        
        log_debug(f"BTC availability check: SL={result['sl_available']}, PL={result['pl_available']}")
        return result
        
    except Exception as e:
        log_error(f"Error checking BTC availability: {e}")
        return {
            'sl_available': False,
            'pl_available': False,
            'sl_model_path': '',
            'pl_model_path': '',
            'config_path': ''
        }


def check_pytorch_availability():
    """
    Check if PyTorch is available and get device information.
    
    Returns:
        dict: PyTorch availability and device information
    """
    try:
        import torch
        
        result = {
            'available': True,
            'version': torch.__version__,
            'cuda_available': torch.cuda.is_available(),
            'cuda_device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
            'mps_available': hasattr(torch.backends, 'mps') and torch.backends.mps.is_available(),
            'device_name': 'cpu'
        }
        
        # Determine best available device
        if result['cuda_available']:
            result['device_name'] = 'cuda'
            result['cuda_device_name'] = torch.cuda.get_device_name(0) if result['cuda_device_count'] > 0 else 'Unknown'
        elif result['mps_available']:
            result['device_name'] = 'mps'
        
        log_debug(f"PyTorch available: {result['device_name']} device")
        return result
        
    except ImportError as e:
        log_debug(f"PyTorch not available: {e}")
        return {
            'available': False,
            'error': str(e),
            'version': None,
            'cuda_available': False,
            'cuda_device_count': 0,
            'mps_available': False,
            'device_name': 'cpu'
        }


def check_tensorflow_availability():
    """
    Check if TensorFlow is available.
    
    Returns:
        dict: TensorFlow availability information
    """
    try:
        import tensorflow as tf
        
        # Suppress TensorFlow warnings for this check
        import os
        old_level = os.environ.get('TF_CPP_MIN_LOG_LEVEL', '0')
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
        
        try:
            gpu_available = len(tf.config.list_physical_devices('GPU')) > 0
        except:
            gpu_available = False
        
        # Restore log level
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = old_level
        
        result = {
            'available': True,
            'version': tf.__version__,
            'gpu_available': gpu_available,
            'gpu_count': len(tf.config.list_physical_devices('GPU')) if gpu_available else 0
        }
        
        log_debug(f"TensorFlow available: version {result['version']}, GPU: {gpu_available}")
        return result
        
    except ImportError as e:
        log_debug(f"TensorFlow not available: {e}")
        return {
            'available': False,
            'error': str(e),
            'version': None,
            'gpu_available': False,
            'gpu_count': 0
        }


def get_model_directory_info(model_name):
    """
    Get information about a model directory.
    
    Args:
        model_name: Name of the model directory
        
    Returns:
        dict: Directory information
    """
    try:
        models_dir = Path(__file__).parent.parent / "models"
        model_dir = models_dir / model_name
        
        if not model_dir.exists():
            return {
                'exists': False,
                'path': str(model_dir),
                'files': [],
                'subdirectories': [],
                'size_mb': 0
            }
        
        files = []
        subdirectories = []
        total_size = 0
        
        for item in model_dir.rglob('*'):
            if item.is_file():
                files.append(str(item.relative_to(model_dir)))
                try:
                    total_size += item.stat().st_size
                except:
                    pass
            elif item.is_dir() and item != model_dir:
                subdirectories.append(str(item.relative_to(model_dir)))
        
        return {
            'exists': True,
            'path': str(model_dir),
            'files': sorted(files),
            'subdirectories': sorted(subdirectories),
            'file_count': len(files),
            'directory_count': len(subdirectories),
            'size_mb': round(total_size / (1024 * 1024), 2)
        }
        
    except Exception as e:
        log_error(f"Error getting model directory info for {model_name}: {e}")
        return {
            'exists': False,
            'path': '',
            'files': [],
            'subdirectories': [],
            'error': str(e)
        }


def get_all_model_availability():
    """
    Get availability status for all models.
    
    Returns:
        dict: Comprehensive model availability information
    """
    try:
        availability = {
            'spleeter': check_spleeter_availability(),
            'beat_transformer': check_beat_transformer_availability(),
            'chord_cnn_lstm': check_chord_cnn_lstm_availability(),
            'genius': check_genius_availability(),
            'btc': check_btc_availability(),
            'pytorch': check_pytorch_availability(),
            'tensorflow': check_tensorflow_availability()
        }
        
        # Count available models
        available_count = sum(1 for key, value in availability.items() 
                            if (isinstance(value, bool) and value) or 
                               (isinstance(value, dict) and value.get('available', False)))
        
        availability['summary'] = {
            'total_models': len(availability) - 1,  # Exclude summary itself
            'available_models': available_count,
            'availability_percentage': round((available_count / (len(availability) - 1)) * 100, 1)
        }
        
        return availability
        
    except Exception as e:
        log_error(f"Error getting model availability: {e}")
        return {
            'error': str(e),
            'summary': {
                'total_models': 0,
                'available_models': 0,
                'availability_percentage': 0.0
            }
        }
