"""
Genius lyrics service for ChordMini Flask application.

This module provides lyrics fetching from Genius.com API using the lyricsgenius library.
"""

import os
import traceback
from typing import Optional, Dict, Any
from flask import request
from utils.logging import log_info, log_error, log_debug


class GeniusService:
    """Service for fetching lyrics from Genius.com API."""

    def __init__(self, config=None):
        """
        Initialize Genius service.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self._genius_client = None
        self._api_key = None

    def _get_api_key(self) -> Optional[str]:
        """
        Get Genius API key from custom header or environment.

        Returns:
            str: API key if available, None otherwise
        """
        # Try custom header first (forwarded from frontend)
        api_key = request.headers.get('X-Genius-API-Key') if request else None
        
        # Fall back to environment variable
        if not api_key:
            api_key = os.environ.get('GENIUS_API_KEY')
            
        return api_key

    def _is_available(self) -> bool:
        """
        Check if Genius service is available.

        Returns:
            bool: True if service is available
        """
        try:
            import lyricsgenius
            api_key = self._get_api_key()
            return bool(api_key)
        except ImportError:
            return False

    def _get_genius_client(self):
        """
        Get or create Genius client instance.

        Returns:
            lyricsgenius.Genius: Configured Genius client

        Raises:
            Exception: If client cannot be created
        """
        if self._genius_client is None:
            api_key = self._get_api_key()
            if not api_key:
                raise Exception("Genius API key not configured. Please set GENIUS_API_KEY environment variable or pass it via X-Genius-API-Key header.")

            try:
                import lyricsgenius
                self._genius_client = lyricsgenius.Genius(api_key)
                
                # Configure client settings
                self._genius_client.verbose = False  # Turn off status messages
                self._genius_client.remove_section_headers = True  # Remove [Verse], [Chorus], etc.
                self._genius_client.skip_non_songs = True  # Skip non-song results
                self._genius_client.excluded_terms = ["(Remix)", "(Live)", "(Acoustic)", "(Demo)"]  # Skip remixes, live versions, etc.
                
                self._api_key = api_key
                
            except ImportError:
                raise Exception("Genius lyrics service is not available. Please install lyricsgenius library.")

        return self._genius_client

    def _clean_lyrics_text(self, lyrics_text: str) -> str:
        """
        Clean up lyrics text from Genius.

        Args:
            lyrics_text: Raw lyrics text from Genius

        Returns:
            str: Cleaned lyrics text
        """
        if not lyrics_text:
            return ""

        # Remove common artifacts
        lyrics_text = lyrics_text.replace("\\n", "\n")
        lyrics_text = lyrics_text.replace("\\", "")

        # Remove "Lyrics" from the beginning if present
        if lyrics_text.startswith("Lyrics\n"):
            lyrics_text = lyrics_text[7:]

        # Remove contributor info and song description at the beginning
        lines = lyrics_text.split('\n')
        cleaned_lines = []
        skip_intro = True

        for line in lines:
            # Skip lines until we find the actual lyrics (usually after "Read More" or empty lines)
            if skip_intro:
                if ('Read More' in line or
                    line.strip() == '' or
                    (len(line) > 20 and not any(word in line.lower() for word in ['contributors', 'translations', 'lyrics', 'read more']))):
                    skip_intro = False
                    if line.strip() != '' and 'Read More' not in line:
                        cleaned_lines.append(line)
                continue

            # Skip lines that look like embed info at the end
            if 'Embed' in line and len(line) < 20:
                break

            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines).strip()

    def fetch_lyrics(self, artist: Optional[str] = None, title: Optional[str] = None, 
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
        if not self._is_available():
            return {
                "success": False,
                "error": "Genius lyrics service is not available. Please install lyricsgenius library."
            }

        try:
            genius = self._get_genius_client()

            # Search for the song
            song = None
            if search_query:
                # Use custom search query
                log_info(f"Searching Genius for: '{search_query}'")
                song = genius.search_song(search_query)
            else:
                # Use artist and title
                log_info(f"Searching Genius for: '{title}' by '{artist}'")
                song = genius.search_song(title, artist)

            if not song:
                return {
                    "success": False,
                    "error": "Song not found on Genius.com",
                    "searched_for": search_query if search_query else f"{title} by {artist}"
                }

            # Extract and clean lyrics
            lyrics_text = self._clean_lyrics_text(song.lyrics if song.lyrics else "")

            # Prepare response with safe serialization
            album_info = getattr(song, 'album', None)
            album_name = None
            if album_info:
                # Handle both string and Album object cases
                if hasattr(album_info, 'name'):
                    album_name = album_info.name
                elif isinstance(album_info, str):
                    album_name = album_info
                else:
                    album_name = str(album_info) if album_info else None

            response_data = {
                "success": True,
                "lyrics": lyrics_text,
                "metadata": {
                    "title": song.title,
                    "artist": song.artist,
                    "album": album_name,
                    "release_date": getattr(song, 'release_date', None),
                    "genius_url": song.url,
                    "genius_id": song.id,
                    "thumbnail_url": getattr(song, 'song_art_image_thumbnail_url', None)
                },
                "source": "genius.com"
            }

            log_info(f"Successfully fetched lyrics for '{song.title}' by '{song.artist}' from Genius")
            return response_data

        except Exception as e:
            error_msg = f"Failed to fetch lyrics from Genius: {str(e)}"
            log_error(f"{error_msg}\n{traceback.format_exc()}")
            return {
                "success": False,
                "error": error_msg
            }
