import { quickTubeServiceSimplified } from './quickTubeServiceSimplified';
import { getCachedAudioFile, saveAudioFileMetadata } from './firebaseStorageService';

/**
 * Audio Extraction Service - QuickTube Only
 *
 * This service provides audio extraction using QuickTube exclusively.
 */

export interface LocalExtractionResult {
  success: boolean;
  audioUrl: string;
  title?: string;
  duration?: number;
  fromCache?: boolean;
  error?: string;
}

export class LocalExtractionService {
  private static instance: LocalExtractionService;

  public static getInstance(): LocalExtractionService {
    if (!LocalExtractionService.instance) {
      LocalExtractionService.instance = new LocalExtractionService();
    }
    return LocalExtractionService.instance;
  }

  /**
   * Check if QuickTube service is available
   */
  async isAvailable(): Promise<boolean> {
    return await quickTubeServiceSimplified.isAvailable();
  }

  /**
   * Extract audio from YouTube video using QuickTube with Firebase caching
   */
  async extractAudio(videoId: string, getInfoOnly: boolean = false, forceRedownload: boolean = false, originalTitle?: string): Promise<LocalExtractionResult> {
    try {
      console.log(`🎵 Audio extraction: Processing ${videoId}, getInfoOnly=${getInfoOnly}, forceRedownload=${forceRedownload}`);

      if (getInfoOnly) {
        // For info-only requests, check cache first for title
        try {
          const cachedAudio = await getCachedAudioFile(videoId);
          if (cachedAudio && cachedAudio.title) {
            return {
              success: true,
              audioUrl: '',
              title: cachedAudio.title,
              duration: cachedAudio.duration || 0
            };
          }
        } catch (cacheError) {
          console.warn('Cache check failed for info-only request:', cacheError);
        }

        // Fallback for info-only requests
        return {
          success: true,
          audioUrl: '',
          title: `YouTube Video ${videoId}`,
          duration: 0
        };
      }

      // Check cache first (unless force redownload)
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase cache for ${videoId}...`);
        try {
          const cachedAudio = await getCachedAudioFile(videoId);
          if (cachedAudio) {
            console.log(`✅ Found cached audio for ${videoId}, returning from cache`);
            return {
              success: true,
              audioUrl: cachedAudio.audioUrl,
              title: cachedAudio.title || `YouTube Video ${videoId}`,
              duration: cachedAudio.duration || 0,
              fromCache: true
            };
          }
        } catch (cacheError) {
          console.warn('Firebase cache check failed, proceeding with extraction:', cacheError);
        }
      }

      // Use QuickTube for audio extraction
      console.log('🔄 Attempting QuickTube extraction...');
      let quickTubeResult;

      try {
        quickTubeResult = await quickTubeServiceSimplified.extractAudio(videoId);
      } catch (quickTubeError) {
        console.error('❌ QuickTube extraction failed:', quickTubeError);

        // For now, we'll throw the error, but in the future we could implement
        // alternative extraction methods here (e.g., yt-dlp, other services)
        throw new Error(`Audio extraction failed: ${quickTubeError instanceof Error ? quickTubeError.message : 'Unknown error'}. Please try uploading the audio file directly or try again later.`);
      }

      if (quickTubeResult.success) {
        console.log('✅ QuickTube extraction successful');

        // Cache the successful result (video ID-based)
        // Use original title from search results, fallback to generic title
        const finalTitle = originalTitle || quickTubeResult.title || `YouTube Video ${videoId}`;

        try {
          await saveAudioFileMetadata({
            videoId, // Primary key: 11-character YouTube ID
            audioUrl: quickTubeResult.audioUrl!,
            title: finalTitle, // Clean title from search results
            storagePath: `quicktube/${videoId}`, // Store using video ID
            fileSize: 0, // Unknown for QuickTube URLs
            duration: quickTubeResult.duration || 0,
            isStreamUrl: true,
            streamExpiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now
          });
          console.log(`💾 Cached QuickTube result for ${videoId} with title: "${finalTitle}"`);
        } catch (cacheError) {
          console.warn('⚠️ Failed to cache QuickTube result:', cacheError);
        }

        return {
          success: true,
          audioUrl: quickTubeResult.audioUrl!,
          title: finalTitle,
          duration: quickTubeResult.duration || 0,
          fromCache: false
        };
      }

      // QuickTube failed
      console.error('❌ QuickTube extraction failed:', quickTubeResult.error);
      return {
        success: false,
        audioUrl: '',
        error: quickTubeResult.error || 'QuickTube extraction failed'
      };

    } catch (error) {
      console.error('❌ Audio extraction failed:', error);
      return {
        success: false,
        audioUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

}

export const localExtractionService = LocalExtractionService.getInstance();
