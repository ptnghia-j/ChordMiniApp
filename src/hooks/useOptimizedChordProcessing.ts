import { useMemo, useCallback, useRef } from 'react';

interface ChordCorrectionCache {
  [key: string]: string;
}

interface RomanNumeralCache {
  [key: string]: string;
}

interface ChordProcessingOptions {
  chords: string[];
  hasPadding: boolean;
  timeSignature: number;
  shiftCount: number;
  showCorrectedChords: boolean;
  sequenceCorrections: {
    originalSequence: string[];
    correctedSequence: string[];
  } | null;
  showRomanNumerals: boolean;
  romanNumeralData: {
    analysis: string[];
    keyContext: string;
  } | null;
}

/**
 * Performance-optimized chord processing hook with advanced caching
 * Minimizes recalculations and provides memoized processing functions
 */
export const useOptimizedChordProcessing = ({
  chords,
  hasPadding,
  timeSignature,
  shiftCount,
  showCorrectedChords,
  sequenceCorrections,
  showRomanNumerals,
  romanNumeralData,
}: ChordProcessingOptions) => {
  // Persistent caches using refs to survive re-renders
  const chordCorrectionCache = useRef<ChordCorrectionCache>({});
  const romanNumeralCache = useRef<RomanNumeralCache>({});
  const processedChordsCache = useRef<Map<string, string[]>>(new Map());

  // Cache key for processed chords
  const processedChordsCacheKey = useMemo(() => {
    return JSON.stringify({
      chords: chords.slice(0, 10), // Sample for cache key
      hasPadding,
      shiftCount,
      showCorrectedChords,
      sequenceCorrections: sequenceCorrections ? {
        original: sequenceCorrections.originalSequence.slice(0, 10),
        corrected: sequenceCorrections.correctedSequence.slice(0, 10),
      } : null,
    });
  }, [chords, hasPadding, shiftCount, showCorrectedChords, sequenceCorrections]);

  // Memoized chord correction function with caching
  const getCorrectedChord = useCallback((originalChord: string, index: number): string => {
    const cacheKey = `${originalChord}-${index}-${showCorrectedChords}`;
    
    if (chordCorrectionCache.current[cacheKey]) {
      return chordCorrectionCache.current[cacheKey];
    }

    let correctedChord = originalChord;

    if (showCorrectedChords && sequenceCorrections) {
      const { originalSequence, correctedSequence } = sequenceCorrections;
      let chordSequenceIndex = index;
      
      if (hasPadding) {
        chordSequenceIndex -= shiftCount;
      }
      
      if (
        chordSequenceIndex >= 0 &&
        chordSequenceIndex < originalSequence.length &&
        originalSequence[chordSequenceIndex] === originalChord
      ) {
        correctedChord = correctedSequence[chordSequenceIndex];
      }
    }

    // Cache the result
    chordCorrectionCache.current[cacheKey] = correctedChord;
    return correctedChord;
  }, [showCorrectedChords, sequenceCorrections, hasPadding, shiftCount]);

  // Memoized Roman numeral function with caching
  const getRomanNumeral = useCallback((chord: string, index: number): string => {
    if (!showRomanNumerals || !romanNumeralData) return '';

    const cacheKey = `${chord}-${index}-${romanNumeralData.keyContext}`;

    if (romanNumeralCache.current[cacheKey]) {
      return romanNumeralCache.current[cacheKey];
    }

    let romanNumeral = '';

    if (index < romanNumeralData.analysis.length) {
      const rawRomanNumeral = romanNumeralData.analysis[index];
      // For caching purposes, we'll just return the raw roman numeral
      // The formatting can be done at render time if needed
      romanNumeral = rawRomanNumeral;
    }

    // Cache the result
    romanNumeralCache.current[cacheKey] = romanNumeral;
    return romanNumeral;
  }, [showRomanNumerals, romanNumeralData]);

  // Memoized processed chords with cache
  const processedChords = useMemo(() => {
    // Check cache first
    if (processedChordsCache.current.has(processedChordsCacheKey)) {
      return processedChordsCache.current.get(processedChordsCacheKey)!;
    }

    const result = chords.map((chord, index) => {
      return getCorrectedChord(chord, index);
    });

    // Cache the result
    processedChordsCache.current.set(processedChordsCacheKey, result);
    
    // Limit cache size to prevent memory leaks
    if (processedChordsCache.current.size > 10) {
      const firstKey = processedChordsCache.current.keys().next().value;
      if (firstKey) {
        processedChordsCache.current.delete(firstKey);
      }
    }

    return result;
  }, [chords, getCorrectedChord, processedChordsCacheKey]);

  // Memoized display chord function
  const getDisplayChord = useCallback((index: number): string => {
    if (index < 0 || index >= processedChords.length) return '';
    return processedChords[index] || '';
  }, [processedChords]);

  // Memoized chord label visibility function
  const shouldShowChordLabel = useCallback((index: number): boolean => {
    const chord = chords[index];
    if (!chord || chord === 'N.C.' || chord === '') return false;
    
    // Don't show label for padding cells
    if (hasPadding && index < shiftCount) return false;
    
    return true;
  }, [chords, hasPadding, shiftCount]);

  // Memoized measure grouping
  const groupedByMeasure = useMemo(() => {
    const groups = [];
    
    for (let i = 0; i < chords.length; i += timeSignature) {
      const measureChords = [];
      for (let j = 0; j < timeSignature; j++) {
        measureChords.push(i + j);
      }
      groups.push({
        measureIndex: Math.floor(i / timeSignature),
        chordIndices: measureChords,
        rowIndex: Math.floor(groups.length / 4), // 4 measures per row
      });
    }
    
    return groups;
  }, [chords.length, timeSignature]);

  // Memoized unique chords for optimization
  const uniqueChords = useMemo(() => {
    const unique = new Set(processedChords.filter(chord => chord && chord !== 'N.C.'));
    return Array.from(unique);
  }, [processedChords]);

  // Cache cleanup function
  const clearCaches = useCallback(() => {
    chordCorrectionCache.current = {};
    romanNumeralCache.current = {};
    processedChordsCache.current.clear();
  }, []);

  // Performance metrics
  const performanceMetrics = useMemo(() => ({
    totalChords: chords.length,
    uniqueChords: uniqueChords.length,
    cacheHitRatio: {
      corrections: Object.keys(chordCorrectionCache.current).length,
      romanNumerals: Object.keys(romanNumeralCache.current).length,
      processedChords: processedChordsCache.current.size,
    },
  }), [chords.length, uniqueChords.length]);

  return {
    // Processed data
    processedChords,
    groupedByMeasure,
    uniqueChords,
    
    // Processing functions
    getDisplayChord,
    getCorrectedChord,
    getRomanNumeral,
    shouldShowChordLabel,
    
    // Cache management
    clearCaches,
    performanceMetrics,
  };
};
