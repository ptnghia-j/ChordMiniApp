import { getTranscription } from '@/services/firestoreService';
import { apiPost } from '@/config/api';
import { LyricsData } from '@/types/musicAiTypes';

// Types for the service
interface ErrorWithSuggestion extends Error {
  suggestion?: string;
}

type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

interface AnalysisResult {
  chords: Array<{chord: string, time: number}>;
  beats: Array<{time: number, beatNum?: number}>;
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

interface ProcessingContextType {
  stage: string;
  progress: number;
  setStage: (stage: string) => void;
  setProgress: (progress: number) => void;
  setStatusMessage: (message: string) => void;
  startProcessing: () => void;
  completeProcessing: () => void;
  failProcessing: (message: string) => void;
}

interface AudioProcessingServiceDependencies {
  // State setters
  setAudioProcessingState: (updater: (prev: AudioProcessingState) => AudioProcessingState) => void;
  setAnalysisResults: (results: AnalysisResult) => void;
  setDuration: (duration: number) => void;
  setShowExtractionNotification: (show: boolean) => void;
  setLyrics: (lyrics: LyricsData) => void;
  setShowLyrics: (show: boolean) => void;
  setHasCachedLyrics: (cached: boolean) => void;
  setActiveTab: (tab: 'beatChordMap' | 'lyricsChords') => void;
  setIsTranscribingLyrics: (transcribing: boolean) => void;
  setLyricsError: (error: string | null) => void;
  
  // Processing context
  processingContext: ProcessingContextType;
  
  // Audio processing service
  analyzeAudioFromService: (audioUrl: string, beatDetector: BeatDetectorType, chordDetector: ChordDetectorType) => Promise<AnalysisResult>;
  
  // Refs and state
  audioRef: React.RefObject<HTMLAudioElement>;
  extractionLockRef: React.MutableRefObject<boolean>;
  beatDetectorRef: React.MutableRefObject<BeatDetectorType>;
  chordDetectorRef: React.MutableRefObject<ChordDetectorType>;
  
  // URL parameters
  videoId: string;
  titleFromSearch: string | null;
  durationFromSearch: string | null;
  channelFromSearch: string | null;
  thumbnailFromSearch: string | null;
  
