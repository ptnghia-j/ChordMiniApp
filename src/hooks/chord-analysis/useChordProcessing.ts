import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook to manage chord processing operations
 * Consolidates chord simplification, roman numerals, and chord editing logic
 */
export const useChordProcessing = () => {
  // Chord processing state
  const [simplifyChords, setSimplifyChords] = useState<boolean>(false);
  const [showRomanNumerals, setShowRomanNumerals] = useState<boolean>(false);
  const [romanNumeralsRequested, setRomanNumeralsRequested] = useState<boolean>(false);
  
  // Roman numeral data state
  const [romanNumeralData, setRomanNumeralData] = useState<{
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null>(null);

  // Chord processing operations
  const toggleChordSimplification = useCallback(() => {
    setSimplifyChords(prev => {
      const newValue = !prev;
      console.log(`🎼 Chord simplification toggled: ${newValue}`);
      return newValue;
    });
  }, []);

  const toggleRomanNumerals = useCallback(() => {
    setShowRomanNumerals(prev => {
      const newValue = !prev;
      if (newValue && !romanNumeralsRequested) {
        setRomanNumeralsRequested(true);
      }
      console.log(`🏛️ Roman numerals toggled: ${newValue}`);
      return newValue;
    });
  }, [romanNumeralsRequested]);

  const updateRomanNumeralData = useCallback((data: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null) => {
    setRomanNumeralData(data);
    if (data) {
      console.log('🏛️ Roman numeral data updated:', data.keyContext);
    }
  }, []);

  const resetChordProcessing = useCallback(() => {
    setSimplifyChords(false);
    setShowRomanNumerals(false);
    setRomanNumeralsRequested(false);
    setRomanNumeralData(null);
    console.log('🔄 Chord processing state reset');
  }, []);

  // Memoized processing flags
  const processingFlags = useMemo(() => ({
    simplifyChords,
    showRomanNumerals,
    romanNumeralsRequested,
    hasRomanNumeralData: !!romanNumeralData,
  }), [simplifyChords, showRomanNumerals, romanNumeralsRequested, romanNumeralData]);

  return {
    // Chord processing state
    simplifyChords,
    showRomanNumerals,
    romanNumeralsRequested,
    romanNumeralData,
    
    // Processing flags
    processingFlags,
    
    // Chord processing operations
    setSimplifyChords,
    setShowRomanNumerals,
    setRomanNumeralsRequested,
    setRomanNumeralData,
    toggleChordSimplification,
    toggleRomanNumerals,
    updateRomanNumeralData,
    resetChordProcessing,
  };
};
