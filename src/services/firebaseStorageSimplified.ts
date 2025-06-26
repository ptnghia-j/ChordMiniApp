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
export interface SimplifiedAudioData {
  videoId: string; // Primary key: 11-character YouTube ID
  audioUrl: string; // Direct QuickTube download URL
  title: string; // Clean title from YouTube search results
  thumbnail?: string; // Thumbnail URL from YouTube search
  channelTitle?: string; // Channel name from YouTube search
  duration?: number; // Duration in seconds
  fileSize?: number; // File size if available
  isStreamUrl: boolean; // Always true for QuickTube URLs
  streamExpiresAt: number; // Expiration timestamp
  createdAt: unknown; // Firestore timestamp
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
  }): Promise<boolean> {
    if (!db) {
      console.warn('Firebase not initialized, skipping save');
      return false;
    }

    try {
      console.log(`💾 Saving audio metadata for video ID: ${data.videoId}`);
      console.log(`📝 Title: "${data.title}"`);

      // Wait for authentication
      const { waitForAuth } = await import('@/config/firebase');
      await waitForAuth();

      // Use video ID as document ID
      const docRef = doc(db, AUDIO_CACHE_COLLECTION, data.videoId);

      // Prepare simplified data structure
      const audioData: SimplifiedAudioData = {
        videoId: data.videoId,
        audioUrl: data.audioUrl,
        title: data.title,
        thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.videoId}/mqdefault.jpg`,
        channelTitle: data.channelTitle || 'Unknown Channel',
        duration: data.duration || 0,
        fileSize: data.fileSize || 0,
        isStreamUrl: true, // QuickTube URLs are always stream URLs
        streamExpiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
        createdAt: serverTimestamp()
      };

      // Save to Firestore
      await setDoc(docRef, audioData);

      console.log(`✅ Audio metadata saved successfully for ${data.videoId}`);
      return true;

    } catch (error) {
      console.error('❌ Error saving audio metadata:', error);
      
      if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
        console.warn('⚠️ Firestore permissions not configured. This is expected in development.');
      }
      
      return false;
    }
  }

  /**
   * Get cached audio metadata by video ID with smart caching
   */
  async getCachedAudioMetadata(videoId: string): Promise<SimplifiedAudioData | null> {
    if (!db) {
      console.warn('Firebase not initialized');
      return null;
    }

    // Import smart cache
    const { audioMetadataCache } = await import('@/services/smartFirebaseCache');

    return await audioMetadataCache.get(
      `audio_${videoId}`,
      async () => {
        try {
          // Wait for authentication
          const { waitForAuth } = await import('@/config/firebase');
          await waitForAuth();

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
            return null;
          }

          // Verify the audio URL is still accessible
          if (await this.verifyAudioUrl(data.audioUrl)) {
            return data;
          } else {
            console.log(`❌ Cached audio URL no longer accessible for ${videoId}`);
            return null;
          }

        } catch (error) {
          if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
            // This is expected in development - don't spam logs
            return null;
          }
          throw error; // Let smart cache handle other errors
        }
      },
      // Check if audio metadata is complete
      (data: SimplifiedAudioData) => {
        return !!(data.audioUrl && data.title && (!data.isStreamUrl || data.streamExpiresAt));
      }
    );
  }

  /**
   * Verify if an audio URL is still accessible
   */
  private async verifyAudioUrl(audioUrl: string): Promise<boolean> {
    try {
      const response = await fetch(audioUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
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
          // Wait for authentication
          const { waitForAuth } = await import('@/config/firebase');
          await waitForAuth();

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
      (data: SimplifiedAudioData) => {
        return !!(data.audioUrl && data.title && (!data.isStreamUrl || data.streamExpiresAt));
      }
    );

    // Convert to the expected format, filtering out null values
    const results = new Map<string, SimplifiedAudioData>();
    for (const [videoId, data] of cachedResults.entries()) {
      if (data) {
        results.set(videoId, data);
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
      // Wait for authentication
      const { waitForAuth } = await import('@/config/firebase');
      await waitForAuth();

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
      // Wait for authentication
      const { waitForAuth } = await import('@/config/firebase');
      await waitForAuth();

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
