"""SongFormer routes for experimental segmentation inference."""

import os
import time
import traceback
from flask import Blueprint, current_app, jsonify, request
import requests

from config import get_config
from extensions import limiter
from utils.logging import log_error, log_info

songformer_bp = Blueprint('songformer', __name__)
config = get_config()
DEFAULT_CALLBACK_TIMEOUT = int(os.getenv('SONGFORMER_CALLBACK_TIMEOUT', '30'))
DEFAULT_CALLBACK_RETRY_COUNT = max(1, int(os.getenv('SONGFORMER_CALLBACK_RETRY_COUNT', '3')))


def patch_async_job_callback(callback_url: str, payload: dict) -> None:
    """PATCH a segmentation job callback with retry semantics."""
    last_error = None

    for attempt in range(DEFAULT_CALLBACK_RETRY_COUNT):
        try:
            response = requests.patch(
                callback_url,
                json=payload,
                timeout=DEFAULT_CALLBACK_TIMEOUT,
                headers={'Content-Type': 'application/json'},
            )
            response.raise_for_status()
            return
        except Exception as exc:
            last_error = exc
            if attempt < DEFAULT_CALLBACK_RETRY_COUNT - 1:
                time.sleep(min(2 ** attempt, 5))

    raise RuntimeError(
        f'Failed to PATCH async callback after {DEFAULT_CALLBACK_RETRY_COUNT} attempts'
    ) from last_error


def validate_async_job(async_job, audio_url):
    if async_job is None:
        return '', '', '', {}

    if not isinstance(audio_url, str) or not audio_url.strip():
        raise ValueError('audioUrl is required when asyncJob is provided')
    if not isinstance(async_job, dict):
        raise ValueError('asyncJob must be an object')

    job_id = async_job.get('jobId')
    update_token = async_job.get('updateToken')
    callback_url = async_job.get('callbackUrl')
    song_context = async_job.get('songContext')

    if not isinstance(job_id, str) or not job_id.strip():
        raise ValueError('asyncJob.jobId is required')
    if not isinstance(update_token, str) or not update_token.strip():
        raise ValueError('asyncJob.updateToken is required')
    if not isinstance(callback_url, str) or not callback_url.strip():
        raise ValueError('asyncJob.callbackUrl is required')
    if not isinstance(song_context, dict):
        raise ValueError('asyncJob.songContext is required')

    return job_id.strip(), update_token.strip(), callback_url.strip(), song_context


def report_async_failure(payload: dict, error: str) -> None:
    async_job = payload.get('asyncJob') if isinstance(payload, dict) else None
    if not isinstance(async_job, dict):
        return

    callback_url = async_job.get('callbackUrl')
    update_token = async_job.get('updateToken')
    if not isinstance(callback_url, str) or not isinstance(update_token, str):
        return

    try:
        patch_async_job_callback(callback_url.strip(), {
            'updateToken': update_token.strip(),
            'status': 'failed',
            'error': error,
        })
    except Exception:
        log_error('Failed to report async SongFormer failure')
        traceback.print_exc()


def process_async_segmentation_job(
    service,
    audio_url: str,
    update_token: str,
    callback_url: str,
    song_context: dict,
) -> dict:
    patch_async_job_callback(callback_url, {
        'updateToken': update_token,
        'status': 'processing',
    })

    result = service.segment_audio_url(audio_url)
    log_info(f"SongFormer async segmentation completed with {len(result.get('segments', []))} segments")

    patch_async_job_callback(callback_url, {
        'updateToken': update_token,
        'status': 'completed',
        'rawSegments': result.get('segments', []),
        'songContext': song_context,
        'model': result.get('model', 'songformer'),
    })
    return result


@songformer_bp.route('/api/songformer/segment', methods=['POST'])
@limiter.limit(config.get_rate_limit('heavy_processing'))
def segment_songformer():
    """Run experimental SongFormer segmentation for a remote/local audio source."""
    payload = request.get_json(silent=True) or {}
    try:
        audio_url = payload.get('audioUrl')
        if not audio_url or not isinstance(audio_url, str):
            return jsonify({'success': False, 'error': 'audioUrl is required'}), 400

        async_job = payload.get('asyncJob')
        _job_id, update_token, callback_url, song_context = validate_async_job(async_job, audio_url)

        service = current_app.extensions['services'].get('songformer')
        if service is None:
            return jsonify({
                'success': False,
                'error': 'SongFormer service is not available in this environment',
            }), 503

        if async_job is not None:
            result = process_async_segmentation_job(
                service,
                audio_url.strip(),
                update_token,
                callback_url,
                song_context,
            )
            return jsonify({
                'success': True,
                'status': 'completed',
                'jobId': _job_id,
                'segments': len(result.get('segments', [])),
            })

        result = service.segment_audio_url(audio_url)
        log_info(f"SongFormer segmentation completed with {len(result.get('segments', []))} segments")

        return jsonify({'success': True, 'data': result})

    except FileNotFoundError as exc:
        report_async_failure(payload, str(exc))
        return jsonify({'success': False, 'error': str(exc)}), 404
    except ValueError as exc:
        report_async_failure(payload, str(exc))
        return jsonify({'success': False, 'error': str(exc)}), 400
    except requests.RequestException as exc:
        error = f'Failed to download audio source: {exc}'
        report_async_failure(payload, error)
        return jsonify({'success': False, 'error': error}), 502
    except Exception as exc:
        report_async_failure(payload, str(exc))
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
        'endpoint': '/api/songformer/segment',
        'expects': {
            'json': {'audioUrl': 'https://... or /audio/...'},
            'asyncJob': {
                'jobId': 'string',
                'updateToken': 'string',
                'callbackUrl': 'https://...',
                'songContext': 'Song context object',
            },
        },
    })
