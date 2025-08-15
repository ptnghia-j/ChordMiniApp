"""
Debug and testing routes for ChordMini Flask application.

This module provides debug and testing endpoints for troubleshooting
model availability, environment issues, and system diagnostics.
"""

import os
import sys
import json
import traceback
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app
from config import get_config
from extensions import limiter
from utils.logging import log_info, log_error, log_debug
from utils.model_utils import check_btc_availability, check_chord_cnn_lstm_availability, get_all_model_availability
from .validators import (
    validate_debug_request, validate_model_test_request, validate_environment_debug_request,
    validate_file_debug_request, validate_btc_debug_request, format_debug_response,
    get_debug_rate_limit
)

# Create blueprint
debug_bp = Blueprint('debug', __name__)

# Get configuration
config = get_config()


@debug_bp.route('/debug/files')
@limiter.limit(get_debug_rate_limit())
def debug_files():
    """Debug endpoint to check if essential files exist"""
    is_valid, error_msg = validate_debug_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        files_to_check = [
            '/app/models/ChordMini/test_btc.py',
            '/app/models/Chord-CNN-LSTM/data/train00.csv',
            '/app/models/ChordMini/config/btc_config.yaml',
            '/app/models/ChordMini/checkpoints/btc/btc_combined_best.pth'
        ]

        results = {}
        for file_path in files_to_check:
            results[file_path] = {
                'exists': os.path.exists(file_path),
                'is_file': os.path.isfile(file_path) if os.path.exists(file_path) else False
            }
            if os.path.exists(file_path):
                try:
                    results[file_path]['size'] = os.path.getsize(file_path)
                except:
                    results[file_path]['size'] = 'unknown'

        return jsonify(format_debug_response(results, 'debug_files'))

    except Exception as e:
        log_error(f"Error in debug_files endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@debug_bp.route('/api/debug-btc', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def debug_btc():
    """Debug BTC model availability and configuration"""
    is_valid, error_msg, params = validate_btc_debug_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        debug_info = {
            "endpoint": "debug-btc",
            "timestamp": __import__('time').time()
        }

        # Get BTC availability
        btc_status = check_btc_availability()
        debug_info["btc_availability"] = btc_status

        # Check BTC directory structure
        btc_dir = Path(__file__).parent.parent.parent / "models" / "ChordMini"
        debug_info["btc_directory"] = {
            "path": str(btc_dir),
            "exists": btc_dir.exists(),
            "is_directory": btc_dir.is_dir() if btc_dir.exists() else False
        }

        if btc_dir.exists():
            try:
                # List directory contents
                contents = []
                for item in btc_dir.iterdir():
                    contents.append({
                        "name": item.name,
                        "is_file": item.is_file(),
                        "is_directory": item.is_dir(),
                        "size": item.stat().st_size if item.is_file() else None
                    })
                debug_info["btc_directory"]["contents"] = contents[:20]  # Limit to first 20 items
            except Exception as e:
                debug_info["btc_directory"]["error"] = str(e)

        # Check specific model files
        model_files = {
            "sl_model": btc_dir / "checkpoints" / "SL" / "btc_model_large_voca.pt",
            "pl_model": btc_dir / "checkpoints" / "btc" / "btc_combined_best.pth",
            "config": btc_dir / "config" / "btc_config.yaml"
        }

        debug_info["model_files"] = {}
        for name, path in model_files.items():
            debug_info["model_files"][name] = {
                "path": str(path),
                "exists": path.exists(),
                "size": path.stat().st_size if path.exists() else 0
            }

        # Check Python dependencies
        dependencies = ["torch", "numpy", "yaml"]
        debug_info["dependencies"] = {}
        for dep in dependencies:
            try:
                module = __import__(dep)
                debug_info["dependencies"][dep] = {
                    "available": True,
                    "version": getattr(module, '__version__', 'unknown')
                }
            except ImportError as e:
                debug_info["dependencies"][dep] = {
                    "available": False,
                    "error": str(e)
                }

        return jsonify(format_debug_response(debug_info, 'debug_btc'))

    except Exception as e:
        log_error(f"Error in debug_btc endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/test-btc-import', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def test_btc_import():
    """Test BTC model import without loading"""
    is_valid, error_msg, params = validate_model_test_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        debug_info = {
            "test": "btc-import",
            "timestamp": __import__('time').time(),
            "steps": []
        }

        # Step 1: Check if BTC directory exists
        btc_dir = Path(__file__).parent.parent.parent / "models" / "ChordMini"
        step1 = {
            "step": 1,
            "description": "Check BTC directory",
            "btc_dir": str(btc_dir),
            "exists": btc_dir.exists()
        }
        debug_info["steps"].append(step1)

        if not btc_dir.exists():
            return jsonify(format_debug_response(debug_info, 'test_btc_import'))

        # Step 2: Check sys.path
        step2 = {
            "step": 2,
            "description": "Check sys.path",
            "btc_in_path": str(btc_dir) in sys.path,
            "sys_path_length": len(sys.path)
        }
        debug_info["steps"].append(step2)

        # Step 3: Add to path if needed
        if str(btc_dir) not in sys.path:
            sys.path.insert(0, str(btc_dir))
            step3 = {
                "step": 3,
                "description": "Added BTC directory to sys.path",
                "added": True
            }
        else:
            step3 = {
                "step": 3,
                "description": "BTC directory already in sys.path",
                "added": False
            }
        debug_info["steps"].append(step3)

        # Step 4: Try to import test_btc
        try:
            import test_btc
            step4 = {
                "step": 4,
                "description": "Import test_btc",
                "success": True,
                "module_file": getattr(test_btc, '__file__', 'unknown')
            }
        except ImportError as e:
            step4 = {
                "step": 4,
                "description": "Import test_btc",
                "success": False,
                "error": str(e)
            }
        debug_info["steps"].append(step4)

        return jsonify(format_debug_response(debug_info, 'test_btc_import'))

    except Exception as e:
        log_error(f"Error in test_btc_import endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/test-chord-cnn-lstm', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def test_chord_cnn_lstm():
    """Test Chord-CNN-LSTM model availability"""
    is_valid, error_msg, params = validate_model_test_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        # Check if Chord-CNN-LSTM is available
        available = check_chord_cnn_lstm_availability()

        if available:
            chord_cnn_lstm_dir = Path(__file__).parent.parent.parent / "models" / "Chord-CNN-LSTM"

            # Try to import and test
            original_dir = os.getcwd()
            try:
                sys.path.insert(0, str(chord_cnn_lstm_dir))
                os.chdir(str(chord_cnn_lstm_dir))
                from chord_recognition import chord_recognition

                return jsonify(format_debug_response({
                    "model": "Chord-CNN-LSTM",
                    "status": "available",
                    "model_dir": str(chord_cnn_lstm_dir),
                    "message": "Chord-CNN-LSTM model is ready for use"
                }, 'test_chord_cnn_lstm'))

            finally:
                os.chdir(original_dir)
        else:
            return jsonify(format_debug_response({
                "model": "Chord-CNN-LSTM",
                "status": "unavailable",
                "message": "Chord-CNN-LSTM model is not available"
            }, 'test_chord_cnn_lstm'))

    except Exception as e:
        log_error(f"Error in test_chord_cnn_lstm endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/debug-chord-cnn-lstm', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def debug_chord_cnn_lstm():
    """Debug Chord-CNN-LSTM model in detail"""
    is_valid, error_msg, params = validate_model_test_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        debug_info = {
            "model": "Chord-CNN-LSTM",
            "timestamp": __import__('time').time()
        }

        original_dir = os.getcwd()
        chord_cnn_lstm_dir = Path(__file__).parent.parent.parent / "models" / "Chord-CNN-LSTM"

        debug_info["original_dir"] = original_dir
        debug_info["chord_cnn_lstm_dir"] = str(chord_cnn_lstm_dir)
        debug_info["dir_exists"] = chord_cnn_lstm_dir.exists()

        # Check key files
        key_files = ["chord_recognition.py", "mir/__init__.py", "mir/chord_recognition.py"]
        debug_info["files"] = {}
        for file in key_files:
            file_path = chord_cnn_lstm_dir / file
            debug_info["files"][file] = file_path.exists()

        debug_info["sys_path_before"] = str(chord_cnn_lstm_dir) in sys.path
        debug_info["working_dir_before"] = os.getcwd()

        # Add to path and change directory
        sys.path.insert(0, str(chord_cnn_lstm_dir))
        os.chdir(str(chord_cnn_lstm_dir))

        debug_info["working_dir_after"] = os.getcwd()
        debug_info["sys_path_after"] = str(chord_cnn_lstm_dir) in sys.path

        # Try importing
        try:
            import chord_recognition
            debug_info["import_success"] = True
            debug_info["module_file"] = getattr(chord_recognition, '__file__', 'unknown')

            # Check if chord_recognition function exists
            if hasattr(chord_recognition, 'chord_recognition'):
                debug_info["function_exists"] = True
            else:
                debug_info["function_exists"] = False
                debug_info["available_functions"] = [attr for attr in dir(chord_recognition)
                                                   if not attr.startswith('_')]
        except ImportError as e:
            debug_info["import_success"] = False
            debug_info["import_error"] = str(e)

        # List actual files in mir directory
        mir_dir = chord_cnn_lstm_dir / "mir"
        if mir_dir.exists():
            debug_info["mir_directory_contents"] = []
            try:
                for item in mir_dir.iterdir():
                    debug_info["mir_directory_contents"].append({
                        "name": item.name,
                        "is_file": item.is_file(),
                        "size": item.stat().st_size if item.is_file() else None
                    })
            except Exception as e:
                debug_info["mir_directory_error"] = str(e)

        # Restore original directory
        os.chdir(original_dir)

        return jsonify(format_debug_response(debug_info, 'debug_chord_cnn_lstm'))

    except Exception as e:
        # Make sure to restore directory even on error
        try:
            os.chdir(original_dir)
        except:
            pass

        log_error(f"Error in debug_chord_cnn_lstm endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/test-btc-pl', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def test_btc_pl():
    """Test BTC-PL model availability"""
    is_valid, error_msg, params = validate_model_test_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        btc_status = check_btc_availability()

        if btc_status['pl_available']:
            return jsonify(format_debug_response({
                "model": "BTC-PL",
                "status": "available",
                "model_path": btc_status['pl_model_path'],
                "config_path": btc_status['config_path'],
                "message": "BTC-PL model is ready for use"
            }, 'test_btc_pl'))
        else:
            return jsonify(format_debug_response({
                "model": "BTC-PL",
                "status": "unavailable",
                "model_path": btc_status['pl_model_path'],
                "config_path": btc_status['config_path'],
                "message": "BTC-PL model is not available"
            }, 'test_btc_pl'))

    except Exception as e:
        log_error(f"Error in test_btc_pl endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/test-btc-sl', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def test_btc_sl():
    """Test BTC-SL model availability"""
    is_valid, error_msg, params = validate_model_test_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        btc_status = check_btc_availability()

        if btc_status['sl_available']:
            return jsonify(format_debug_response({
                "model": "BTC-SL",
                "status": "available",
                "model_path": btc_status['sl_model_path'],
                "config_path": btc_status['config_path'],
                "message": "BTC-SL model is ready for use"
            }, 'test_btc_sl'))
        else:
            return jsonify(format_debug_response({
                "model": "BTC-SL",
                "status": "unavailable",
                "model_path": btc_status['sl_model_path'],
                "config_path": btc_status['config_path'],
                "message": "BTC-SL model is not available"
            }, 'test_btc_sl'))

    except Exception as e:
        log_error(f"Error in test_btc_sl endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@debug_bp.route('/api/debug-environment', methods=['POST'])
@limiter.limit(get_debug_rate_limit())
def debug_environment():
    """Debug environment and system information"""
    is_valid, error_msg, params = validate_environment_debug_request()
    if not is_valid:
        return jsonify({"error": error_msg}), 404

    try:
        import platform

        debug_info = {
            "timestamp": __import__('time').time(),
            "system": {
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "python_executable": sys.executable,
                "architecture": platform.architecture(),
                "processor": platform.processor(),
                "machine": platform.machine()
            },
            "environment": {
                "working_directory": os.getcwd(),
                "sys_path_length": len(sys.path),
                "sys_path_first_5": sys.path[:5],
                "environment_variables": {
                    key: value for key, value in os.environ.items()
                    if any(keyword in key.upper() for keyword in
                          ['PYTHON', 'PATH', 'TORCH', 'CUDA', 'MODEL', 'CHORD'])
                }
            },
            "models": get_all_model_availability(),
            "memory": {},
            "disk_space": {}
        }

        # Get memory information if psutil is available
        try:
            import psutil
            memory = psutil.virtual_memory()
            debug_info["memory"] = {
                "total_gb": round(memory.total / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "percent_used": memory.percent
            }
        except ImportError:
            debug_info["memory"] = {"error": "psutil not available"}

        # Get disk space information
        try:
            import shutil
            total, used, free = shutil.disk_usage("/")
            debug_info["disk_space"] = {
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "percent_used": round((used / total) * 100, 1)
            }
        except Exception as e:
            debug_info["disk_space"] = {"error": str(e)}

        return jsonify(format_debug_response(debug_info, 'debug_environment'))

    except Exception as e:
        log_error(f"Error in debug_environment endpoint: {e}")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500
