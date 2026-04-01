'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
import {
  useGuitarCapoFret,
  useGuitarSelectedPositions,
  useSetGuitarCapoFret,
  useSetGuitarSelectedPosition,
  useTargetKey,
  useUIStore,
} from '@/stores/uiStore';
import { transposeChord, calculateTargetKey } from '@/utils/chordTransposition';
import { DEFAULT_MAX_CAPO_SUGGESTION_FRET, suggestCapoPosition } from '@/utils/guitarVoicing';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';
import ScrollableTabContainer from '@/components/chord-analysis/ScrollableTabContainer';
import CapoNeckPreview from '@/components/chord-analysis/CapoNeckPreview';


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

  const targetKey = useTargetKey();

  const [viewMode, setViewMode] = useState<'animated' | 'summary'>('animated');
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());
  const [isLoadingChords, setIsLoadingChords] = useState<boolean>(false);

  // Shared guitar voicing state
  const capoFret = useGuitarCapoFret();
  const chordPositions = useGuitarSelectedPositions();
  const setSharedCapoFret = useSetGuitarCapoFret();
  const setSharedChordPosition = useSetGuitarSelectedPosition();
  // Capo label mode: 'shape' shows the chord shape name, 'sound' shows the sounding chord name
  const [capoLabelMode, setCapoLabelMode] = useState<'shape' | 'sound'>('shape');
  const [isCapoPreviewOpen, setIsCapoPreviewOpen] = useState(false);
  const hasUserAdjustedCapoRef = useRef(false);
  const capoSuggestionSignatureRef = useRef('');
  const capoPreviewCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // Wrapped setter that clears chord data cache when capo changes (new chord shapes need to be loaded)
  const setCapoFret = useCallback((value: number | ((prev: number) => number), options?: { isUserInitiated?: boolean }) => {
    const nextValue = typeof value === 'function' ? value(capoFret) : value;
    if (!Number.isFinite(nextValue)) {
      return;
    }
    if (options?.isUserInitiated !== false) {
      hasUserAdjustedCapoRef.current = true;
    }
    setSharedCapoFret(nextValue);
    setChordDataCache(new Map());
  }, [capoFret, setSharedCapoFret]);

  // When capo is set, transpose chords DOWN by capo fret count to get the "shape" chord
  // e.g., capo on fret 2: song has D → guitarist plays C shape (D transposed -2 = C)
  const capoTargetKey = useMemo(() => {
    if (capoFret === 0) return 'C';
    const baseKey = targetKey || keySignature || 'C';
    return calculateTargetKey(baseKey, -capoFret);
  }, [capoFret, keySignature, targetKey]);

  // Responsive diagram sizing for animated view - diagram dimensions scale with screen
  const diagramConfig = useMemo(() => {
    if (windowWidth >= 1536) return { size: 'large' as const, diagramWidth: 125, diagramHeight: 160, cellWidth: 140, marginX: 10, labelClass: '' };
    if (windowWidth >= 1280) return { size: 'large' as const, diagramWidth: 115, diagramHeight: 147, cellWidth: 130, marginX: 8, labelClass: '' };
    if (windowWidth >= 1024) return { size: 'medium' as const, diagramWidth: 100, diagramHeight: 128, cellWidth: 115, marginX: 7, labelClass: '' };
    if (windowWidth >= 768) return { size: 'medium' as const, diagramWidth: 90, diagramHeight: 115, cellWidth: 105, marginX: 6, labelClass: '' };
    if (windowWidth >= 640) return { size: 'small' as const, diagramWidth: 78, diagramHeight: 100, cellWidth: 92, marginX: 5, labelClass: 'text-xs leading-tight' };
    return { size: 'small' as const, diagramWidth: 70, diagramHeight: 90, cellWidth: 82, marginX: 4, labelClass: 'text-xs leading-tight' };
  }, [windowWidth]);

  // Handle chord position changes
  const handlePositionChange = useCallback((chordName: string, positionIndex: number) => {
    setSharedChordPosition(chordName, positionIndex);
  }, [setSharedChordPosition]);

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
  const {
    resolvedChordGridData,
    displayedChords,
  } = useResolvedChordDisplayData({
    chordGridData,
    showCorrectedChords: mergedShowCorrectedChords,
    chordCorrections: mergedChordCorrections,
    sequenceCorrections,
  });

  const normalizeChordNameForDisplay = useCallback((originalChord: string): string => {
    if (!originalChord ||
        originalChord === '' ||
        originalChord === 'N.C.' ||
        originalChord === 'N' ||
        originalChord === 'N/C' ||
        originalChord === 'NC') {
      return 'N.C.';
    }
    return originalChord;
  }, []);

  // This matches the beat-grid display: corrections/enharmonic updates first, capo transposition later.
  const getProcessedSoundingChordName = useCallback((originalChord: string): string => {
    const normalizedChord = normalizeChordNameForDisplay(originalChord);
    if (normalizedChord === 'N.C.') return normalizedChord;

    return normalizedChord;
  }, [normalizeChordNameForDisplay]);

  const getProcessedShapeChordName = useCallback((soundingChord: string): string => {
    const normalizedChord = normalizeChordNameForDisplay(soundingChord);
    if (normalizedChord === 'N.C.') {
      return normalizedChord;
    }

    const rawShapeChord = capoFret > 0
      ? transposeChord(normalizedChord, -capoFret, capoTargetKey)
      : normalizedChord;

    return chordMappingService.getPreferredDiagramChordName(rawShapeChord);
  }, [normalizeChordNameForDisplay, capoFret, capoTargetKey]);

  // Build capo label mappings for both occurrence-specific animated diagrams and
  // unique summary diagrams. Shape names can collapse multiple sounding slash
  // chords into the same renderable diagram, so animated playback needs an
  // index-based lookup instead of a shape-name-only map.
  const processedChordData = useMemo(() => {
    const entries = displayedChords.map((chord) => {
      const sounding = getProcessedSoundingChordName(chord);
      const shape = getProcessedShapeChordName(sounding);
      return { sounding, shape };
    });

    const soundingNameByIndex = new Map<number, string>();
    const soundingNamesByShape = new Map<string, string[]>();

    entries.forEach(({ sounding, shape }, index) => {
      if (shape !== 'N.C.' && sounding !== 'N.C.' && shape !== sounding) {
        soundingNameByIndex.set(index, sounding);

        const currentShapeLabels = soundingNamesByShape.get(shape) || [];
        if (!currentShapeLabels.includes(sounding)) {
          soundingNamesByShape.set(shape, [...currentShapeLabels, sounding]);
        }
      }
    });

    return {
      entries,
      soundingNameByIndex,
      soundingNameByShape: new Map(
        Array.from(soundingNamesByShape.entries()).map(([shape, soundingNames]) => [
          shape,
          soundingNames.join(' | '),
        ])
      ),
    };
  }, [displayedChords, getProcessedSoundingChordName, getProcessedShapeChordName]);

  const capoSuggestionTargetKey = useMemo(() => (
    targetKey || keySignature || 'C'
  ), [keySignature, targetKey]);

  const uniqueSoundingChordsForCapoSuggestion = useMemo(() => (
    Array.from(
      new Set(
        processedChordData.entries
          .map((entry) => entry.sounding)
          .filter((chord) => chord && chord !== 'N.C.')
      )
    )
  ), [processedChordData.entries]);

  const capoSuggestionSignature = useMemo(() => (
    uniqueSoundingChordsForCapoSuggestion.join('||')
  ), [uniqueSoundingChordsForCapoSuggestion]);

  const suggestedCapo = useMemo(() => (
    suggestCapoPosition(uniqueSoundingChordsForCapoSuggestion, {
      maxCapo: DEFAULT_MAX_CAPO_SUGGESTION_FRET,
      targetKey: capoSuggestionTargetKey,
    })
  ), [uniqueSoundingChordsForCapoSuggestion, capoSuggestionTargetKey]);

  const openCapoPreview = useCallback(() => {
    if (capoPreviewCloseTimeoutRef.current) {
      clearTimeout(capoPreviewCloseTimeoutRef.current);
      capoPreviewCloseTimeoutRef.current = null;
    }
    setIsCapoPreviewOpen(true);
  }, []);

  const scheduleCapoPreviewClose = useCallback(() => {
    if (capoPreviewCloseTimeoutRef.current) {
      clearTimeout(capoPreviewCloseTimeoutRef.current);
    }
    capoPreviewCloseTimeoutRef.current = setTimeout(() => {
      setIsCapoPreviewOpen(false);
      capoPreviewCloseTimeoutRef.current = null;
    }, 120);
  }, []);

  const handleCapoPreviewBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget as Node | null;
    if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }
    scheduleCapoPreviewClose();
  }, [scheduleCapoPreviewClose]);

  useEffect(() => (
    () => {
      if (capoPreviewCloseTimeoutRef.current) {
        clearTimeout(capoPreviewCloseTimeoutRef.current);
      }
    }
  ), []);

  useEffect(() => {
    if (capoSuggestionSignatureRef.current === capoSuggestionSignature) {
      return;
    }

    capoSuggestionSignatureRef.current = capoSuggestionSignature;
    hasUserAdjustedCapoRef.current = false;
  }, [capoSuggestionSignature]);

  useEffect(() => {
    if (!suggestedCapo || hasUserAdjustedCapoRef.current) {
      return;
    }

    if (capoFret !== suggestedCapo.capoFret) {
      useUIStore.getState().setGuitarCapoFret(suggestedCapo.capoFret);
    }
  }, [suggestedCapo, capoFret]);


  // Unique chords for guitar diagrams (always applies corrections for consistent display)
  const uniqueChordsForGuitarDiagrams = useMemo(() => {
    const chordSet = new Set<string>();
    if (resolvedChordGridData?.originalAudioMapping?.length) {
      resolvedChordGridData.originalAudioMapping.forEach(mapping => {
        const processedChord = processedChordData.entries[mapping.visualIndex]?.shape;
        if (processedChord) chordSet.add(processedChord);
      });
    } else {
      const skipCount = (resolvedChordGridData?.paddingCount || 0) + (resolvedChordGridData?.shiftCount || 0);
      processedChordData.entries.slice(skipCount).forEach((entry) => {
        if (entry.shape) chordSet.add(entry.shape);
      });
    }
    return Array.from(chordSet).sort();
  }, [resolvedChordGridData, processedChordData.entries]);

  const currentChordNameForCache = useMemo(() => {
    return processedChordData.entries[currentBeatIndex]?.shape || null;
  }, [processedChordData.entries, currentBeatIndex]);

  useEffect(() => {
    const loadChordData = async () => {
      const chordsToLoad = new Set<string>();
      uniqueChordsForGuitarDiagrams.forEach(chord => {
        if (!chordDataCache.has(chord)) chordsToLoad.add(chord);
      });
      if (currentChordNameForCache && !chordDataCache.has(currentChordNameForCache)) {
        chordsToLoad.add(currentChordNameForCache);
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
  }, [uniqueChordsForGuitarDiagrams, currentChordNameForCache, chordDataCache]);

  // Unfiltered chord data for guitar diagrams (always shows all chords with consistent corrections)
  const uniqueChordDataForGuitarDiagrams = useMemo(() => {
    const seenChords = new Set<string>();
    return uniqueChordsForGuitarDiagrams
      .filter(chord => !seenChords.has(chord) && seenChords.add(chord))
      .map(chord => ({ name: chord, data: chordDataCache.get(chord) || null }));
  }, [uniqueChordsForGuitarDiagrams, chordDataCache]);



  // Unfiltered chord progression for guitar diagrams (always shows all chords regardless of Roman numeral toggle)
  const getUniqueChordProgressionForGuitarDiagrams = useMemo(() => {
    if (!processedChordData.entries.length) return [];
    const uniqueProgression = [];
    let lastChord = null;
    const skipCount = (resolvedChordGridData?.paddingCount || 0) + (resolvedChordGridData?.shiftCount || 0);
    for (let i = 0; i < processedChordData.entries.length; i++) {
      const shapeChord = processedChordData.entries[i]?.shape || 'N.C.';
      const isShiftCell = i < (resolvedChordGridData?.shiftCount || 0) && !shapeChord;
      const isPaddingCell = i >= (resolvedChordGridData?.shiftCount || 0)
        && i < skipCount
        && shapeChord === 'N.C.'
        && Boolean(resolvedChordGridData?.hasPadding);
      if (isShiftCell || isPaddingCell) continue;
      if (shapeChord) {
        if (shapeChord !== lastChord) {
          uniqueProgression.push({ chord: shapeChord, startIndex: i, timestamp: resolvedChordGridData?.beats[i] || 0 });
          lastChord = shapeChord;
        }
      }
    }
    return uniqueProgression;
  }, [processedChordData.entries, resolvedChordGridData]);

  const currentChordInProgressionIndex = useMemo(() => {
    const progression = getUniqueChordProgressionForGuitarDiagrams;
    if (progression.length === 0) return 0;

    const foundIndex = progression.findIndex((chordInfo, index) => (
      currentBeatIndex >= chordInfo.startIndex
      && (index + 1 === progression.length || currentBeatIndex < progression[index + 1].startIndex)
    ));

    return foundIndex === -1 ? 0 : foundIndex;
  }, [getUniqueChordProgressionForGuitarDiagrams, currentBeatIndex]);

  const visibleChordRange = useMemo(() => {
    const progression = getUniqueChordProgressionForGuitarDiagrams;
    if (progression.length === 0) return [];
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
  }, [getUniqueChordProgressionForGuitarDiagrams, currentChordInProgressionIndex, windowWidth]);


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
    <div className={`guitar-chords-tab space-y-2 sm:space-y-3 ${className}`}>
      {/* Beat & Chord Progression Section */}
      <div className="chord-grid-section space-y-2">
        <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-medium text-gray-700 dark:text-gray-300 sm:text-lg">Beat & Chord Progression</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
            {/* Shape/Sound label toggle - appears to the left so capo stays in place beside view */}
            {capoFret > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">Label:</span>
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
                <div className="hidden h-6 w-px bg-gray-300 dark:bg-gray-600 sm:block" />
              </>
            )}

            {/* Capo control */}
            <div
              className="relative flex items-center gap-2"
              onMouseEnter={openCapoPreview}
              onMouseLeave={scheduleCapoPreviewClose}
              onFocus={openCapoPreview}
              onBlur={handleCapoPreviewBlur}
            >
              <div className="flex items-center gap-1.5">
                <label htmlFor="capo-input" className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
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

              <AnimatePresence>
                {isCapoPreviewOpen && (
                  <>
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-full z-30 h-3 w-[min(22rem,calc(100vw-2rem))] sm:left-auto sm:right-0"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="absolute left-0 top-[calc(100%+0.25rem)] z-40 w-[min(22rem,calc(100vw-2rem))] sm:left-auto sm:right-0"
                      onMouseEnter={openCapoPreview}
                      onMouseLeave={scheduleCapoPreviewClose}
                    >
                      <CapoNeckPreview
                        capoFret={capoFret}
                        suggestedCapoFret={suggestedCapo?.capoFret ?? null}
                        onCapoFretChange={(fret) => setCapoFret(fret)}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="hidden h-6 w-px bg-gray-300 dark:bg-gray-600 sm:block" />

            {/* View mode toggle */}
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">View:</span>
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button onClick={() => setViewMode('animated')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${viewMode === 'animated' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Animated</button>
              <button onClick={() => setViewMode('summary')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${viewMode === 'summary' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Summary</button>
            </div>
          </div>
        </div>
        <ScrollableTabContainer heightClass="h-[8.5rem] sm:h-32 md:h-40 lg:h-48">
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
                  {visibleChordRange.map((chordInfo) => {
                    // Get segmentation color for this chord position
                    // Use the timestamp from the chord info for accurate mapping
                    const timestamp = resolvedChordGridData?.beats[chordInfo.startIndex];
                    const segmentationColor = getSegmentationColorForBeat(
                      chordInfo.startIndex,
                      resolvedChordGridData?.beats || [],
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
                        }}
                      >
                        <GuitarChordDiagram
                          chordData={chordDataCache.get(chordInfo.chord) || null}
                          positionIndex={chordPositions[chordInfo.chord] || 0}
                          size={diagramConfig.size}
                          customWidth={diagramConfig.diagramWidth}
                          customHeight={diagramConfig.diagramHeight}
                          showChordName={true}
                          displayName={chordInfo.chord}
                          soundingChordName={
                            processedChordData.soundingNameByIndex.get(chordInfo.startIndex)
                            || processedChordData.soundingNameByShape.get(chordInfo.chord)
                          }
                          isFocused={chordInfo.isCurrent}
                          segmentationColor={segmentationColor}
                          showPositionSelector={chordInfo.isCurrent}
                          onPositionChange={(positionIndex) => handlePositionChange(chordInfo.chord, positionIndex)}
                          capoFret={capoFret}
                          capoLabelMode={capoLabelMode}
                          showRomanNumerals={false}
                          romanNumeral=""
                          labelClassName={diagramConfig.labelClass}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
            </div>
          </div>
        ) : !isLoadingChords && (
          <div className="summary-chord-view relative p-4 sm:p-6">
            <h3 className="mb-4 text-center text-base font-medium text-gray-700 dark:text-gray-300 sm:mb-6 sm:text-lg">All Chords in Song ({uniqueChordsForGuitarDiagrams.length} unique)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4 md:gap-6 justify-items-center">
              {uniqueChordDataForGuitarDiagrams.map(({name, data}, index) => (
                <div key={index} className="flex justify-center">
                  <GuitarChordDiagram
                    chordData={data}
                    positionIndex={chordPositions[name] || 0}
                    size="medium"
                    showChordName={true}
                    className="hover:scale-105 transition-transform"
                    displayName={name}
                    soundingChordName={processedChordData.soundingNameByShape.get(name)}
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
