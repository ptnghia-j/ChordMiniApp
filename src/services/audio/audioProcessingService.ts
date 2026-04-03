import { analyzeAudioWithRateLimit, AnalysisResult, ChordDetectorType } from '@/services/chord-analysis/chordRecognitionService';
import {
  getTranscription,
  normalizeTranscriptionData,
  saveTranscription,
  TranscriptionData,
  updateTranscriptionEnrichment,
} from '@/services/firebase/firestoreService';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';

// Define error types for better type safety
export interface ErrorWithSuggestion extends Error {
  suggestion?: string;
}

export interface AudioProcessingState {
  isDownloading: boolean;
  isExtracting: boolean;
  isExtracted: boolean;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
  audioUrl?: string;
  youtubeEmbedUrl?: string;
  videoUrl?: string;
  error?: string | null;
  suggestion?: string | null;
  fromCache: boolean;
  fromFirestoreCache: boolean;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
}

export interface AnalyzeAudioFileOptions {
  prefetchedTranscription?: TranscriptionData | Omit<TranscriptionData, 'createdAt'> | null;
  onTranscriptionSaved?: (data: Omit<TranscriptionData, 'createdAt'>) => void;
  searchMetadata?: {
    title?: string | null;
    channelTitle?: string | null;
    thumbnail?: string | null;
  };
}

export class AudioProcessingService {
  private static instance: AudioProcessingService;
  
  public static getInstance(): AudioProcessingService {
    if (!AudioProcessingService.instance) {
      AudioProcessingService.instance = new AudioProcessingService();
    }
    return AudioProcessingService.instance;
  }

