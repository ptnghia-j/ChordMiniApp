import { quickTubeServiceSimplified } from './quickTubeServiceSimplified';
import { ytMp3GoService } from './ytMp3GoService';
import { getCachedAudioFile, saveAudioFileMetadata } from './firebaseStorageService';
import { detectEnvironment } from '@/utils/environmentDetection';

/**
 * Local Audio Extraction Service - Environment-Aware
 *
 * This service provides audio extraction using environment-appropriate services:
 * - Vercel Production: yt-mp3-go (better Unicode support)
 * - Local Development: QuickTube or yt-dlp
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
   * Get the current audio extraction strategy
   */
  private getExtractionStrategy(): string {
    const env = detectEnvironment();
    return env.strategy;
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

      // Use appropriate service for audio extraction based on environment
      const strategy = this.getExtractionStrategy();
      let extractionResult;

      if (strategy === 'ytmp3go') {
        console.log('🔄 Attempting yt-mp3-go extraction...');
        try {
          extractionResult = await ytMp3GoService.extractAudio(videoId);
        } catch (ytMp3GoError) {
          console.error('❌ yt-mp3-go extraction failed:', ytMp3GoError);
          throw new Error(`Audio extraction failed: ${ytMp3GoError instanceof Error ? ytMp3GoError.message : 'Unknown error'}. Please try uploading the audio file directly or try again later.`);
        }
      } else {
        console.log('🔄 Attempting QuickTube extraction...');
        try {
          extractionResult = await quickTubeServiceSimplified.extractAudio(videoId);
        } catch (quickTubeError) {
          console.error('❌ QuickTube extraction failed:', quickTubeError);
          throw new Error(`Audio extraction failed: ${quickTubeError instanceof Error ? quickTubeError.message : 'Unknown error'}. Please try uploading the audio file directly or try again later.`);
        }
      }

      if (extractionResult.success) {
        const serviceName = strategy === 'ytmp3go' ? 'yt-mp3-go' : 'QuickTube';
        console.log(`✅ ${serviceName} extraction successful`);

        // Cache the successful result (video ID-based)
        // Use original title from search results, fallback to generic title
        const finalTitle = originalTitle || extractionResult.title || `YouTube Video ${videoId}`;

        try {
          const storagePrefix = strategy === 'ytmp3go' ? 'ytmp3go' : 'quicktube';
          await saveAudioFileMetadata({
            videoId, // Primary key: 11-character YouTube ID
            audioUrl: extractionResult.audioUrl!,
            title: finalTitle, // Clean title from search results
            storagePath: `${storagePrefix}/${videoId}`, // Store using video ID with service prefix
            fileSize: 0, // Unknown for external URLs
            duration: extractionResult.duration || 0,
            isStreamUrl: true,
            streamExpiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now

            // Enhanced metadata
            extractionService: strategy === 'ytmp3go' ? 'yt-mp3-go' : 'quicktube',
            extractionTimestamp: Date.now(),
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` // Default thumbnail
          });
          console.log(`💾 Cached ${serviceName} result for ${videoId} with enhanced metadata: "${finalTitle}"`);
        } catch (cacheError) {
          console.warn(`⚠️ Failed to cache ${serviceName} result:`, cacheError);
        }

        return {
          success: true,
          audioUrl: extractionResult.audioUrl!,
          title: finalTitle,
          duration: extractionResult.duration || 0,
          fromCache: false
        };
      }

      // Extraction failed
      const serviceName = strategy === 'ytmp3go' ? 'yt-mp3-go' : 'QuickTube';
      console.error(`❌ ${serviceName} extraction failed:`, extractionResult.error);
      return {
        success: false,
        audioUrl: '',
        error: extractionResult.error || `${serviceName} extraction failed`
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
