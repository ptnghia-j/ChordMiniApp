'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { chordMappingService } from '@/services/chordMappingService';
import GuitarChordDiagram from '@/components/GuitarChordDiagram';
import { ChordGridContainer } from '@/components/ChordGridContainer';

interface ChordData {
  key: string;
  suffix: string;
  positions: Array<{
    frets: number[];
    fingers: number[];
    baseFret: number;
    barres: number[];
    capo?: boolean;
    midi?: number[];
  }>;
}

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface GuitarChordsTabProps {
  analysisResults: AnalysisResult | null;
  chordGridData: ChordGridData;
  currentBeatIndex: number;
  onBeatClick: (beatIndex: number, timestamp: number) => void;
  className?: string;
  // Additional props needed for ChordGridContainer
  keySignature: string | null;
  isDetectingKey: boolean;
  isChatbotOpen?: boolean;
  isLyricsPanelOpen?: boolean;
  isUploadPage?: boolean;
  // Enharmonic correction props
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;
}

export const GuitarChordsTab: React.FC<GuitarChordsTabProps> = ({
  analysisResults,
  chordGridData,
  currentBeatIndex,
  onBeatClick,
  className = '',
  keySignature,
  isDetectingKey,
  isChatbotOpen = false,
  isLyricsPanelOpen = false,
  isUploadPage = false,
  showCorrectedChords = false,
  chordCorrections = null,
  sequenceCorrections = null
}) => {
  const [viewMode, setViewMode] = useState<'animated' | 'summary'>('animated');
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());
  const [isLoadingChords, setIsLoadingChords] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // Handle window resize for responsive animation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Function to apply enharmonic corrections to chord names
  const applyCorrectedChordName = useCallback((originalChord: string, visualIndex?: number): string => {
    // Early return when corrections are disabled or chord is empty
    if (!showCorrectedChords || !originalChord || originalChord === 'N.C.') {
      return originalChord;
    }

    // Try sequence-based corrections first (more accurate)
    if (sequenceCorrections && visualIndex !== undefined) {
      const { originalSequence, correctedSequence } = sequenceCorrections;

      // Find the chord in the sequence corrections by matching the chord name
      let chordSequenceIndex = visualIndex;
      if (chordGridData.hasPadding) {
        // Remove shift and padding offset to get the actual chord sequence index
        chordSequenceIndex = visualIndex - ((chordGridData.shiftCount || 0) + (chordGridData.paddingCount || 0));
      }

      // Check if we have a valid index and correction
      if (chordSequenceIndex >= 0 &&
          chordSequenceIndex < originalSequence.length &&
          chordSequenceIndex < correctedSequence.length &&
          originalSequence[chordSequenceIndex] === originalChord) {
        return correctedSequence[chordSequenceIndex];
      }
    }

    // Fallback: Use legacy chord-by-chord corrections
    if (chordCorrections) {
      // Extract the root note from the chord
      let rootNote = originalChord;

      // For chords with colon notation (e.g., "C#:maj", "F#:min")
      if (originalChord.includes(':')) {
        rootNote = originalChord.split(':')[0];
      } else {
        // For chords without colon (e.g., "C#m", "F#", "Db7")
        const match = originalChord.match(/^([A-G][#b]?)/);
        if (match) {
          rootNote = match[1];
        }
      }

      // Check if we have a correction for this root note
      if (chordCorrections[rootNote]) {
        const correctedRoot = chordCorrections[rootNote];

        // Replace the root note in the original chord with the corrected one
        if (originalChord.includes(':')) {
          return originalChord.replace(rootNote, correctedRoot);
        } else {
          return originalChord.replace(rootNote, correctedRoot);
        }
      }
    }

    return originalChord;
  }, [showCorrectedChords, chordCorrections, sequenceCorrections, chordGridData.hasPadding, chordGridData.shiftCount, chordGridData.paddingCount]);

  // Helper function to preprocess chord names (remove inversions) before applying corrections
  const preprocessAndCorrectChordName = useCallback((originalChord: string, visualIndex?: number): string => {
    if (!originalChord || originalChord === 'N.C.') {
      return originalChord;
    }

    // First, preprocess to remove inversions (Ab/C → Ab)
    const inversionMatch = originalChord.match(/^([^/]+)\/(.+)$/);
    const preprocessedChord = inversionMatch ? inversionMatch[1].trim() : originalChord;

    // Then apply enharmonic corrections
    return applyCorrectedChordName(preprocessedChord, visualIndex);
  }, [applyCorrectedChordName]);

  // Extract unique chords from the chord grid for summary view
  // FIXED: Only include actual chord predictions from ML model, not padding N.C. labels
  // ENHANCED: Apply enharmonic corrections to chord names
  const uniqueChords = useMemo(() => {
    const chordSet = new Set<string>();

    // Use originalAudioMapping to identify actual chord predictions from ML model
    if (chordGridData.originalAudioMapping && chordGridData.originalAudioMapping.length > 0) {
      // Only include chords that are actual predictions from the ML model
      chordGridData.originalAudioMapping.forEach(mapping => {
        const originalChord = mapping.chord;
        if (originalChord && originalChord !== '' && originalChord !== 'N.C.') {
          // Apply preprocessing (inversion removal) and enharmonic corrections before adding to set
          const processedChord = preprocessAndCorrectChordName(originalChord, mapping.visualIndex);
          chordSet.add(processedChord);
        }
        // Include actual N.C. predictions from the model (not padding)
        else if (originalChord === 'N.C.') {
          chordSet.add(originalChord);
        }
      });
    } else {
      // Fallback: use all chords but exclude padding N.C. labels
      // Skip the first paddingCount + shiftCount chords as they are padding/shift
      const skipCount = (chordGridData.paddingCount || 0) + (chordGridData.shiftCount || 0);
      chordGridData.chords.slice(skipCount).forEach((chord, index) => {
        if (chord && chord !== '') {
          // Apply preprocessing (inversion removal) and enharmonic corrections before adding to set
          const processedChord = preprocessAndCorrectChordName(chord, skipCount + index);
          chordSet.add(processedChord);
        }
      });
    }

    return Array.from(chordSet).sort();
  }, [chordGridData.chords, chordGridData.originalAudioMapping, chordGridData.paddingCount, chordGridData.shiftCount, preprocessAndCorrectChordName]);

  // Load chord data asynchronously
  useEffect(() => {
    const loadChordData = async () => {
      setIsLoadingChords(true);

      setChordDataCache(prevCache => {
        const newCache = new Map(prevCache);

        // Check which chords need to be loaded
        const chordsToLoad: string[] = [];

        // Add unique chords that aren't cached
        for (const chord of uniqueChords) {
          if (!newCache.has(chord)) {
            chordsToLoad.push(chord);
          }
        }

        // Add current chord if not cached (apply corrections first)
        const currentOriginalChord = currentBeatIndex >= 0 && currentBeatIndex < chordGridData.chords.length
          ? chordGridData.chords[currentBeatIndex]
          : null;

        if (currentOriginalChord) {
          const currentProcessedChord = preprocessAndCorrectChordName(currentOriginalChord, currentBeatIndex);
          if (!newCache.has(currentProcessedChord)) {
            chordsToLoad.push(currentProcessedChord);
          }
        }

        // Load chords asynchronously
        if (chordsToLoad.length > 0) {
          Promise.all(
            chordsToLoad.map(async (chord) => {
              try {
                const data = await chordMappingService.getChordData(chord);
                return { chord, data };
              } catch (error) {
                console.error(`Failed to load chord data for ${chord}:`, error);
                return { chord, data: null };
              }
            })
          ).then(results => {
            setChordDataCache(cache => {
              const updatedCache = new Map(cache);
              results.forEach(({ chord, data }) => {
                updatedCache.set(chord, data);
              });
              return updatedCache;
            });
            setIsLoadingChords(false);
          });
        } else {
          setIsLoadingChords(false);
        }

        return newCache;
      });
    };

    if (uniqueChords.length > 0 || currentBeatIndex >= 0) {
      loadChordData();
    }
  }, [uniqueChords, currentBeatIndex, chordGridData.chords, preprocessAndCorrectChordName]);

  // Get chord data for unique chords from cache
  // FIXED: Ensure no duplicates by filtering out null data and deduplicating by chord name
  const uniqueChordData = useMemo(() => {
    const seenChords = new Set<string>();
    const chordDataArray = [];

    for (const chord of uniqueChords) {
      // Skip if we've already seen this chord name
      if (seenChords.has(chord)) {
        continue;
      }

      const data = chordDataCache.get(chord) || null;
      // Only include chords that have valid data or are N.C.
      if (data || chord === 'N.C.') {
        chordDataArray.push({
          name: chord,
          data: data
        });
        seenChords.add(chord);
      }
    }

    return chordDataArray;
  }, [uniqueChords, chordDataCache]);

  // Note: currentChord logic moved to getVisibleChordRange for row-based animated view

  // Get unique chord progression with change points for optimized animation
  // FIXED: Filter out padding N.C. labels, only include actual chord changes
  // ENHANCED: Apply enharmonic corrections to chord names
  const getUniqueChordProgression = useMemo(() => {
    const totalChords = chordGridData.chords.length;
    if (totalChords === 0) return [];

    // Build unique chord progression with change indices
    const uniqueProgression = [];
    let lastChord = null;

    // Skip padding and shift cells when building progression
    const skipCount = (chordGridData.paddingCount || 0) + (chordGridData.shiftCount || 0);

    for (let i = 0; i < totalChords; i++) {
      const originalChord = chordGridData.chords[i] || 'N.C.';

      // Skip empty shift cells and padding N.C. labels
      const isShiftCell = i < (chordGridData.shiftCount || 0) && originalChord === '';
      const isPaddingCell = i >= (chordGridData.shiftCount || 0) &&
                           i < skipCount &&
                           originalChord === 'N.C.' &&
                           chordGridData.hasPadding;

      if (isShiftCell || isPaddingCell) {
        continue;
      }

      if (originalChord !== '' && originalChord !== 'N.C.') {
        // Apply preprocessing (inversion removal) and enharmonic corrections
        const processedChord = preprocessAndCorrectChordName(originalChord, i);

        if (processedChord !== lastChord) {
          uniqueProgression.push({
            chord: processedChord,
            startIndex: i,
            timestamp: chordGridData.beats[i] || 0
          });
          lastChord = processedChord;
        }
      }
    }

    return uniqueProgression;
  }, [chordGridData, preprocessAndCorrectChordName]);

  // Calculate visible chord range for animated view with responsive count
  const getVisibleChordRange = useMemo(() => {
    if (getUniqueChordProgression.length === 0) return [];

    // Find current chord in unique progression
    let currentChordIndex = 0;
    for (let i = 0; i < getUniqueChordProgression.length; i++) {
      if (currentBeatIndex >= getUniqueChordProgression[i].startIndex) {
        currentChordIndex = i;
      } else {
        break;
      }
    }

    // Responsive visible count based on screen size
    // xl: 7 diagrams, lg: 5 diagrams, md: 3 diagrams, sm: 2 diagrams
    const getVisibleCount = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth;
        if (width >= 1280) return 7; // xl
        if (width >= 1024) return 5; // lg
        if (width >= 768) return 3;  // md
        if (width >= 640) return 2;  // sm
        return 1; // xs (mobile)
      }
      return 5; // Default fallback
    };

    const visibleCount = getVisibleCount();

    // Calculate start and end indices in unique progression
    let startIndex = Math.max(0, currentChordIndex - Math.floor(visibleCount / 2));
    const endIndex = Math.min(getUniqueChordProgression.length - 1, startIndex + visibleCount - 1);

    // Adjust start if we're near the end
    if (endIndex - startIndex < visibleCount - 1) {
      startIndex = Math.max(0, endIndex - visibleCount + 1);
    }

    const visibleChords = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const chordInfo = getUniqueChordProgression[i];
      visibleChords.push({
        chord: chordInfo.chord,
        index: chordInfo.startIndex,
        isCurrent: i === currentChordIndex,
        timestamp: chordInfo.timestamp
      });
    }

    return visibleChords;
  }, [getUniqueChordProgression, currentBeatIndex]);

  // Calculate slide offset to keep current chord centered - improved stability
  const getSlideOffset = useCallback(() => {
    if (getVisibleChordRange.length === 0) return 0;

    // Find the current chord index in the visible range
    const currentChordIndex = getVisibleChordRange.findIndex(chord => chord.isCurrent);
    if (currentChordIndex === -1) return 0;

    // Calculate offset to center the current chord
    // Each chord takes approximately 164px (140px width + 24px gap)
    const chordWidth = 164; // Updated for new gap size

    // Use responsive container width with better calculations
    const containerWidth = Math.min(windowWidth - 64, 1200);
    const containerCenter = containerWidth / 2;

    // Calculate the position of the current chord more precisely
    const currentChordPosition = currentChordIndex * chordWidth + (chordWidth / 2);

    // Calculate offset to center the current chord in the container
    const offset = containerCenter - currentChordPosition;

    // Improved clamping logic for smoother edge behavior
    const totalWidth = getVisibleChordRange.length * chordWidth;

    // For small ranges, center the entire group
    if (getVisibleChordRange.length <= 3) {
      return Math.max(0, (containerWidth - totalWidth) / 2);
    }

    // Smooth edge clamping with gradual limits
    const maxOffset = Math.max(0, (totalWidth - containerWidth) / 2);
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offset));

    // Apply smoothing to prevent jarring movements
    return Math.round(clampedOffset * 100) / 100; // Round to 2 decimal places for stability
  }, [getVisibleChordRange, windowWidth]);

  if (!analysisResults) {
    return (
      <div className={`flex items-center justify-center p-8 bg-white dark:bg-content-bg rounded-lg shadow-card transition-colors duration-300 ${className}`}>
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No Analysis Results</p>
          <p className="text-sm">Run chord analysis to see guitar chord diagrams</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`guitar-chords-tab space-y-6 ${className}`}>
      {/* Limited height ChordGridContainer for beat & chord progression */}
      <div className="chord-grid-section">
        {/* Combined header with title and view toggle */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Beat & Chord Progression</h3>
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</span>
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('animated')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                  viewMode === 'animated'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                ✓ Animated
              </button>
              <button
                onClick={() => setViewMode('summary')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                  viewMode === 'summary'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Summary
              </button>
            </div>
          </div>
        </div>

        <div className="chord-grid-window bg-white dark:bg-content-bg rounded-lg overflow-hidden">
          <div className="h-32 sm:h-40 md:h-48 lg:h-56 overflow-y-auto">
            <ChordGridContainer
              analysisResults={analysisResults}
              chordGridData={chordGridData}
              currentBeatIndex={currentBeatIndex}
              keySignature={keySignature}
              isDetectingKey={isDetectingKey}
              isChatbotOpen={isChatbotOpen}
              isLyricsPanelOpen={isLyricsPanelOpen}
              onBeatClick={onBeatClick}
              isUploadPage={isUploadPage}
              showCorrectedChords={showCorrectedChords}
              chordCorrections={chordCorrections}
              sequenceCorrections={sequenceCorrections}
            />
          </div>
        </div>
      </div>

      {/* Guitar Chord Diagrams Section */}
      <div className="chord-diagrams-section">
        {isLoadingChords && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading chord diagrams...</span>
          </div>
        )}

        {!isLoadingChords && viewMode === 'animated' ? (
          // Animated View - Enhanced horizontal sliding chord diagrams with blur effects
          <div className="animated-chord-view">
            {/* Responsive chord diagram container with sliding animation */}
            <div className="chord-diagrams-container relative">
              {/* Horizontal sliding container with blur edges */}
              <div className="relative py-6 overflow-hidden bg-white dark:bg-content-bg">
                {/* Left blur gradient - responsive width */}
                <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-16 md:w-20 lg:w-24 bg-gradient-to-r from-white via-white/70 to-transparent dark:from-content-bg dark:via-content-bg/70 dark:to-transparent z-30 pointer-events-none"></div>

                {/* Right blur gradient - responsive width */}
                <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-16 md:w-20 lg:w-24 bg-gradient-to-l from-white via-white/70 to-transparent dark:from-content-bg dark:via-content-bg/70 dark:to-transparent z-30 pointer-events-none"></div>

                {/* Sliding chord container */}
                <div
                  className="flex items-center justify-center"
                  style={{
                    transform: `translateX(${getSlideOffset()}px)`,
                    transition: 'transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Smooth easing
                    gap: '1.5rem', // Increased gap for better spacing
                    minHeight: '200px', // Ensure consistent height
                    willChange: 'transform', // Optimize for animations
                    backfaceVisibility: 'hidden', // Prevent flickering
                    perspective: '1000px' // Enable 3D acceleration
                  }}
                >
                  {getVisibleChordRange.map((chordInfo, index) => {
                    const chordData = chordDataCache.get(chordInfo.chord) || null;

                    // Calculate distance-based effects
                    const centerIndex = Math.floor(getVisibleChordRange.length / 2);
                    const distanceFromCenter = Math.abs(index - centerIndex);
                    const maxDistance = Math.max(1, centerIndex);

                    // Progressive blur and opacity based on distance - subtle effects for readability
                    const normalizedDistance = distanceFromCenter / maxDistance;
                    const blurAmount = chordInfo.isCurrent ? 0 : Math.min(normalizedDistance * 1, 1); // Reduced to 0-1px range
                    const opacityValue = chordInfo.isCurrent ? 1 : Math.max(0.6, 1 - normalizedDistance * 0.3); // Less opacity reduction
                    const scaleValue = chordInfo.isCurrent ? 1.05 : Math.max(0.95, 1 - normalizedDistance * 0.05); // Subtle scale changes

                    return (
                      <div
                        key={`${chordInfo.index}-${chordInfo.chord}`}
                        className="flex-shrink-0 rounded-lg"
                        style={{
                          filter: `blur(${blurAmount}px)`,
                          opacity: opacityValue,
                          transform: `scale(${scaleValue})`,
                          transition: 'all 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Smooth easing
                          minWidth: '140px', // Ensure consistent spacing
                          zIndex: chordInfo.isCurrent ? 20 : 10,
                          boxShadow: chordInfo.isCurrent ? '0 10px 25px rgba(0, 0, 0, 0.15)' : 'none',
                          backfaceVisibility: 'hidden', // Prevent flickering
                          transformOrigin: 'center center' // Ensure scaling from center
                        }}
                      >
                        <GuitarChordDiagram
                          chordData={chordData}
                          size="large"
                          showChordName={true}
                          className="transition-all duration-500 ease-out"
                          displayName={chordInfo.chord}
                          isFocused={chordInfo.isCurrent}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : !isLoadingChords ? (
          // Summary View - Responsive grid of all unique chords
          <div className="summary-chord-view bg-white dark:bg-content-bg rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-6 text-center">
              All Chords in Song ({uniqueChords.length} unique)
            </h3>

            {/* Enhanced responsive grid matching animated view breakpoints */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-4 sm:gap-5 md:gap-6 justify-items-center">
              {uniqueChordData.map((chord, index) => (
                <div
                  key={index}
                  className="flex justify-center"
                >
                  <GuitarChordDiagram
                    chordData={chord.data}
                    size="medium"
                    showChordName={true}
                    className="hover:scale-105 transition-transform duration-200"
                    displayName={chord.name} // Use corrected chord name for display
                    isFocused={false} // Summary view doesn't have focus states
                  />
                </div>
              ))}
            </div>

            {uniqueChords.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                <div className="max-w-md mx-auto">
                  <Image
                    src="/quarter_rest.svg"
                    alt="No chords"
                    width={64}
                    height={64}
                    className="mx-auto mb-4 opacity-50"
                    style={{ filter: 'brightness(0.4)' }}
                  />
                  <p className="text-lg font-medium">No chords detected in this song</p>
                  <p className="text-sm mt-2">Try running chord analysis to see guitar chord diagrams</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default GuitarChordsTab;