  async extractAudioFromYouTube(
    videoId: string,
    forceRedownload: boolean = false,
    useStreamUrl: boolean = true,
    originalTitle?: string
  ): Promise<{ audioUrl: string; fromCache: boolean; isStreamUrl?: boolean; streamExpiresAt?: number; title?: string; duration?: number }> {
    try {
      const response = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          forceRedownload,
          useStreamUrl,
          originalTitle
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}: Failed to extract audio`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Audio extraction failed');
      }

      return {
        audioUrl: data.audioUrl,
        fromCache: data.fromCache || false,
        isStreamUrl: data.isStreamUrl || false,
        streamExpiresAt: data.streamExpiresAt,
        title: data.title,
        duration: data.duration
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Determine suggestion based on error type
      let suggestion = null;
      if (errorMessage.includes('YouTube Short')) {
        suggestion = 'YouTube Shorts cannot be processed. Please try a regular YouTube video.';
      } else if (errorMessage.includes('restricted') || errorMessage.includes('unavailable')) {
        suggestion = 'This video may be restricted or unavailable for download. Try a different video.';
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        suggestion = 'Check your internet connection and try again.';
      }

      // Create an error object with additional properties
      const errorWithSuggestion: ErrorWithSuggestion = new Error(errorMessage);
      errorWithSuggestion.suggestion = suggestion || undefined;
      throw errorWithSuggestion;
    }
  }

  async analyzeAudioFile(
    audioUrl: string,
    videoId: string,
    beatDetector: string,
    chordDetector: string,
    title?: string,
    options?: AnalyzeAudioFileOptions
  ): Promise<AnalysisResult> {
    try {
      const resolvedTitle = title || options?.searchMetadata?.title || undefined;
      const resolvedThumbnail = normalizeThumbnailUrl(
        videoId,
        options?.searchMetadata?.thumbnail,
        'mqdefault'
      );

      // Check Firestore cache first
      const hasPrefetchedTranscription =
        options !== undefined && Object.prototype.hasOwnProperty.call(options, 'prefetchedTranscription');

      const cachedData = hasPrefetchedTranscription
        ? options?.prefetchedTranscription ?? null
        : await getTranscription(videoId, beatDetector, chordDetector);

      if (cachedData) {

        const needsTitle = !cachedData.title && !!resolvedTitle;
        const needsChannelTitle = !cachedData.channelTitle && !!options?.searchMetadata?.channelTitle;
        const needsThumbnail = !cachedData.thumbnail && !!resolvedThumbnail;

        if (needsTitle || needsChannelTitle || needsThumbnail) {
          const enriched = {
            title: needsTitle ? resolvedTitle : undefined,
            channelTitle: needsChannelTitle ? options?.searchMetadata?.channelTitle ?? undefined : undefined,
            thumbnail: needsThumbnail ? resolvedThumbnail : undefined,
          };

          const updateSucceeded = await updateTranscriptionEnrichment(
            videoId,
            beatDetector,
            chordDetector,
            enriched
          );

          if (updateSucceeded && options?.onTranscriptionSaved) {
            options.onTranscriptionSaved(
              normalizeTranscriptionData({
                ...cachedData,
                ...enriched,
              } as TranscriptionData)
            );
          }
        }

        // Cache found - loading cached results

        // Convert cached data to AnalysisResult format
        return {
          chords: cachedData.chords,
          beats: cachedData.beats,
          downbeats: cachedData.downbeats,
          downbeats_with_measures: cachedData.downbeats_with_measures,
          synchronizedChords: cachedData.synchronizedChords,
          beatModel: cachedData.beatModel,
          chordModel: cachedData.chordModel,
          audioDuration: cachedData.audioDuration,
          beatDetectionResult: {
            time_signature: cachedData.timeSignature ?? undefined,
            bpm: cachedData.bpm ?? undefined,
            beatShift: cachedData.beatShift
          }
        };
      }

      // Perform analysis with rate limiting
      const analysisResults = await analyzeAudioWithRateLimit(audioUrl, beatDetector as 'auto' | 'madmom' | 'beat-transformer', chordDetector as ChordDetectorType, videoId);
      const normalizedAnalysisResults = {
        ...analysisResults,
        beatModel: analysisResults.beatModel || beatDetector,
        chordModel: analysisResults.chordModel || chordDetector,
      };

      // Cache the results (note: enharmonic correction data will be added later via updateTranscriptionWithKey)
      const transcriptionData = {
        videoId,
        title: resolvedTitle, // Include video title for proper display in RecentVideos
        channelTitle: options?.searchMetadata?.channelTitle || undefined,
        thumbnail: resolvedThumbnail,
        audioUrl,
        beats: normalizedAnalysisResults.beats,
        chords: normalizedAnalysisResults.chords,
        downbeats: normalizedAnalysisResults.downbeats,
        downbeats_with_measures: normalizedAnalysisResults.downbeats_with_measures,
        synchronizedChords: normalizedAnalysisResults.synchronizedChords,
        beatModel: beatDetector,
        chordModel: chordDetector,
        timeSignature: normalizedAnalysisResults.beatDetectionResult?.time_signature,
        bpm: normalizedAnalysisResults.beatDetectionResult?.bpm,
        beatShift: normalizedAnalysisResults.beatDetectionResult?.beatShift,
        audioDuration: normalizedAnalysisResults.audioDuration,
        usageCount: 0,
        timestamp: new Date()
      };

      const saveSucceeded = await saveTranscription(transcriptionData);
      if (saveSucceeded) {
        options?.onTranscriptionSaved?.(transcriptionData);
      }

      return normalizedAnalysisResults;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Check if there's a suggestion in the error
      let suggestion: string | null = null;
      if (error instanceof Error && 'suggestion' in error) {
        suggestion = (error as ErrorWithSuggestion).suggestion || null;
      }

      const errorWithSuggestion: ErrorWithSuggestion = new Error(errorMessage);
      errorWithSuggestion.suggestion = suggestion || undefined;
      throw errorWithSuggestion;
    }
  }

  async getVideoInfo(videoId: string): Promise<{ title: string; duration: number }> {
    try {
      // Enhanced input validation
      if (!videoId || typeof videoId !== 'string') {
        throw new Error('Invalid video ID provided');
      }

      // Validate YouTube video ID format (11 characters, alphanumeric + _ -)
      const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
      if (!videoIdRegex.test(videoId)) {
        throw new Error('Invalid YouTube video ID format. Please provide a valid 11-character video ID.');
      }

      console.log(`Fetching video info for: ${videoId}`);

      // Try the new dedicated YouTube info API first
      try {
        const response = await fetch(`/api/youtube/info?videoId=${videoId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          // Handle specific HTTP error codes
          if (response.status === 400) {
            throw new Error(data.error || 'Invalid video ID or request');
          } else if (response.status === 404) {
            throw new Error('Video not found or API endpoint unavailable');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again in a few minutes.');
          } else if (response.status >= 500) {
            throw new Error('Server error while fetching video info. Please try again.');
          } else {
            throw new Error(data.error || `HTTP error ${response.status}: Failed to fetch video info`);
          }
        }

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch video info from YouTube API');
        }

        console.log(`Successfully fetched video info: "${data.title}" (${data.duration}s)`);

