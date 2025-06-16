import fs from 'fs/promises';
import path from 'path';

/**
 * Local File-Based Caching Service for Development
 * 
 * This service provides caching functionality using local files
 * when Firebase/Firestore is not available or configured.
 */

export interface LocalCacheEntry {
  videoId: string;
  audioUrl: string;
  title?: string;
  duration?: number;
  fileSize: number;
  createdAt: string;
  filePath: string;
}

export class LocalCacheService {
  private static instance: LocalCacheService;
  private cacheDir: string;
  private metadataFile: string;
  private cache: Map<string, LocalCacheEntry> = new Map();

  private constructor() {
    this.cacheDir = path.join(process.cwd(), 'temp');
    this.metadataFile = path.join(this.cacheDir, 'cache-metadata.json');
  }

  public static getInstance(): LocalCacheService {
    if (!LocalCacheService.instance) {
      LocalCacheService.instance = new LocalCacheService();
    }
    return LocalCacheService.instance;
  }

  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Load existing metadata
      await this.loadMetadata();

      console.log(`Local cache initialized with ${this.cache.size} entries`);
    } catch (error) {
      console.warn('Failed to initialize local cache:', error);
    }
  }

  /**
   * Load metadata from file
   */
  private async loadMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf-8');
      const entries: LocalCacheEntry[] = JSON.parse(data);
      
      // Validate entries and check if files still exist
      for (const entry of entries) {
        try {
          await fs.access(entry.filePath);
          this.cache.set(entry.videoId, entry);
        } catch {
          console.log(`Cache entry for ${entry.videoId} removed (file not found)`);
        }
      }
    } catch {
      // No metadata file exists yet, start fresh
      console.log('No existing cache metadata found, starting fresh');
    }
  }

  /**
   * Save metadata to file
   */
  private async saveMetadata(): Promise<void> {
    try {
      const entries = Array.from(this.cache.values());
      await fs.writeFile(this.metadataFile, JSON.stringify(entries, null, 2));
    } catch (error) {
      console.warn('Failed to save cache metadata:', error);
    }
  }

  /**
   * Get cached audio file
   */
  async getCachedAudio(videoId: string): Promise<LocalCacheEntry | null> {
    await this.initialize();

    const entry = this.cache.get(videoId);
    if (!entry) {
      return null;
    }

    // Check if file still exists
    try {
      await fs.access(entry.filePath);
      console.log(`Cache hit for ${videoId}: ${entry.filePath}`);
      return entry;
    } catch {
      // File was deleted, remove from cache
      this.cache.delete(videoId);
      await this.saveMetadata();
      console.log(`Cache entry for ${videoId} removed (file deleted)`);
      return null;
    }
  }

  /**
   * Add audio file to cache
   */
  async addToCache(
    videoId: string,
    audioUrl: string,
    filePath: string,
    metadata: {
      title?: string;
      duration?: number;
      fileSize: number;
    }
  ): Promise<void> {
    await this.initialize();

    const entry: LocalCacheEntry = {
      videoId,
      audioUrl,
      title: metadata.title,
      duration: metadata.duration,
      fileSize: metadata.fileSize,
      createdAt: new Date().toISOString(),
      filePath
    };

    this.cache.set(videoId, entry);
    await this.saveMetadata();

    console.log(`Added ${videoId} to local cache: ${filePath}`);
  }

  /**
   * Remove from cache
   */
  async removeFromCache(videoId: string): Promise<void> {
    await this.initialize();

    const entry = this.cache.get(videoId);
    if (entry) {
      // Try to delete the file
      try {
        await fs.unlink(entry.filePath);
      } catch {
        // File might already be deleted
      }

      this.cache.delete(videoId);
      await this.saveMetadata();

      console.log(`Removed ${videoId} from local cache`);
    }
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    await this.initialize();

    // Delete all cached files
    for (const entry of this.cache.values()) {
      try {
        await fs.unlink(entry.filePath);
      } catch {
        // Ignore errors
      }
    }

    this.cache.clear();
    await this.saveMetadata();

    console.log('Local cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    await this.initialize();

    let totalSize = 0;
    let oldestDate = new Date();
    let newestDate = new Date(0);
    let oldestEntry = '';
    let newestEntry = '';

    for (const entry of this.cache.values()) {
      totalSize += entry.fileSize;
      
      const entryDate = new Date(entry.createdAt);
      if (entryDate < oldestDate) {
        oldestDate = entryDate;
        oldestEntry = entry.videoId;
      }
      if (entryDate > newestDate) {
        newestDate = entryDate;
        newestEntry = entry.videoId;
      }
    }

    return {
      totalEntries: this.cache.size,
      totalSize,
      oldestEntry: oldestEntry || undefined,
      newestEntry: newestEntry || undefined
    };
  }

  /**
   * Clean up old entries (older than 7 days)
   */
  async cleanupOldEntries(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    await this.initialize();

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [videoId, entry] of this.cache.entries()) {
      const entryAge = now - new Date(entry.createdAt).getTime();
      if (entryAge > maxAgeMs) {
        toRemove.push(videoId);
      }
    }

    for (const videoId of toRemove) {
      await this.removeFromCache(videoId);
    }

    console.log(`Cleaned up ${toRemove.length} old cache entries`);
    return toRemove.length;
  }
}

export const localCacheService = LocalCacheService.getInstance();
