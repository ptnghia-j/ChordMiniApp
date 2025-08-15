"""
Lyrics orchestrator service for ChordMini Flask application.

This module coordinates between different lyrics providers (Genius, LRClib)
and provides a unified interface for lyrics fetching.
"""

from typing import Optional, Dict, Any
from utils.logging import log_info, log_error, log_debug
from .genius_service import GeniusService
from .lrclib_service import LRCLibService


class LyricsOrchestrator:
    """
    Orchestrator service that coordinates between different lyrics providers.
    
    This service provides a unified interface for fetching lyrics from multiple
    providers with fallback strategies and response normalization.
    """

    def __init__(self, config=None):
        """
        Initialize lyrics orchestrator.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self.genius_service = GeniusService(config)
        self.lrclib_service = LRCLibService(config)

    def fetch_from_genius(self, artist: Optional[str] = None, title: Optional[str] = None, 
                         search_query: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch lyrics from Genius.com.

        Args:
            artist: Artist name (optional if search_query provided)
            title: Song title (optional if search_query provided)
            search_query: Custom search query (optional if artist and title provided)

        Returns:
            Dict containing lyrics data or error information
        """
        log_debug(f"Fetching lyrics from Genius: artist={artist}, title={title}, search_query={search_query}")
        
        result = self.genius_service.fetch_lyrics(
            artist=artist,
            title=title,
            search_query=search_query
        )
        
        # Add provider information to result
        if result.get('success'):
            result['provider'] = 'genius'
            result['found'] = True
        else:
            result['provider'] = 'genius'
            result['found'] = False
            
        return result

    def fetch_from_lrclib(self, artist: Optional[str] = None, title: Optional[str] = None, 
                         search_query: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch synchronized lyrics from LRClib.net.

        Args:
            artist: Artist name (optional if search_query provided)
            title: Song title (optional if search_query provided)
            search_query: Custom search query (optional if artist and title provided)

        Returns:
            Dict containing lyrics data or error information
        """
        log_debug(f"Fetching lyrics from LRClib: artist={artist}, title={title}, search_query={search_query}")
        
        result = self.lrclib_service.fetch_lyrics(
            artist=artist,
            title=title,
            search_query=search_query
        )
        
        # Add provider information to result
        if result.get('success'):
            result['provider'] = 'lrclib'
            result['found'] = True
        else:
            result['provider'] = 'lrclib'
            result['found'] = False
            
        return result

    def fetch_with_fallback(self, artist: Optional[str] = None, title: Optional[str] = None, 
                           search_query: Optional[str] = None, 
                           preferred_provider: str = 'genius') -> Dict[str, Any]:
        """
        Fetch lyrics with fallback strategy between providers.

        Args:
            artist: Artist name (optional if search_query provided)
            title: Song title (optional if search_query provided)
            search_query: Custom search query (optional if artist and title provided)
            preferred_provider: Preferred provider to try first ('genius' or 'lrclib')

        Returns:
            Dict containing lyrics data or error information
        """
        log_info(f"Fetching lyrics with fallback: preferred_provider={preferred_provider}")
        
        providers = ['genius', 'lrclib']
        if preferred_provider in providers:
            # Move preferred provider to front
            providers.remove(preferred_provider)
            providers.insert(0, preferred_provider)

        last_error = None
        
        for provider in providers:
            try:
                if provider == 'genius':
                    result = self.fetch_from_genius(artist, title, search_query)
                elif provider == 'lrclib':
                    result = self.fetch_from_lrclib(artist, title, search_query)
                else:
                    continue

                if result.get('success'):
                    log_info(f"Successfully fetched lyrics from {provider}")
                    return result
                else:
                    last_error = result.get('error', f'Unknown error from {provider}')
                    log_debug(f"Failed to fetch from {provider}: {last_error}")

            except Exception as e:
                last_error = f"Error with {provider}: {str(e)}"
                log_error(last_error)
                continue

        # If we get here, all providers failed
        return {
            "success": False,
            "error": f"All lyrics providers failed. Last error: {last_error}",
            "providers_tried": providers,
            "found": False
        }

    def get_available_providers(self) -> Dict[str, bool]:
        """
        Get availability status of all lyrics providers.

        Returns:
            Dict mapping provider names to availability status
        """
        return {
            'genius': self.genius_service._is_available(),
            'lrclib': True  # LRClib doesn't require special dependencies
        }

    def get_provider_info(self) -> Dict[str, Dict[str, Any]]:
        """
        Get information about all lyrics providers.

        Returns:
            Dict containing provider information
        """
        return {
            'genius': {
                'name': 'Genius.com',
                'description': 'Comprehensive lyrics database with metadata',
                'available': self.genius_service._is_available(),
                'features': ['lyrics', 'metadata', 'album_info', 'release_date'],
                'requires_api_key': True
            },
            'lrclib': {
                'name': 'LRClib.net',
                'description': 'Synchronized lyrics database',
                'available': True,
                'features': ['synchronized_lyrics', 'plain_lyrics', 'timing_data'],
                'requires_api_key': False
            }
        }
