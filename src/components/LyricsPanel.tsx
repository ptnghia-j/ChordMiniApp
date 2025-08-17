'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- STYLE: Using react-icons for a consistent, modern look ---
import { HiMusicalNote, HiInformationCircle, HiTrash, HiXMark } from 'react-icons/hi2';

import { getCurrentLyricsLine, parseVideoTitle, LRCTimestamp, LRCLibResponse } from '@/services/lrclibService';
import { searchLyricsWithFallback, checkLyricsServicesHealth, LyricsServiceResponse } from '@/services/lyricsService';


interface LyricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  videoTitle?: string;
  currentTime?: number;
  className?: string;
}

const LyricsPanel: React.FC<LyricsPanelProps> = React.memo(({
  isOpen,
  onClose,
  videoTitle = '',
  currentTime = 0,
  className = ''
}) => {
  
  const [lyricsData, setLyricsData] = useState<LyricsServiceResponse | null>(null);
  const [lrclibData, setLrclibData] = useState<LRCLibResponse | null>(null);
  const [enhancedLyricsData, setEnhancedLyricsData] = useState<LyricsServiceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchForSynced, setSearchForSynced] = useState(true);
  const [serviceHealth, setServiceHealth] = useState<{ lrclib: boolean; genius: boolean; overall: boolean } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [displayMode, setDisplayMode] = useState<'sync' | 'static'>('sync');

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      if (videoTitle && !searchQuery) {
        setSearchQuery(videoTitle);
      }
    }
  }, [isOpen, videoTitle, searchQuery]);

  const handleTooltipToggle = (show: boolean) => setShowTooltip(show);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) { setShowTooltip(false); } };
    if (showTooltip) { document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }
  }, [showTooltip]);

  useEffect(() => {
    if (isOpen && !serviceHealth) {
      checkLyricsServicesHealth().then(setServiceHealth);
    }
  }, [isOpen, serviceHealth]);

  const fetchLyrics = async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setLyricsData(null);
    setLrclibData(null);
    setEnhancedLyricsData(null);
    try {
      const parsedTitle = parseVideoTitle(query.trim());
      const enhancedResponse = await searchLyricsWithFallback({ artist: parsedTitle.artist, title: parsedTitle.title, search_query: query.trim(), prefer_synchronized: searchForSynced });
      if (enhancedResponse.success) {
        setEnhancedLyricsData(enhancedResponse);
        if (enhancedResponse.metadata.source === 'lrclib') {
          const legacyResponse: LRCLibResponse = { success: true, has_synchronized: enhancedResponse.has_synchronized, synchronized_lyrics: enhancedResponse.synchronized_lyrics, plain_lyrics: enhancedResponse.plain_lyrics, metadata: { title: enhancedResponse.metadata.title, artist: enhancedResponse.metadata.artist, album: enhancedResponse.metadata.album || '', duration: enhancedResponse.metadata.duration || 0, lrclib_id: 0, instrumental: false }, source: enhancedResponse.source };
          setLrclibData(legacyResponse);
        }
        if (searchForSynced && enhancedResponse.has_synchronized) { setDisplayMode('sync'); } else { setDisplayMode('static'); }
      } else {
        setError(enhancedResponse.error || 'No lyrics found for this search query');
      }
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      setError(`Failed to connect to lyrics services: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => { fetchLyrics(searchQuery); };
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } };
  const clearLyrics = () => { setLyricsData(null); setLrclibData(null); setEnhancedLyricsData(null); setError(null); setSearchQuery(''); };

  const currentLyricsInfo = (() => {
    if (enhancedLyricsData?.synchronized_lyrics) { return getCurrentLyricsLine(enhancedLyricsData.synchronized_lyrics, currentTime); }
    if (lrclibData?.synchronized_lyrics) { return getCurrentLyricsLine(lrclibData.synchronized_lyrics, currentTime); }
    return { currentIndex: -1 };
  })();

  // **Preserved auto-scroll and focus functionality**
  useEffect(() => {
    if ((lrclibData?.has_synchronized || enhancedLyricsData?.has_synchronized) && displayMode === 'sync' && currentLyricsInfo.currentIndex >= 0) {
      const currentElement = document.querySelector(`[data-lyrics-index="${currentLyricsInfo.currentIndex}"]`);
      if (currentElement && lyricsContainerRef.current) {
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLyricsInfo.currentIndex, lrclibData, enhancedLyricsData, displayMode]);

  const formatLyrics = (lyrics: string) => {
    return lyrics.split('\n').map((line, index) => <p key={index} className={`${line.trim() === '' ? 'mb-4' : 'mb-2'} leading-relaxed`}>{line.trim() === '' ? '\u00A0' : line}</p>);
  };

  const renderSynchronizedLyrics = (synchronizedLyrics: LRCTimestamp[]) => {
    return synchronizedLyrics.map((line, index) => {
      const isCurrent = index === currentLyricsInfo.currentIndex;
      const isPast = index < currentLyricsInfo.currentIndex;
      const isUpcoming = index === currentLyricsInfo.currentIndex + 1;
      return (
        <div key={index} data-lyrics-index={index} className={`py-2 px-3 rounded-lg transition-all duration-300 mb-2 ${isCurrent ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-semibold scale-105' : isPast ? 'text-gray-500 dark:text-gray-500' : isUpcoming ? 'text-gray-700 dark:text-gray-300 opacity-80' : 'text-gray-600 dark:text-gray-400 opacity-60'}`}>
          <div className="flex items-start space-x-3"><span className="text-xs text-gray-400 dark:text-gray-500 mt-1 min-w-[3rem]">{Math.floor(line.time / 60)}:{(line.time % 60).toFixed(1).padStart(4, '0')}</span><span className="leading-relaxed">{line.text || '♪'}</span></div>
        </div>
      );
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 bg-black bg-opacity-30 z-[9997] sm:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={`
              fixed z-[9998] flex flex-col
              bg-white dark:bg-content-bg
              border border-neutral-200 dark:border-gray-700
              shadow-2xl rounded-xl
              bottom-16 right-4 w-96 max-w-[calc(100vw-2rem)] h-[calc(100vh-8rem)] max-h-[700px] min-h-[400px]
              sm:bottom-16 sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100vh-8rem)] sm:max-h-[700px] sm:min-h-[400px]
              max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:w-full max-sm:h-[80vh] max-sm:max-h-[80vh] max-sm:min-h-[60vh]
              max-sm:rounded-t-xl max-sm:rounded-b-none
              ${className}
            `}
            initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* --- Header: Original content and structure with new styles --- */}
            <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-3">
                <HiMusicalNote className="h-5 w-5 text-green-500" />
                <h3 className="font-semibold text-neutral-800 dark:text-white text-base">Song Lyrics</h3>
                <div ref={tooltipRef} onMouseLeave={() => handleTooltipToggle(false)}>
                  <button onMouseEnter={() => handleTooltipToggle(true)} onFocus={() => handleTooltipToggle(true)} onBlur={() => handleTooltipToggle(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white"><HiInformationCircle /></button>
                  <AnimatePresence>{showTooltip && 
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-10 mt-2 w-64 p-2 text-xs bg-neutral-800 text-white rounded-lg shadow-lg"> 
                      Synchronized lyrics timing may not be perfectly aligned due to differences between the analyzed audio version and the original song recording. This can occur when using live performances, remixes, or different releases of the same song.
                    </motion.div>}
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* **Preserved small synchronized toggle button** */}
                <button
                  onClick={() => {
                    if (lrclibData?.has_synchronized || enhancedLyricsData?.has_synchronized) { setDisplayMode(displayMode === 'sync' ? 'static' : 'sync'); } 
                    else { setSearchForSynced(!searchForSynced); }
                  }}
                  className={`px-2 py-1 text-xs rounded-full font-medium transition-colors ${(lrclibData?.has_synchronized || enhancedLyricsData?.has_synchronized ? displayMode === 'sync' : searchForSynced) ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'}`}
                >
                  {lrclibData?.has_synchronized || enhancedLyricsData?.has_synchronized ? (displayMode === 'sync' ? "Sync: On" : "Sync: Off") : (searchForSynced ? "Sync: On" : "Sync: Off")}
                </button>
                <button onClick={clearLyrics} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Clear lyrics"><HiTrash className="h-5 w-5" /></button>
                <button onClick={onClose} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close lyrics"><HiXMark className="h-5 w-5" /></button>
              </div>
            </div>

            {/* --- Search Area: Original structure with new styles --- */}
            <div className="p-4 border-b border-neutral-200 dark:border-gray-700 shrink-0">
              <div className="flex gap-2">
                <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleKeyPress} placeholder="Search for song lyrics..." disabled={isLoading} className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-gray-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50" />
                <button onClick={handleSearch} disabled={!searchQuery.trim() || isLoading} className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white disabled:text-neutral-500 dark:disabled:text-neutral-400 rounded-lg transition-colors">
                  {isLoading ? 'Searching...' : 'Search'}
                </button>
              </div>
              {/* **Preserved original lyrics service indicators** */}
              {serviceHealth && (
                <div className="flex items-center space-x-3 text-xs mt-3">
                  <span className="text-neutral-500 dark:text-neutral-400">Services:</span>
                  <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${serviceHealth.lrclib ? 'bg-green-500' : 'bg-red-500'}`}></div><span className="text-neutral-600 dark:text-neutral-300">LRClib</span></div>
                  <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${serviceHealth.genius ? 'bg-green-500' : 'bg-red-500'}`}></div><span className="text-neutral-600 dark:text-neutral-300">Genius</span></div>
                  {enhancedLyricsData?.fallback_used && (<span className="text-yellow-500 dark:text-yellow-400">(Fallback Active)</span>)}
                </div>
              )}
            </div>

            {/* --- Content Area: Original structure with new styles and dark:text-white --- */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading && (<div className="flex justify-center h-full items-center"><div className="w-6 h-6 border-2 border-t-green-500 border-neutral-200 dark:border-neutral-700 rounded-full animate-spin"></div></div>)}
              {error && (<div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-400">{error}</div>)}
              
              {enhancedLyricsData && enhancedLyricsData.metadata.source !== 'lrclib' && (
                <div className="space-y-4" ref={lyricsContainerRef}>
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-gray-700">
                    <h4 className="font-semibold text-neutral-900 dark:text-white">{enhancedLyricsData.metadata.title}</h4>
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">by {enhancedLyricsData.metadata.artist}</p>
                    {enhancedLyricsData.metadata.genius_url && (<a href={enhancedLyricsData.metadata.genius_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View on Genius</a>)}
                  </div>
                  {enhancedLyricsData.plain_lyrics ? (<div className="text-neutral-800 dark:text-white">{formatLyrics(enhancedLyricsData.plain_lyrics)}</div>) : (<p className="text-center text-neutral-500 py-8">No lyrics content available</p>)}
                </div>
              )}
              {lrclibData && (
                <div className="space-y-4" ref={lyricsContainerRef}>
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-gray-700">
                    <h4 className="font-semibold text-neutral-900 dark:text-white">{lrclibData.metadata.title}</h4>
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">by {lrclibData.metadata.artist}</p>
                  </div>
                  {lrclibData.has_synchronized && displayMode === 'sync' && lrclibData.synchronized_lyrics ? (<div className="space-y-1">{renderSynchronizedLyrics(lrclibData.synchronized_lyrics)}</div>) : lrclibData.plain_lyrics ? (<div className="text-neutral-800 dark:text-white">{formatLyrics(lrclibData.plain_lyrics)}</div>) : (<p className="text-center text-neutral-500 py-8">No lyrics content available</p>)}
                </div>
              )}
              
              {!lyricsData && !lrclibData && !isLoading && !error && (<div className="text-center text-neutral-500 dark:text-neutral-500 mt-8"><HiMusicalNote className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Search for song lyrics above</p></div>)}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;