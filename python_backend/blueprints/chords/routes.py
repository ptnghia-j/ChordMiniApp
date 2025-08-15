"""
Chord recognition routes for ChordMini Flask application.

This module provides all chord recognition endpoints including model testing
and information endpoints.
"""

import os
import tempfile
import traceback
import requests
from flask import Blueprint, request, jsonify, current_app
from config import get_config
from extensions import limiter
from utils.logging import log_info, log_error, log_debug
from utils.paths import AUDIO_DIR
from .validators import (
    validate_chord_recognition_request,
    validate_firebase_chord_recognition_request,
    validate_file_size,
    normalize_audio_url_to_path,
    get_detector_display_name
)

# Create blueprint
chords_bp = Blueprint('chords', __name__)

# Get configuration
config = get_config()


@chords_bp.route('/api/recognize-chords', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def recognize_chords():
    """
    Recognize chords in an audio file using various models.

    Parameters:
    - file: The audio file to analyze (multipart/form-data)
    - audio_path: Alternative to file, path to an existing audio file on the server
    - detector: Model to use ('chord-cnn-lstm', 'btc-sl', 'btc-pl', 'auto')
    - chord_dict: Optional chord dictionary to use
    - force: Force use of detector even if file is large
    - use_spleeter: Use Spleeter for audio separation

    Returns:
    - JSON with chord recognition results
    """
    temp_file_path = None

    try:
        # Validate request
        is_valid, error_msg, file, params = validate_chord_recognition_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Handle different input types
        if params['json_data']:
            # JSON request with audioUrl
            data = params['json_data']
            audio_url = data.get('audioUrl')

            if audio_url and audio_url.startswith('/audio/'):
                file_path = normalize_audio_url_to_path(audio_url, str(AUDIO_DIR))
                if not os.path.exists(file_path):
                    return jsonify({"error": f"Audio file not found: {audio_url}"}), 404
            else:
                return jsonify({"error": "Invalid audioUrl format"}), 400

        elif file:
            # File upload
            # Validate file size
            size_valid, size_error = validate_file_size(file, params['detector'], params['force'])
            if not size_valid:
                return jsonify({"error": size_error}), 413

            # Save uploaded file temporarily
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            file.save(temp_file.name)
            temp_file_path = temp_file.name
            file_path = temp_file_path

        elif params['audio_path']:
            # Existing file path
            file_path = params['audio_path']
            if not os.path.exists(file_path):
                return jsonify({"error": f"Audio file not found: {file_path}"}), 404
        else:
            return jsonify({"error": "No valid audio input provided"}), 400

        log_info(f"Processing chord recognition request: detector={params['detector']}, "
                f"chord_dict={params['chord_dict']}, force={params['force']}, "
                f"use_spleeter={params['use_spleeter']}")

        # Run chord recognition
        result = chord_service.recognize_chords(
            file_path=file_path,
            detector=params['detector'],
            chord_dict=params['chord_dict'],
            force=params['force'],
            use_spleeter=params['use_spleeter']
        )

        if result.get('success'):
            log_info(f"Chord recognition successful: {result['total_chords']} chords detected "
                    f"using {result['model_used']} with {result['chord_dict']} dictionary")
        else:
            log_error(f"Chord recognition failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except Exception as e:
        error_msg = f"Chord recognition error: {str(e)}"
        log_error(error_msg)
        log_error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": error_msg,
            "traceback": traceback.format_exc() if not config.PRODUCTION_MODE else None
        }), 500
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                log_debug(f"Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_error:
                log_error(f"Failed to clean up temporary file {temp_file_path}: {cleanup_error}")


@chords_bp.route('/api/recognize-chords-firebase', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def recognize_chords_firebase():
    """
    Recognize chords in an audio file from Firebase Storage URL.

    Parameters:
    - firebase_url: Firebase Storage URL of the audio file
    - detector: Chord recognition model to use
    - chord_dict: Optional chord dictionary to use

    Returns:
    - JSON with chord recognition results
    """
    temp_file_path = None

    try:
        # Validate request
        is_valid, error_msg, params = validate_firebase_chord_recognition_request()
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        firebase_url = params['firebase_url']
        detector = params['detector']
        chord_dict = params['chord_dict']

        log_info(f"Processing Firebase chord recognition: {firebase_url[:100]}... "
                f"with detector={detector}")

        # Download file from Firebase Storage
        log_info("Downloading file from Firebase Storage...")
        response = requests.get(firebase_url, timeout=300)  # 5 minute timeout
        response.raise_for_status()

        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        temp_file.write(response.content)
        temp_file.close()
        temp_file_path = temp_file.name

        log_info(f"Downloaded file to: {temp_file_path}")
        log_info(f"File size: {os.path.getsize(temp_file_path) / (1024 * 1024):.1f}MB")

        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Run chord recognition
        result = chord_service.recognize_chords(
            file_path=temp_file_path,
            detector=detector,
            chord_dict=chord_dict,
            force=False,  # Don't force for Firebase requests
            use_spleeter=False  # Don't use Spleeter for Firebase requests
        )

        if result.get('success'):
            log_info(f"Firebase chord recognition successful: {result['total_chords']} chords detected")
        else:
            log_error(f"Firebase chord recognition failed: {result.get('error', 'Unknown error')}")

        return jsonify(result)

    except requests.exceptions.RequestException as e:
        error_msg = f"Failed to download file from Firebase Storage: {str(e)}"
        log_error(error_msg)
        return jsonify({"error": error_msg}), 400
    except Exception as e:
        error_msg = f"Firebase chord recognition error: {str(e)}"
        log_error(error_msg)
        log_error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": error_msg,
            "traceback": traceback.format_exc() if not config.PRODUCTION_MODE else None
        }), 500
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                log_debug(f"Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_error:
                log_error(f"Failed to clean up temporary file {temp_file_path}: {cleanup_error}")


@chords_bp.route('/api/chord-model-info', methods=['GET'])
@limiter.limit(config.get_rate_limit('light_processing'))
def chord_model_info():
    """Return information about available chord recognition models"""
    try:
        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Get detector information
        detector_info = chord_service.get_detector_info()

        return jsonify({
            "success": True,
            "available_chord_models": detector_info["available_detectors"],
            "chord_model_info": {
                name: {
                    "name": info["name"],
                    "description": info["description"],
                    "available": info["available"],
                    "supported_chord_dicts": info["supported_chord_dicts"],
                    "default_chord_dict": info["default_chord_dict"],
                    "size_limit_mb": info["size_limit_mb"]
                }
                for name, info in detector_info["detectors"].items()
            },
            "spleeter_available": detector_info["spleeter_available"],
            "default_chord_model": detector_info["available_detectors"][0] if detector_info["available_detectors"] else None
        })

    except Exception as e:
        error_msg = f"Error getting chord model info: {str(e)}"
        log_error(error_msg)
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500


@chords_bp.route('/api/test-chord-cnn-lstm', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_chord_cnn_lstm():
    """Test Chord-CNN-LSTM model availability"""
    try:
        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Get detector
        detector = chord_service.detectors['chord-cnn-lstm']

        if detector.is_available():
            model_info = detector.get_model_info()
            return jsonify({
                "success": True,
                "model": "Chord-CNN-LSTM",
                "status": "available",
                "message": "Chord-CNN-LSTM model is ready for use",
                "model_info": model_info
            })
        else:
            return jsonify({
                "success": False,
                "model": "Chord-CNN-LSTM",
                "status": "unavailable",
                "error": "Chord-CNN-LSTM model is not available"
            })

    except Exception as e:
        error_msg = f"Error testing Chord-CNN-LSTM: {str(e)}"
        log_error(error_msg)
        return jsonify({
            "success": False,
            "model": "Chord-CNN-LSTM",
            "status": "error",
            "error": error_msg
        }), 500


@chords_bp.route('/api/test-btc-sl', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_btc_sl():
    """Test BTC-SL (Self-Label) model availability"""
    try:
        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Get detector
        detector = chord_service.detectors['btc-sl']

        if detector.is_available():
            model_info = detector.get_model_info()
            return jsonify({
                "success": True,
                "model": "BTC-SL",
                "status": "available",
                "message": "BTC-SL model is ready for use",
                "model_info": model_info
            })
        else:
            return jsonify({
                "success": False,
                "model": "BTC-SL",
                "status": "unavailable",
                "error": "BTC-SL model is not available"
            })

    except Exception as e:
        error_msg = f"Error testing BTC-SL: {str(e)}"
        log_error(error_msg)
        return jsonify({
            "success": False,
            "model": "BTC-SL",
            "status": "error",
            "error": error_msg
        }), 500


@chords_bp.route('/api/test-btc-pl', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_btc_pl():
    """Test BTC-PL (Pseudo-Label) model availability"""
    try:
        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        # Get detector
        detector = chord_service.detectors['btc-pl']

        if detector.is_available():
            model_info = detector.get_model_info()
            return jsonify({
                "success": True,
                "model": "BTC-PL",
                "status": "available",
                "message": "BTC-PL model is ready for use",
                "model_info": model_info
            })
        else:
            return jsonify({
                "success": False,
                "model": "BTC-PL",
                "status": "unavailable",
                "error": "BTC-PL model is not available"
            })

    except Exception as e:
        error_msg = f"Error testing BTC-PL: {str(e)}"
        log_error(error_msg)
        return jsonify({
            "success": False,
            "model": "BTC-PL",
            "status": "error",
            "error": error_msg
        }), 500


@chords_bp.route('/api/test-all-chord-models', methods=['GET'])
@limiter.limit(config.get_rate_limit('test'))
def test_all_chord_models():
    """Test all available chord recognition models"""
    try:
        # Get chord recognition service
        chord_service = current_app.extensions['services']['chord_recognition']

        results = {
            "success": True,
            "models_tested": [],
            "available_models": [],
            "unavailable_models": []
        }

        # Test each detector
        for detector_name in ['chord-cnn-lstm', 'btc-sl', 'btc-pl']:
            detector = chord_service.detectors[detector_name]

            test_result = {
                "name": detector_name,
                "display_name": get_detector_display_name(detector_name),
                "available": detector.is_available()
            }

            if detector.is_available():
                results["available_models"].append(detector_name)
                test_result["status"] = "available"

                # Add model info
                try:
                    model_info = detector.get_model_info()
                    test_result["model_info"] = model_info
                except Exception as e:
                    test_result["info_error"] = str(e)

            else:
                results["unavailable_models"].append(detector_name)
                test_result["status"] = "unavailable"
                test_result["error"] = f"{detector_name} not available"

            results["models_tested"].append(test_result)

        # Add summary
        results["summary"] = {
            "total_models": len(results["models_tested"]),
            "available_count": len(results["available_models"]),
            "unavailable_count": len(results["unavailable_models"]),
            "default_model": results["available_models"][0] if results["available_models"] else "none"
        }

        # Add Spleeter info
        results["spleeter_available"] = chord_service.spleeter_service.is_available()

        return jsonify(results)

    except Exception as e:
        error_msg = f"Error testing chord models: {str(e)}"
        log_error(error_msg)
        return jsonify({
            "success": False,
            "error": error_msg,
            "traceback": traceback.format_exc() if not config.PRODUCTION_MODE else None
        }), 500