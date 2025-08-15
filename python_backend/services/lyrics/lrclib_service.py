"""
LRClib lyrics service for ChordMini Flask application.

This module provides lyrics fetching from LRClib.net API for synchronized lyrics.
"""

import re
import traceback
from typing import Optional, Dict, Any, List
import requests
from utils.logging import log_info, log_error, log_debug


class LRCLibService:
    """Service for fetching synchronized lyrics from LRClib.net API."""

    def __init__(self, config=None):
        """
        Initialize LRClib service.

        Args:
            config: Configuration object (optional)
        """
        self.config = config
        self.base_url = "https://lrclib.net/api"
        self.timeout = 10

    def _parse_lrc_format(self, lrc_content: str) -> List[Dict[str, Any]]:
        """
        Parse LRC format lyrics into structured data.

        LRC format example:
        [00:12.34]Line of lyrics
        [01:23.45]Another line

        Args:
            lrc_content: LRC formatted lyrics string

        Returns:
            List of dictionaries with 'time' (in seconds) and 'text' keys
        """
        if not lrc_content:
            return []

        lines = []
        # Regex to match LRC timestamp format [mm:ss.xx] or [mm:ss]
        timestamp_pattern = r'\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$'

        for line in lrc_content.split('\n'):
            line = line.strip()
            if not line:
                continue

            match = re.match(timestamp_pattern, line)
            if match:
                minutes = int(match.group(1))
                seconds = int(match.group(2))
                milliseconds = int(match.group(3) or 0)

                # Convert to total seconds
                total_seconds = minutes * 60 + seconds + (milliseconds / 1000)

                # Get lyrics text
                lyrics_text = match.group(4).strip()

                lines.append({
                    "time": total_seconds,
                    "text": lyrics_text
                })

        # Sort by time to ensure proper order
        lines.sort(key=lambda x: x['time'])

        return lines

    def fetch_lyrics(self, artist: Optional[str] = None, title: Optional[str] = None, 
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
        try:
            # Prepare search parameters
            search_url = f"{self.base_url}/search"
            
            if artist and title:
                # Use specific artist and title search
                params = {
                    "artist_name": artist,
                    "track_name": title
                }
                log_info(f"Searching LRClib for: '{title}' by '{artist}'")
            else:
                # Use general search query
                params = {
                    "q": search_query
                }
                log_info(f"Searching LRClib for: '{search_query}'")

            # Make API request
            response = requests.get(search_url, params=params, timeout=self.timeout)
            response.raise_for_status()

            search_results = response.json()

            if not search_results or len(search_results) == 0:
                return {
                    "success": False,
                    "error": "No synchronized lyrics found on LRClib",
                    "searched_for": search_query if search_query else f"{title} by {artist}"
                }

            # Get the best match (first result)
            best_match = search_results[0]

            # Check if synchronized lyrics are available
            synced_lyrics = best_match.get('syncedLyrics')
            plain_lyrics = best_match.get('plainLyrics')

            if not synced_lyrics and not plain_lyrics:
                return {
                    "success": False,
                    "error": "No lyrics content found in LRClib result"
                }

            # Parse synchronized lyrics if available
            parsed_lyrics = None
            if synced_lyrics:
                parsed_lyrics = self._parse_lrc_format(synced_lyrics)

            # Prepare response
            response_data = {
                "success": True,
                "has_synchronized": bool(synced_lyrics),
                "synchronized_lyrics": parsed_lyrics,
                "plain_lyrics": plain_lyrics,
                "metadata": {
                    "title": best_match.get('trackName', ''),
                    "artist": best_match.get('artistName', ''),
                    "album": best_match.get('albumName', ''),
                    "duration": best_match.get('duration', 0),
                    "lrclib_id": best_match.get('id'),
                    "instrumental": best_match.get('instrumental', False)
                },
                "source": "lrclib.net"
            }

            log_info(f"Successfully fetched {'synchronized' if synced_lyrics else 'plain'} lyrics for '{best_match.get('trackName')}' by '{best_match.get('artistName')}' from LRClib")
            return response_data

        except requests.exceptions.RequestException as e:
            error_msg = f"Failed to connect to LRClib: {str(e)}"
            log_error(error_msg)
            return {
                "success": False,
                "error": error_msg
            }
        except Exception as e:
            error_msg = f"Failed to process lyrics from LRClib: {str(e)}"
            log_error(f"{error_msg}\n{traceback.format_exc()}")
            return {
                "success": False,
                "error": error_msg
            }
