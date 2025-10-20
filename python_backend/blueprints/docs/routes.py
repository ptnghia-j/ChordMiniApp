"""
Documentation routes for ChordMini Flask application.

This module provides API documentation endpoints.
"""

from flask import Blueprint, jsonify, render_template, request
from extensions import limiter
from config import get_config

# Create blueprint
docs_bp = Blueprint('docs', __name__)

# Get configuration for rate limits
config = get_config()


@docs_bp.route('/docs')
@limiter.limit(config.get_rate_limit('docs'))
def api_docs():
    """Serve API documentation page"""
    return render_template('docs.html')


@docs_bp.route('/api/docs')
@limiter.limit(config.get_rate_limit('docs'))
def api_docs_json():
    """Return API documentation in JSON format"""
    docs = {
        "title": "ChordMini Audio Analysis API",
        "version": "1.0.0",
        "description": "API for audio analysis including beat detection, chord recognition, and lyrics fetching",
        "base_url": request.host_url.rstrip('/'),
        "endpoints": [
            {
                "path": "/",
                "method": "GET",
                "summary": "Health check and API status",
                "description": "Returns the current status of the API and available models",
                "responses": {
                    "200": {
                        "description": "API status information",
                        "example": {
                            "status": "healthy",
                            "message": "Audio analysis API is running",
                            "beat_model": "Beat-Transformer",
                            "chord_model": "Chord-CNN-LSTM",
                            "genius_available": True
                        }
                    }
                }
            },
            {
                "path": "/api/model-info",
                "method": "GET",
                "summary": "Get available models information",
                "description": "Returns detailed information about available beat detection and chord recognition models",
                "responses": {
                    "200": {
                        "description": "Model information",
                        "example": {
                            "success": True,
                            "models": {
                                "beat": [
                                    {
                                        "id": "madmom",
                                        "name": "Madmom",
                                        "description": "Neural network with high accuracy and speed, best for common time signatures (3/4, 4/4)",
                                        "default": True,
                                        "available": True
                                    },
                                    {
                                        "id": "beat-transformer",
                                        "name": "Beat-Transformer",
                                        "description": "DL model with 5-channel audio separation, flexible in time signatures, slow processing speed",
                                        "default": False,
                                        "available": True
                                    }
                                ],
                                "chord": [
                                    {
                                        "id": "chord-cnn-lstm",
                                        "name": "Chord-CNN-LSTM",
                                        "description": "Deep learning model for chord recognition",
                                        "default": True,
                                        "available": True
                                    },
                                    {
                                        "id": "btc-sl",
                                        "name": "BTC SL (Supervised Learning)",
                                        "description": "Transformer-based model with supervised learning",
                                        "default": False,
                                        "available": True
                                    },
                                    {
                                        "id": "btc-pl",
                                        "name": "BTC PL (Pseudo-Label)",
                                        "description": "Transformer-based model with pseudo-labeling",
                                        "default": False,
                                        "available": True
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                "path": "/api/detect-beats",
                "method": "POST",
                "summary": "Detect beats in audio file",
                "description": "Analyze an audio file to detect beat positions and downbeats",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    },
                    "model": {
                        "type": "string",
                        "required": False,
                        "default": "beat-transformer",
                        "options": ["beat-transformer", "madmom"],
                        "description": "Beat detection model to use"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Beat detection results",
                        "example": {
                            "success": True,
                            "beats": [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
                            "downbeats": [0.5, 2.5, 4.5],
                            "total_beats": 8,
                            "total_downbeats": 3,
                            "bpm": 120.0,
                            "time_signature": "4/4",
                            "model_used": "beat-transformer",
                            "model_name": "Beat-Transformer",
                            "processing_time": 2.34,
                            "audio_duration": 4.5
                        }
                    },
                    "400": {
                        "description": "Bad request - missing or invalid audio file"
                    },
                    "500": {
                        "description": "Internal server error during processing"
                    }
                }
            },
            {
                "path": "/api/recognize-chords",
                "method": "POST",
                "summary": "Recognize chords in audio file (Chord-CNN-LSTM)",
                "description": "Analyze an audio file to recognize chord progressions using the Chord-CNN-LSTM model",
                "parameters": {
                    "audio_file": {
                        "type": "file",
                        "required": True,
                        "description": "Audio file (MP3, WAV, FLAC, etc.)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Chord recognition results",
                        "example": {
                            "success": True,
                            "chords": [
                                {"start": 0.0, "end": 2.0, "chord": "C", "confidence": 0.95},
                                {"start": 2.0, "end": 4.0, "chord": "Am", "confidence": 0.87},
                                {"start": 4.0, "end": 6.0, "chord": "F", "confidence": 0.92},
                                {"start": 6.0, "end": 8.0, "chord": "G", "confidence": 0.89}
                            ],
                            "total_chords": 4,
                            "model_used": "chord-cnn-lstm",
                            "model_name": "Chord-CNN-LSTM",
                            "chord_dict": "large_voca",
                            "processing_time": 3.21,
                            "audio_duration": 8.0
                        }
                    }
                }
            },
            {
                "path": "/api/genius-lyrics",
                "method": "POST",
                "summary": "Fetch lyrics from Genius.com",
                "description": "Search and retrieve lyrics from Genius.com using artist and song title. API key is configured server-side.",
                "parameters": {
                    "artist": {
                        "type": "string",
                        "required": True,
                        "description": "Artist name"
                    },
                    "title": {
                        "type": "string",
                        "required": True,
                        "description": "Song title"
                    },
                    "search_query": {
                        "type": "string",
                        "required": False,
                        "description": "Alternative search query (optional, overrides artist/title)"
                    }
                },
                "responses": {
                    "200": {
                        "description": "Lyrics retrieval results",
                        "example": {
                            "success": True,
                            "lyrics": "Hey Jude, don't make it bad...",
                            "metadata": {
                                "title": "Hey Jude",
                                "artist": "The Beatles",
                                "album": "Hey Jude",
                                "genius_url": "https://genius.com/the-beatles-hey-jude-lyrics",
                                "genius_id": 378195,
                                "thumbnail_url": "https://images.genius.com/..."
                            },
                            "source": "genius.com"
                        }
                    },
                    "404": {
                        "description": "Song not found",
                        "example": {
                            "success": False,
                            "error": "Song not found on Genius.com",
                            "searched_for": "Hey Jude by The Beatles"
                        }
                    },
                    "500": {
                        "description": "API key not configured or other server error",
                        "example": {
                            "success": False,
                            "error": "Genius API key not configured. Please set GENIUS_API_KEY environment variable."
                        }
                    }
                }
            }
        ],
        "rate_limits": {
            "description": "Production-grade rate limiting is enforced to ensure fair usage and system stability",
            "storage": "Redis-based in production, in-memory for development",
            "categories": {
                "heavy_processing": {
                    "limit": "2 requests per minute",
                    "endpoints": [
                        "/api/detect-beats",
                        "/api/recognize-chords",
                        "/api/recognize-chords-btc-sl",
                        "/api/recognize-chords-btc-pl",
                        "/api/detect-beats-firebase",
                        "/api/recognize-chords-firebase"
                    ],
                    "description": "CPU-intensive ML model inference endpoints"
                },
                "moderate_processing": {
                    "limit": "10 requests per minute",
                    "endpoints": [
                        "/api/genius-lyrics",
                        "/api/lrclib-lyrics",
                        "/api/search-youtube",
                        "/api/search-piped"
                    ],
                    "description": "External API calls and moderate processing"
                },
                "light_processing": {
                    "limit": "20-50 requests per minute",
                    "endpoints": [
                        "/api/model-info (20/min)",
                        "/ (30/min)",
                        "/docs, /api/docs (50/min)"
                    ],
                    "description": "Information and documentation endpoints"
                },
                "test_endpoints": {
                    "limit": "3-5 requests per minute",
                    "endpoints": [
                        "/api/test-*",
                        "/api/debug-*"
                    ],
                    "description": "Diagnostic and testing endpoints"
                }
            },
            "error_response": {
                "status_code": 429,
                "body": {
                    "error": "Rate limit exceeded",
                    "message": "Too many requests. Please wait before trying again.",
                    "retry_after": "seconds_to_wait"
                }
            }
        }
    }
    return jsonify(docs)