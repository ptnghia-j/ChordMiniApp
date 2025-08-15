"""
Audio extraction orchestrator service for ChordMini Flask application.

This module coordinates audio extraction from YouTube videos using
QuickTube and other extraction methods with fallback strategies.
"""

from typing import Dict, Any, Optional
from utils.logging import log_info, log_error, log_debug
from .quicktube_client import QuickTubeClient


class AudioExtractionService:
    """
    Orchestrator service for audio extraction from YouTube videos.
    
    This service provides a unified interface for extracting audio from
    YouTube videos using multiple extraction methods with fallback strategies.
    """

    def __init__(self, config=None):
        """
        Initialize audio extraction service.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self.quicktube_client = QuickTubeClient(config)

    def extract_audio(self, video_id: str, force_refresh: bool = False, 
                     stream_only: bool = True, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Extract audio from YouTube video.

        Args:
            video_id: YouTube video ID
            force_refresh: Force re-extraction even if cached
            stream_only: Return stream URL only
            timeout: Request timeout in seconds

        Returns:
            Dict containing extraction results or error information
        """
        log_info(f"Extracting audio for video: {video_id}, force_refresh={force_refresh}, stream_only={stream_only}")

        try:
            # Use QuickTube as primary extraction method
            result = self.quicktube_client.extract_audio(video_id, timeout)
            
            if result.get('success'):
                log_info(f"Audio extraction successful using QuickTube")
                return result
            else:
                log_error(f"QuickTube extraction failed: {result.get('error')}")
                
                # For now, we only have QuickTube. In the future, add fallback methods here
                return {
                    'success': False,
                    'error': f"Audio extraction failed: {result.get('error', 'Unknown error')}",
                    'method': 'quicktube'
                }

        except Exception as e:
            error_msg = f"Audio extraction service error: {str(e)}"
            log_error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }

    def get_video_info(self, video_id: str) -> Dict[str, Any]:
        """
        Get video information without extracting audio.

        Args:
            video_id: YouTube video ID

        Returns:
            Dict containing video information
        """
        log_info(f"Getting video info for: {video_id}")

        # QuickTube doesn't provide metadata, so return basic info
        return {
            'success': True,
            'title': f'YouTube Video {video_id}',
            'duration': 0,
            'uploader': 'Unknown',
            'description': 'Video info not available with QuickTube',
            'videoId': video_id,
            'method': 'quicktube'
        }

    def get_available_methods(self) -> Dict[str, bool]:
        """
        Get availability status of all extraction methods.

        Returns:
            Dict mapping method names to availability status
        """
        return {
            'quicktube': self.quicktube_client.is_available()
        }

    def get_service_info(self) -> Dict[str, Dict[str, Any]]:
        """
        Get information about all extraction services.

        Returns:
            Dict containing service information
        """
        return {
            'quicktube': self.quicktube_client.get_service_info()
        }

    def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to extraction services.

        Returns:
            Dict containing connection test results
        """
        results = {}
        
        # Test QuickTube
        try:
            quicktube_available = self.quicktube_client.is_available()
            results['quicktube'] = {
                'available': quicktube_available,
                'status': 'online' if quicktube_available else 'offline'
            }
        except Exception as e:
            results['quicktube'] = {
                'available': False,
                'status': 'error',
                'error': str(e)
            }

        return {
            'success': True,
            'services': results,
            'primary_service': 'quicktube'
        }