  // Current state values
  audioProcessingState: AudioProcessingState;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  progress: number;
  lyrics: LyricsData | null; // Current lyrics state for confirmation check
}

/**
 * Enhanced audio analysis function that integrates with processing context
 * Lines 595-739 from original component
 */
export const handleAudioAnalysis = async (deps: AudioProcessingServiceDependencies): Promise<AnalysisResult | undefined> => {
  const {
    audioProcessingState,
    setAudioProcessingState,
    setAnalysisResults,
    setDuration,
    processingContext,
    analyzeAudioFromService,
    beatDetectorRef,
    chordDetectorRef,
    videoId
  } = deps;

  if (!audioProcessingState.audioUrl) {
    console.error('No audio URL available for analysis');
    return;
  }

  // Get current model values from refs to ensure we have the latest values
  const currentBeatDetector = beatDetectorRef.current;
  const currentChordDetector = chordDetectorRef.current;

  // Debug: Verify we're using the correct models
  // console.log(`🎯 Analysis starting: Using ${currentBeatDetector} + ${currentChordDetector} models`);
  // console.log(`🔍 Model state verification: state beatDetector="${deps.beatDetector}", state chordDetector="${deps.chordDetector}"`);
  // console.log(`🔍 Model ref verification: ref beatDetector="${beatDetectorRef.current}", ref chordDetector="${chordDetectorRef.current}"`);

  try {
    const cachedData = await getTranscription(videoId, currentBeatDetector, currentChordDetector);

    if (cachedData) {
      // Found cached results, loading...

      // Start processing context for loading cached data
      processingContext.startProcessing();
      processingContext.setStage('beat-detection');
      processingContext.setProgress(50);
      processingContext.setStatusMessage('Loading cached analysis results...');

      // Convert cached data to AnalysisResult format
      const analysisResult: AnalysisResult = {
        chords: cachedData.chords || [],
        beats: cachedData.beats || [],
        downbeats: cachedData.downbeats || [],
        downbeats_with_measures: Array.isArray(cachedData.downbeats_with_measures)
          ? cachedData.downbeats_with_measures.map((item: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
              typeof item === 'number' ? item : item.time || 0
            )
          : [],
        synchronizedChords: cachedData.synchronizedChords || [],
        beatModel: cachedData.beatModel || 'beat-transformer',
        chordModel: cachedData.chordModel || 'chord-cnn-lstm',
        audioDuration: cachedData.audioDuration || 0,
        beatDetectionResult: {
          time_signature: cachedData.timeSignature ?? undefined,
          bpm: cachedData.bpm ?? undefined,
          beatShift: cachedData.beatShift ?? undefined
        }
      };

      // Update state to reflect cached analysis is loaded
      setAudioProcessingState(prev => ({
        ...prev,
        isAnalyzing: false,
        isAnalyzed: true,
        fromFirestoreCache: true
      }));

      // Set analysis results directly
      setAnalysisResults(analysisResult);

      // Update duration if available
      if (cachedData.audioDuration && cachedData.audioDuration > 0) {
        setDuration(cachedData.audioDuration);
        // console.log(`🎵 Updated duration from cached analysis: ${cachedData.audioDuration.toFixed(1)} seconds`);
      }

      // Complete processing context
      processingContext.completeProcessing();
      processingContext.setStage('complete');
      processingContext.setProgress(100);
      processingContext.setStatusMessage('Cached analysis loaded successfully');

      return analysisResult;
    } else {
      // console.log(`❌ No cached results found for ${currentBeatDetector} + ${currentChordDetector}, running new analysis...`);
    }
  } catch (cacheError) {
    console.warn('Cache check failed, proceeding with new analysis:', cacheError);
  }

  // No cached results found, proceed with new analysis
  // console.log('🔄 Starting new audio analysis...');

  let stageTimeout: NodeJS.Timeout | null = null;

  try {
    // Start processing context for new analysis
    processingContext.startProcessing();
    processingContext.setStage('beat-detection');
    processingContext.setProgress(0);
    processingContext.setStatusMessage('Starting beat detection...');

    // Update to chord recognition stage after a brief delay
    stageTimeout = setTimeout(() => {
      processingContext.setStage('chord-recognition');
      processingContext.setProgress(50);
      processingContext.setStatusMessage('Recognizing chords and synchronizing with beats...');
    }, 1000);

    // Call the audio processing service with current model values
    const results = await analyzeAudioFromService(audioProcessingState.audioUrl, currentBeatDetector, currentChordDetector);

    // Update duration from analysis results if available
    if (results.audioDuration && results.audioDuration > 0) {
      setDuration(results.audioDuration);
      // console.log(`🎵 Updated duration from analysis results: ${results.audioDuration.toFixed(1)} seconds`);
    }

    // FIXED: Clear the stage timeout to prevent it from overriding completion
    if (stageTimeout) {
      clearTimeout(stageTimeout);
      stageTimeout = null;
    }

    // Update processing context for completion
    processingContext.completeProcessing();

    return results;
  } catch (error) {
    console.error('Audio analysis failed:', error);

    // Clear timeout on error too
    if (stageTimeout) {
      clearTimeout(stageTimeout);
      stageTimeout = null;
    }

    // Update processing context for error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    processingContext.failProcessing(errorMessage);

    throw error;
  }
};

/**
 * Transcribe lyrics using Music.AI with word-level synchronization
 * Lines 841-945 from original component
 */
export const transcribeLyricsWithAI = async (deps: AudioProcessingServiceDependencies): Promise<void> => {
  const {
    videoId,
    audioProcessingState,
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    setActiveTab,
    setIsTranscribingLyrics,
    setLyricsError,
    lyrics
  } = deps;

  if (!audioProcessingState.audioUrl) {
    console.error('No audio URL available for lyrics transcription');
    return;
  }

  // If lyrics already exist, show confirmation popup for re-transcription
  if (lyrics && lyrics.lines && lyrics.lines.length > 0) {
    const confirmed = window.confirm(
      'Re-transcription will overwrite existing lyrics and consume API credits. Are you sure you want to continue?'
    );
    if (!confirmed) {
      return;
    }
  }

  try {
    setIsTranscribingLyrics(true);
    setLyricsError(null);

    // Get the user's Music.AI API key
    const { getMusicAiApiKeyWithValidation } = await import('@/utils/apiKeyUtils');
    const keyValidation = await getMusicAiApiKeyWithValidation();

    if (!keyValidation.isValid || !keyValidation.apiKey) {
      setLyricsError(keyValidation.error || 'Music.AI API key not found. Please add your API key in settings.');
      setIsTranscribingLyrics(false);
      return;
    }

    const musicAiApiKey = keyValidation.apiKey;

    const response = await apiPost('TRANSCRIBE_LYRICS', {
      videoId,
      audioPath: audioProcessingState.audioUrl, // Fixed: use audioPath instead of audioUrl
      checkCacheOnly: false, // Explicit: this is a transcription request, not cache-only
      forceRefresh: false,
      musicAiApiKey: musicAiApiKey // Add the API key to the request
    });

    const data = await response.json();

    if (data && data.lyrics) {
      setLyrics(data.lyrics);
      setShowLyrics(true);
      setHasCachedLyrics(false);
      setActiveTab('lyricsChords');
    } else {
      throw new Error(data?.error || 'Failed to transcribe lyrics');
    }
  } catch (error) {
    console.error('Lyrics transcription failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    setLyricsError(errorMessage);
  } finally {
    setIsTranscribingLyrics(false);
  }
};

/**
 * Extract audio from YouTube with comprehensive metadata preservation
 * Lines 947-1120 from original component
 */
export const extractAudioFromYouTube = async (deps: AudioProcessingServiceDependencies, forceRefresh: boolean = false): Promise<{ audioUrl?: string; fromCache?: boolean; isStreamUrl?: boolean; streamExpiresAt?: number; title?: string; duration?: number } | void> => {
  const {
    videoId,
    titleFromSearch,
    durationFromSearch,
    channelFromSearch,
    thumbnailFromSearch,
    setAudioProcessingState,
    setDuration,
    setShowExtractionNotification,
    extractionLockRef,
    progress: _progress, // eslint-disable-line @typescript-eslint/no-unused-vars
    processingContext
  } = deps;

  // Prevent concurrent extractions
  if (extractionLockRef.current) {
    console.log('🔒 Audio extraction already in progress, skipping...');
    return;
  }

  extractionLockRef.current = true;

  try {
    // console.log(`🎵 Starting audio extraction for video: ${videoId}`);
    // console.log(`📊 Search metadata: title="${titleFromSearch}", duration="${durationFromSearch}", channel="${channelFromSearch}"`);

    // Update state to show extraction is starting
    setAudioProcessingState(prev => ({
      ...prev,
      isExtracting: true,
      isDownloading: true, // Set the downloading flag to true
      isExtracted: false,
      error: null,
      suggestion: null
    }));

    // Start processing context
    processingContext.startProcessing();
    processingContext.setStage('audio-extraction');
    processingContext.setProgress(0);
    processingContext.setStatusMessage('Extracting audio from YouTube...');

    // Prepare metadata for the extraction request
    const videoMetadata = {
      id: videoId,
      title: titleFromSearch || undefined,
      duration: durationFromSearch || undefined,
      channelTitle: channelFromSearch || undefined,
      thumbnail: thumbnailFromSearch || undefined
    };

    // Progress animation during extraction
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 2, 90);
      processingContext.setProgress(currentProgress);
    }, 300);

    try {
      const response = await apiPost('EXTRACT_AUDIO', {
        videoId,
        forceRefresh,
        videoMetadata,
        originalTitle: titleFromSearch
      });

      // Clear progress interval
      clearInterval(progressInterval);

      const data = await response.json();

      if (data.success) {
        // console.log(`✅ Audio extraction successful: ${data.audioUrl}`);
        // console.log(`📊 Extraction metadata: fromCache=${data.fromCache}, title="${data.title}", duration=${data.duration}`);

        // Update state with successful extraction
        setAudioProcessingState(prev => ({
          ...prev,
          isExtracting: false,
          isDownloading: false, // Reset the downloading flag
          isExtracted: true,
          audioUrl: data.audioUrl,
          fromCache: data.fromCache || false,
          error: null,
          suggestion: null
        }));

        // Update duration if available from extraction
        if (data.duration && data.duration > 0) {
          setDuration(data.duration);
          console.log(`🎵 Updated duration from extraction: ${data.duration} seconds`);
        } else if (durationFromSearch) {
          // Fallback to search duration if extraction didn't provide duration
          const searchDurationSeconds = parseInt(durationFromSearch);
          if (!isNaN(searchDurationSeconds) && searchDurationSeconds > 0) {
            setDuration(searchDurationSeconds);
            console.log(`🎵 Updated duration from search metadata: ${searchDurationSeconds} seconds`);
          }
        }

        // Show extraction notification
        setShowExtractionNotification(true);

        // Complete processing context
        processingContext.completeProcessing();
        processingContext.setStage('complete');
        processingContext.setProgress(100);
        processingContext.setStatusMessage('Audio extraction completed successfully');

        // FIXED: Return the metadata so the video title can be set properly
        return {
          audioUrl: data.audioUrl,
          fromCache: data.fromCache || false,
          isStreamUrl: data.isStreamUrl || false,
          streamExpiresAt: data.streamExpiresAt,
          title: titleFromSearch || data.title || `YouTube Video ${videoId}`, // Prefer frontend metadata
          duration: data.duration
        };

      } else {
        throw new Error(data.error || 'Audio extraction failed');
      }
    } catch (apiError) {
      // Clear progress interval on error
      clearInterval(progressInterval);
      throw apiError;
    }

  } catch (error) {
    console.error('Audio extraction failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    let suggestion: string | undefined;

    // Determine suggestion based on error type
    if (errorMessage.includes('YouTube Short')) {
      suggestion = 'YouTube Shorts cannot be processed. Please try a regular YouTube video.';
    } else if (errorMessage.includes('restricted') || errorMessage.includes('unavailable')) {
      suggestion = 'This video may be restricted or unavailable for download. Try a different video.';
    } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      suggestion = 'Check your internet connection and try again.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      suggestion = 'Service temporarily unavailable. Please try again in a few minutes.';
    }

    // Update state with error
    setAudioProcessingState(prev => ({
      ...prev,
      isExtracting: false,
      isDownloading: false, // Reset the downloading flag on error
      isExtracted: false,
      error: errorMessage,
      suggestion
    }));

    // Update processing context for error
    processingContext.failProcessing(errorMessage);

    // Create error with suggestion
    const errorWithSuggestion: ErrorWithSuggestion = new Error(errorMessage);
    errorWithSuggestion.suggestion = suggestion;
    throw errorWithSuggestion;

  } finally {
    extractionLockRef.current = false;
  }
};
