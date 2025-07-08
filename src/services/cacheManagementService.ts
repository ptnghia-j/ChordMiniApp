// Cache Management Service
// Extracted from src/app/analyze/[videoId]/page.tsx
// Handles all cache checking and management operations

/* eslint-disable @typescript-eslint/no-explicit-any */
// ✅ TEMPORARY: Type compatibility issues will be resolved in future iteration

import { getTranscription } from '@/services/firestoreService';

interface LyricsData {
  lines: Array<{
    text: string;
    start: number;
    end: number;
    words?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
  }>;
  error?: string;
}

interface CacheCheckDependencies {
  videoId: string;
  beatDetector: string;
  chordDetector: string;
  audioProcessingState: {
    isExtracted: boolean;
    audioUrl: string | null;
    isAnalyzed: boolean;
    isAnalyzing: boolean;
  };
  modelsInitialized: boolean;
  setCacheAvailable: (available: boolean) => void;
  setCacheCheckCompleted: (completed: boolean) => void;
  lyrics: LyricsData | null;
  setHasCachedLyrics: (hasCached: boolean) => void;
}

/**
 * Check for cached analysis availability (but don't auto-load)
 */
export const checkCachedAnalysisAvailability = async (deps: CacheCheckDependencies): Promise<void> => {
  const {
    videoId,
    beatDetector,
    chordDetector,
    audioProcessingState,
    modelsInitialized,
    setCacheAvailable,
    setCacheCheckCompleted
  } = deps;

  if (audioProcessingState.isExtracted && audioProcessingState.audioUrl && !audioProcessingState.isAnalyzed && !audioProcessingState.isAnalyzing && modelsInitialized) {
    // console.log('🔍 Checking for cached analysis availability (not auto-loading)...');

    try {
      // Add a small delay to ensure Firebase is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Reset cache state before checking
      setCacheAvailable(false);
      setCacheCheckCompleted(false);

      // Check if cached analysis exists for current models
      // console.log(`🔍 Cache check: Looking for ${beatDetector} + ${chordDetector} combination`);
      const cachedData = await getTranscription(videoId, beatDetector, chordDetector);

      if (cachedData) {
        // console.log(`✅ Found cached analysis for ${beatDetector} + ${chordDetector} models (not auto-loading)`);
        // console.log(`🔍 Cache contains: beatModel="${cachedData.beatModel}", chordModel="${cachedData.chordModel}"`);
        // console.log('🔍 NOTE: Cached results are available but require manual "Start Analysis" to load');
        setCacheAvailable(true);
      } else {
        // console.log(`❌ No cached analysis found for ${beatDetector} + ${chordDetector} models`);
        setCacheAvailable(false);
      }

      setCacheCheckCompleted(true);
    } catch (error) {
      console.error('Error checking cached analysis:', error);
      setCacheAvailable(false);
      setCacheCheckCompleted(true);
    }
  }
};

/**
 * Check for cached enharmonic correction data
 */
export const checkCachedEnharmonicData = async (
  videoId: string,
  beatDetector: string,
  chordDetector: string,
  analysisResults: any,
  chordCorrections: any,
  setChordCorrections: (corrections: any) => void,
  setSequenceCorrections: (corrections: any) => void
): Promise<void> => {
  if (analysisResults?.chords && analysisResults.chords.length > 0 && !chordCorrections) {
    try {
      const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);
      
      if (cachedTranscription && (cachedTranscription as any).chordCorrections) {
        // Loading cached chord corrections (new format)
        setChordCorrections((cachedTranscription as any).chordCorrections);
        // console.log('✅ Loaded cached chord corrections');
      }

      // Check for sequence corrections (enhanced format)
      if (cachedTranscription && (cachedTranscription as any).sequenceCorrections) {
        setSequenceCorrections((cachedTranscription as any).sequenceCorrections);
        console.log('✅ Loaded cached sequence corrections');
      }
    } catch (error) {
      console.error('Error loading cached enharmonic data:', error);
    }
  }
};

/**
 * Check for cached lyrics (enhanced version)
 */
export const checkCachedLyrics = async (
  videoId: string,
  params: any,
  lyrics: LyricsData | null,
  setHasCachedLyrics: (hasCached: boolean) => void,
  audioUrl?: string // Add optional audioUrl parameter
): Promise<void> => {
  if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
    try {
      const response = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: params?.videoId || videoId,
          audioPath: audioUrl || null, // Use provided audioUrl if available
          forceRefresh: false,
          checkCacheOnly: true // New flag to only check cache without processing
        }),
      });

      const data = await response.json();
      // console.log('Cache check lyrics response:', data);

      if (response.ok && data.success && data.lyrics) {
        if (data.lyrics.lines && Array.isArray(data.lyrics.lines) && data.lyrics.lines.length > 0) {
          // console.log(`Found ${data.lyrics.lines.length} lines of cached lyrics (not auto-loading)`);
          // Set cached lyrics state to update UI
          setHasCachedLyrics(true);
          // Don't auto-load, just update UI state that cached lyrics are available
          // User will need to click "AI Transcribe" to load them
        }
      }
    } catch {
      // console.log('No cached lyrics found or error checking');
    }
  }
};

/**
 * Update transcription cache with key signature and enharmonic correction data
 */
export const updateTranscriptionWithKey = async (
  videoId: string,
  beatDetector: string,
  chordDetector: string,
  keyResult: any,
  saveTranscription: any
): Promise<void> => {
  try {
    const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);
    if (cachedTranscription) {
      await saveTranscription({
        ...cachedTranscription,
        keySignature: keyResult.primaryKey,
        keyModulation: keyResult.modulation,
        chordCorrections: keyResult.chordCorrections,
        sequenceCorrections: keyResult.sequenceCorrections
      });
      // console.log('✅ Updated transcription cache with key signature and enharmonic corrections');
    }
  } catch (error) {
    console.error('Error updating transcription cache with key data:', error);
  }
};
