/**
 * Firebase Storage Service - Simplified Video ID-Based Storage
 *
 * This service eliminates filename-based storage and uses video ID as the primary key:
 * 1. Store audio metadata using 11-character YouTube video ID
 * 2. Use YouTube search metadata (title, thumbnail) for indexing
 * 3. No filename sanitization or complex storage paths
 * 4. Direct video ID-based retrieval
 */

import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Collection name for audio cache - matches existing Firebase data
const AUDIO_CACHE_COLLECTION = 'audioFiles';

// Simplified audio file data structure
export interface SimplifiedAudioData extends Record<string, unknown> {
  videoId: string; // Primary key: 11-character YouTube ID
  audioUrl: string; // Direct download URL from extraction service
  title: string; // Clean title from YouTube search results
  thumbnail?: string; // Thumbnail URL from YouTube search
  channelTitle?: string; // Channel name from YouTube search
  duration?: number; // Duration in seconds
  fileSize?: number; // File size if available
  isStreamUrl: boolean; // True for external URLs, false for Firebase Storage URLs
  streamExpiresAt?: number; // Expiration timestamp (only for stream URLs)
  createdAt: unknown; // Firestore timestamp

  // Enhanced metadata fields
  extractionService?: string; // Which service was used (yt-mp3-go, quicktube, yt-dlp)
  extractionTimestamp?: number; // When the audio was extracted
  videoDuration?: string; // Original duration string from YouTube (e.g., "PT3M33S")
  videoDescription?: string; // Video description (optional)
  videoPublishedAt?: string; // When the video was published
  videoViewCount?: number; // View count at time of extraction
}

export class FirebaseStorageSimplified {
  private static instance: FirebaseStorageSimplified;

  public static getInstance(): FirebaseStorageSimplified {
    if (!FirebaseStorageSimplified.instance) {
      FirebaseStorageSimplified.instance = new FirebaseStorageSimplified();
    }
    return FirebaseStorageSimplified.instance;
  }

