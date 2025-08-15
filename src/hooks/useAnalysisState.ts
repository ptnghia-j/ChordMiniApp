import { useState, useEffect, useRef, useMemo } from 'react';
import { getTranscription, saveTranscription } from '../services/firestoreService';

// Types for analysis state management
type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

interface AnalysisResult {
  chords: Array<{chord: string, time?: number, start?: number}>;
  beats: Array<{time: number, beatNum?: number} | number>;
  downbeats: number[];
  downbeats_with_measures: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel: string;
  chordModel: string;
  audioDuration: number;
  beatDetectionResult: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
  };
}

interface AudioProcessingState {
  isExtracting: boolean;
  isDownloading: boolean;
  isExtracted: boolean;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
  audioUrl: string | null;
  videoUrl: string | null;
  youtubeEmbedUrl: string | null;
  fromCache: boolean;
  fromFirestoreCache: boolean;
  error: string | null;
  suggestion?: string | null;
}

interface SequenceCorrections {
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
  romanNumerals?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
}

interface UseAnalysisStateProps {
  videoId: string;
  analysisResults: AnalysisResult | null;
  audioProcessingState: AudioProcessingState;
}

interface UseAnalysisStateReturn {
  // Model selection state
  beatDetector: BeatDetectorType;
  setBeatDetector: (detector: BeatDetectorType) => void;
  chordDetector: ChordDetectorType;
  setChordDetector: (detector: ChordDetectorType) => void;
  beatDetectorRef: React.MutableRefObject<BeatDetectorType>;
  chordDetectorRef: React.MutableRefObject<ChordDetectorType>;
  
  // Cache management state
  cacheAvailable: boolean;
  setCacheAvailable: (available: boolean) => void;
  cacheCheckCompleted: boolean;
  setCacheCheckCompleted: (completed: boolean) => void;
  modelsInitialized: boolean;
  setModelsInitialized: (initialized: boolean) => void;
  
  // Key detection state
  keySignature: string | null;
  setKeySignature: (key: string | null) => void;
  isDetectingKey: boolean;
  setIsDetectingKey: (detecting: boolean) => void;
  keyDetectionAttempted: boolean;
  setKeyDetectionAttempted: (attempted: boolean) => void;
  
  // Chord corrections state
  chordCorrections: Record<string, string> | null;
  setChordCorrections: (corrections: Record<string, string> | null) => void;
  showCorrectedChords: boolean;
  setShowCorrectedChords: (show: boolean) => void;
  sequenceCorrections: SequenceCorrections | null;
  setSequenceCorrections: (corrections: SequenceCorrections | null) => void;
  hasAutoEnabledCorrections: boolean;
  setHasAutoEnabledCorrections: (enabled: boolean) => void;
  
  // Memoized corrections
  memoizedChordCorrections: Record<string, string> | null;
  memoizedSequenceCorrections: SequenceCorrections | null;
}

/**
 * Custom hook for managing analysis state including model selection, cache management, and key detection
 * Extracted from lines 188-245, 275-360, 363-475, 743-785 of original component
 */
