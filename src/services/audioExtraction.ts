/**
 * Audio Extraction Service - YT2MP3 Magic Integration
 *
 * This service provides reliable audio extraction using YT2MP3 Magic:
 * 1. Uses YT2MP3 Magic as primary service (100% success rate in testing)
 * 2. Direct streaming upload to Firebase Storage
 * 3. Video ID-based caching and storage
 * 4. Leverages existing search results for metadata
 *
 * PRESERVED FOR REFERENCE:
 * - QuickTube integration (replaced by YT2MP3 Magic)
 * - yt-mp3-go integration (preserved for future reference)
 */

import { yt2mp3MagicService } from './yt2mp3MagicService';
import { uploadAudioStreamWithRetry } from './streamingFirebaseUpload';
// PRESERVED FOR REFERENCE: import { quickTubeServiceSimplified } from './quickTubeServiceSimplified';
// PRESERVED FOR REFERENCE: import { ytMp3GoService } from './ytMp3GoService';
import { firebaseStorageSimplified, SimplifiedAudioData } from './firebaseStorageSimplified';
import { detectEnvironment } from '@/utils/environmentDetection';
import { ytDlpService } from './ytDlpService';
import { asyncJobService } from './asyncJobService';

export interface AudioExtractionResult {
  success: boolean;
  audioUrl?: string;
  title?: string;
  duration?: number;
  fromCache?: boolean;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
  error?: string;
}

export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: string;
  url?: string;
}

export class AudioExtractionServiceSimplified {
  private static instance: AudioExtractionServiceSimplified;

  public static getInstance(): AudioExtractionServiceSimplified {
    if (!AudioExtractionServiceSimplified.instance) {
      AudioExtractionServiceSimplified.instance = new AudioExtractionServiceSimplified();
    }
    return AudioExtractionServiceSimplified.instance;
  }



  /**
   * Extract audio using environment-aware strategy
   */
  async extractAudio(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const env = detectEnvironment();

    console.log(`🔧 Environment Detection for Audio Extraction:`);
    console.log(`   Strategy: ${env.strategy}`);
    console.log(`   isDevelopment: ${env.isDevelopment}`);
    console.log(`   isProduction: ${env.isProduction}`);
    console.log(`   isVercel: ${env.isVercel}`);
    console.log(`   baseUrl: ${env.baseUrl}`);

    // Route to appropriate service based on environment strategy
    switch (env.strategy) {
      case 'yt2mp3magic':
        return await this.extractAudioWithYt2mp3Magic(videoMetadata, forceRedownload);

      case 'ytdlp':
        if (env.isDevelopment) {
          return await this.extractAudioWithYtDlp(videoMetadata, forceRedownload);
        } else {
          return {
            success: false,
            error: 'yt-dlp is only available in development environment'
          };
        }

      // PRESERVED FOR REFERENCE - yt-mp3-go integration
      // default:
      //   return await this.extractAudioWithYtMp3Go(videoMetadata, forceRedownload);

      default:
        // Fallback to YT2MP3 Magic for unknown strategies
        console.log(`⚠️ Unknown strategy ${env.strategy}, falling back to YT2MP3 Magic`);
        return await this.extractAudioWithYt2mp3Magic(videoMetadata, forceRedownload);
    }
  }

  /**
   * Extract audio using yt-dlp (development only)
   */
  private async extractAudioWithYtDlp(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const videoId = videoMetadata.id;

    try {
      // Step 1: Check Firebase Storage first for permanent audio files (unless forced redownload)
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access with enhanced metadata
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: videoMetadata.title,
                duration: this.parseDuration(videoMetadata.duration),
                fileSize: existingFile.fileSize || 0,

                // Enhanced metadata for cache hits
                extractionService: 'firebase-storage-cache',
                extractionTimestamp: Date.now(),
                videoDuration: videoMetadata.duration
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn(`⚠️ Firebase Storage check failed for ${videoId}:`, storageError);
        }

        // Step 2: Check simplified Firestore cache as fallback
        const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`✅ Using cached audio metadata for ${videoId}: "${cached.title}"`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }



      // Step 2: Use yt-dlp to download audio
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const downloadResult = await ytDlpService.downloadAudio(videoUrl, videoId);

      if (!downloadResult.success || !downloadResult.audioUrl) {
        console.error(`❌ yt-dlp download failed for ${videoId}:`, downloadResult.error);

        // In development, provide additional debugging information
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔧 Debug: You can use the debug API to troubleshoot this issue:`);
          console.log(`   POST /api/debug/ytdlp`);
          console.log(`   Body: { "action": "troubleshoot", "videoUrl": "${videoUrl}" }`);
        }

        throw new Error(downloadResult.error || 'yt-dlp download failed');
      }

      console.log(`✅ yt-dlp download successful:`, {
        filename: downloadResult.filename,
        fileSize: downloadResult.fileSize ? `${(downloadResult.fileSize / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
        localPath: downloadResult.localPath,
        audioUrl: downloadResult.audioUrl
      });

      // Step 3: Attempt to upload to Firebase Storage for permanent access
      let finalAudioUrl = downloadResult.audioUrl;
      let isStorageUrl = false;
      let actualFileSize = 0;
      const finalDuration = downloadResult.duration || 0;

      try {
        if (downloadResult.audioUrl && downloadResult.audioUrl.startsWith('http://localhost:')) {
          // For local yt-dlp files, read the file and upload to Firebase Storage
          console.log(`📥 Reading local audio file for Firebase Storage upload: ${downloadResult.audioUrl}`);

          const audioResponse = await fetch(downloadResult.audioUrl);
          if (audioResponse.ok) {
            const audioData = await audioResponse.arrayBuffer();
            actualFileSize = audioData.byteLength;

            console.log(`📥 Read ${(actualFileSize / 1024 / 1024).toFixed(2)}MB local file for storage`);

            // Upload to Firebase Storage with monitoring
            const uploadStartTime = Date.now();
            const { uploadAudioFile, saveAudioFileMetadata } = await import('./firebaseStorageService');
            const uploadResult = await uploadAudioFile(videoId, audioData);

            if (uploadResult) {
              const uploadTime = Date.now() - uploadStartTime;
              finalAudioUrl = uploadResult.audioUrl;
              isStorageUrl = true;

              console.log(`✅ Audio stored in Firebase Storage in ${uploadTime}ms: ${finalAudioUrl}`);
              console.log(`📊 Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);

              // Save detailed metadata to Firestore
              await saveAudioFileMetadata({
                videoId,
                audioUrl: finalAudioUrl,
                title: videoMetadata.title,
                storagePath: uploadResult.storagePath,
                fileSize: actualFileSize,
                duration: finalDuration,
                isStreamUrl: false,
                streamExpiresAt: undefined
              });

              console.log(`📈 Firebase Storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
            }
          }
        }
      } catch (storageError) {
        console.warn(`⚠️ Firebase Storage upload failed for yt-dlp file, using local URL fallback: ${storageError}`);
        console.log(`📈 Firebase Storage Failure: videoId=${videoId}, error=${storageError instanceof Error ? storageError.message : 'Unknown'}`);
      }

      // Step 4: Save to cache with final URL (storage or local) - only if not already saved to full metadata
      if (!isStorageUrl) {
        // Only save to simplified cache if Firebase Storage upload failed
        const saved = await firebaseStorageSimplified.saveAudioMetadata({
          videoId,
          audioUrl: finalAudioUrl,
          title: videoMetadata.title,
          thumbnail: videoMetadata.thumbnail,
          channelTitle: videoMetadata.channelTitle,
          duration: finalDuration,
          fileSize: actualFileSize || 0,

          // Enhanced metadata from video search results
          extractionService: 'yt-dlp',
          extractionTimestamp: Date.now(),
          videoDuration: videoMetadata.duration
        });

        if (saved) {
          console.log(`💾 Cached yt-dlp result for ${videoId} (fallback)`);
          console.log(`📈 Local URL Fallback: videoId=${videoId}, reason=storage_upload_failed`);
        }
      } else {
        console.log(`💾 Audio metadata already saved to Firebase Storage for ${videoId}`);
      }



      return {
        success: true,
        audioUrl: finalAudioUrl,
        title: videoMetadata.title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl
      };

    } catch (error) {
      console.error(`❌ yt-dlp extraction failed for ${videoId}:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'yt-dlp extraction failed'
      };
    }
  }

  /**
   * Extract audio using YT2MP3 Magic service (primary method)
   */
  private async extractAudioWithYt2mp3Magic(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const videoId = videoMetadata.id;
    const title = videoMetadata.title;

    try {
      // Step 1: Check Firebase Storage first for permanent audio files (unless forced redownload)
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access with enhanced metadata
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: videoMetadata.title,
                duration: this.parseDuration(videoMetadata.duration),
                fileSize: existingFile.fileSize || 0,
                extractionService: 'firebase-storage-cache',
                extractionTimestamp: Date.now(),
                videoDuration: videoMetadata.duration
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn(`⚠️ Firebase Storage check failed for ${videoId}:`, storageError);
        }

        // Step 2: Check simplified Firestore cache as fallback
        const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`✅ Using cached audio metadata for ${videoId}: "${cached.title}"`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl || false
          };
        }
      }

      // Step 3: Extract using YT2MP3 Magic service
      const searchDuration = this.parseDuration(videoMetadata.duration);
      console.log('🎵 Using YT2MP3 Magic service for audio extraction');
      const extractionResult = await yt2mp3MagicService.extractAudio(videoId, title, searchDuration);

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error || 'YT2MP3 Magic extraction failed'
        };
      }

      // Step 4: Stream upload to Firebase Storage for permanent access
      let finalAudioUrl = '';
      let isStorageUrl = false;
      let actualFileSize = extractionResult.fileSize || 0;
      const finalDuration = extractionResult.duration || this.parseDuration(videoMetadata.duration);

      if (extractionResult.audioStream) {
        console.log('📤 Streaming upload to Firebase Storage...');
        try {
          const uploadResult = await uploadAudioStreamWithRetry(
            extractionResult.audioStream,
            {
              videoId,
              filename: extractionResult.filename,
              title: title,
              contentType: extractionResult.contentType || 'audio/mpeg'
            }
          );

          if (uploadResult.success && uploadResult.audioUrl) {
            finalAudioUrl = uploadResult.audioUrl;
            isStorageUrl = true;
            actualFileSize = uploadResult.fileSize || actualFileSize;
            console.log(`✅ Successfully uploaded to Firebase Storage: ${uploadResult.storagePath}`);
          } else {
            console.warn(`⚠️ Firebase Storage upload failed: ${uploadResult.error}`);
            return {
              success: false,
              error: `Firebase Storage upload failed: ${uploadResult.error}`
            };
          }
        } catch (uploadError) {
          console.error(`❌ Firebase Storage upload error:`, uploadError);
          return {
            success: false,
            error: `Firebase Storage upload error: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
          };
        }
      } else {
        return {
          success: false,
          error: 'No audio stream received from YT2MP3 Magic service'
        };
      }

