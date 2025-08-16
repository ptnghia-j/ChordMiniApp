'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { chordMappingService } from '@/services/chordMappingService';
import { ChordGridContainer } from '@/components/ChordGridContainer';
import { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationColorForBeat } from '@/utils/segmentationColors';


// Lazy load heavy guitar chord diagram component
const GuitarChordDiagram = dynamic(() => import('@/components/GuitarChordDiagram'), {
  loading: () => <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg" />,
  ssr: false
});

interface ChordData {
  key: string;
  suffix:string;
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
  keySignature: string | null;
  isDetectingKey: boolean;
  isChatbotOpen?: boolean;
  isLyricsPanelOpen?: boolean;
  isUploadPage?: boolean;
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
  // Segmentation props for synchronized color overlay
  segmentationData?: SegmentationResult | null;
  showSegmentation?: boolean;
  // Roman numeral analysis props
  showRomanNumerals?: boolean;
  romanNumeralData?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
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
  sequenceCorrections = null,
  segmentationData = null,
  showSegmentation = false,
  showRomanNumerals = false,
  romanNumeralData = null
}) => {
  const [viewMode, setViewMode] = useState<'animated' | 'summary'>('animated');
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());
  const [isLoadingChords, setIsLoadingChords] = useState<boolean>(false);




  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [chordPositions, setChordPositions] = useState<Map<string, number>>(new Map()); // Track position for each chord

  // Handle chord position changes
  const handlePositionChange = useCallback((chordName: string, positionIndex: number) => {
    setChordPositions(prev => new Map(prev.set(chordName, positionIndex)));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  // Chord correction for guitar diagrams (always applies corrections when available for consistent display)
  const applyCorrectedChordNameForGuitarDiagrams = useCallback((originalChord: string, visualIndex?: number): string => {
    if (!showCorrectedChords || !originalChord || originalChord === 'N.C.') return originalChord;

    if (sequenceCorrections && visualIndex !== undefined) {
      const { originalSequence, correctedSequence } = sequenceCorrections;
      let chordSequenceIndex = visualIndex;
      if (chordGridData.hasPadding) {
        chordSequenceIndex -= ((chordGridData.shiftCount || 0) + (chordGridData.paddingCount || 0));
      }

      // First try exact index matching
      if (chordSequenceIndex >= 0 && chordSequenceIndex < originalSequence.length && originalSequence[chordSequenceIndex] === originalChord) {
        return correctedSequence[chordSequenceIndex];
      }

      // If exact index matching fails, look for the chord anywhere in the original sequence
      // This ensures consistent corrections for the same chord throughout the progression
      const correctionIndex = originalSequence.findIndex(chord => chord === originalChord);
      if (correctionIndex !== -1 && correctionIndex < correctedSequence.length) {
        return correctedSequence[correctionIndex];
      }
    }

    if (chordCorrections) {
      const rootNote = originalChord.includes(':') ? originalChord.split(':')[0] : (originalChord.match(/^([A-G][#b]?)/)?.[1] || originalChord);
      if (chordCorrections[rootNote]) return originalChord.replace(rootNote, chordCorrections[rootNote]);
    }
    return originalChord;
  }, [showCorrectedChords, chordCorrections, sequenceCorrections, chordGridData.hasPadding, chordGridData.shiftCount, chordGridData.paddingCount]);



  // Helper function to extract root chord for guitar diagram lookup (strips bass note)
  const getRootChordForDiagramLookup = useCallback((chordName: string): string => {
    if (!chordName || chordName === 'N.C.' || chordName === 'N' || chordName === 'N/C' || chordName === 'NC') {
      return chordName;
    }
    // Strip inversion/bass note for guitar diagram lookup (C/E → C, C/G → C)
    // This ensures we get playable root position chord diagrams
    return chordName.split('/')[0].trim();
  }, []);

  const preprocessAndCorrectChordNameForGuitarDiagrams = useCallback((originalChord: string, visualIndex?: number): string => {
    // Normalize all "no chord" representations to a single canonical form
    if (!originalChord ||
        originalChord === '' ||
        originalChord === 'N.C.' ||
        originalChord === 'N' ||
        originalChord === 'N/C' ||
        originalChord === 'NC') {
      return 'N.C.'; // Use 'N.C.' as the canonical "no chord" representation
    }
    // Strip bass note for guitar diagram lookup since guitar diagrams don't support inversions
    const rootChord = getRootChordForDiagramLookup(originalChord);
    return applyCorrectedChordNameForGuitarDiagrams(rootChord, visualIndex);
  }, [applyCorrectedChordNameForGuitarDiagrams, getRootChordForDiagramLookup]);



  // Unique chords for guitar diagrams (always applies corrections for consistent display)
  const uniqueChordsForGuitarDiagrams = useMemo(() => {
    const chordSet = new Set<string>();
    if (chordGridData.originalAudioMapping?.length) {
      chordGridData.originalAudioMapping.forEach(mapping => {
        if (mapping.chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(mapping.chord, mapping.visualIndex));
      });
    } else {
      const skipCount = (chordGridData.paddingCount || 0) + (chordGridData.shiftCount || 0);
      chordGridData.chords.slice(skipCount).forEach((chord, index) => {
        if (chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(chord, skipCount + index));
      });
    }
    return Array.from(chordSet).sort();
  }, [chordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);

  useEffect(() => {
    const loadChordData = async () => {
      const chordsToLoad = new Set<string>();
      uniqueChordsForGuitarDiagrams.forEach(chord => {
        if (!chordDataCache.has(chord)) chordsToLoad.add(chord);
      });
      const currentOriginalChord = chordGridData.chords[currentBeatIndex];
      if (currentOriginalChord) {
        const currentProcessedChord = preprocessAndCorrectChordNameForGuitarDiagrams(currentOriginalChord, currentBeatIndex);
        if (!chordDataCache.has(currentProcessedChord)) chordsToLoad.add(currentProcessedChord);
      }
      if (chordsToLoad.size > 0) {
        setIsLoadingChords(true);
        try {
          const results = await Promise.all(
            Array.from(chordsToLoad).map(async (chord) => ({ chord, data: await chordMappingService.getChordData(chord) }))
          );
          setChordDataCache(cache => {
            const updatedCache = new Map(cache);
            results.forEach(({ chord, data }) => updatedCache.set(chord, data));
            return updatedCache;
          });
        } catch (error) { console.error('Failed to load chord data:', error); }
        setIsLoadingChords(false);
      }
    };
    loadChordData();
  }, [uniqueChordsForGuitarDiagrams, currentBeatIndex, chordGridData.chords, preprocessAndCorrectChordNameForGuitarDiagrams, chordDataCache]);

  // Unfiltered chord data for guitar diagrams (always shows all chords with consistent corrections)
  const uniqueChordDataForGuitarDiagrams = useMemo(() => {
    const seenChords = new Set<string>();
    return uniqueChordsForGuitarDiagrams
      .filter(chord => !seenChords.has(chord) && seenChords.add(chord))
      .map(chord => ({ name: chord, data: chordDataCache.get(chord) || null }));
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);



  // Unfiltered chord progression for guitar diagrams (always shows all chords regardless of Roman numeral toggle)
  const getUniqueChordProgressionForGuitarDiagrams = useMemo(() => {
    if (!chordGridData.chords.length) return [];
    const uniqueProgression = [];
    let lastChord = null;
    const skipCount = (chordGridData.paddingCount || 0) + (chordGridData.shiftCount || 0);
    for (let i = 0; i < chordGridData.chords.length; i++) {
      const originalChord = chordGridData.chords[i] || 'N.C.';
      const isShiftCell = i < (chordGridData.shiftCount || 0) && !originalChord;
      const isPaddingCell = i >= (chordGridData.shiftCount || 0) && i < skipCount && originalChord === 'N.C.' && chordGridData.hasPadding;
      if (isShiftCell || isPaddingCell) continue;
      if (originalChord) {
        const processedChord = preprocessAndCorrectChordNameForGuitarDiagrams(originalChord, i);

        if (processedChord !== lastChord) {
          uniqueProgression.push({ chord: processedChord, startIndex: i, timestamp: chordGridData.beats[i] || 0 });
          lastChord = processedChord;
        }
      }
    }
    return uniqueProgression;
  }, [chordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);



  const getVisibleChordRange = useMemo(() => {
    const progression = getUniqueChordProgressionForGuitarDiagrams;
    if (progression.length === 0) return [];
    let currentChordInProgressionIndex = progression.findIndex((c, i) => currentBeatIndex >= c.startIndex && (i + 1 === progression.length || currentBeatIndex < progression[i + 1].startIndex));
    if (currentChordInProgressionIndex === -1) currentChordInProgressionIndex = 0;
    const getVisibleCount = () => {
      if (windowWidth >= 1280) return 7;
      if (windowWidth >= 1024) return 5;
      if (windowWidth >= 768) return 3;
      if (windowWidth >= 640) return 2;
      return 1;
    };
    const getFocusOffset = (count: number) => {
      if (count >= 7) return 2;
      if (count >= 3) return 1;
      return 0;
    };
    const visibleCount = getVisibleCount();
    const focusOffset = getFocusOffset(visibleCount);
    let startIndex = Math.max(0, currentChordInProgressionIndex - focusOffset);
    const endIndex = Math.min(progression.length, startIndex + visibleCount);
    if (endIndex - startIndex < visibleCount) {
      startIndex = Math.max(0, endIndex - visibleCount);
    }
    return progression.slice(startIndex, endIndex).map((chordInfo) => ({
      ...chordInfo,
      isCurrent: chordInfo.startIndex === progression[currentChordInProgressionIndex].startIndex,
    }));
  }, [getUniqueChordProgressionForGuitarDiagrams, currentBeatIndex, windowWidth]);


  if (!analysisResults) {
    return (
      <div className={`flex items-center justify-center p-8 bg-white dark:bg-content-bg rounded-lg shadow-card ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">Run chord analysis to see guitar chord diagrams.</p>
      </div>
    );
  }

  // DEFINE A SLOW, SMOOTH TWEEN TRANSITION
  // This provides a graceful, predictable motion that stops precisely on time.
  const itemTransition = {
    type: "tween",
    duration: 0.8,
    ease: "easeInOut"
  };

  return (
    <div className={`guitar-chords-tab space-y-6 ${className}`}>
      {/* Beat & Chord Progression Section */}
      <div className="chord-grid-section">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Beat & Chord Progression</h3>
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</span>
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setViewMode('animated')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'animated' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Animated</button>
              <button onClick={() => setViewMode('summary')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'summary' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Summary</button>
            </div>
          </div>
        </div>
        <div className="chord-grid-window bg-white dark:bg-content-bg rounded-lg overflow-hidden">
          <div className="h-32 sm:h-40 md:h-48 lg:h-56 overflow-y-auto">
            <ChordGridContainer {...{analysisResults, chordGridData, currentBeatIndex, keySignature, isDetectingKey, isChatbotOpen, isLyricsPanelOpen, onBeatClick, isUploadPage, showCorrectedChords, chordCorrections, sequenceCorrections, segmentationData, showSegmentation, showRomanNumerals, romanNumeralData}}/>
          </div>
        </div>
      </div>

      {/* Guitar Chord Diagrams Section */}
      <div className="chord-diagrams-section">
        {isLoadingChords && viewMode === 'animated' && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading Diagrams...</span>
          </div>
        )}

        {!isLoadingChords && viewMode === 'animated' ? (
          <div className="animated-chord-view relative bg-white dark:bg-content-bg overflow-hidden">
            <div className="flex justify-center items-center" style={{minHeight: '200px'}}>
                <AnimatePresence initial={false}>
                  {getVisibleChordRange.map((chordInfo) => {
                    // Get segmentation color for this chord position
                    // Use the timestamp from the chord info for accurate mapping
                    const timestamp = chordGridData.beats[chordInfo.startIndex];
                    const segmentationColor = getSegmentationColorForBeat(
                      chordInfo.startIndex,
                      chordGridData.beats,
                      segmentationData,
                      showSegmentation,
                      typeof timestamp === 'number' ? timestamp : undefined
                    );

                    return (
                      <motion.div
                        layout
                        key={`guitar-chord-${chordInfo.startIndex}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: chordInfo.isCurrent ? 1 : 0.6, scale: chordInfo.isCurrent ? 1.05 : 0.95, filter: `blur(${chordInfo.isCurrent ? 0 : 1}px)`, zIndex: chordInfo.isCurrent ? 10 : 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={itemTransition} // ✅ APPLY TWEEN TRANSITION
                        className="flex-shrink-0 relative rounded-lg"
                        style={{
                          width: '140px',
                          margin: '0 12px',
                          backgroundColor: segmentationColor || 'transparent',
                          padding: segmentationColor ? '8px' : '0'
                        }}
                      >
                        <GuitarChordDiagram
                          chordData={chordDataCache.get(chordInfo.chord) || null}
                          positionIndex={chordPositions.get(chordInfo.chord) || 0}
                          size="large"
                          showChordName={true}
                          displayName={chordInfo.chord}
                          isFocused={chordInfo.isCurrent}
                          segmentationColor={segmentationColor}
                          showPositionSelector={chordInfo.isCurrent}
                          onPositionChange={(positionIndex) => handlePositionChange(chordInfo.chord, positionIndex)}
                          showRomanNumerals={false}
                          romanNumeral=""
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
            </div>
          </div>
        ) : !isLoadingChords && (
          <div className="summary-chord-view bg-white dark:bg-content-bg rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-6 text-center">All Chords in Song ({uniqueChordsForGuitarDiagrams.length} unique)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4 md:gap-6 justify-items-center">
              {uniqueChordDataForGuitarDiagrams.map(({name, data}, index) => (
                <div key={index} className="flex justify-center">
                  <GuitarChordDiagram
                    chordData={data}
                    positionIndex={chordPositions.get(name) || 0}
                    size="medium"
                    showChordName={true}
                    className="hover:scale-105 transition-transform"
                    displayName={name}
                    isFocused={false}
                    showPositionSelector={true}
                    onPositionChange={(positionIndex) => handlePositionChange(name, positionIndex)}
                    showRomanNumerals={false}
                    romanNumeral=""
                  />
                </div>
              ))}
            </div>
            {uniqueChordsForGuitarDiagrams.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-12 max-w-md mx-auto">
                <Image src="/quarter_rest.svg" alt="No chords" width={64} height={64} className="mx-auto mb-4 opacity-50" style={{ filter: 'brightness(0.4)' }} />
                <p className="text-lg font-medium">No chords detected in this song</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuitarChordsTab;