#!/usr/bin/env python3
"""
ChordMini Backend - Minimal Version for Cloud Deployment Testing
"""

import os
import json
import requests
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize rate limiter
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"]
)

@app.route('/', methods=['GET'])
def home():
    """Health check endpoint"""
    return jsonify({
        'status': 'ChordMini Backend is running',
        'version': '0.1.0-minimal',
        'endpoints': [
            '/api/search-piped',
            '/api/download-quicktube'
        ]
    })

@app.route('/api/search-piped', methods=['GET'])
@limiter.limit("10 per minute")
def search_piped():
    """
    Search YouTube videos using Piped API

    Parameters:
    - q: Search query
    - limit: Maximum number of results (default: 10)

    Returns:
    - JSON with search results in ChordMini format
    """
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        limit = min(int(request.args.get('limit', 10)), 20)  # Cap at 20 results

        print(f"Piped API search for: {query}")

        # Use Piped API for search
        start_time = time.time()
        piped_url = f"https://pipedapi.kavin.rocks/search?q={query}&filter=videos"
        
        response = requests.get(piped_url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        response_time = time.time() - start_time

        if not data.get('items'):
            return jsonify({
                'success': True,
                'items': [],
                'total_results': 0,
                'query': query,
                'source': 'piped_api',
                'response_time': round(response_time, 3)
            })

        # Transform Piped API results to match our format
        items = []
        for item in data['items'][:limit]:
            if item.get('type') == 'stream':  # Only video streams
                transformed_item = {
                    'videoId': item.get('url', '').replace('/watch?v=', ''),
                    'title': item.get('title', ''),
                    'channelTitle': item.get('uploaderName', ''),
                    'channelId': item.get('uploaderUrl', '').replace('/channel/', ''),
                    'duration': str(item.get('duration', 0)),
                    'viewCount': item.get('views', 0),
                    'publishedAt': item.get('uploadedDate', ''),
                    'thumbnails': {
                        'default': {'url': item.get('thumbnail', '')},
                        'medium': {'url': item.get('thumbnail', '')},
                        'high': {'url': item.get('thumbnail', '')}
                    }
                }
                items.append(transformed_item)

        result = {
            'success': True,
            'items': items,
            'total_results': len(items),
            'query': query,
            'source': 'piped_api',
            'response_time': round(response_time, 3)
        }

        print(f"✅ Piped API found {len(items)} results in {response_time:.3f}s")
        return jsonify(result)

    except Exception as e:
        print(f"Error in search_piped endpoint: {e}")
        return jsonify({
            'error': 'Failed to search using Piped API',
            'details': str(e)
        }), 500

@app.route('/api/download-quicktube', methods=['POST'])
@limiter.limit("5 per minute")
def download_quicktube():
    """
    Download audio using QuickTube web service

    Parameters:
    - video_id: YouTube video ID

    Returns:
    - JSON with download URL or error
    """
    try:
        data = request.get_json()
        if not data or 'video_id' not in data:
            return jsonify({"error": "video_id is required"}), 400

        video_id = data['video_id']
        print(f"QuickTube download request for: {video_id}")

        # Use QuickTube web service API
        start_time = time.time()
        quicktube_url = "https://quicktube.app/api/download"
        
        payload = {
            'url': f'https://www.youtube.com/watch?v={video_id}',
            'format': 'mp3'
        }
        
        response = requests.post(quicktube_url, json=payload, timeout=30)
        response_time = time.time() - start_time

        if response.status_code == 200:
            result_data = response.json()
            
            result = {
                'success': True,
                'video_id': video_id,
                'download_url': result_data.get('download_url'),
                'title': result_data.get('title', ''),
                'duration': result_data.get('duration', 0),
                'source': 'quicktube_web',
                'response_time': round(response_time, 3)
            }
            
            print(f"✅ QuickTube download successful in {response_time:.3f}s")
            return jsonify(result)
        else:
            return jsonify({
                'error': 'QuickTube download failed',
                'details': f'HTTP {response.status_code}: {response.text}'
            }), 500

    except Exception as e:
        print(f"Error in download_quicktube endpoint: {e}")
        return jsonify({
            'error': 'Failed to download using QuickTube',
            'details': str(e)
        }), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        'error': 'Rate limit exceeded',
        'message': str(e.description)
    }), 429

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'error': 'Endpoint not found',
        'message': 'The requested endpoint does not exist'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred'
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