      // Step 5: Save metadata to simplified cache for future access
      await firebaseStorageSimplified.saveAudioMetadata({
        videoId,
        audioUrl: finalAudioUrl,
        title,
        duration: finalDuration,
        fileSize: actualFileSize,
        extractionService: 'yt2mp3-magic',
        extractionTimestamp: Date.now(),
        videoDuration: videoMetadata.duration,
        isStreamUrl: !isStorageUrl
      });

      console.log(`✅ YT2MP3 Magic extraction completed for ${videoId}`);

      return {
        success: true,
        audioUrl: finalAudioUrl,
        title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ YT2MP3 Magic extraction failed for ${videoId}:`, errorMessage);

      return {
        success: false,
        error: `YT2MP3 Magic extraction failed: ${errorMessage}`
      };
    }
  }

  /**
   * PRESERVED FOR REFERENCE - Extract audio using QuickTube (production/fallback)
   * This method has been replaced by YT2MP3 Magic service
   */
  /*
  private async extractAudioWithQuickTube(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const { id: videoId, title, thumbnail, channelTitle } = videoMetadata;

    console.log(`🎵 QuickTube extraction request for ${videoId}: "${title}"`);

    try {
      // Step 1: Check Firebase Storage first for permanent audio files (unless forced redownload)
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: videoMetadata.title,
                duration: this.parseDuration(videoMetadata.duration),
                fileSize: existingFile.fileSize || 0
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn(`⚠️ Firebase Storage check failed for ${videoId}:`, storageError);
        }

        // Step 2: Check simplified Firestore cache as fallback
        const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`✅ Using cached audio metadata for ${videoId}: "${cached.title}"`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }

      // Step 2: Extract using QuickTube service (this method is QuickTube-only)
      const searchDuration = this.parseDuration(videoMetadata.duration);
      console.log('🎵 Using QuickTube service for audio extraction');
      const extractionResult = await quickTubeServiceSimplified.extractAudio(videoId, title, searchDuration);

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error || 'QuickTube extraction failed'
        };
      }

      // Step 3: Attempt to store audio file in Firebase Storage for permanent access
      let finalAudioUrl = extractionResult.audioUrl!;
      let isStorageUrl = false;
      let actualFileSize = 0;
      const finalDuration = extractionResult.duration || this.parseDuration(videoMetadata.duration);

      try {
        // Ensure we have a valid audio URL before proceeding
        if (!extractionResult.audioUrl) {
          throw new Error('No audio URL available for storage');
        }

        // Download audio data from QuickTube URL with progress tracking
        console.log(`📥 Downloading audio data for Firebase Storage: ${extractionResult.audioUrl}`);
        const downloadStartTime = Date.now();

        const audioResponse = await fetch(extractionResult.audioUrl);

        if (audioResponse.ok) {
          const audioData = await audioResponse.arrayBuffer();
          actualFileSize = audioData.byteLength;
          const downloadTime = Date.now() - downloadStartTime;

          console.log(`📥 Downloaded ${(actualFileSize / 1024 / 1024).toFixed(2)}MB in ${downloadTime}ms for storage`);

          // Upload to Firebase Storage with monitoring
          const uploadStartTime = Date.now();
          const { uploadAudioFile, saveAudioFileMetadata } = await import('./firebaseStorageService');
          const uploadResult = await uploadAudioFile(videoId, audioData);

          if (uploadResult) {
            const uploadTime = Date.now() - uploadStartTime;
            finalAudioUrl = uploadResult.audioUrl;
            isStorageUrl = true;

            console.log(`✅ Audio stored in Firebase Storage in ${uploadTime}ms: ${finalAudioUrl}`);
            console.log(`📊 Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);

            // Save detailed metadata to Firestore with enhanced video information
            await saveAudioFileMetadata({
              videoId,
              audioUrl: finalAudioUrl,
              title,
              storagePath: uploadResult.storagePath,
              fileSize: actualFileSize,
              duration: finalDuration,
              isStreamUrl: false,
              streamExpiresAt: undefined,

              // Enhanced metadata from video search results
              channelTitle: videoMetadata.channelTitle,
              thumbnail: videoMetadata.thumbnail,
              extractionService: 'quicktube',
              extractionTimestamp: Date.now(),
              videoDuration: videoMetadata.duration
            });

            // Log storage success metrics
            console.log(`📈 Firebase Storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
          }
        }
      } catch (storageError) {
        console.warn(`⚠️ Firebase Storage upload failed, using stream URL fallback: ${storageError}`);
        console.log(`📈 Firebase Storage Failure: videoId=${videoId}, error=${storageError instanceof Error ? storageError.message : 'Unknown'}`);
      }

      // Step 4: Save to cache with final URL (storage or stream) - only if not already saved to full metadata
      console.log(`💾 Saving with duration: ${finalDuration}s (source: ${extractionResult.duration ? 'audio metadata' : 'search metadata'})`);

      if (!isStorageUrl) {
        // NON-BLOCKING: Save to simplified cache in background (won't block audio extraction)
        firebaseStorageSimplified.saveAudioMetadataBackground({
          videoId,
          audioUrl: finalAudioUrl,
          title,
          thumbnail,
          channelTitle,
          duration: finalDuration,
          fileSize: actualFileSize || 0
        });

        console.log(`🔄 Background cache save initiated for ${videoId} (fallback)`);
        console.log(`📈 Stream URL Fallback: videoId=${videoId}, reason=storage_upload_failed`);
      } else {
        console.log(`💾 Audio metadata already saved to Firebase Storage for ${videoId}`);
      }

      // Step 4: Return result with final duration
      return {
        success: true,
        audioUrl: finalAudioUrl, // Use finalAudioUrl (Firebase Storage) instead of extractionResult.audioUrl (QuickTube)
        title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl, // Firebase Storage URLs are permanent, QuickTube URLs are temporary
        streamExpiresAt: isStorageUrl ? undefined : Date.now() + (24 * 60 * 60 * 1000) // Only set expiry for QuickTube URLs
      };

    } catch (error) {
      console.error(`❌ Audio extraction failed for ${videoId}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }
  */

