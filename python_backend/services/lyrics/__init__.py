"""
Lyrics services package for ChordMini Flask application.

This package provides lyrics fetching services from multiple providers
including Genius and LRClib with fallback strategies.
"""

from .orchestrator import LyricsOrchestrator
from .genius_service import GeniusService
from .lrclib_service import LRCLibService

__all__ = ['LyricsOrchestrator', 'GeniusService', 'LRCLibService']