  /**
   * Save audio metadata using video ID as primary key
   */
  async saveAudioMetadata(data: {
    videoId: string;
    audioUrl: string;
    title: string;
    thumbnail?: string;
    channelTitle?: string;
    duration?: number;
    fileSize?: number;
    isStreamUrl?: boolean;
    streamExpiresAt?: number;

    // Enhanced metadata fields
    extractionService?: string;
    extractionTimestamp?: number;
    videoDuration?: string;
    videoDescription?: string;
    videoPublishedAt?: string;
    videoViewCount?: number;
  }): Promise<boolean> {
    // COLD START FIX: Enhanced Firebase initialization with retry logic
    if (!db) {
      console.warn('Firebase not initialized, attempting to initialize...');
      try {
        // Try to re-import and initialize Firebase
        const { db: globalDb } = await import('@/config/firebase');
        if (!globalDb) {
          console.warn('Firebase initialization failed, skipping audio metadata save');
          return false;
        }
      } catch (error) {
        console.warn('Firebase re-initialization failed:', error);
        return false;
      }
    }

    // COLD START FIX: Implement retry logic with exponential backoff for authentication issues
    const maxRetries = 3;
    const baseDelay = 100; // Start with 100ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._saveAudioMetadataAttempt(data, attempt);
      } catch (error) {
        const isPermissionError = error instanceof Error &&
          (error.message.includes('permission-denied') ||
           error.message.includes('PERMISSION_DENIED') ||
           error.message.includes('Missing or insufficient permissions'));

        if (isPermissionError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 100ms, 200ms, 400ms
          console.warn(`⚠️ Permission denied on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms...`);

          // Wait for authentication to be ready
          await new Promise(resolve => setTimeout(resolve, delay));

          // ENHANCED: Use the new comprehensive authentication system
          try {
            const { ensureAuthReady, getCurrentAuthUser, isAuthStateReady } = await import('@/config/firebase');

            console.log(`🔍 Auth state before retry ${attempt}: ready=${isAuthStateReady()}, user=${!!getCurrentAuthUser()}`);

            // Use the comprehensive authentication system
            const authReady = await ensureAuthReady();

            if (authReady) {
              console.log(`✅ Authentication ensured for retry ${attempt}`);
            } else {
              console.warn(`⚠️ Failed to ensure authentication on attempt ${attempt}`);
            }
          } catch (authError) {
            console.warn(`❌ Authentication error on attempt ${attempt}:`, authError);
          }

          continue; // Retry the operation
        }

        // If it's not a permission error or we've exhausted retries, handle accordingly
        if (isPermissionError) {
          console.error(`❌ Permission denied after ${maxRetries} attempts. This may be due to cold start authentication issues.`);
          console.warn('🔧 Cache operation failed, but this should not block audio extraction workflow.');
          return false; // Return false but don't throw to avoid blocking audio extraction
        }

        // For other errors, log and return false
        console.error('❌ Error saving audio metadata:', error);
        return false;
      }
    }

    return false; // Should never reach here
  }

  /**
   * Internal method to attempt saving audio metadata
   */
  private async _saveAudioMetadataAttempt(data: {
    videoId: string;
    audioUrl: string;
    title: string;
    thumbnail?: string;
    channelTitle?: string;
    duration?: number;
    fileSize?: number;
    isStreamUrl?: boolean;
    streamExpiresAt?: number;
    extractionService?: string;
    extractionTimestamp?: number;
    videoDuration?: string;
    videoDescription?: string;
    videoPublishedAt?: string;
    videoViewCount?: number;
  }, attempt: number): Promise<boolean> {

    try {
      console.log(`💾 Saving audio metadata for video ID: ${data.videoId}`);
      console.log(`📝 Title: "${data.title}"`);

      // Skip authentication - Firebase security rules allow public access for caching
      // This eliminates the 20-second timeout when anonymous auth fails

      // Use video ID as document ID
      if (!db) {
        console.error('Firebase db is null after initialization check');
        return false;
      }
      const docRef = doc(db, AUDIO_CACHE_COLLECTION, data.videoId);

      // Prepare simplified data structure
      const isStreamUrl = data.isStreamUrl !== undefined ? data.isStreamUrl :
                         (data.audioUrl.includes('quicktube.app') || data.audioUrl.includes('lukavukanovic.xyz'));

      const audioData: SimplifiedAudioData = {
        videoId: data.videoId,
        audioUrl: data.audioUrl,
        title: data.title,
        thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.videoId}/mqdefault.jpg`,
        channelTitle: data.channelTitle || 'Unknown Channel',
        duration: data.duration || 0,
        fileSize: data.fileSize || 0,
        isStreamUrl,
        ...(isStreamUrl && {
          streamExpiresAt: data.streamExpiresAt || (Date.now() + (24 * 60 * 60 * 1000))
        }), // Only include streamExpiresAt for stream URLs

        // Enhanced metadata fields (filter out undefined values for Firebase)
        ...(data.extractionService && { extractionService: data.extractionService }),
        extractionTimestamp: data.extractionTimestamp || Date.now(),
        ...(data.videoDuration && { videoDuration: data.videoDuration }),
        ...(data.videoDescription && { videoDescription: data.videoDescription }),
        ...(data.videoPublishedAt && { videoPublishedAt: data.videoPublishedAt }),
        ...(data.videoViewCount && { videoViewCount: data.videoViewCount }),

        createdAt: serverTimestamp()
      };

      // Save to Firestore
      await setDoc(docRef, audioData);

      console.log(`✅ Audio metadata saved successfully for ${data.videoId} (attempt ${attempt})`);
      return true;

    } catch (error) {
      // Re-throw the error to be handled by the retry logic in the parent method
      throw error;
    }
  }

  /**
   * NON-BLOCKING: Save audio metadata in background without blocking audio extraction
   */
  async saveAudioMetadataBackground(data: {
    videoId: string;
    audioUrl: string;
    title: string;
    thumbnail?: string;
    channelTitle?: string;
    duration: number;
    fileSize: number;
    isStreamUrl?: boolean;
    streamExpiresAt?: number;
    extractionService?: string;
    extractionTimestamp?: number;
    videoDuration?: string;
    videoDescription?: string;
    videoPublishedAt?: string;
    videoViewCount?: number;
  }): Promise<void> {
    // Run cache operation in background without blocking
    setTimeout(async () => {
      try {
        const success = await this.saveAudioMetadata(data);
        if (success) {
          console.log(`🔄 Background cache save successful for ${data.videoId}`);
        } else {
          console.warn(`⚠️ Background cache save failed for ${data.videoId} (non-blocking)`);
        }
      } catch (error) {
        console.warn(`⚠️ Background cache save error for ${data.videoId} (non-blocking):`, error);
      }
    }, 0); // Execute on next tick
  }

  /**
   * Get cached audio metadata by video ID with smart caching
   */
  async getCachedAudioMetadata(videoId: string): Promise<SimplifiedAudioData | null> {
    if (!db) {
      // PERFORMANCE FIX: Try to initialize Firebase if not ready (race condition fix)
      try {
        const { getFirestoreInstance } = await import('@/lib/firebase-lazy');
        const firestoreInstance = await getFirestoreInstance();
        if (!firestoreInstance) {
          console.warn('Firebase not initialized and initialization failed');
          return null;
        }
        // Update global db reference for future calls
        const { db: globalDb } = await import('@/config/firebase');
        if (!globalDb) {
          console.warn('Firebase initialization succeeded but global db not available');
          return null;
        }
      } catch (error) {
        console.warn('Firebase initialization failed during cache check:', error);
        return null;
      }
    }

    // Import smart cache
    const { audioMetadataCache } = await import('@/services/smartFirebaseCache');

    const result = await audioMetadataCache.get(
      `audio_${videoId}`,
      async () => {
        try {
          // Skip authentication - Firebase security rules allow public access for caching
          // This eliminates the 20-second timeout when anonymous auth fails

          if (!db) {
            return null;
          }

          // Get document by video ID
          const docRef = doc(db, AUDIO_CACHE_COLLECTION, videoId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            return null;
          }

          const data = docSnap.data() as SimplifiedAudioData;

          // Check if stream URL has expired
          if (data.isStreamUrl && data.streamExpiresAt && Date.now() > data.streamExpiresAt) {
            console.log(`⏰ Cached stream URL expired for ${videoId}`);

            // Log cache miss due to expiration
            try {
              const { storageMonitoringService } = await import('./storageMonitoringService');
              storageMonitoringService.logStorageOperation({
                type: 'cache_miss',
                videoId,
                success: false,
                error: 'Stream URL expired'
              });
            } catch (monitoringError) {
              // Don't fail the main operation if monitoring fails
              console.warn('Monitoring service unavailable:', monitoringError);
            }

            return null;
          }

          // Verify the audio URL is still accessible
          if (await this.verifyAudioUrl(data.audioUrl)) {
            console.log(`✅ Found cached audio for ${videoId} (${data.isStreamUrl ? 'stream' : 'storage'} URL)`);

            // Log cache hit
            try {
              const { storageMonitoringService } = await import('./storageMonitoringService');
              storageMonitoringService.logStorageOperation({
                type: 'cache_hit',
                videoId,
                fileSize: data.fileSize,
                success: true
              });
            } catch (monitoringError) {
              // Don't fail the main operation if monitoring fails
              console.warn('Monitoring service unavailable:', monitoringError);
            }

            return data;
          } else {
            console.log(`❌ Cached audio URL no longer accessible for ${videoId}`);

            // Log cache miss due to inaccessible URL
            try {
              const { storageMonitoringService } = await import('./storageMonitoringService');
              storageMonitoringService.logStorageOperation({
                type: 'cache_miss',
                videoId,
                success: false,
                error: 'Audio URL no longer accessible'
              });
            } catch (monitoringError) {
              // Don't fail the main operation if monitoring fails
              console.warn('Monitoring service unavailable:', monitoringError);
            }

            return null;
          }

        } catch (error) {
          if (error instanceof Error && (error.message.includes('PERMISSION_DENIED') || error.message.includes('permission-denied'))) {
            // Enhanced permission error handling for cold starts
            console.warn('⚠️ Firebase permission denied during cache read. This may be due to cold start initialization.');

            // Attempt retry for cold start scenarios
            try {
              console.log('🔄 Retrying cache read after cold start delay...');
              await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay for reads
              if (db) {
                const retryDocRef = doc(db, AUDIO_CACHE_COLLECTION, videoId);
                const retryDocSnap = await getDoc(retryDocRef);

                if (retryDocSnap.exists()) {
                  const retryData = retryDocSnap.data() as SimplifiedAudioData;
                  // Check if stream URL has expired
                  if (retryData.isStreamUrl && retryData.streamExpiresAt && Date.now() > retryData.streamExpiresAt) {
                    return null;
                  }
                  return retryData;
                }
              }
              return null;
            } catch (retryError) {
              console.warn('❌ Cache read retry failed:', retryError);
              return null;
            }
          }
          if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
            // Firebase Admin SDK authentication failed - this is expected without service account
            console.warn('⚠️ Firebase Admin authentication failed (service account not configured)');
            return null;
          }
          throw error; // Let smart cache handle other errors
        }
      },
      // Check if audio metadata is complete
      (data: Record<string, unknown>) => {
        return !!(data.audioUrl && data.title && (!data.isStreamUrl || data.streamExpiresAt));
      }
    );

    return result as SimplifiedAudioData | null;
  }

  /**
   * Verify if an audio URL is still accessible
   */
  private async verifyAudioUrl(audioUrl: string): Promise<boolean> {
    try {
      // For Firebase Storage URLs, skip verification to avoid CORS issues
      // Firebase Storage URLs are generally reliable and don't need HEAD request verification
      if (audioUrl.includes('firebasestorage.googleapis.com')) {
        console.log(`🔥 Skipping verification for Firebase Storage URL (CORS-safe)`);
        return true;
      }

      // For other URLs (stream URLs, etc.), perform HEAD request verification
      // In production, be more lenient with timeouts and errors
      const timeoutMs = process.env.NODE_ENV === 'production' ? 10000 : 5000;
      const response = await fetch(audioUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(timeoutMs)
      });
      return response.ok;
    } catch (error) {
      // In production, log the error but don't fail cache verification for network issues
      if (process.env.NODE_ENV === 'production') {
        console.warn(`⚠️ URL verification failed in production (treating as valid):`, error instanceof Error ? error.message : error);
        return true; // Be more lenient in production
      }
      return false;
    }
  }

  /**
   * Check if audio is cached for a video ID
   */
  async isAudioCached(videoId: string): Promise<boolean> {
    const cached = await this.getCachedAudioMetadata(videoId);
    return cached !== null;
  }

  /**
   * Get multiple cached audio files by video IDs with smart batch caching
   */
  async getMultipleCachedAudio(videoIds: string[]): Promise<Map<string, SimplifiedAudioData>> {
    if (!db || videoIds.length === 0) {
      return new Map();
    }

    // Import smart cache
    const { audioMetadataCache } = await import('@/services/smartFirebaseCache');

    // Use smart cache batch functionality
    const cachedResults = await audioMetadataCache.getBatch(
      videoIds,
      async (videoId: string) => {
        try {
          // Skip authentication - Firebase security rules allow public access for caching
          // This eliminates the 20-second timeout when anonymous auth fails

          if (!db) {
            return null;
          }

          // Get document by video ID
          const docRef = doc(db, AUDIO_CACHE_COLLECTION, videoId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            return null;
          }

          const data = docSnap.data() as SimplifiedAudioData;

          // Check if stream URL has expired
          if (data.isStreamUrl && data.streamExpiresAt && Date.now() > data.streamExpiresAt) {
            return null;
          }

          // Verify the audio URL is still accessible
          if (await this.verifyAudioUrl(data.audioUrl)) {
            return data;
          } else {
            return null;
          }

        } catch (error) {
          if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
            return null;
          }
          throw error;
        }
      },
      // Check if audio metadata is complete
      (data: Record<string, unknown>) => {
        return !!(data.audioUrl && data.title && (!data.isStreamUrl || data.streamExpiresAt));
      }
    );

    // Convert to the expected format, filtering out null values
    const results = new Map<string, SimplifiedAudioData>();
    for (const [videoId, data] of cachedResults.entries()) {
      if (data) {
        results.set(videoId, data as unknown as SimplifiedAudioData);
      }
    }

    return results;
  }

  /**
   * Update audio metadata (e.g., when title is corrected)
   */
  async updateAudioMetadata(videoId: string, updates: Partial<SimplifiedAudioData>): Promise<boolean> {
    if (!db) {
      console.warn('Firebase not initialized');
      return false;
    }

    try {
      // Skip authentication - Firebase security rules allow public access for caching
      // This eliminates the 20-second timeout when anonymous auth fails

      const docRef = doc(db, AUDIO_CACHE_COLLECTION, videoId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.warn(`Cannot update non-existent audio metadata for ${videoId}`);
        return false;
      }

      const currentData = docSnap.data() as SimplifiedAudioData;
      const updatedData = {
        ...currentData,
        ...updates,
        videoId, // Ensure video ID is not changed
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, updatedData);
      console.log(`✅ Updated audio metadata for ${videoId}`);
      return true;

    } catch (error) {
      console.error(`❌ Error updating audio metadata for ${videoId}:`, error);
      return false;
    }
  }

  /**
   * Delete cached audio metadata
   */
  async deleteCachedAudio(videoId: string): Promise<boolean> {
    if (!db) {
      console.warn('Firebase not initialized');
      return false;
    }

    try {
      // Skip authentication - Firebase security rules allow public access for caching
      // This eliminates the 20-second timeout when anonymous auth fails

      const docRef = doc(db, AUDIO_CACHE_COLLECTION, videoId);
      await setDoc(docRef, { deleted: true, deletedAt: serverTimestamp() });
      
      console.log(`🗑️ Marked audio metadata as deleted for ${videoId}`);
      return true;

    } catch (error) {
      console.error(`❌ Error deleting audio metadata for ${videoId}:`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalCached: number;
    validCached: number;
    expiredCached: number;
  }> {
    // This would require a more complex query in a real implementation
    // For now, return basic stats
    return {
      totalCached: 0,
      validCached: 0,
      expiredCached: 0
    };
  }
}

// Export singleton instance
export const firebaseStorageSimplified = FirebaseStorageSimplified.getInstance();
