"""
QuickTube HTTP client for ChordMini Flask application.

This module provides HTTP client functionality for the QuickTube service
for audio extraction from YouTube videos.
"""

import time
import traceback
from typing import Dict, Any, Optional
import requests
from utils.logging import log_info, log_error, log_debug


class QuickTubeClient:
    """HTTP client for QuickTube audio extraction service."""

    def __init__(self, config=None):
        """
        Initialize QuickTube client.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self.base_url = "https://quicktube.app"
        self.timeout = 60
        self.job_timeout = 10
        self.poll_interval = 6

    def extract_audio(self, video_id: str, timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Extract audio from YouTube video using QuickTube service.

        Args:
            video_id: YouTube video ID
            timeout: Request timeout in seconds (optional)

        Returns:
            Dict containing extraction results or error information
        """
        if timeout is None:
            timeout = self.timeout

        try:
            log_info(f"Starting QuickTube audio extraction for video: {video_id}")

            # Step 1: Create extraction job
            job_id = self._create_job(video_id)
            if not job_id:
                return {
                    'success': False,
                    'error': 'Failed to create QuickTube extraction job'
                }

            log_info(f"QuickTube job created: {job_id}")

            # Step 2: Poll for file availability
            result = self._poll_for_file(video_id, timeout)
            
            if result['success']:
                log_info(f"QuickTube extraction successful: {result['audioUrl']}")
            else:
                log_error(f"QuickTube extraction failed: {result['error']}")

            return result

        except Exception as e:
            error_msg = f"QuickTube extraction failed: {str(e)}"
            log_error(f"{error_msg}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': error_msg
            }

    def _create_job(self, video_id: str) -> Optional[str]:
        """
        Create a QuickTube extraction job.

        Args:
            video_id: YouTube video ID

        Returns:
            Job ID if successful, None otherwise
        """
        try:
            youtube_url = f"https://www.youtube.com/watch?v={video_id}"
            job_url = f"{self.base_url}/download/index"

            response = requests.get(
                job_url,
                params={'link': youtube_url},
                timeout=self.job_timeout,
                headers={
                    'Accept': 'application/json',
                    'User-Agent': 'ChordMini/1.0'
                }
            )
            response.raise_for_status()

            job_data = response.json()
            return job_data.get('jid')

        except Exception as e:
            log_error(f"Failed to create QuickTube job: {str(e)}")
            return None

    def _poll_for_file(self, video_id: str, timeout: int) -> Dict[str, Any]:
        """
        Poll for file availability after job creation.

        Args:
            video_id: YouTube video ID
            timeout: Maximum time to wait in seconds

        Returns:
            Dict containing extraction results
        """
        max_attempts = timeout // self.poll_interval
        
        for attempt in range(max_attempts):
            log_debug(f"QuickTube polling attempt {attempt + 1}/{max_attempts}")

            # Try direct file access
            direct_url = f"{self.base_url}/dl/{video_id}.mp3"
            
            if self._check_file_availability(direct_url):
                return {
                    'success': True,
                    'audioUrl': direct_url,
                    'youtubeEmbedUrl': f'https://www.youtube.com/embed/{video_id}',
                    'streamExpiresAt': int(time.time()) + 3600,  # 1 hour from now
                    'fromCache': False,
                    'method': 'quicktube',
                    'message': 'Extracted audio using QuickTube'
                }

            if attempt < max_attempts - 1:
                time.sleep(self.poll_interval)

        return {
            'success': False,
            'error': f'QuickTube extraction timeout after {timeout} seconds'
        }

    def _check_file_availability(self, url: str) -> bool:
        """
        Check if a file is available at the given URL.

        Args:
            url: URL to check

        Returns:
            bool: True if file is available and valid
        """
        try:
            response = requests.head(
                url,
                timeout=5,
                headers={
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            )

            if response.status_code == 200:
                content_length = response.headers.get('content-length', '0')
                # File should be larger than 1KB to be considered valid
                return int(content_length) > 1000

            return False

        except requests.RequestException:
            return False

    def is_available(self) -> bool:
        """
        Check if QuickTube service is available.

        Returns:
            bool: True if service is available
        """
        try:
            response = requests.head(self.base_url, timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def get_service_info(self) -> Dict[str, Any]:
        """
        Get information about the QuickTube service.

        Returns:
            Dict containing service information
        """
        return {
            'name': 'QuickTube',
            'description': 'Fast YouTube audio extraction service',
            'base_url': self.base_url,
            'available': self.is_available(),
            'features': ['audio_extraction', 'direct_streaming'],
            'timeout': self.timeout
        }
