import { promises as fs } from 'fs';
import path from 'path';
import { convertToPrivacyEnhancedUrl } from '@/utils/youtubeUtils';

// Check if we're in a serverless environment (Vercel)
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Define the cache directory (only used in non-serverless environments)
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_INDEX_PATH = path.join(CACHE_DIR, 'cache_index.json');

// In-memory cache for serverless environments
let memoryCache: CacheEntry[] = [];

// Define the cache entry type
export interface CacheEntry {
  videoId: string;
  audioUrl: string;
  videoUrl?: string | null;
  youtubeEmbedUrl: string;
  title?: string;
  processedAt: number; // timestamp
  fileSize?: number;
  streamExpiresAt?: number; // For YouTube stream URLs
  isStreamUrl?: boolean; // Flag to indicate if audioUrl is a YouTube stream URL
}

// Initialize the cache
export async function initCache() {
  if (isServerless) {
    // In serverless environments, use memory cache
    console.log('Using in-memory cache for serverless environment');
    return;
  }

  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // Check if cache index exists, if not create it
    try {
      await fs.access(CACHE_INDEX_PATH);
    } catch {
      // Create empty cache index
      await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Failed to initialize cache:', error);
  }
}

// Get cache index
export async function getCacheIndex(): Promise<CacheEntry[]> {
  if (isServerless) {
    // In serverless environments, return memory cache
    return memoryCache.map((entry: CacheEntry) => {
      if (entry.youtubeEmbedUrl && entry.youtubeEmbedUrl.includes('youtube.com')) {
        entry.youtubeEmbedUrl = convertToPrivacyEnhancedUrl(entry.youtubeEmbedUrl);
      }
      return entry;
    });
  }

  try {
    const data = await fs.readFile(CACHE_INDEX_PATH, 'utf-8');
    const cacheIndex = JSON.parse(data);

    // Convert any YouTube URLs to privacy-enhanced mode
    return cacheIndex.map((entry: CacheEntry) => {
      if (entry.youtubeEmbedUrl && entry.youtubeEmbedUrl.includes('youtube.com')) {
        entry.youtubeEmbedUrl = convertToPrivacyEnhancedUrl(entry.youtubeEmbedUrl);
      }
      return entry;
    });
  } catch (error) {
    console.error('Failed to read cache index:', error);
    return [];
  }
}

// Check if a video is in the cache
export async function isVideoInCache(videoId: string): Promise<CacheEntry | null> {
  const cacheIndex = await getCacheIndex();
  const entry = cacheIndex.find(entry => entry.videoId === videoId);

  if (!entry) return null;

  // For YouTube stream URLs, check if they're expired
  if (entry.isStreamUrl && entry.streamExpiresAt) {
    if (Date.now() > entry.streamExpiresAt) {
      console.log(`YouTube stream URL expired for ${videoId}, removing from cache`);
      await removeCacheEntry(videoId);
      return null;
    }
    return entry;
  }

  // For local files, verify that the files actually exist
  if (!entry.isStreamUrl) {
    const audioPath = path.join(process.cwd(), 'public', entry.audioUrl);
    try {
      await fs.access(audioPath);
      return entry;
    } catch {
      // File doesn't exist, remove from cache
      await removeCacheEntry(videoId);
      return null;
    }
  }

  return entry;
}

// Add a video to the cache
export async function addToCache(entry: CacheEntry): Promise<void> {
  if (isServerless) {
    // In serverless environments, use memory cache
    const existingIndex = memoryCache.findIndex(e => e.videoId === entry.videoId);
    if (existingIndex !== -1) {
      memoryCache.splice(existingIndex, 1);
    }

    // Ensure YouTube embed URL uses privacy-enhanced mode
    if (entry.youtubeEmbedUrl && entry.youtubeEmbedUrl.includes('youtube.com')) {
      entry.youtubeEmbedUrl = convertToPrivacyEnhancedUrl(entry.youtubeEmbedUrl);
    }

    memoryCache.push(entry);

    // Limit memory cache size to prevent memory issues
    if (memoryCache.length > 50) {
      memoryCache = memoryCache.slice(-50);
    }
    return;
  }

  const cacheIndex = await getCacheIndex();

  // Remove existing entry if it exists
  const existingIndex = cacheIndex.findIndex(e => e.videoId === entry.videoId);
  if (existingIndex !== -1) {
    cacheIndex.splice(existingIndex, 1);
  }

  // Calculate file sizes if not provided (only for local files)
  if (!entry.fileSize && entry.audioUrl && !entry.isStreamUrl) {
    try {
      const audioPath = path.join(process.cwd(), 'public', entry.audioUrl);
      const stats = await fs.stat(audioPath);
      entry.fileSize = stats.size;
    } catch (error) {
      console.error(`Failed to get file size for ${entry.audioUrl}:`, error);
    }
  }

  // Ensure YouTube embed URL uses privacy-enhanced mode
  if (entry.youtubeEmbedUrl && entry.youtubeEmbedUrl.includes('youtube.com')) {
    entry.youtubeEmbedUrl = convertToPrivacyEnhancedUrl(entry.youtubeEmbedUrl);
  }

  // Add new entry
  cacheIndex.push(entry);

  // Save updated index
  await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify(cacheIndex, null, 2));
}

// Remove a video from the cache
export async function removeCacheEntry(videoId: string): Promise<void> {
  if (isServerless) {
    // In serverless environments, use memory cache
    memoryCache = memoryCache.filter(entry => entry.videoId !== videoId);
    return;
  }

  const cacheIndex = await getCacheIndex();
  const updatedIndex = cacheIndex.filter(entry => entry.videoId !== videoId);
  await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify(updatedIndex, null, 2));
}

// Clean old cache entries (older than maxAge in days)
export async function cleanCache(maxAge: number = 30): Promise<void> {
  const cacheIndex = await getCacheIndex();
  const now = Date.now();
  const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

  const updatedIndex = cacheIndex.filter(entry => {
    const age = now - entry.processedAt;
    return age < maxAgeMs;
  });

  await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify(updatedIndex, null, 2));
}
