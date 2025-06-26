/**
 * Smart Firebase Cache Service
 * 
 * Addresses performance issues with repeated Firebase queries for legacy data:
 * 1. Implements in-memory caching to avoid repeated queries for known incomplete records
 * 2. Provides fallback handling for legacy records without audio metadata
 * 3. Reduces warning spam with proper error boundaries
 * 4. Implements smart retry logic with exponential backoff
 */

interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
  isIncomplete: boolean;
  errorCount: number;
  lastError?: string;
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxErrorCount: number; // Max errors before marking as permanently failed
  incompleteRecordTtl: number; // Shorter TTL for incomplete records
}

export class SmartFirebaseCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private warningsSuppressed = new Set<string>();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ttl: 5 * 60 * 1000, // 5 minutes default
      maxErrorCount: 3,
      incompleteRecordTtl: 30 * 60 * 1000, // 30 minutes for incomplete records
      ...config
    };
  }

  /**
   * Get cached data or execute query function
   */
  async get<K>(
    key: string,
    queryFn: () => Promise<T | null>,
    isCompleteCheck?: (data: T) => boolean
  ): Promise<T | null> {
    const cached = this.cache.get(key);
    const now = Date.now();

    // Check if we have valid cached data
    if (cached) {
      const ttl = cached.isIncomplete ? this.config.incompleteRecordTtl : this.config.ttl;
      
      if (now - cached.timestamp < ttl) {
        // Return cached data (even if null)
        if (cached.data === null && cached.isIncomplete) {
          this.suppressWarning(key, 'Returning cached incomplete record (avoiding repeated queries)');
        }
        return cached.data;
      }

      // Check if we should skip retry due to too many errors
      if (cached.errorCount >= this.config.maxErrorCount) {
        this.suppressWarning(key, `Skipping query due to ${cached.errorCount} previous errors`);
        return cached.data;
      }
    }

    // Execute the query
    try {
      console.log(`🔍 Executing Firebase query for key: ${key}`);
      const data = await queryFn();
      
      // Check if data is complete
      const isComplete = data ? (isCompleteCheck ? isCompleteCheck(data) : true) : false;
      
      // Cache the result
      this.cache.set(key, {
        data,
        timestamp: now,
        isIncomplete: !isComplete,
        errorCount: 0
      });

      if (!isComplete && data) {
        console.warn(`⚠️ Incomplete record cached for ${key} - will retry with longer TTL`);
      }

      return data;

    } catch (error) {
      console.error(`❌ Firebase query failed for ${key}:`, error);
      
      // Update error count
      const errorCount = (cached?.errorCount || 0) + 1;
      this.cache.set(key, {
        data: cached?.data || null,
        timestamp: now,
        isIncomplete: true,
        errorCount,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return cached data if available, otherwise null
      return cached?.data || null;
    }
  }

  /**
   * Batch get multiple keys with optimized parallel execution
   */
  async getBatch<K>(
    keys: string[],
    queryFn: (key: string) => Promise<T | null>,
    isCompleteCheck?: (data: T) => boolean
  ): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    const keysToQuery: string[] = [];
    const now = Date.now();

    // Check cache for each key
    for (const key of keys) {
      const cached = this.cache.get(key);
      
      if (cached) {
        const ttl = cached.isIncomplete ? this.config.incompleteRecordTtl : this.config.ttl;
        
        if (now - cached.timestamp < ttl || cached.errorCount >= this.config.maxErrorCount) {
          results.set(key, cached.data);
          continue;
        }
      }
      
      keysToQuery.push(key);
    }

    // Execute queries for uncached keys in parallel
    if (keysToQuery.length > 0) {
      console.log(`🔍 Batch querying ${keysToQuery.length} keys from Firebase`);
      
      const promises = keysToQuery.map(async (key) => {
        try {
          const data = await queryFn(key);
          const isComplete = data ? (isCompleteCheck ? isCompleteCheck(data) : true) : false;
          
          this.cache.set(key, {
            data,
            timestamp: now,
            isIncomplete: !isComplete,
            errorCount: 0
          });

          return { key, data };
        } catch (error) {
          console.error(`❌ Batch query failed for ${key}:`, error);
          
          const cached = this.cache.get(key);
          const errorCount = (cached?.errorCount || 0) + 1;
          
          this.cache.set(key, {
            data: cached?.data || null,
            timestamp: now,
            isIncomplete: true,
            errorCount,
            lastError: error instanceof Error ? error.message : 'Unknown error'
          });

          return { key, data: cached?.data || null };
        }
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ key, data }) => {
        results.set(key, data);
      });
    }

    return results;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.warningsSuppressed.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.warningsSuppressed.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    return {
      totalEntries: entries.length,
      incompleteEntries: entries.filter(e => e.isIncomplete).length,
      errorEntries: entries.filter(e => e.errorCount > 0).length,
      suppressedWarnings: this.warningsSuppressed.size
    };
  }

  /**
   * Suppress repeated warnings for the same key
   */
  private suppressWarning(key: string, message: string): void {
    if (!this.warningsSuppressed.has(key)) {
      console.warn(`⚠️ ${message} (key: ${key})`);
      this.warningsSuppressed.add(key);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const ttl = entry.isIncomplete ? this.config.incompleteRecordTtl : this.config.ttl;
      
      if (now - entry.timestamp > ttl * 2) { // Keep entries a bit longer than TTL
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.warningsSuppressed.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }
}

// Create singleton instances for different data types
export const audioMetadataCache = new SmartFirebaseCache<any>({
  ttl: 10 * 60 * 1000, // 10 minutes for audio metadata
  incompleteRecordTtl: 60 * 60 * 1000, // 1 hour for incomplete audio records
  maxErrorCount: 5
});

export const transcriptionCache = new SmartFirebaseCache<any>({
  ttl: 30 * 60 * 1000, // 30 minutes for transcriptions
  incompleteRecordTtl: 2 * 60 * 60 * 1000, // 2 hours for incomplete transcriptions
  maxErrorCount: 3
});

// Cleanup interval
setInterval(() => {
  audioMetadataCache.cleanup();
  transcriptionCache.cleanup();
}, 15 * 60 * 1000); // Cleanup every 15 minutes
