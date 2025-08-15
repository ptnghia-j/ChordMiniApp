"""
YouTube search service for ChordMini Flask application.

This module provides YouTube search functionality using Piped API
with fallback strategies and response normalization.
"""

import time
import traceback
from typing import Dict, Any, List, Optional
import requests
from utils.logging import log_info, log_error, log_debug


class YouTubeSearchService:
    """Service for searching YouTube videos using Piped API."""

    def __init__(self, config=None):
        """
        Initialize YouTube search service.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self.piped_base_url = "https://pipedapi.kavin.rocks"
        self.timeout = 10

    def search_videos(self, query: str, max_results: int = 8) -> Dict[str, Any]:
        """
        Search for YouTube videos.

        Args:
            query: Search query
            max_results: Maximum number of results to return

        Returns:
            Dict containing search results or error information
        """
        log_info(f"Searching YouTube for: '{query}' (max_results: {max_results})")

        try:
            # Use Piped API for search
            start_time = time.time()
            result = self._search_with_piped_api(query, max_results)
            response_time = time.time() - start_time

            if result['success']:
                result['response_time'] = round(response_time, 3)
                log_info(f"YouTube search successful: found {result['total_results']} results in {response_time:.3f}s")
            else:
                log_error(f"YouTube search failed: {result['error']}")

            return result

        except Exception as e:
            error_msg = f"YouTube search service error: {str(e)}"
            log_error(f"{error_msg}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': error_msg,
                'items': [],
                'total_results': 0
            }

    def _search_with_piped_api(self, query: str, max_results: int) -> Dict[str, Any]:
        """
        Search using Piped API.

        Args:
            query: Search query
            max_results: Maximum number of results

        Returns:
            Dict containing search results
        """
        try:
            search_url = f"{self.piped_base_url}/search"
            params = {
                'q': query,
                'filter': 'videos'
            }

            response = requests.get(search_url, params=params, timeout=self.timeout)
            response.raise_for_status()

            data = response.json()

            if not data.get('items'):
                return {
                    'success': True,
                    'items': [],
                    'total_results': 0,
                    'query': query,
                    'source': 'piped_api'
                }

            # Transform Piped API results to match expected format
            items = self._transform_piped_results(data['items'], max_results)

            return {
                'success': True,
                'items': items,
                'total_results': len(items),
                'query': query,
                'source': 'piped_api'
            }

        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Piped API request failed: {str(e)}',
                'items': [],
                'total_results': 0
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Piped API search failed: {str(e)}',
                'items': [],
                'total_results': 0
            }

    def _transform_piped_results(self, piped_items: List[Dict], max_results: int) -> List[Dict[str, Any]]:
        """
        Transform Piped API results to match expected format.

        Args:
            piped_items: Raw items from Piped API
            max_results: Maximum number of results to return

        Returns:
            List of transformed video items
        """
        items = []
        
        for item in piped_items[:max_results]:
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

        return items

    def is_available(self) -> bool:
        """
        Check if YouTube search service is available.

        Returns:
            bool: True if service is available
        """
        try:
            response = requests.head(self.piped_base_url, timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def get_service_info(self) -> Dict[str, Any]:
        """
        Get information about the YouTube search service.

        Returns:
            Dict containing service information
        """
        return {
            'name': 'YouTube Search via Piped API',
            'description': 'YouTube video search using Piped API',
            'base_url': self.piped_base_url,
            'available': self.is_available(),
            'features': ['video_search', 'metadata_extraction'],
            'timeout': self.timeout
        }

    def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to YouTube search service.

        Returns:
            Dict containing connection test results
        """
        try:
            available = self.is_available()
            return {
                'success': True,
                'available': available,
                'status': 'online' if available else 'offline',
                'service': 'piped_api'
            }
        except Exception as e:
            return {
                'success': False,
                'available': False,
                'status': 'error',
                'error': str(e),
                'service': 'piped_api'
            }
