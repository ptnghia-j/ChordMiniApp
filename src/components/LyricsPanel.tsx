'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchLRCLibLyrics, getCurrentLyricsLine, parseVideoTitle, LRCTimestamp, LRCLibResponse } from '@/services/lrclibService';

interface LyricsMetadata {
  title: string;
  artist: string;
  album?: string;
  release_date?: string;
  genius_url: string;
  genius_id: number;
  thumbnail_url?: string;
}

interface LyricsData {
  lyrics: string;
  metadata: LyricsMetadata;
  source: string;
}

interface LyricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  videoTitle?: string;
  currentTime?: number; // Current playback time for synchronized lyrics
  className?: string;
}

/**
 * Lyrics panel component that displays lyrics from Genius.com
 * Uses the same UI pattern as the chatbot interface with right-side panel layout
 */
const LyricsPanel: React.FC<LyricsPanelProps> = ({
  isOpen,
  onClose,
  videoTitle = '',
  currentTime = 0,
  className = ''
}) => {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [lrclibData, setLrclibData] = useState<LRCLibResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchForSynced, setSearchForSynced] = useState(true); // Toggle for synchronized lyrics search
  const [showTooltip, setShowTooltip] = useState(false); // State for tooltip visibility
  const [displayMode, setDisplayMode] = useState<'sync' | 'static'>('sync'); // Display mode toggle

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      // Pre-fill with video title if available
      if (videoTitle && !searchQuery) {
        setSearchQuery(videoTitle);
      }
    }
  }, [isOpen, videoTitle, searchQuery]);

  // Handle tooltip visibility with keyboard support
  const handleTooltipToggle = (show: boolean) => {
    setShowTooltip(show);
  };

  // Handle keyboard navigation for tooltip
  const handleTooltipKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowTooltip(!showTooltip);
    } else if (e.key === 'Escape') {
      setShowTooltip(false);
    }
  };

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTooltip]);

  const fetchLyrics = async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setLyricsData(null);
    setLrclibData(null);

    try {
      if (searchForSynced) {
        // Try LRClib first for synchronized lyrics
        try {
          const parsedTitle = parseVideoTitle(query.trim());
          const lrclibResponse = await searchLRCLibLyrics(parsedTitle);

          if (lrclibResponse.success && lrclibResponse.has_synchronized) {
            setLrclibData(lrclibResponse);
            setDisplayMode('sync');
            return; // Success with synchronized lyrics
          } else if (lrclibResponse.success && lrclibResponse.plain_lyrics) {
            setLrclibData(lrclibResponse);
            setDisplayMode('static');
            return; // Success with plain lyrics from LRClib
          }
        } catch (lrclibError) {
          console.warn('LRClib search failed, falling back to Genius:', lrclibError);
          console.warn('LRClib error details:', lrclibError instanceof Error ? lrclibError.message : String(lrclibError));
        }
      }

      // Fallback to Genius.com or if synchronized search is disabled
      const response = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app'}/api/genius-lyrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search_query: query.trim()
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLyricsData(data);
        setDisplayMode('static');
      } else {
        setError(data.error || 'Failed to fetch lyrics');
      }
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
      setError(`Failed to connect to lyrics service: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    fetchLyrics(searchQuery);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const clearLyrics = () => {
    setLyricsData(null);
    setLrclibData(null);
    setError(null);
    setSearchQuery('');
  };

  // Get current lyrics line for synchronized display
  const currentLyricsInfo = lrclibData?.synchronized_lyrics
    ? getCurrentLyricsLine(lrclibData.synchronized_lyrics, currentTime)
    : { currentIndex: -1 };

  // Auto-scroll to current lyrics line
  useEffect(() => {
    if (lrclibData?.has_synchronized && displayMode === 'sync' && currentLyricsInfo.currentIndex >= 0) {
      const currentElement = document.querySelector(`[data-lyrics-index="${currentLyricsInfo.currentIndex}"]`);
      if (currentElement && lyricsContainerRef.current) {
        currentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentLyricsInfo.currentIndex, lrclibData?.has_synchronized, displayMode]);

  // Format lyrics for display
  const formatLyrics = (lyrics: string) => {
    return lyrics.split('\n').map((line, index) => (
      <p key={index} className={`${line.trim() === '' ? 'mb-4' : 'mb-2'} leading-relaxed`}>
        {line.trim() === '' ? '\u00A0' : line}
      </p>
    ));
  };

  // Render synchronized lyrics with highlighting
  const renderSynchronizedLyrics = (synchronizedLyrics: LRCTimestamp[]) => {
    return synchronizedLyrics.map((line, index) => {
      const isCurrent = index === currentLyricsInfo.currentIndex;
      const isPast = index < currentLyricsInfo.currentIndex;
      const isUpcoming = index === currentLyricsInfo.currentIndex + 1;

      return (
        <div
          key={index}
          data-lyrics-index={index}
          className={`
            py-2 px-3 rounded-lg transition-all duration-300 mb-2
            ${isCurrent
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-semibold scale-105'
              : isPast
                ? 'text-gray-500 dark:text-gray-500'
                : isUpcoming
                  ? 'text-gray-700 dark:text-gray-300 opacity-80'
                  : 'text-gray-600 dark:text-gray-400 opacity-60'
            }
          `}
        >
          <div className="flex items-start space-x-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 min-w-[3rem]">
              {Math.floor(line.time / 60)}:{(line.time % 60).toFixed(1).padStart(4, '0')}
            </span>
            <span className="leading-relaxed">{line.text || '♪'}</span>
          </div>
        </div>
      );
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`
            fixed z-[9998]
            bg-white dark:bg-content-bg rounded-lg shadow-2xl
            border border-gray-200 dark:border-gray-700
            flex flex-col

            /* Desktop positioning and sizing - same as ChatbotInterface */
            bottom-16 right-4
            w-96 max-w-[calc(100vw-2rem)]
            h-[calc(100vh-6rem)] max-h-[800px] min-h-[400px]

            /* Mobile responsive - full screen on small devices */
            sm:bottom-16 sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)]
            sm:h-[calc(100vh-6rem)] sm:max-h-[800px] sm:min-h-[400px]

            /* Mobile full screen */
            max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:top-0
            max-sm:w-full max-sm:h-full max-sm:max-h-none max-sm:min-h-0
            max-sm:rounded-none

            ${className}
          `}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm sm:text-base">Song Lyrics</h3>
              {/* Sync status indicator */}
              {lrclibData?.has_synchronized && displayMode === 'sync' && (
                <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                  Synchronized
                </span>
              )}
              {(lyricsData || (lrclibData && !lrclibData.has_synchronized)) && displayMode === 'static' && (
                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                  Static
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={clearLyrics}
                className="
                  p-2 sm:p-1 rounded-lg text-gray-500 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  transition-colors duration-200
                "
                title="Clear lyrics"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="
                  p-2 sm:p-1 rounded-lg text-gray-500 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  transition-colors duration-200
                "
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex space-x-2 mb-3">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search for song lyrics..."
                disabled={isLoading}
                className="
                  flex-1 px-3 py-2 text-sm
                  border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-700
                  text-gray-800 dark:text-gray-200
                  placeholder-gray-500 dark:placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-green-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isLoading}
                className="
                  px-4 py-2 text-sm font-medium
                  bg-green-600 hover:bg-green-700 disabled:bg-gray-400
                  text-white rounded-lg
                  transition-colors duration-200
                  disabled:cursor-not-allowed
                "
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Search options */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={searchForSynced}
                  onChange={(e) => setSearchForSynced(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Search for synchronized lyrics</span>
              </label>

              {/* Display mode toggle for synchronized lyrics */}
              {lrclibData?.has_synchronized && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setDisplayMode(displayMode === 'sync' ? 'static' : 'sync')}
                    className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  >
                    {displayMode === 'sync' ? 'Switch to Static' : 'Switch to Sync'}
                  </button>

                  {/* Information icon with tooltip */}
                  <div className="relative" ref={tooltipRef}>
                    <button
                      onMouseEnter={() => handleTooltipToggle(true)}
                      onMouseLeave={() => handleTooltipToggle(false)}
                      onFocus={() => handleTooltipToggle(true)}
                      onBlur={() => handleTooltipToggle(false)}
                      onKeyDown={handleTooltipKeyDown}
                      className="
                        p-1 rounded-full text-blue-600 dark:text-blue-400
                        hover:bg-blue-50 dark:hover:bg-blue-900/20
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                        transition-colors duration-200
                      "
                      aria-label="Information about synchronized lyrics timing"
                      aria-describedby="sync-tooltip"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </button>

                    {/* Tooltip */}
                    <AnimatePresence>
                      {showTooltip && (
                        <motion.div
                          id="sync-tooltip"
                          role="tooltip"
                          initial={{ opacity: 0, scale: 0.95, y: 5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 5 }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className="
                            absolute bottom-full right-0 mb-2 z-50
                            w-64 p-3 text-xs
                            bg-blue-50 dark:bg-blue-900/90
                            border border-blue-200 dark:border-blue-700
                            text-blue-800 dark:text-blue-200
                            rounded-lg shadow-lg
                            backdrop-blur-sm
                          "
                          style={{
                            transform: 'translateX(50%)',
                            maxWidth: 'calc(100vw - 2rem)'
                          }}
                        >
                          <div className="relative">
                            <p className="leading-relaxed">
                              Synchronized lyrics timing may not be perfectly aligned due to differences between the analyzed audio version and the original song recording. This can occur when using live performances, remixes, or different releases of the same song.
                            </p>
                            {/* Tooltip arrow */}
                            <div className="
                              absolute top-full right-1/2 transform translate-x-1/2
                              w-0 h-0 border-l-4 border-r-4 border-t-4
                              border-l-transparent border-r-transparent
                              border-t-blue-200 dark:border-t-blue-700
                            "></div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* LRClib lyrics display */}
            {lrclibData && (
              <div className="space-y-4">
                {/* Song metadata */}
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">{lrclibData.metadata.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">by {lrclibData.metadata.artist}</p>
                  {lrclibData.metadata.album && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">Album: {lrclibData.metadata.album}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      Source: LRClib.net
                    </span>
                    {lrclibData.metadata.duration > 0 && (
                      <span className="text-xs text-gray-500">
                        Duration: {Math.floor(lrclibData.metadata.duration / 60)}:{(lrclibData.metadata.duration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Lyrics content */}
                <div ref={lyricsContainerRef} className="prose prose-sm dark:prose-invert max-w-none">
                  {lrclibData.has_synchronized && displayMode === 'sync' && lrclibData.synchronized_lyrics ? (
                    <div className="space-y-1">
                      {renderSynchronizedLyrics(lrclibData.synchronized_lyrics)}
                    </div>
                  ) : lrclibData.plain_lyrics ? (
                    <div className="text-gray-800 dark:text-gray-200 leading-relaxed">
                      {formatLyrics(lrclibData.plain_lyrics)}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                      <p className="text-sm">No lyrics content available</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Genius lyrics display */}
            {lyricsData && (
              <div className="space-y-4">
                {/* Song metadata */}
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">{lyricsData.metadata.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">by {lyricsData.metadata.artist}</p>
                  {lyricsData.metadata.album && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">Album: {lyricsData.metadata.album}</p>
                  )}
                  <a
                    href={lyricsData.metadata.genius_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 dark:text-green-400 hover:underline"
                  >
                    View on Genius.com
                  </a>
                </div>

                {/* Lyrics content */}
                <div ref={lyricsContainerRef} className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="text-gray-800 dark:text-gray-200 leading-relaxed">
                    {formatLyrics(lyricsData.lyrics)}
                  </div>
                </div>
              </div>
            )}

            {!lyricsData && !lrclibData && !isLoading && !error && (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm">Search for song lyrics above</p>
                <p className="text-xs mt-1">Powered by LRClib.net & Genius.com</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LyricsPanel;
