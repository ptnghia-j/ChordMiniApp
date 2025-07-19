/**
 * Production-Safe Audio Caching Strategy
 * 
 * This service provides a fallback caching mechanism when Firebase is not available
 * in production environments (e.g., when service account credentials are not configured).
 * 
 * It uses in-memory caching and Firestore metadata cache as alternatives to Firebase Storage.
 */

interface CacheEntry {
  videoId: string;
  audioUrl: string;
  title: string;
  duration: number;
  isStreamUrl: boolean;
  streamExpiresAt?: number;
  cachedAt: number;
}

class ProductionCacheStrategy {
  private static instance: ProductionCacheStrategy;
  private memoryCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_MEMORY_CACHE_SIZE = 50;

  public static getInstance(): ProductionCacheStrategy {
    if (!ProductionCacheStrategy.instance) {
      ProductionCacheStrategy.instance = new ProductionCacheStrategy();
    }
    return ProductionCacheStrategy.instance;
  }

  /**
   * Check if we can use Firebase Storage
   */
  async canUseFirebaseStorage(): Promise<boolean> {
    try {
      // Only try Firebase if we're in a browser environment or have service account
      if (typeof window !== 'undefined') {
        return true; // Client SDK available
      }

      // Server-side: check for service account
      return !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    } catch {
      return false;
    }
  }

  /**
   * Get cached audio with fallback strategy
   */
  async getCachedAudio(videoId: string): Promise<CacheEntry | null> {
    // Strategy 1: Try Firebase Storage if available
    if (await this.canUseFirebaseStorage()) {
      try {
        const { findExistingAudioFile } = await import('./firebaseStorageService');
        const firebaseResult = await findExistingAudioFile(videoId);
        
        if (firebaseResult) {
          const entry: CacheEntry = {
            videoId,
            audioUrl: firebaseResult.audioUrl,
            title: `Video ${videoId}`,
            duration: 0,
            isStreamUrl: false,
            cachedAt: Date.now()
          };
          
          // Cache in memory for faster future access
          this.setMemoryCache(videoId, entry);
          return entry;
        }
      } catch (error) {
        console.warn(`⚠️ Firebase Storage fallback failed for ${videoId}:`, error);
      }
    }

    // Strategy 2: Try Firestore metadata cache
    try {
      const { firebaseStorageSimplified } = await import('./firebaseStorageSimplified');
      const firestoreResult = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
      
      if (firestoreResult) {
        const entry: CacheEntry = {
          videoId,
          audioUrl: firestoreResult.audioUrl,
          title: firestoreResult.title,
          duration: firestoreResult.duration || 0,
          isStreamUrl: firestoreResult.isStreamUrl || false,
          streamExpiresAt: firestoreResult.streamExpiresAt,
          cachedAt: Date.now()
        };
        
        // Cache in memory for faster future access
        this.setMemoryCache(videoId, entry);
        return entry;
      }
    } catch (error) {
      console.warn(`⚠️ Firestore metadata cache failed for ${videoId}:`, error);
    }

    // Strategy 3: Check memory cache
    const memoryResult = this.getMemoryCache(videoId);
    if (memoryResult) {
      return memoryResult;
    }

    return null;
  }

  /**
   * Cache audio result with fallback strategy
   */
  async cacheAudio(entry: CacheEntry): Promise<void> {
    // Always cache in memory first
    this.setMemoryCache(entry.videoId, entry);

    // Try to cache in Firestore if available
    try {
      const { firebaseStorageSimplified } = await import('./firebaseStorageSimplified');
      await firebaseStorageSimplified.saveAudioMetadata({
        videoId: entry.videoId,
        audioUrl: entry.audioUrl,
        title: entry.title,
        duration: entry.duration,
        isStreamUrl: entry.isStreamUrl,
        streamExpiresAt: entry.streamExpiresAt
      });
      console.log(`💾 Cached audio metadata in Firestore for ${entry.videoId}`);
    } catch (error) {
      console.warn(`⚠️ Failed to cache in Firestore for ${entry.videoId}:`, error);
      console.log(`💾 Audio cached in memory only for ${entry.videoId}`);
    }
  }

  /**
   * Memory cache operations
   */
  private setMemoryCache(videoId: string, entry: CacheEntry): void {
    // Remove expired entries
    this.cleanupMemoryCache();
    
    // Add new entry
    this.memoryCache.set(videoId, entry);
    
    // Limit cache size
    if (this.memoryCache.size > this.MAX_MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
  }

  private getMemoryCache(videoId: string): CacheEntry | null {
    const entry = this.memoryCache.get(videoId);
    
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.cachedAt > this.CACHE_TTL) {
      this.memoryCache.delete(videoId);
      return null;
    }

    // Check if stream URL is expired
    if (entry.isStreamUrl && entry.streamExpiresAt && Date.now() > entry.streamExpiresAt) {
      this.memoryCache.delete(videoId);
      return null;
    }

    return entry;
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [videoId, entry] of this.memoryCache.entries()) {
      if (now - entry.cachedAt > this.CACHE_TTL) {
        this.memoryCache.delete(videoId);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    memoryEntries: number;
    firebaseAvailable: boolean;
    firestoreAvailable: boolean;
  } {
    return {
      memoryEntries: this.memoryCache.size,
      firebaseAvailable: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || typeof window !== 'undefined',
      firestoreAvailable: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    };
  }
}

// Export singleton instance
export const productionCacheStrategy = ProductionCacheStrategy.getInstance();
