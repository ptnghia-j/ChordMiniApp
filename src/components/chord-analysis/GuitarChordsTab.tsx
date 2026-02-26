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
import { transposeChord, calculateTargetKey } from '@/utils/chordTransposition';
import ScrollableTabContainer from '@/components/chord-analysis/ScrollableTabContainer';


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

  // Capo state: fret 0 = no capo, fret 1-12 = capo position
  const [capoFret, setCapoFretRaw] = useState<number>(0);
  // Capo label mode: 'shape' shows the chord shape name, 'sound' shows the sounding chord name
  const [capoLabelMode, setCapoLabelMode] = useState<'shape' | 'sound'>('shape');

  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [chordPositions, setChordPositions] = useState<Map<string, number>>(new Map()); // Track position for each chord

  // Wrapped setter that clears chord data cache when capo changes (new chord shapes need to be loaded)
  const setCapoFret = useCallback((value: number | ((prev: number) => number)) => {
    setCapoFretRaw(value);
    setChordDataCache(new Map());
    setChordPositions(new Map());
  }, []);

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

  // When capo is set, transpose chords DOWN by capo fret count to get the "shape" chord
  // e.g., capo on fret 2: song has D → guitarist plays C shape (D transposed -2 = C)
  const capoTargetKey = useMemo(() => {
    if (capoFret === 0) return 'C';
    // Derive target key from the song's key signature or fallback to 'C'
    const baseKey = keySignature || targetKey || 'C';
    return calculateTargetKey(baseKey, -capoFret);
  }, [capoFret, keySignature, targetKey]);

  const capoTransposedChordGridData = useMemo(() => {
    if (capoFret === 0 || !transposedChordGridData) {
      return transposedChordGridData;
    }

    const capoTransposedChords = transposedChordGridData.chords.map((chord) => {
      if (!chord || chord === 'N.C.' || chord === 'N' || chord === 'N/C' || chord === 'NC') {
        return chord;
      }
      return transposeChord(chord, -capoFret, capoTargetKey);
    });

    const capoTransposedMapping = transposedChordGridData.originalAudioMapping?.map(mapping => ({
      ...mapping,
      chord: mapping.chord && mapping.chord !== 'N.C.' && mapping.chord !== 'N' && mapping.chord !== 'N/C' && mapping.chord !== 'NC'
        ? transposeChord(mapping.chord, -capoFret, capoTargetKey)
        : mapping.chord
    }));

    return {
      ...transposedChordGridData,
      chords: capoTransposedChords,
      originalAudioMapping: capoTransposedMapping
    };
  }, [transposedChordGridData, capoFret, capoTargetKey]);

  // Build a mapping from capo-transposed (shape) chord name → sounding chord name
  // This is used when capoLabelMode === 'sound' to display the actual sounding name
  const shapeToSoundingMap = useMemo(() => {
    const map = new Map<string, string>();
    if (capoFret === 0 || !transposedChordGridData || !capoTransposedChordGridData) return map;
    for (let i = 0; i < transposedChordGridData.chords.length; i++) {
      const soundingChord = transposedChordGridData.chords[i];
      const shapeChord = capoTransposedChordGridData.chords[i];
      if (soundingChord && shapeChord && soundingChord !== shapeChord) {
        map.set(shapeChord, soundingChord);
      }
    }
    return map;
  }, [transposedChordGridData, capoTransposedChordGridData, capoFret]);

  // Responsive diagram sizing for animated view - diagram dimensions scale with screen
  const diagramConfig = useMemo(() => {
    if (windowWidth >= 1536) return { size: 'large' as const, diagramWidth: 125, diagramHeight: 160, cellWidth: 140, marginX: 10, labelClass: '' };
    if (windowWidth >= 1280) return { size: 'large' as const, diagramWidth: 115, diagramHeight: 147, cellWidth: 130, marginX: 8, labelClass: '' };
    if (windowWidth >= 1024) return { size: 'medium' as const, diagramWidth: 100, diagramHeight: 128, cellWidth: 115, marginX: 7, labelClass: '' };
    if (windowWidth >= 768) return { size: 'medium' as const, diagramWidth: 90, diagramHeight: 115, cellWidth: 105, marginX: 6, labelClass: '' };
    if (windowWidth >= 640) return { size: 'small' as const, diagramWidth: 78, diagramHeight: 100, cellWidth: 92, marginX: 5, labelClass: 'text-[10px] leading-tight' };
    return { size: 'small' as const, diagramWidth: 70, diagramHeight: 90, cellWidth: 82, marginX: 4, labelClass: 'text-[10px] leading-tight' };
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
      if (capoTransposedChordGridData.hasPadding) {
        chordSequenceIndex -= ((capoTransposedChordGridData.shiftCount || 0) + (capoTransposedChordGridData.paddingCount || 0));
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
  }, [mergedShowCorrectedChords, mergedChordCorrections, sequenceCorrections, capoTransposedChordGridData.hasPadding, capoTransposedChordGridData.shiftCount, capoTransposedChordGridData.paddingCount]);



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
  // Uses capoTransposedChordGridData to show capo-adjusted shapes when capo is enabled
  const uniqueChordsForGuitarDiagrams = useMemo(() => {
    const chordSet = new Set<string>();
    if (capoTransposedChordGridData.originalAudioMapping?.length) {
      capoTransposedChordGridData.originalAudioMapping.forEach(mapping => {
        if (mapping.chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(mapping.chord, mapping.visualIndex));
      });
    } else {
      const skipCount = (capoTransposedChordGridData.paddingCount || 0) + (capoTransposedChordGridData.shiftCount || 0);
      capoTransposedChordGridData.chords.slice(skipCount).forEach((chord, index) => {
        if (chord) chordSet.add(preprocessAndCorrectChordNameForGuitarDiagrams(chord, skipCount + index));
      });
    }
    return Array.from(chordSet).sort();
  }, [capoTransposedChordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);

  useEffect(() => {
    const loadChordData = async () => {
      const chordsToLoad = new Set<string>();
      uniqueChordsForGuitarDiagrams.forEach(chord => {
        if (!chordDataCache.has(chord)) chordsToLoad.add(chord);
      });
      const currentOriginalChord = capoTransposedChordGridData.chords[currentBeatIndex];
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
  }, [uniqueChordsForGuitarDiagrams, currentBeatIndex, capoTransposedChordGridData.chords, preprocessAndCorrectChordNameForGuitarDiagrams, chordDataCache]);

  // Unfiltered chord data for guitar diagrams (always shows all chords with consistent corrections)
  const uniqueChordDataForGuitarDiagrams = useMemo(() => {
    const seenChords = new Set<string>();
    return uniqueChordsForGuitarDiagrams
      .filter(chord => !seenChords.has(chord) && seenChords.add(chord))
      .map(chord => ({ name: chord, data: chordDataCache.get(chord) || null }));
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);



  // Unfiltered chord progression for guitar diagrams (always shows all chords regardless of Roman numeral toggle)
  // Uses capoTransposedChordGridData to show capo-adjusted shapes
  const getUniqueChordProgressionForGuitarDiagrams = useMemo(() => {
    if (!capoTransposedChordGridData.chords.length) return [];
    const uniqueProgression = [];
    let lastChord = null;
    const skipCount = (capoTransposedChordGridData.paddingCount || 0) + (capoTransposedChordGridData.shiftCount || 0);
    for (let i = 0; i < capoTransposedChordGridData.chords.length; i++) {
      const originalChord = capoTransposedChordGridData.chords[i] || 'N.C.';
      const isShiftCell = i < (capoTransposedChordGridData.shiftCount || 0) && !originalChord;
      const isPaddingCell = i >= (capoTransposedChordGridData.shiftCount || 0) && i < skipCount && originalChord === 'N.C.' && capoTransposedChordGridData.hasPadding;
      if (isShiftCell || isPaddingCell) continue;
      if (originalChord) {
        const processedChord = preprocessAndCorrectChordNameForGuitarDiagrams(originalChord, i);

        if (processedChord !== lastChord) {
          uniqueProgression.push({ chord: processedChord, startIndex: i, timestamp: capoTransposedChordGridData.beats[i] || 0 });
          lastChord = processedChord;
        }
      }
    }
    return uniqueProgression;
  }, [capoTransposedChordGridData, preprocessAndCorrectChordNameForGuitarDiagrams]);



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
        <div className="flex items-center justify-between mb-2 flex-wrap gap-y-2">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Beat & Chord Progression</h3>
          <div className="flex items-center space-x-3">
            {/* Capo control */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="capo-input" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Capo:
              </label>
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={() => setCapoFret(prev => Math.max(0, prev - 1))}
                  disabled={capoFret === 0}
                  className="w-7 h-8 flex items-center justify-center text-sm font-bold rounded-l-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300"
                  aria-label="Decrease capo fret"
                >
                  −
                </button>
                <input
                  id="capo-input"
                  type="number"
                  min={0}
                  max={12}
                  value={capoFret}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0 && val <= 12) setCapoFret(val);
                  }}
                  className="w-8 h-8 text-center text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-800 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Capo fret position"
                />
                <button
                  onClick={() => setCapoFret(prev => Math.min(12, prev + 1))}
                  disabled={capoFret === 12}
                  className="w-7 h-8 flex items-center justify-center text-sm font-bold rounded-r-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300"
                  aria-label="Increase capo fret"
                >
                  +
                </button>
              </div>
            </div>

            {/* Shape/Sound label toggle - only visible when capo is active */}
            {capoFret > 0 && (
              <>
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Label:</span>
                  <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    <button
                      onClick={() => setCapoLabelMode('shape')}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${capoLabelMode === 'shape' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      title="Show chord shape name (what you play)"
                    >
                      Shape
                    </button>
                    <button
                      onClick={() => setCapoLabelMode('sound')}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${capoLabelMode === 'sound' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      title="Show sounding chord name (what you hear)"
                    >
                      Sound
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

            {/* View mode toggle */}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</span>
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setViewMode('animated')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'animated' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Animated</button>
              <button onClick={() => setViewMode('summary')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'summary' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Summary</button>
            </div>
          </div>
        </div>
        <ScrollableTabContainer heightClass="h-24 sm:h-32 md:h-40 lg:h-48">
          <ChordGridContainer {...{ analysisResults, chordGridData, keySignature, isDetectingKey, isChatbotOpen, isLyricsPanelOpen, isUploadPage, showCorrectedChords, chordCorrections, sequenceCorrections, segmentationData }} />
        </ScrollableTabContainer>
      </div>

      {/* Guitar Chord Diagrams Section */}
      <div className="chord-diagrams-section relative">
        {isLoadingChords && viewMode === 'animated' && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading Diagrams...</span>
          </div>
        )}

        {!isLoadingChords && viewMode === 'animated' ? (
          <div className="animated-chord-view relative overflow-visible">
            <div className="flex justify-center items-start py-1" style={{ minHeight: Math.max(diagramConfig.diagramHeight + 50, 100) }}>
                <AnimatePresence initial={false}>
                  {getVisibleChordRange.map((chordInfo) => {
                    // Get segmentation color for this chord position
                    // Use the timestamp from the chord info for accurate mapping
                    const timestamp = capoTransposedChordGridData.beats[chordInfo.startIndex];
                    const segmentationColor = getSegmentationColorForBeat(
                      chordInfo.startIndex,
                      capoTransposedChordGridData.beats,
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
                          customWidth={diagramConfig.diagramWidth}
                          customHeight={diagramConfig.diagramHeight}
                          showChordName={true}
                          displayName={chordInfo.chord}
                          soundingChordName={shapeToSoundingMap.get(chordInfo.chord)}
                          isFocused={chordInfo.isCurrent}
                          segmentationColor={segmentationColor}
                          showPositionSelector={chordInfo.isCurrent}
                          onPositionChange={(positionIndex) => handlePositionChange(chordInfo.chord, positionIndex)}
                          capoFret={capoFret}
                          capoLabelMode={capoLabelMode}
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
          <div className="summary-chord-view relative p-6">
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
                    soundingChordName={shapeToSoundingMap.get(name)}
                    isFocused={false}
                    showPositionSelector={true}
                    onPositionChange={(positionIndex) => handlePositionChange(name, positionIndex)}
                    capoFret={capoFret}
                    capoLabelMode={capoLabelMode}
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