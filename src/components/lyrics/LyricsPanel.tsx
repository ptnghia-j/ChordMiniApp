'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { HiMusicalNote, HiInformationCircle, HiTrash, HiXMark } from 'react-icons/hi2';
import { getCurrentLyricsLine, parseVideoTitle, LRCTimestamp, LRCLibResponse } from '@/services/lyrics/lrclibService';
import { searchLyricsWithFallback, type LyricsServiceResponse } from '@/services/lyrics/lyricsService';
import { useEmbeddedPanelHeight } from '@/hooks/ui/useEmbeddedPanelHeight';

interface LyricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  videoTitle?: string;
  currentTime?: number;
  className?: string;
  embedded?: boolean;
}

const FLOATING_PANEL_CLASSES = 'w-[20.5rem] max-w-[calc(100vw-1rem)] h-[calc(100vh-9.85rem)] max-h-[590px] min-h-[340px] max-sm:left-3 max-sm:right-3 max-sm:bottom-[calc(var(--mobile-video-dock-height,0px)+1.35rem)] max-sm:w-auto max-sm:max-w-none max-sm:h-[calc(100vh-var(--mobile-video-dock-height,0px)-9.6rem)] max-sm:max-h-[calc(100vh-var(--mobile-video-dock-height,0px)-9.6rem)] max-sm:min-h-[280px] sm:bottom-16 sm:right-4 sm:w-[20.5rem] sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100vh-9.85rem)] sm:max-h-[590px] sm:min-h-[340px]';

