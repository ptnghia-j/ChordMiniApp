/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTranscription, saveTranscription } from './firestoreService';

// Types for cache management
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
  isExtracted: boolean;
  audioUrl: string | null;
  isAnalyzed: boolean;
  isAnalyzing: boolean;
}

interface CacheManagerDependencies {
  videoId: string;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  analysisResults: AnalysisResult | null;
  audioProcessingState: AudioProcessingState;
  modelsInitialized: boolean;
  
  // State setters
  setChordCorrections: (corrections: Record<string, string> | null) => void;
  setKeySignature: (key: string | null) => void;
  setSequenceCorrections: (corrections: any) => void;
  setCacheAvailable: (available: boolean) => void;
  setCacheCheckCompleted: (completed: boolean) => void;
  setIsDetectingKey: (detecting: boolean) => void;
  setKeyDetectionAttempted: (attempted: boolean) => void;
  
  // Current state values
  chordCorrections: Record<string, string> | null;
  isDetectingKey: boolean;
  keyDetectionAttempted: boolean;
}

/**
 * Check for cached enharmonic correction data when analysis results are loaded
 * Extracted from lines 363-405 of original component
 */
export const checkCachedEnharmonicData = async (deps: CacheManagerDependencies): Promise<void> => {
  const {
    analysisResults,
    chordCorrections,
    videoId,
    beatDetector,
    chordDetector,
    setChordCorrections,
    setKeySignature
  } = deps;

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

/**
 * Update the transcription cache with key signature and enharmonic correction data
 * Extracted from lines 441-463 of original component
 */
export const updateTranscriptionWithKey = async (
  videoId: string,
  beatDetector: BeatDetectorType,
  chordDetector: ChordDetectorType,
  keySignature: string,
  modulation?: any,
  corrections?: Record<string, string> | null
): Promise<void> => {
  try {
    // Get current model values at execution time
    const currentBeatDetector = beatDetector;
    const currentChordDetector = chordDetector;
    const cachedTranscription = await getTranscription(videoId, currentBeatDetector, currentChordDetector);
    if (cachedTranscription) {
      await saveTranscription({
        ...cachedTranscription,
        keySignature: keySignature,
        keyModulation: modulation,
        chordCorrections: corrections || null
      });
      // console.log('Updated transcription cache with key signature and enharmonic correction data:', keySignature);
    }
  } catch (error) {
    console.error('Failed to update transcription cache with key signature and enharmonic correction data:', error);
  }
};

/**
 * Check cached analysis availability for current model combination
 * Extracted from lines 743-785 of original component
 */
export const checkCachedAnalysisAvailability = async (deps: CacheManagerDependencies): Promise<void> => {
  const {
    audioProcessingState,
    modelsInitialized,
    videoId,
    beatDetector,
    chordDetector,
    setCacheAvailable,
    setCacheCheckCompleted
  } = deps;

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
        // Found cached analysis (not auto-loading)
        setCacheAvailable(true);
      } else {
        // No cached analysis found - user action required
        setCacheAvailable(false);
      }

      setCacheCheckCompleted(true);

    } catch (error) {
      console.error('Error checking cached analysis availability:', error);
      console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to run analysis');
    }
  }
};

/**
 * Perform key detection with cache integration and update transcription cache
 * Extracted from lines 407-475 of original component
 */
export const performKeyDetectionWithCache = async (deps: CacheManagerDependencies): Promise<void> => {
  const {
    analysisResults,
    isDetectingKey,
    chordCorrections,
    keyDetectionAttempted,
    videoId,
    beatDetector,
    chordDetector,
    setIsDetectingKey,
    setKeyDetectionAttempted,
    setKeySignature,
    setSequenceCorrections,
    setChordCorrections
  } = deps;

  if (analysisResults?.chords && analysisResults.chords.length > 0 && !isDetectingKey && !chordCorrections && !keyDetectionAttempted) {
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
    try {
      const { detectKey } = await import('./keyDetectionService');
      
      // Use cache for sequence corrections (no bypass)
      const result = await detectKey(chordData, true, false); // Request enharmonic correction, use cache

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
        await updateTranscriptionWithKey(
          videoId,
          beatDetector,
          chordDetector,
          result.primaryKey,
          result.modulation,
          result.corrections
        );
      }
    } catch (error) {
      console.error('Failed to detect key:', error);
      setKeySignature(null);
    } finally {
      setIsDetectingKey(false);
    }
  }
};



/**
 * Generate cache key for model combination
 */
export const generateCacheKey = (
  videoId: string,
  beatDetector: BeatDetectorType,
  chordDetector: ChordDetectorType
): string => {
  return `${videoId}_${beatDetector}_${chordDetector}`;
};

/**
 * Validate cache data structure
 */
export const validateCacheData = (data: any): boolean => {
  return data &&
         typeof data === 'object' &&
         data.chords &&
         Array.isArray(data.chords) &&
         data.beats &&
         Array.isArray(data.beats);
};
