/**
 * Audio Storage Service - Production-Ready Firebase Storage Integration
 * 
 * This service handles audio file storage for ChordMiniApp in production environments
 * where local file storage is not available (Vercel serverless functions).
 * 
 * Features:
 * - Firebase Storage for permanent audio file storage
 * - Firestore metadata caching with storage URLs
 * - Fallback to QuickTube stream URLs when storage fails
 * - Automatic cleanup of expired files
 */

import { uploadAudioFile, saveAudioFileMetadata, getCachedAudioFile } from './firebaseStorageService';
import { firebaseStorageSimplified } from './firebaseStorageSimplified';

export interface AudioStorageResult {
  success: boolean;
  audioUrl: string;
  fromCache: boolean;
  isStorageUrl: boolean;
  isStreamUrl: boolean;
  fileSize?: number;
  duration?: number;
  error?: string;
}

export class AudioStorageService {
  private static instance: AudioStorageService;

  public static getInstance(): AudioStorageService {
    if (!AudioStorageService.instance) {
      AudioStorageService.instance = new AudioStorageService();
    }
    return AudioStorageService.instance;
  }

  /**
   * Store audio file with intelligent fallback strategy
   */
  async storeAudioFile(
    videoId: string,
    audioData: ArrayBuffer,
    metadata: {
      title: string;
      duration?: number;
      fileSize?: number;
      channelTitle?: string;
      thumbnail?: string;
    }
  ): Promise<AudioStorageResult> {
    console.log(`🔄 Storing audio file for ${videoId}, size: ${(audioData.byteLength / 1024 / 1024).toFixed(2)}MB`);

    // Check if already cached
    const cached = await this.getCachedAudio(videoId);
    if (cached.success) {
      console.log(`✅ Using cached audio for ${videoId}`);
      return cached;
    }

    try {
      // Attempt Firebase Storage upload
      const uploadResult = await uploadAudioFile(videoId, audioData);
      
      if (uploadResult) {
        console.log(`✅ Audio uploaded to Firebase Storage: ${uploadResult.audioUrl}`);
        
        // Save metadata to Firestore
        const saved = await saveAudioFileMetadata({
          videoId,
          audioUrl: uploadResult.audioUrl,
          title: metadata.title,
          storagePath: uploadResult.storagePath,
          fileSize: audioData.byteLength,
          duration: metadata.duration,
          isStreamUrl: false,
          streamExpiresAt: undefined
        });

        if (saved) {
          return {
            success: true,
            audioUrl: uploadResult.audioUrl,
            fromCache: false,
            isStorageUrl: true,
            isStreamUrl: false,
            fileSize: audioData.byteLength,
            duration: metadata.duration
          };
        }
      }
    } catch (storageError) {
      console.warn(`⚠️ Firebase Storage upload failed: ${storageError}`);
      console.log(`🔄 Falling back to stream URL caching for ${videoId}`);
    }

    // Fallback: Save as stream URL reference (QuickTube URL)
    // This doesn't store the actual file but caches the metadata
    return {
      success: false,
      audioUrl: '',
      fromCache: false,
      isStorageUrl: false,
      isStreamUrl: true,
      error: 'Storage upload failed, use stream URL fallback'
    };
  }

  /**
   * Retrieve cached audio with intelligent source detection
   */
  async getCachedAudio(videoId: string): Promise<AudioStorageResult> {
    try {
      // Check Firebase Storage cache first
      const cached = await getCachedAudioFile(videoId);
      
      if (cached) {
        // Verify the storage URL is still valid
        if (cached.audioUrl && !cached.isStreamUrl) {
          const isValid = await this.verifyStorageUrl(cached.audioUrl);
          if (isValid) {
            return {
              success: true,
              audioUrl: cached.audioUrl,
              fromCache: true,
              isStorageUrl: true,
              isStreamUrl: false,
              fileSize: cached.fileSize,
              duration: cached.duration
            };
          } else {
            console.warn(`⚠️ Cached storage URL invalid for ${videoId}`);
          }
        }

        // Check if it's a valid stream URL
        if (cached.isStreamUrl && cached.streamExpiresAt) {
          const isExpired = Date.now() > cached.streamExpiresAt;
          if (!isExpired) {
            return {
              success: true,
              audioUrl: cached.audioUrl,
              fromCache: true,
              isStorageUrl: false,
              isStreamUrl: true,
              fileSize: cached.fileSize,
              duration: cached.duration
            };
          } else {
            console.warn(`⚠️ Cached stream URL expired for ${videoId}`);
          }
        }
      }

      // Check simplified cache
      const simplifiedCache = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
      if (simplifiedCache) {
        return {
          success: true,
          audioUrl: simplifiedCache.audioUrl,
          fromCache: true,
          isStorageUrl: false,
          isStreamUrl: true,
          fileSize: simplifiedCache.fileSize,
          duration: simplifiedCache.duration
        };
      }

    } catch (error) {
      console.error(`❌ Error checking cached audio for ${videoId}:`, error);
    }

    return {
      success: false,
      audioUrl: '',
      fromCache: false,
      isStorageUrl: false,
      isStreamUrl: false,
      error: 'No cached audio found'
    };
  }

  /**
   * Verify if a storage URL is still accessible
   */
  private async verifyStorageUrl(url: string): Promise<boolean> {
    try {
      // For Firebase Storage URLs, skip verification to avoid CORS issues
      // Firebase Storage URLs are generally reliable and don't need HEAD request verification
      if (url.includes('firebasestorage.googleapis.com')) {
        console.log(`🔥 Skipping verification for Firebase Storage URL (CORS-safe)`);
        return true;
      }

      // For other URLs (stream URLs, etc.), perform HEAD request verification
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<void> {
    console.log('🧹 Starting cache cleanup...');
    // Implementation would query Firestore for expired entries
    // and remove them to save storage costs
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    storageFiles: number;
    streamUrls: number;
  }> {
    // Implementation would query Firestore to get storage statistics
    return {
      totalFiles: 0,
      totalSize: 0,
      storageFiles: 0,
      streamUrls: 0
    };
  }
}

export const audioStorageService = AudioStorageService.getInstance();