  /**
   * PRESERVED FOR REFERENCE - Extract audio using yt-mp3-go (Vercel production)
   * This method has been replaced by YT2MP3 Magic service
   */
  /*
  private async extractAudioWithYtMp3Go(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const { id: videoId, title } = videoMetadata;

    console.log(`🎵 yt-mp3-go extraction: ${videoId} ("${title}")`);
    console.log(`📊 Video metadata received:`, {
      title: videoMetadata.title,
      channelTitle: videoMetadata.channelTitle,
      thumbnail: videoMetadata.thumbnail,
      duration: videoMetadata.duration
    });

    try {
      // Step 1: Check Firebase Storage first for permanent audio files
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: videoMetadata.title,
                duration: this.parseDuration(videoMetadata.duration),
                fileSize: existingFile.fileSize || 0
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn('⚠️ Firebase Storage check failed, continuing with extraction:', storageError);
        }

        // Step 2: Check simplified Firestore cache as fallback
        const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`✅ Using cached audio metadata for ${videoId}`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }

      // Step 3: Extract using yt-mp3-go service with medium quality (default)
      const searchDuration = this.parseDuration(videoMetadata.duration);
      console.log('🎵 Using yt-mp3-go service for audio extraction with medium quality');
      const extractionResult = await ytMp3GoService.extractAudio(videoId, title, searchDuration, 'medium');

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error || 'yt-mp3-go extraction failed'
        };
      }

      // Step 4: Attempt to download and upload to Firebase Storage for permanent caching
      let finalAudioUrl = extractionResult.audioUrl!;
      let isStorageUrl = false;
      let actualFileSize = 0;
      const finalDuration = extractionResult.duration || this.parseDuration(videoMetadata.duration);

      console.log(`📝 yt-mp3-go provided external URL: ${finalAudioUrl}`);

      // Try to download and upload to Firebase Storage for permanent access
      try {
        console.log(`📥 Downloading yt-mp3-go audio file for Firebase Storage upload...`);
        const downloadStartTime = Date.now();

        const audioResponse = await fetch(finalAudioUrl);
        if (audioResponse.ok) {
          const audioData = await audioResponse.arrayBuffer();
          actualFileSize = audioData.byteLength;
          const downloadTime = Date.now() - downloadStartTime;

          console.log(`📥 Downloaded ${(actualFileSize / 1024 / 1024).toFixed(2)}MB from yt-mp3-go in ${downloadTime}ms`);

          // Upload to Firebase Storage with monitoring
          const uploadStartTime = Date.now();
          const { uploadAudioFile, saveAudioFileMetadata } = await import('./firebaseStorageService');
          const uploadResult = await uploadAudioFile(videoId, audioData);

          if (uploadResult) {
            const uploadTime = Date.now() - uploadStartTime;
            finalAudioUrl = uploadResult.audioUrl;
            isStorageUrl = true;

            console.log(`✅ yt-mp3-go audio stored in Firebase Storage in ${uploadTime}ms: ${finalAudioUrl}`);
            console.log(`📊 Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);

            // Save detailed metadata to Firestore with enhanced video information
            console.log(`💾 Saving Firebase Storage metadata for ${videoId}:`, {
              title,
              channelTitle: videoMetadata.channelTitle,
              extractionService: 'yt-mp3-go',
              fileSize: actualFileSize
            });

            await saveAudioFileMetadata({
              videoId,
              audioUrl: finalAudioUrl,
              title,
              storagePath: uploadResult.storagePath,
              fileSize: actualFileSize,
              duration: finalDuration,
              isStreamUrl: false,
              streamExpiresAt: undefined,

              // Enhanced metadata from video search results
              channelTitle: videoMetadata.channelTitle,
              thumbnail: videoMetadata.thumbnail,
              extractionService: 'yt-mp3-go',
              extractionTimestamp: Date.now(),
              videoDuration: videoMetadata.duration
            });

            // Log storage success metrics
            console.log(`📈 Firebase Storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
          }
        }
      } catch (storageError) {
        console.warn('⚠️ Firebase Storage upload failed for yt-mp3-go, falling back to external URL caching:', storageError);
        // Continue with external URL caching as fallback
      }

      // Step 5: Cache the result in simplified Firestore (only if not already saved to Firebase Storage)
      if (!isStorageUrl) {
        // Only save to simplified cache if Firebase Storage upload failed
        try {
          await firebaseStorageSimplified.saveAudioMetadata({
            videoId,
            audioUrl: finalAudioUrl,
            title,
            thumbnail: videoMetadata.thumbnail,
            channelTitle: videoMetadata.channelTitle,
            duration: finalDuration,
            fileSize: actualFileSize,
            isStreamUrl: !isStorageUrl,
            streamExpiresAt: isStorageUrl ? undefined : Date.now() + 24 * 60 * 60 * 1000, // 24 hours for stream URLs

            // Enhanced metadata from video search results
            extractionService: 'yt-mp3-go',
            extractionTimestamp: Date.now(),
            videoDuration: videoMetadata.duration
          });
          console.log(`💾 Cached yt-mp3-go external URL with enhanced metadata for ${videoId}`);
        } catch (cacheError) {
          console.warn('⚠️ Failed to cache yt-mp3-go result:', cacheError);
        }
      } else {
        console.log(`💾 Audio metadata already saved to Firebase Storage for ${videoId}`);
      }

      return {
        success: true,
        audioUrl: finalAudioUrl,
        title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl,
        streamExpiresAt: isStorageUrl ? undefined : Date.now() + 24 * 60 * 60 * 1000
      };

    } catch (error) {
      console.error(`❌ yt-mp3-go extraction failed for ${videoId}:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown yt-mp3-go extraction error'
      };
    }
  }
  */