        return {
          title: data.title || `YouTube Video ${videoId}`,
          duration: data.duration || 0
        };

      } catch (apiError) {
        console.warn('YouTube info API failed, trying fallback method:', apiError);

        // Fallback to the extract-audio API with getInfoOnly flag
        try {
          const fallbackResponse = await fetch('/api/extract-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId,
              getInfoOnly: true
            }),
          });

          const fallbackData = await fallbackResponse.json();

          if (!fallbackResponse.ok) {
            throw new Error(fallbackData.error || `HTTP error ${fallbackResponse.status}: Failed to fetch video info`);
          }

          if (!fallbackData.success) {
            throw new Error(fallbackData.error || 'Failed to fetch video info');
          }

          console.log(`Successfully fetched video info via fallback: "${fallbackData.title}"`);

          return {
            title: fallbackData.title || `YouTube Video ${videoId}`,
            duration: fallbackData.duration || 0
          };

        } catch (fallbackError) {
          console.error('Both video info methods failed:', fallbackError);
          throw fallbackError;
        }
      }

    } catch (error) {
      console.error('Error fetching video info:', error);

      // Provide specific error messages based on error type
      let errorMessage = 'Failed to fetch video information';

      if (error instanceof Error) {
        if (error.message.includes('Invalid YouTube video ID format')) {
          errorMessage = 'Invalid YouTube video ID format. Please check the video ID and try again.';
        } else if (error.message.includes('Video not found') || error.message.includes('not available')) {
          errorMessage = 'Video not found or unavailable. The video may be private, deleted, or region-restricted.';
        } else if (error.message.includes('Rate limit') || error.message.includes('quota')) {
          errorMessage = 'Service temporarily unavailable due to rate limiting. Please try again in a few minutes.';
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          errorMessage = 'Network error while fetching video info. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }

      // For now, return default values instead of throwing to maintain compatibility
      // In the future, we might want to throw the error to let the UI handle it
      console.warn(`Returning default values due to error: ${errorMessage}`);

      return {
        title: `YouTube Video ${videoId}`,
        duration: 0
      };
    }
  }

  createInitialState(): AudioProcessingState {
    return {
      isDownloading: false,
      isExtracting: false,
      isExtracted: false,
      isAnalyzing: false,
      isAnalyzed: false,
      fromCache: false,
      fromFirestoreCache: false
    };
  }

  updateStateWithVideoUrls(
    state: AudioProcessingState,
    videoId: string
  ): AudioProcessingState {
    return {
      ...state,
      youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  }

  updateStateForDownloadStart(state: AudioProcessingState): AudioProcessingState {
    return {
      ...state,
      isDownloading: true,
      isExtracting: true,
      isExtracted: false,
      isAnalyzing: false,
      isAnalyzed: false,
      error: undefined,
      suggestion: undefined
    };
  }

  updateStateForDownloadSuccess(
    state: AudioProcessingState,
    audioUrl: string,
    fromCache: boolean,
    isStreamUrl?: boolean,
    streamExpiresAt?: number
  ): AudioProcessingState {
    return {
      ...state,
      isDownloading: false,
      isExtracting: false,
      isExtracted: true,
      audioUrl,
      fromCache,
      isStreamUrl,
      streamExpiresAt,
      error: undefined,
      suggestion: undefined
    };
  }

  updateStateForDownloadError(
    state: AudioProcessingState,
    error: string,
    suggestion?: string
  ): AudioProcessingState {
    return {
      ...state,
      isDownloading: false,
      isExtracting: false,
      isExtracted: false,
      error,
      suggestion
    };
  }

  updateStateForAnalysisStart(state: AudioProcessingState): AudioProcessingState {
    return {
      ...state,
      isAnalyzing: true,
      isAnalyzed: false,
      error: undefined,
      suggestion: undefined
    };
  }

  updateStateForAnalysisSuccess(
    state: AudioProcessingState,
    fromFirestoreCache: boolean
  ): AudioProcessingState {
    return {
      ...state,
      isAnalyzing: false,
      isAnalyzed: true,
      fromFirestoreCache,
      error: undefined,
      suggestion: undefined
    };
  }

  updateStateForAnalysisError(
    state: AudioProcessingState,
    error: string,
    suggestion?: string
  ): AudioProcessingState {
    return {
      ...state,
      isAnalyzing: false,
      isAnalyzed: false,
      error,
      suggestion
    };
  }
}