export const useAnalysisState = ({ 
  videoId, 
  analysisResults, 
  audioProcessingState 
}: UseAnalysisStateProps): UseAnalysisStateReturn => {
  
  // Model selection with localStorage persistence (lines 188-206)
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_beat_detector');
      if (saved && ['auto', 'madmom', 'beat-transformer'].includes(saved)) {
        return saved as BeatDetectorType;
      }
    }
    return 'beat-transformer';
  });

  const [chordDetector, setChordDetector] = useState<ChordDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_chord_detector');
      if (saved && ['chord-cnn-lstm', 'btc-sl', 'btc-pl'].includes(saved)) {
        return saved as ChordDetectorType;
      }
    }
    return 'chord-cnn-lstm';
  });

  // Cache availability state (lines 208-211)
  const [cacheAvailable, setCacheAvailable] = useState<boolean>(false);
  const [cacheCheckCompleted, setCacheCheckCompleted] = useState<boolean>(false);
  const [modelsInitialized, setModelsInitialized] = useState<boolean>(false);

  // Use refs to ensure we always get the latest model values (lines 213-224)
  const beatDetectorRef = useRef(beatDetector);
  const chordDetectorRef = useRef(chordDetector);

  // Update refs when state changes
  useEffect(() => {
    beatDetectorRef.current = beatDetector;
  }, [beatDetector]);

  useEffect(() => {
    chordDetectorRef.current = chordDetector;
  }, [chordDetector]);

  // Reset cache state when models change and persist to localStorage (lines 226-243)
  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
    // Persist beat detector preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_beat_detector', beatDetector);
    }
  }, [beatDetector]);

  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
    // Persist chord detector preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_chord_detector', chordDetector);
    }
  }, [chordDetector]);

  // Mark models as initialized after component mount to allow user interaction (lines 245-252)
  useEffect(() => {
    const timer = setTimeout(() => {
      setModelsInitialized(true);
    }, 1000); // Give user 1 second to see and potentially change model selection

    return () => clearTimeout(timer);
  }, []);

  // Key signature state (lines 274-276)
  const [keySignature, setKeySignature] = useState<string | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);
  const [keyDetectionAttempted, setKeyDetectionAttempted] = useState(false);

  // Enharmonic correction state (lines 278-303)
  const [chordCorrections, setChordCorrections] = useState<Record<string, string> | null>(null);
  const [showCorrectedChords, setShowCorrectedChords] = useState(false);
  // NEW: Enhanced sequence-based corrections
  const [sequenceCorrections, setSequenceCorrections] = useState<SequenceCorrections | null>(null);

  // Memoize chord corrections to prevent useMemo dependency changes
  const memoizedChordCorrections = useMemo(() => chordCorrections, [chordCorrections]);
  const memoizedSequenceCorrections = useMemo(() => sequenceCorrections, [sequenceCorrections]);

  // Auto-enable corrections when sequence corrections are available (only once) (lines 307-314)
  const [hasAutoEnabledCorrections, setHasAutoEnabledCorrections] = useState(false);
  useEffect(() => {
    if (sequenceCorrections && sequenceCorrections.correctedSequence.length > 0 && !showCorrectedChords && !hasAutoEnabledCorrections) {
      setShowCorrectedChords(true);
      setHasAutoEnabledCorrections(true);
    }
  }, [sequenceCorrections, showCorrectedChords, hasAutoEnabledCorrections]);

  // Check for cached enharmonic correction data when analysis results are loaded (lines 362-405)
  useEffect(() => {
    const checkCachedEnharmonicData = async () => {
      if (analysisResults?.chords && analysisResults.chords.length > 0 && !chordCorrections) {
        try {
          // Get current model values at execution time
          const currentBeatDetector = beatDetector;
          const currentChordDetector = chordDetector;
          const cachedTranscription = await getTranscription(videoId, currentBeatDetector, currentChordDetector);
          // Check cached transcription data for chord corrections

          if (cachedTranscription && cachedTranscription.chordCorrections) {
            // Loading cached chord corrections (new format)
            setChordCorrections(cachedTranscription.chordCorrections);
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
          } else if (cachedTranscription && cachedTranscription.originalChords && cachedTranscription.correctedChords) {
            // Backward compatibility: convert old format to new format
            const corrections: Record<string, string> = {};
            for (let i = 0; i < cachedTranscription.originalChords.length && i < cachedTranscription.correctedChords.length; i++) {
              const original = cachedTranscription.originalChords[i];
              const corrected = cachedTranscription.correctedChords[i];
              if (original !== corrected) {
                corrections[original] = corrected;
              }
            }
            if (Object.keys(corrections).length > 0) {
              setChordCorrections(corrections);
            }
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
          } else {
            // No cached chord corrections found
          }
        } catch (error) {
          console.error('Failed to load cached enharmonic correction data:', error);
        }
      }
    };

    checkCachedEnharmonicData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisResults?.chords, videoId, chordCorrections]); // Removed beatDetector and chordDetector to prevent unnecessary re-runs

  // Key detection effect - only run once when analysis results are available (lines 407-475)
  useEffect(() => {
    if (analysisResults?.chords && analysisResults.chords.length > 0 && !isDetectingKey && !keyDetectionAttempted) {
      setIsDetectingKey(true);
      setKeyDetectionAttempted(true);

      // Prepare chord data for key detection - filter out chords without valid time
      const chordData = analysisResults.chords
        .filter((chord) => chord.time !== undefined && chord.time !== null)
        .map((chord) => ({
          chord: chord.chord,
          time: chord.time as number // Safe to cast since we filtered out undefined/null
        }));

      // Import and call key detection service with enharmonic correction
      import('../services/keyDetectionService').then(({ detectKey }) => {
        // Use cache for sequence corrections (no bypass)
        detectKey(chordData, true, false) // Request enharmonic correction, use cache
          .then(result => {

            setKeySignature(result.primaryKey);

            // Handle sequence-based corrections (preferred)
            if (result.sequenceCorrections && result.sequenceCorrections.correctedSequence) {
              setSequenceCorrections(result.sequenceCorrections);

              // Also set legacy corrections for backward compatibility
              if (result.corrections && Object.keys(result.corrections).length > 0) {
                setChordCorrections(result.corrections);
              }
            } else if (result.corrections && Object.keys(result.corrections).length > 0) {
              // FALLBACK: Use legacy chord corrections
              setChordCorrections(result.corrections);
            }

            // Update the transcription cache with key signature and enharmonic correction data
            if (result.primaryKey && result.primaryKey !== 'Unknown') {
              const updateTranscriptionWithKey = async () => {
                try {
                  // Get current model values at execution time
                  const currentBeatDetector = beatDetector;
                  const currentChordDetector = chordDetector;
                  const cachedTranscription = await getTranscription(videoId, currentBeatDetector, currentChordDetector);
                  if (cachedTranscription) {
                    await saveTranscription({
                      ...cachedTranscription,
                      keySignature: result.primaryKey,
                      keyModulation: result.modulation,
                      chordCorrections: result.corrections || null
                    });
                    // console.log('Updated transcription cache with key signature and enharmonic correction data:', result.primaryKey);
                  }
                } catch (error) {
                  console.error('Failed to update transcription cache with key signature and enharmonic correction data:', error);
                }
              };
              updateTranscriptionWithKey();
            }
          })
          .catch(error => {
            console.error('Failed to detect key:', error);
            setKeySignature(null);
          })
          .finally(() => {
            setIsDetectingKey(false);
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisResults?.chords, isDetectingKey, keyDetectionAttempted, videoId]); // Removed beatDetector and chordDetector to prevent unnecessary re-runs

  // Cache availability checking (lines 743-785)
  useEffect(() => {
    const checkCachedAnalysisAvailability = async () => {
      if (audioProcessingState.isExtracted && audioProcessingState.audioUrl && !audioProcessingState.isAnalyzed && !audioProcessingState.isAnalyzing && modelsInitialized) {
        // console.log('🔍 Checking for cached analysis availability (not auto-loading)...');

        try {
          // Add a small delay to ensure Firebase is ready
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Debug: Log the model state values used for cache check
          // console.log('🔍 DEBUG: Cache availability check with models:', {
          //   beatDetector,
          //   chordDetector,
          //   beatDetectorType: typeof beatDetector,
          //   chordDetectorType: typeof chordDetector
          // });

          // Check if cached analysis exists for current models
          // Cache check logging removed for production
          const cachedData = await getTranscription(videoId, beatDetector, chordDetector);

          if (cachedData) {
            console.log(`✅ Found cached analysis for ${beatDetector} + ${chordDetector} models (not auto-loading)`);
            console.log(`🔍 Cache contains: beatModel="${cachedData.beatModel}", chordModel="${cachedData.chordModel}"`);
            // console.log('🔍 NOTE: Cached results are available but require manual "Start Analysis" to load');
            // console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to load cached results or run new analysis');
            setCacheAvailable(true);
          } else {
            console.log(`❌ No cached analysis found for ${beatDetector} + ${chordDetector} models`);
            console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to run new analysis');
            setCacheAvailable(false);
          }

          setCacheCheckCompleted(true);

        } catch (error) {
          console.error('Error checking cached analysis availability:', error);
          console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to run analysis');
        }
      }
    };

    checkCachedAnalysisAvailability();
  }, [audioProcessingState.isExtracted, audioProcessingState.audioUrl, audioProcessingState.isAnalyzed, audioProcessingState.isAnalyzing, videoId, beatDetector, chordDetector, modelsInitialized]);

  return {
    // Model selection state
    beatDetector,
    setBeatDetector,
    chordDetector,
    setChordDetector,
    beatDetectorRef,
    chordDetectorRef,
    
    // Cache management state
    cacheAvailable,
    setCacheAvailable,
    cacheCheckCompleted,
    setCacheCheckCompleted,
    modelsInitialized,
    setModelsInitialized,
    
    // Key detection state
    keySignature,
    setKeySignature,
    isDetectingKey,
    setIsDetectingKey,
    keyDetectionAttempted,
    setKeyDetectionAttempted,
    
    // Chord corrections state
    chordCorrections,
    setChordCorrections,
    showCorrectedChords,
    setShowCorrectedChords,
    sequenceCorrections,
    setSequenceCorrections,
    hasAutoEnabledCorrections,
    setHasAutoEnabledCorrections,
    
    // Memoized corrections
    memoizedChordCorrections,
    memoizedSequenceCorrections,
  };
};
