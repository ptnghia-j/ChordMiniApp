'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { chordMappingService } from '@/services/chord-analysis/chordMappingService';
import { ChordGridContainer } from '@/components/chord-analysis/ChordGridContainer';
import { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationColorForBeat } from '@/utils/segmentationColors';
import { useAnalysisResults, useShowCorrectedChords, useChordCorrections } from '@/stores/analysisStore';
import { useCurrentBeatIndex } from '@/stores/playbackStore';
import { useSegmentationSelector } from '@/contexts/selectors'; // Now uses Zustand internally
import { useIsPitchShiftEnabled, usePitchShiftSemitones, useTargetKey } from '@/stores/uiStore';
import { transposeChord } from '@/utils/chordTransposition';


// Lazy load heavy guitar chord diagram component
const GuitarChordDiagram = dynamic(() => import('@/components/chord-playback/GuitarChordDiagram'), {
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
  analysisResults?: AnalysisResult | null;
  chordGridData: ChordGridData;
  className?: string;
  keySignature?: string | null;
  isDetectingKey?: boolean;
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
  // Segmentation props for synchronized color overlay (data only; toggle from UIContext)
  segmentationData?: SegmentationResult | null;
}

export const GuitarChordsTab: React.FC<GuitarChordsTabProps> = ({
  analysisResults,
  chordGridData,
  className = '',
  keySignature,
  isDetectingKey,
  isChatbotOpen = false,
  isLyricsPanelOpen = false,
  isUploadPage = false,
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  segmentationData = null,
}) => {
  const currentBeatIndex = useCurrentBeatIndex();

  // Get pitch shift state from Zustand store
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const targetKey = useTargetKey();

  const [viewMode, setViewMode] = useState<'animated' | 'summary'>('animated');
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());
  const [isLoadingChords, setIsLoadingChords] = useState<boolean>(false);




  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [chordPositions, setChordPositions] = useState<Map<string, number>>(new Map()); // Track position for each chord

  // Apply pitch shift transposition to chord grid data if enabled
  const transposedChordGridData = useMemo(() => {
    if (!isPitchShiftEnabled || pitchShiftSemitones === 0 || !chordGridData) {
      return chordGridData;
    }

    // Transpose all chords in the grid
    const transposedChords = chordGridData.chords.map((chord) => {
      if (!chord || chord === 'N.C.' || chord === 'N' || chord === 'N/C' || chord === 'NC') {
        return chord;
      }
      return transposeChord(chord, pitchShiftSemitones, targetKey ?? undefined);
    });

    // Transpose originalAudioMapping if it exists
    const transposedMapping = chordGridData.originalAudioMapping?.map(mapping => ({
      ...mapping,
      chord: mapping.chord && mapping.chord !== 'N.C.' && mapping.chord !== 'N' && mapping.chord !== 'N/C' && mapping.chord !== 'NC'
        ? transposeChord(mapping.chord, pitchShiftSemitones, targetKey ?? undefined)
        : mapping.chord
    }));

    return {
      ...chordGridData,
      chords: transposedChords,
      originalAudioMapping: transposedMapping
    };
  }, [chordGridData, isPitchShiftEnabled, pitchShiftSemitones, targetKey]);

  // Responsive diagram sizing for animated view
  const diagramConfig = useMemo(() => {
    if (windowWidth >= 1536) return { size: 'large' as const, cellWidth: 136, marginX: 12, minH: 210, labelClass: '' };
    if (windowWidth >= 1280) return { size: 'large' as const, cellWidth: 128, marginX: 10, minH: 205, labelClass: '' };
    if (windowWidth >= 1024) return { size: 'medium' as const, cellWidth: 118, marginX: 9, minH: 198, labelClass: '' };
    if (windowWidth >= 768) return { size: 'medium' as const, cellWidth: 108, marginX: 8, minH: 190, labelClass: '' };
    if (windowWidth >= 640) return { size: 'small' as const, cellWidth: 96, marginX: 7, minH: 180, labelClass: 'text-[10px] leading-tight' };
    return { size: 'small' as const, cellWidth: 90, marginX: 6, minH: 170, labelClass: 'text-[10px] leading-tight' };
  }, [windowWidth]);

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



  // Pull analysis toggles and data from Zustand stores when not provided via props
  // Segmentation toggle from UIStore
  const { showSegmentation } = useSegmentationSelector();

  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();

  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;

  // Chord correction for guitar diagrams (always applies corrections when available for consistent display)
  const applyCorrectedChordNameForGuitarDiagrams = useCallback((originalChord: string, visualIndex?: number): string => {
    if (!mergedShowCorrectedChords || !originalChord || originalChord === 'N.C.') return originalChord;

    if (sequenceCorrections && visualIndex !== undefined) {
      const { originalSequence, correctedSequence } = sequenceCorrections;
      let chordSequenceIndex = visualIndex;
      if (transposedChordGridData.hasPadding) {
        chordSequenceIndex -= ((transposedChordGridData.shiftCount || 0) + (transposedChordGridData.paddingCount || 0));
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

    if (mergedChordCorrections) {
      const rootNote = originalChord.includes(':') ? originalChord.split(':')[0] : (originalChord.match(/^([A-G][#b]?)/)?.[1] || originalChord);
      const correction = mergedChordCorrections[rootNote as keyof typeof mergedChordCorrections];
      if (correction) return originalChord.replace(rootNote, correction as string);
    }
    return originalChord;
  }, [mergedShowCorrectedChords, mergedChordCorrections, sequenceCorrections, transposedChordGridData.hasPadding, transposedChordGridData.shiftCount, transposedChordGridData.paddingCount]);



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
  // Uses transposedChordGridData to show transposed chords when pitch shift is enabled
  const uniqueChordsForGuitarDiagrams = useMemo(() => {
    const chordSet = new Set<string>();
    if (transposedChordGridData.originalAudioMapping?.length) {
      transposedChordGridData.originalAudioMapping.forEach(mapping => {
        if (mapping.chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(mapping.chord, mapping.visualIndex));
      });
    } else {
      const skipCount = (transposedChordGridData.paddingCount || 0) + (transposedChordGridData.shiftCount || 0);
      transposedChordGridData.chords.slice(skipCount).forEach((chord, index) => {
        if (chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(chord, skipCount + index));
      });
    }
    return Array.from(chordSet).sort();
  }, [transposedChordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);

  useEffect(() => {
    const loadChordData = async () => {
      const chordsToLoad = new Set<string>();
      uniqueChordsForGuitarDiagrams.forEach(chord => {
        if (!chordDataCache.has(chord)) chordsToLoad.add(chord);
      });
      const currentOriginalChord = transposedChordGridData.chords[currentBeatIndex];
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
  }, [uniqueChordsForGuitarDiagrams, currentBeatIndex, transposedChordGridData.chords, preprocessAndCorrectChordNameForGuitarDiagrams, chordDataCache]);

  // Unfiltered chord data for guitar diagrams (always shows all chords with consistent corrections)
  const uniqueChordDataForGuitarDiagrams = useMemo(() => {
    const seenChords = new Set<string>();
    return uniqueChordsForGuitarDiagrams
      .filter(chord => !seenChords.has(chord) && seenChords.add(chord))
      .map(chord => ({ name: chord, data: chordDataCache.get(chord) || null }));
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);



  // Unfiltered chord progression for guitar diagrams (always shows all chords regardless of Roman numeral toggle)
  // Uses transposedChordGridData to show transposed chords when pitch shift is enabled
  const getUniqueChordProgressionForGuitarDiagrams = useMemo(() => {
    if (!transposedChordGridData.chords.length) return [];
    const uniqueProgression = [];
    let lastChord = null;
    const skipCount = (transposedChordGridData.paddingCount || 0) + (transposedChordGridData.shiftCount || 0);
    for (let i = 0; i < transposedChordGridData.chords.length; i++) {
      const originalChord = transposedChordGridData.chords[i] || 'N.C.';
      const isShiftCell = i < (transposedChordGridData.shiftCount || 0) && !originalChord;
      const isPaddingCell = i >= (transposedChordGridData.shiftCount || 0) && i < skipCount && originalChord === 'N.C.' && transposedChordGridData.hasPadding;
      if (isShiftCell || isPaddingCell) continue;
      if (originalChord) {
        const processedChord = preprocessAndCorrectChordNameForGuitarDiagrams(originalChord, i);

        if (processedChord !== lastChord) {
          uniqueProgression.push({ chord: processedChord, startIndex: i, timestamp: transposedChordGridData.beats[i] || 0 });
          lastChord = processedChord;
        }
      }
    }
    return uniqueProgression;
  }, [transposedChordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);



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


  if (!mergedAnalysisResults) {
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
    <div className={`guitar-chords-tab space-y-3 sm:space-y-3 ${className}`}>
      {/* Beat & Chord Progression Section */}
      <div className="chord-grid-section">
        <div className="flex items-center justify-between mb-2">
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
          <div className="h-24 sm:h-32 md:h-40 lg:h-48 overflow-y-auto">
            <ChordGridContainer {...{ analysisResults, chordGridData, keySignature, isDetectingKey, isChatbotOpen, isLyricsPanelOpen, isUploadPage, showCorrectedChords, chordCorrections, sequenceCorrections, segmentationData }} />
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
          <div className="animated-chord-view relative bg-white dark:bg-content-bg overflow-visible">
            <div className="flex justify-center items-start py-1" style={{ minHeight: Math.max(diagramConfig.minH - 60, 100) }}>
                <AnimatePresence initial={false}>
                  {getVisibleChordRange.map((chordInfo) => {
                    // Get segmentation color for this chord position
                    // Use the timestamp from the chord info for accurate mapping
                    const timestamp = transposedChordGridData.beats[chordInfo.startIndex];
                    const segmentationColor = getSegmentationColorForBeat(
                      chordInfo.startIndex,
                      transposedChordGridData.beats,
                      segmentationData,
                      showSegmentation,
                      typeof timestamp === 'number' ? timestamp : undefined
                    );

                    return (
                      <motion.div
                        layout
                        key={`guitar-chord-${chordInfo.startIndex}`}
                        initial={false}
                        animate={{
                          opacity: chordInfo.isCurrent ? 1 : 0.6,
                          scale: 1,
                          filter: `blur(${chordInfo.isCurrent ? 0 : 1}px)`,
                          zIndex: chordInfo.isCurrent ? 10 : 1
                        }}
                        exit={{ opacity: 0.6 }}
                        transition={itemTransition}
                        className="flex-shrink-0 relative rounded-lg will-change-transform"
                        style={{
                          width: `${diagramConfig.cellWidth}px`,
                          margin: `0 ${diagramConfig.marginX}px`,
                          backgroundColor: segmentationColor || 'transparent',
                          padding: segmentationColor ? '8px' : '0'
                        }}
                      >
                        <GuitarChordDiagram
                          chordData={chordDataCache.get(chordInfo.chord) || null}
                          positionIndex={chordPositions.get(chordInfo.chord) || 0}
                          size={diagramConfig.size}
                          showChordName={true}
                          displayName={chordInfo.chord}
                          isFocused={chordInfo.isCurrent}
                          segmentationColor={segmentationColor}
                          showPositionSelector={chordInfo.isCurrent}
                          onPositionChange={(positionIndex) => handlePositionChange(chordInfo.chord, positionIndex)}
                          showRomanNumerals={false}
                          romanNumeral=""
                          labelClassName={diagramConfig.labelClass}
                          // Prevent internal re-render animations when unchanged
                          key={`diagram-${chordInfo.chord}-${chordPositions.get(chordInfo.chord) || 0}`}
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