  /**
   * Extract audio using just video ID (fallback when search metadata is not available)
   */
  async extractAudioById(
    videoId: string,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    console.log(`🎵 Audio extraction by ID: ${videoId}`);

    try {
      // Step 1: Check Firebase Storage first for permanent audio files
      if (!forceRedownload) {
        console.log(`🔍 Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: `YouTube Video ${videoId}`,
                duration: 0, // Duration will be detected later
                fileSize: existingFile.fileSize || 0
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: `YouTube Video ${videoId}`,
              duration: 0,
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn(`⚠️ Firebase Storage check failed for ${videoId}:`, storageError);
        }

        // Step 2: Check simplified Firestore cache as fallback
        const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`✅ Using cached audio metadata for ${videoId}`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }

      // Step 2: Extract using appropriate service based on environment (no search metadata available)
      const env = detectEnvironment();
      let extractionResult;

      switch (env.strategy) {
        case 'yt2mp3magic':
          console.log('🎵 Using YT2MP3 Magic service for audio extraction (by ID)');
          extractionResult = await yt2mp3MagicService.extractAudio(videoId);
          break;

        case 'ytdlp':
          // yt-dlp is not suitable for direct audio extraction by ID
          // It's designed for full video processing with search metadata
          return {
            success: false,
            error: 'yt-dlp requires full video metadata and is not suitable for ID-only extraction'
          };

        // PRESERVED FOR REFERENCE - yt-mp3-go integration
        // default:
        //   console.log('🎵 Using yt-mp3-go service for audio extraction (by ID) with medium quality');
        //   extractionResult = await ytMp3GoService.extractAudio(videoId, undefined, undefined, 'medium');
        //   break;

        default:
          // Fallback to YT2MP3 Magic for unknown strategies
          console.log(`⚠️ Unknown strategy ${env.strategy}, falling back to YT2MP3 Magic`);
          extractionResult = await yt2mp3MagicService.extractAudio(videoId);
          break;
      }

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error || 'Audio extraction failed'
        };
      }

      // Step 3: Handle YT2MP3 Magic result with streaming upload to Firebase Storage
      let finalAudioUrl = '';
      let isStorageUrl = false;
      let actualFileSize = extractionResult.fileSize || 0;
      const finalDuration = extractionResult.duration || 0;
      const title = extractionResult.title || `YouTube Video ${videoId}`;

      if (extractionResult.audioStream) {
        console.log('📤 Streaming upload to Firebase Storage...');
        try {
          const uploadResult = await uploadAudioStreamWithRetry(
            extractionResult.audioStream,
            {
              videoId,
              filename: extractionResult.filename,
              title: title,
              contentType: extractionResult.contentType || 'audio/mpeg'
            }
          );

          if (uploadResult.success && uploadResult.audioUrl) {
            finalAudioUrl = uploadResult.audioUrl;
            isStorageUrl = true;
            actualFileSize = uploadResult.fileSize || actualFileSize;
            console.log(`✅ Successfully uploaded to Firebase Storage: ${uploadResult.storagePath}`);
          } else {
            console.warn(`⚠️ Firebase Storage upload failed: ${uploadResult.error}`);
            return {
              success: false,
              error: `Firebase Storage upload failed: ${uploadResult.error}`
            };
          }
        } catch (uploadError) {
          console.error(`❌ Firebase Storage upload error:`, uploadError);
          return {
            success: false,
            error: `Firebase Storage upload error: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
          };
        }
      } else {
        return {
          success: false,
          error: 'No audio stream received from YT2MP3 Magic service'
        };
      }

      // Step 4: Save metadata to simplified cache for future access
      const saved = await firebaseStorageSimplified.saveAudioMetadata({
        videoId,
        audioUrl: finalAudioUrl,
        title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: 'Unknown Channel',
        duration: finalDuration,
        fileSize: actualFileSize,
        extractionService: 'yt2mp3-magic',
        extractionTimestamp: Date.now(),
        isStreamUrl: !isStorageUrl
      });

      if (saved) {
        console.log(`💾 Cached extraction result for ${videoId}`);
      }

      return {
        success: true,
        audioUrl: finalAudioUrl,
        title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl
      };

    } catch (error) {
      console.error(`❌ Audio extraction failed for ${videoId}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  /**
   * Check if audio is available in cache
   */
  async isAudioCached(videoId: string): Promise<boolean> {
    return await firebaseStorageSimplified.isAudioCached(videoId);
  }

  /**
   * Get cached audio metadata
   */
  async getCachedAudio(videoId: string): Promise<SimplifiedAudioData | null> {
    return await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
  }

  /**
   * Batch check for cached audio with Firebase Storage priority
   */
  async getBatchCachedAudio(videoIds: string[]): Promise<Map<string, SimplifiedAudioData>> {
    console.log(`🔍 Batch checking audio cache for ${videoIds.length} videos`);

    // First, check Firebase Storage for permanent files
    try {
      const { findExistingAudioFiles } = await import('./firebaseStorageService');
      const storageResults = await findExistingAudioFiles(videoIds);

      if (storageResults.size > 0) {
        console.log(`✅ Found ${storageResults.size} videos in Firebase Storage`);
        console.log(`📈 Firebase Storage Batch Hit: found=${storageResults.size}/${videoIds.length}`);

        // Convert Firebase Storage results to SimplifiedAudioData format
        const results = new Map<string, SimplifiedAudioData>();

        for (const [videoId, storageData] of storageResults.entries()) {
          const audioData: SimplifiedAudioData = {
            videoId,
            audioUrl: storageData.audioUrl,
            title: `YouTube Video ${videoId}`, // Will be updated with actual title if available
            duration: 0, // Duration will be detected later
            fileSize: storageData.fileSize || 0,
            isStreamUrl: false, // Firebase Storage URLs are permanent
            createdAt: Date.now()
          };

          results.set(videoId, audioData);

          // Save to simplified cache for faster future access
          await firebaseStorageSimplified.saveAudioMetadata({
            videoId,
            audioUrl: storageData.audioUrl,
            title: `YouTube Video ${videoId}`,
            duration: 0,
            fileSize: storageData.fileSize || 0
          });
        }

        // For videos not found in Firebase Storage, check Firestore cache
        const remainingVideoIds = videoIds.filter(id => !storageResults.has(id));
        if (remainingVideoIds.length > 0) {
          console.log(`🔍 Checking Firestore cache for remaining ${remainingVideoIds.length} videos`);
          const firestoreResults = await firebaseStorageSimplified.getMultipleCachedAudio(remainingVideoIds);

          // Merge results
          for (const [videoId, data] of firestoreResults.entries()) {
            results.set(videoId, data);
          }

          console.log(`📈 Firestore Cache Hit: found=${firestoreResults.size}/${remainingVideoIds.length}`);
        }

        console.log(`✅ Total batch cache results: ${results.size}/${videoIds.length} videos found`);
        return results;
      }
    } catch (storageError) {
      console.warn('⚠️ Firebase Storage batch check failed, falling back to Firestore:', storageError);
    }

    // Fallback to Firestore-only check
    console.log(`🔍 Falling back to Firestore-only batch check for ${videoIds.length} videos`);
    const results = await firebaseStorageSimplified.getMultipleCachedAudio(videoIds);
    console.log(`📈 Firestore Cache Hit: found=${results.size}/${videoIds.length}`);
    return results;
  }

  /**
   * Check audio extraction service availability
   */
  async isServiceAvailable(): Promise<boolean> {
    const env = detectEnvironment();

    switch (env.strategy) {
      case 'yt2mp3magic':
        return await yt2mp3MagicService.isAvailable();

      case 'ytdlp':
        return env.isDevelopment ? await ytDlpService.isAvailable() : false;

      // PRESERVED FOR REFERENCE - yt-mp3-go availability check
      // default:
      //   return await ytMp3GoService.isAvailable();

      default:
        // Fallback to YT2MP3 Magic availability check
        return await yt2mp3MagicService.isAvailable();
    }
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(durationString?: string): number {
    if (!durationString) return 0;

    try {
      // Handle formats like "3:45", "1:23:45", "0:30"
      const parts = durationString.split(':').map(part => parseInt(part, 10));
      
      if (parts.length === 2) {
        // MM:SS format
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clear service caches
   */
  clearCaches(): void {
    // YT2MP3 Magic service manages its own cache internally
    // PRESERVED FOR REFERENCE: quickTubeServiceSimplified.clearActiveJobs();
    console.log('🧹 Cleared audio extraction service caches');
  }

  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{
    quickTubeAvailable: boolean;
    cacheStats: {
      totalCached: number;
      validCached: number;
      expiredCached: number;
    };
  }> {
    const [quickTubeAvailable, cacheStats] = await Promise.all([
      this.isServiceAvailable(),
      firebaseStorageSimplified.getCacheStats()
    ]);

    return {
      quickTubeAvailable,
      cacheStats
    };
  }

  /**
   * Extract audio using async job processing (for long-running tasks)
   * This method is designed to work within Vercel's timeout constraints
   */
  async extractAudioAsync(
    videoId: string,
    forceRefresh = false,
    title?: string,
    onProgress?: (status: { progress?: number; status: string; elapsedTime?: number }) => void
  ): Promise<AudioExtractionResult> {
    console.log(`🎵 Async audio extraction: ${videoId}${title ? ` ("${title}")` : ''}`);

    try {
      // Check Firebase Storage first for permanent audio files (unless force refresh)
      if (!forceRefresh) {
        const env = detectEnvironment();
        console.log(`🔍 [${env.isProduction ? 'PROD' : 'DEV'}] Checking Firebase Storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('./firebaseStorageService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`✅ Found existing audio in Firebase Storage for ${videoId}`);
            console.log(`📈 Firebase Storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // Check if metadata already exists in simplified cache to avoid redundant writes
            const existingMetadata = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
            if (!existingMetadata) {
              console.log(`💾 Saving metadata to simplified cache for faster future access`);
              // Save to simplified cache for faster future access
              await firebaseStorageSimplified.saveAudioMetadata({
                videoId,
                audioUrl: existingFile.audioUrl,
                title: title || `Video ${videoId}`,
                duration: 0, // Duration will be detected later
                fileSize: existingFile.fileSize || 0
              });
            } else {
              console.log(`⚡ Metadata already exists in simplified cache, skipping redundant write`);
            }

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: title || `Video ${videoId}`,
              duration: 0,
              fromCache: true,
              isStreamUrl: false // Firebase Storage URLs are permanent
            };
          }
        } catch (storageError) {
          const errorMessage = storageError instanceof Error ? storageError.message : String(storageError);

          if (errorMessage.includes('Could not load the default credentials')) {
            console.warn(`⚠️ Firebase Storage unavailable (no credentials configured): ${videoId}`);
            console.warn('💡 To enable Firebase Storage caching, configure FIREBASE_SERVICE_ACCOUNT_KEY in Vercel');
          } else if (errorMessage.includes('XMLHttpRequest is not defined')) {
            console.warn(`⚠️ Firebase Client SDK cannot run in server environment: ${videoId}`);
          } else {
            console.warn(`⚠️ Firebase Storage check failed for ${videoId}:`, storageError);
          }
        }

        // Check simplified Firestore cache as fallback
        const cachedData = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
        if (cachedData) {
          console.log(`✅ Found cached audio metadata for ${videoId}`);
          console.log(`📈 Firestore Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cachedData.audioUrl,
            title: cachedData.title || title,
            duration: cachedData.duration,
            fromCache: true,
            isStreamUrl: cachedData.isStreamUrl,
            streamExpiresAt: cachedData.streamExpiresAt
          };
        }
      }

      // Use async job service for extraction
      const result = await asyncJobService.extractAudio(videoId, title, forceRefresh, onProgress);

      if (result.success && result.audioUrl) {
        // Cache the result
        const audioData: SimplifiedAudioData = {
          videoId,
          audioUrl: result.audioUrl,
          title: title || `Video ${videoId}`,
          duration: 0, // Duration will be detected later
          isStreamUrl: false,
          streamExpiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
          createdAt: Date.now()
        };

        await firebaseStorageSimplified.saveAudioMetadata(audioData);
        console.log(`💾 Cached async extraction result for ${videoId}`);

        return {
          success: true,
          audioUrl: result.audioUrl,
          title: audioData.title,
          duration: audioData.duration,
          fromCache: false
        };
      } else {
        return {
          success: false,
          error: result.error || 'Async extraction failed'
        };
      }

    } catch (error) {
      console.error(`❌ Async audio extraction failed for ${videoId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown async extraction error'
      };
    }
  }
}

// Export singleton instance
export const audioExtractionServiceSimplified = AudioExtractionServiceSimplified.getInstance();

// Additional functions for analysis page compatibility
import { getTranscription } from '@/services/firestoreService';
import { apiPost } from '@/config/api';
import { LyricsData } from '@/types/musicAiTypes';

// Types for the service

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

interface ProcessingContext {
  setProgress: (progress: number) => void;
  setStage: (stage: string) => void;
}

interface AudioProcessingServiceDependencies {
  // State setters
  setAudioProcessingState: (state: AudioProcessingState | ((prev: AudioProcessingState) => AudioProcessingState)) => void;
  setAnalysisResults: (results: AnalysisResult | null) => void;
  setDuration: (duration: number) => void;
  setLyrics: (lyrics: LyricsData | null) => void;
  setShowLyrics: (show: boolean) => void;
  setHasCachedLyrics: (hasCached: boolean) => void;
  setActiveTab: (tab: string) => void;
  setIsTranscribingLyrics: (isTranscribing: boolean) => void;
  setLyricsError: (error: string | null) => void;
  setShowExtractionNotification: (show: boolean) => void;

  // Processing context
  processingContext: ProcessingContext;

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

  try {
    const cachedData = await getTranscription(videoId, currentBeatDetector, currentChordDetector);

    if (cachedData) {
      console.log(`✅ Found cached analysis for ${videoId} with ${currentBeatDetector} + ${currentChordDetector}`);

      // Convert TranscriptionData to AnalysisResult format
      const analysisResult: AnalysisResult = {
        chords: cachedData.chords.map(chord => ({
          chord: chord.chord,
          time: chord.start || chord.time || 0
        })),
        beats: cachedData.beats.map(beat => ({
          time: beat.time,
          beatNum: beat.beatNum
        })),
        downbeats: cachedData.downbeats || [],
        downbeats_with_measures: Array.isArray(cachedData.downbeats_with_measures)
          ? cachedData.downbeats_with_measures.map(d => typeof d === 'object' ? d.time : d)
          : [],
        synchronizedChords: cachedData.synchronizedChords || [],
        beatModel: cachedData.beatModel,
        chordModel: cachedData.chordModel,
        audioDuration: cachedData.audioDuration || 0,
        beatDetectionResult: {
          time_signature: cachedData.timeSignature || undefined,
          bpm: cachedData.bpm || undefined,
          beatShift: cachedData.beatShift || undefined
        }
      };

      setAnalysisResults(analysisResult);
      setAudioProcessingState(prev => ({
        ...prev,
        isAnalyzing: false,
        isAnalyzed: true,
        fromFirestoreCache: true
      }));

      if (analysisResult.audioDuration && analysisResult.audioDuration > 0) {
        setDuration(analysisResult.audioDuration);
      }

      return analysisResult;
    }

    // No cached data, proceed with analysis
    console.log(`🔍 No cached analysis found for ${videoId} with ${currentBeatDetector} + ${currentChordDetector}, proceeding with analysis`);

    setAudioProcessingState(prev => ({
      ...prev,
      isAnalyzing: true,
      isAnalyzed: false,
      fromFirestoreCache: false
    }));

    // Set up progress tracking
    processingContext.setProgress(0);
    processingContext.setStage('Initializing analysis...');

    let stageTimeout: NodeJS.Timeout | null = null;

    // Set up stage progression timeout (fallback)
    stageTimeout = setTimeout(() => {
      processingContext.setStage('Processing audio data...');
      setTimeout(() => {
        processingContext.setStage('Detecting beats and chords...');
        setTimeout(() => {
          processingContext.setStage('Finalizing results...');
        }, 8000);
      }, 5000);
    }, 3000);

    // Call the audio processing service with current model values
    const results = await analyzeAudioFromService(audioProcessingState.audioUrl, currentBeatDetector, currentChordDetector);

    // Update duration from analysis results if available
    if (results.audioDuration && results.audioDuration > 0) {
      setDuration(results.audioDuration);
    }

    // Clear the stage timeout to prevent it from overriding completion
    if (stageTimeout) {
      clearTimeout(stageTimeout);
      stageTimeout = null;
    }

    // Update state with results
    setAnalysisResults(results);
    setAudioProcessingState(prev => ({
      ...prev,
      isAnalyzing: false,
      isAnalyzed: true,
      fromFirestoreCache: false
    }));

    processingContext.setProgress(100);
    processingContext.setStage('Analysis complete!');

    return results;

  } catch (error) {
    console.error('❌ Audio analysis failed:', error);

    setAudioProcessingState(prev => ({
      ...prev,
      isAnalyzing: false,
      isAnalyzed: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
      suggestion: error instanceof Error && 'suggestion' in error ? (error as Error & { suggestion?: string }).suggestion : undefined
    }));

    processingContext.setStage('Analysis failed');
    throw error;
  }
};

/**
 * Transcribe lyrics using Music.AI with word-level synchronization
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
      'Lyrics have already been transcribed for this video. Do you want to transcribe them again? This will overwrite the existing lyrics.'
    );
    if (!confirmed) {
      console.log('🎤 User cancelled lyrics re-transcription');
      return;
    }
  }

  setIsTranscribingLyrics(true);
  setLyricsError(null);

  try {
    console.log(`🎤 Starting lyrics transcription for ${videoId}`);

    const response = await apiPost('TRANSCRIBE_LYRICS', {
      videoId,
      audioUrl: audioProcessingState.audioUrl
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Lyrics transcription failed');
    }

    console.log(`✅ Lyrics transcription successful for ${videoId}`);

    // Set the transcribed lyrics
    setLyrics(data.lyrics);
    setShowLyrics(true);
    setHasCachedLyrics(true);
    setActiveTab('lyrics');

  } catch (error) {
    console.error('❌ Lyrics transcription failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Lyrics transcription failed';
    setLyricsError(errorMessage);
  } finally {
    setIsTranscribingLyrics(false);
  }
};

/**
 * Extract audio from YouTube with comprehensive metadata preservation
 */
export const extractAudioFromYouTube = async (deps: AudioProcessingServiceDependencies, forceRefresh: boolean = false): Promise<void> => {
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
    processingContext
  } = deps;

  // Prevent concurrent extractions
  if (extractionLockRef.current) {
    console.log('🔒 Audio extraction already in progress, skipping...');
    return;
  }

  extractionLockRef.current = true;

  try {
    setAudioProcessingState(prev => ({
      ...prev,
      isDownloading: true,
      isExtracting: true,
      isExtracted: false,
      error: null,
      suggestion: null
    }));

    // Show extraction notification
    setShowExtractionNotification(true);

    // Set up progress tracking
    let progress = 0;
    const progressInterval: NodeJS.Timeout = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      processingContext.setProgress(progress);
    }, 1000);

    // Prepare video metadata for the API call
    const videoMetadata = titleFromSearch ? {
      id: videoId,
      title: titleFromSearch,
      thumbnail: thumbnailFromSearch || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      channelTitle: channelFromSearch || 'Unknown Channel',
      duration: durationFromSearch || '0:00'
    } : undefined;

    try {
      const response = await apiPost('EXTRACT_AUDIO', {
        videoId,
        forceRefresh,
        videoMetadata,
        originalTitle: titleFromSearch
      });

      // Clear progress interval
      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Audio extraction failed');
      }

      console.log(`✅ Audio extraction successful for ${videoId}`);

      // Update state with successful extraction
      setAudioProcessingState(prev => ({
        ...prev,
        isDownloading: false,
        isExtracting: false,
        isExtracted: true,
        audioUrl: data.audioUrl,
        youtubeEmbedUrl: data.youtubeEmbedUrl,
        fromCache: data.fromCache || false,
        isStreamUrl: data.isStreamUrl,
        streamExpiresAt: data.streamExpiresAt,
        error: null,
        suggestion: null
      }));

      // Update duration if available
      if (data.duration && data.duration > 0) {
        setDuration(data.duration);
      }

      processingContext.setProgress(100);

    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }

  } catch (error) {
    console.error('❌ Audio extraction failed:', error);

    setAudioProcessingState(prev => ({
      ...prev,
      isDownloading: false,
      isExtracting: false,
      isExtracted: false,
      error: error instanceof Error ? error.message : 'Audio extraction failed',
      suggestion: error instanceof Error && 'suggestion' in error ? (error as Error & { suggestion?: string }).suggestion : undefined
    }));

    throw error;
  } finally {
    extractionLockRef.current = false;
    setShowExtractionNotification(false);
  }
};