const LyricsPanel: React.FC<LyricsPanelProps> = React.memo(({
  isOpen,
  onClose,
  videoTitle = '',
  currentTime = 0,
  className = '',
  embedded = false
}) => {
  const [lyricsData, setLyricsData] = useState<LyricsServiceResponse | null>(null);
  const [lrclibData, setLrclibData] = useState<LRCLibResponse | null>(null);
  const [enhancedLyricsData, setEnhancedLyricsData] = useState<LyricsServiceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchForSynced, setSearchForSynced] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [displayMode, setDisplayMode] = useState<'sync' | 'static'>('sync');

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const embeddedHeight = useEmbeddedPanelHeight(embedded, panelRef);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      if (videoTitle && !searchQuery) {
        setSearchQuery(videoTitle);
      }
    }
  }, [isOpen, videoTitle, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) setShowTooltip(false);
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
    setEnhancedLyricsData(null);
    try {
      const parsedTitle = parseVideoTitle(query.trim());
      const enhancedResponse = await searchLyricsWithFallback({
        artist: parsedTitle.artist, title: parsedTitle.title,
        search_query: query.trim(), prefer_synchronized: searchForSynced
      });
      if (enhancedResponse.success) {
        setEnhancedLyricsData(enhancedResponse);
        if (enhancedResponse.metadata.source === 'lrclib') {
          const legacyResponse: LRCLibResponse = {
            success: true, has_synchronized: enhancedResponse.has_synchronized,
            synchronized_lyrics: enhancedResponse.synchronized_lyrics,
            plain_lyrics: enhancedResponse.plain_lyrics,
            metadata: {
              title: enhancedResponse.metadata.title, artist: enhancedResponse.metadata.artist,
              album: enhancedResponse.metadata.album || '', duration: enhancedResponse.metadata.duration || 0,
              lrclib_id: 0, instrumental: false
            },
            source: enhancedResponse.source
          };
          setLrclibData(legacyResponse);
        }
        if (searchForSynced && enhancedResponse.has_synchronized) setDisplayMode('sync');
        else setDisplayMode('static');
      } else {
        setError(enhancedResponse.error || 'No lyrics found for this search query');
      }
    } catch (err) {
      console.error('Error fetching lyrics:', err);
      setError(`Failed to connect to lyrics services: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => fetchLyrics(searchQuery);
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } };
  const clearLyrics = () => { setLyricsData(null); setLrclibData(null); setEnhancedLyricsData(null); setError(null); setSearchQuery(''); };

  const hasSynced = lrclibData?.has_synchronized || enhancedLyricsData?.has_synchronized;
  const syncOn = hasSynced ? displayMode === 'sync' : searchForSynced;

  const currentLyricsInfo = (() => {
    if (enhancedLyricsData?.synchronized_lyrics) return getCurrentLyricsLine(enhancedLyricsData.synchronized_lyrics, currentTime);
    if (lrclibData?.synchronized_lyrics) return getCurrentLyricsLine(lrclibData.synchronized_lyrics, currentTime);
    return { currentIndex: -1 };
  })();
  const syncedLyrics = enhancedLyricsData?.synchronized_lyrics || lrclibData?.synchronized_lyrics;

  useEffect(() => {
    if (hasSynced && displayMode === 'sync' && currentLyricsInfo.currentIndex >= 0) {
      const container = lyricsContainerRef.current;
      const el = container?.querySelector(`[data-lyrics-index="${currentLyricsInfo.currentIndex}"]`) as HTMLElement | null;
      if (container && el) {
        const lineCount = syncedLyrics?.length || 0;
        const currentIndex = currentLyricsInfo.currentIndex;
        const containerHeight = container.clientHeight;
        const maxScrollTop = Math.max(0, container.scrollHeight - containerHeight);
        const stickyTitle = container.querySelector('[data-lyrics-sticky-header]') as HTMLElement | null;
        const topSafeArea = (stickyTitle?.offsetHeight || 0) + 12;
        const isNearBottom = lineCount > 0 && currentIndex >= Math.max(0, lineCount - 3);
        const bottomSafeArea = Math.min(140, Math.max(88, containerHeight * 0.28));
        const safeViewportHeight = Math.max(1, containerHeight - topSafeArea - bottomSafeArea);
        const topPinnedTarget = el.offsetTop - topSafeArea;
        const centeredTarget = el.offsetTop - topSafeArea - (safeViewportHeight / 2) + (el.clientHeight / 2);

        let targetScrollTop = 0;

        if (isNearBottom) {
          targetScrollTop = el.offsetTop - (containerHeight - bottomSafeArea - 12) + el.clientHeight;
        } else {
          // Ease from a top-pinned start into the centered reading position
          // instead of switching modes abruptly after the first few lines.
          const transitionStartIndex = 1;
          const transitionEndIndex = 5;
          const transitionProgress = Math.max(
            0,
            Math.min(1, (currentIndex - transitionStartIndex) / (transitionEndIndex - transitionStartIndex))
          );

          targetScrollTop = topPinnedTarget + ((centeredTarget - topPinnedTarget) * transitionProgress);
        }

        container.scrollTo({
          top: Math.min(maxScrollTop, Math.max(0, targetScrollTop)),
          behavior: 'smooth'
        });
      }
    }
  }, [currentLyricsInfo.currentIndex, displayMode, hasSynced, syncedLyrics]);

  const songTitle = enhancedLyricsData?.metadata?.title || lrclibData?.metadata?.title;
  const songArtist = enhancedLyricsData?.metadata?.artist || lrclibData?.metadata?.artist;
  const geniusUrl = enhancedLyricsData?.metadata?.genius_url;

  const hasAnyData = !!(lyricsData || lrclibData || enhancedLyricsData);

  const formatLyrics = (lyrics: string) =>
    lyrics.split('\n').map((line, i) => (
      <p key={i} className={`${line.trim() === '' ? 'mb-4' : 'mb-2'} leading-relaxed`}>
        {line.trim() === '' ? '\u00A0' : line}
      </p>
    ));

  const renderSynchronizedLyrics = (lines: LRCTimestamp[]) =>
    lines.map((line, index) => {
      const isCurrent = index === currentLyricsInfo.currentIndex;
      const isPast = index < currentLyricsInfo.currentIndex;
      return (
        <div
          key={index}
          data-lyrics-index={index}
          className={`flex items-start gap-3 py-2 px-3 rounded-lg transition-all duration-300 ${
            isCurrent
              ? 'border border-green-200/55 bg-green-50/55 dark:border-green-500/10 dark:bg-green-900/25 scale-[1.02]'
              : ''
          }`}
        >
          <span className={`text-[11px] tabular-nums mt-0.5 min-w-[3rem] shrink-0 ${
            isCurrent
              ? 'text-green-600 dark:text-green-400 font-semibold'
              : isPast
                ? 'text-gray-500 dark:text-gray-600'
                : 'text-gray-500 dark:text-gray-500'
          }`}>
            {Math.floor(line.time / 60)}:{(line.time % 60).toFixed(1).padStart(4, '0')}
          </span>
          <span className={`leading-relaxed transition-colors duration-300 ${
            isCurrent
              ? 'text-gray-900 dark:text-white font-semibold'
              : isPast
                ? 'text-gray-500 dark:text-gray-500'
                : 'text-gray-700 dark:text-gray-400'
          }`}>
            {line.text || '♪'}
          </span>
        </div>
      );
    });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {!embedded && (
            <motion.div
              className="fixed inset-0 z-[9997] bg-black/20 backdrop-blur-[1px] sm:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.div
            ref={panelRef}
            className={`
              ${embedded ? 'relative' : 'fixed bottom-16 right-4 max-sm:bottom-0 max-sm:right-0 max-sm:left-0'}
              ${embedded ? '' : 'z-[9998]'}
              relative isolate flex flex-col
              border border-white/45 dark:border-white/12
              shadow-[0_24px_60px_-28px_rgba(15,23,42,0.72)] rounded-xl overflow-hidden
              ${embedded ? 'w-full h-full max-h-none min-h-[400px]' : FLOATING_PANEL_CLASSES}
              ${className}
            `}
            style={embeddedHeight ? { height: `${embeddedHeight}px`, maxHeight: `${embeddedHeight}px`, minHeight: 0 } : undefined}
            initial={embedded ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
            animate={embedded ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={embedded ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/72 backdrop-blur-xl dark:bg-slate-900/42" />

            <div className="relative z-10 flex h-full flex-col">
            {/* Unified top: header + search — no border between them */}
            <div className="shrink-0 space-y-2.5 bg-white/34 px-4 pt-3 pb-3 backdrop-blur-md dark:bg-slate-900/12">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HiMusicalNote className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold text-gray-800 dark:text-white text-base">Song Lyrics</h3>
                  <div ref={tooltipRef} className="relative" onMouseLeave={() => setShowTooltip(false)}>
                    <button
                      onMouseEnter={() => setShowTooltip(true)}
                      onFocus={() => setShowTooltip(true)}
                      onBlur={() => setShowTooltip(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    >
                      <HiInformationCircle className="h-4 w-4" />
                    </button>
                    <AnimatePresence>
                      {showTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="absolute z-10 mt-1 left-0 w-60 p-2.5 text-xs bg-gray-800 text-gray-100 rounded-lg shadow-lg"
                        >
                          Sync timing may differ from the analyzed audio if using a different recording version.
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (hasSynced) setDisplayMode(displayMode === 'sync' ? 'static' : 'sync');
                      else setSearchForSynced(!searchForSynced);
                    }}
                    className={`px-2.5 py-1 text-[11px] rounded-full font-semibold transition-colors ${
                      syncOn
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Sync: {syncOn ? 'On' : 'Off'}
                  </button>
                  <button onClick={clearLyrics} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors" title="Clear">
                    <HiTrash className="h-4 w-4" />
                  </button>
                  <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors" aria-label="Close">
                    <HiXMark className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Search for song lyrics..."
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-black/5 bg-white/72 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-green-500/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder-gray-500"
                />
                <Button
                  size="sm"
                  color="success"
                  isDisabled={!searchQuery.trim() || isLoading}
                  isLoading={isLoading}
                  onPress={handleSearch}
                  className="font-semibold px-4"
                >
                  Search
                </Button>
              </div>
            </div>

            {/* Scrollable content */}
            <div ref={lyricsContainerRef} className="relative flex-1 overflow-y-auto overscroll-contain">
              {/* Song title — sticky with subtle backdrop blur only */}
              {(songTitle || songArtist) && (
                <div data-lyrics-sticky-header className="sticky top-0 z-10 isolate overflow-hidden border-b border-white/20 dark:border-white/5">
                  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-white/55 backdrop-blur-xl dark:bg-slate-950/30" />
                  <div className="px-4 pt-2 pb-1.5">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{songTitle}</h4>
                    {songArtist && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">by {songArtist}</p>}
                    {geniusUrl && (
                      <a href={geniusUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">
                        View on Genius
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Lyrics content */}
              <div className={`px-4 ${displayMode === 'sync' && syncedLyrics ? 'pt-2 pb-28' : 'pb-4'}`}>
                {/* Loading */}
                {isLoading && (
                  <div className="flex justify-center items-center py-16">
                    <div className="w-6 h-6 border-2 border-t-green-500 border-gray-200 dark:border-gray-700 rounded-full animate-spin" />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {/* Genius / non-lrclib plain lyrics */}
                {enhancedLyricsData && enhancedLyricsData.metadata.source !== 'lrclib' && (
                  <div className="text-gray-800 dark:text-gray-200 text-sm">
                    {enhancedLyricsData.plain_lyrics
                      ? formatLyrics(enhancedLyricsData.plain_lyrics)
                      : <p className="text-center text-gray-400 py-8">No lyrics content available</p>
                    }
                  </div>
                )}

                {/* LRClib lyrics — synced or plain */}
                {lrclibData && (
                  <div className="space-y-0.5">
                    {lrclibData.has_synchronized && displayMode === 'sync' && syncedLyrics
                      ? renderSynchronizedLyrics(syncedLyrics)
                      : lrclibData.plain_lyrics
                        ? <div className="text-gray-800 dark:text-gray-200 text-sm">{formatLyrics(lrclibData.plain_lyrics)}</div>
                        : <p className="text-center text-gray-400 py-8">No lyrics content available</p>
                    }
                  </div>
                )}

                {/* Empty state */}
                {!hasAnyData && !isLoading && !error && (
                  <div className="text-center text-gray-400 dark:text-gray-500 pt-12">
                    <HiMusicalNote className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Search for song lyrics above</p>
                  </div>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;
