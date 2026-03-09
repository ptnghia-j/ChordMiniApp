"""SongFormer routes for experimental segmentation inference."""

import traceback
from flask import Blueprint, current_app, jsonify, request

from config import get_config
from extensions import limiter
from utils.logging import log_error, log_info

songformer_bp = Blueprint('songformer', __name__)
config = get_config()


@songformer_bp.route('/api/songformer/segment', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def segment_songformer():
    """Run experimental SongFormer segmentation for a remote/local audio source."""
    try:
        payload = request.get_json(silent=True) or {}
        audio_url = payload.get('audioUrl')
        if not audio_url or not isinstance(audio_url, str):
            return jsonify({'success': False, 'error': 'audioUrl is required'}), 400

        service = current_app.extensions['services'].get('songformer')
        if service is None:
            return jsonify({
                'success': False,
                'error': 'SongFormer service is not available in this environment',
            }), 503

        result = service.segment_audio_url(audio_url)
        log_info(f"SongFormer segmentation completed with {len(result.get('segments', []))} segments")
        return jsonify({'success': True, 'data': result})

    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        log_error(f"SongFormer segmentation failed: {exc}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


@songformer_bp.route('/api/songformer/info', methods=['GET'])
def songformer_info():
    """Return basic availability information for the experimental SongFormer route."""
    service = current_app.extensions['services'].get('songformer')
    return jsonify({
        'name': 'SongFormer experimental backend',
        'available': service is not None,
        'description': 'Audio-backed structural segmentation prototype used as a fallback/experimental engine.',
    })