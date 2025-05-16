import { promises as fs } from 'fs';
import path from 'path';

// Define the cache directory
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_INDEX_PATH = path.join(CACHE_DIR, 'cache_index.json');

// Define the cache entry type
export interface CacheEntry {
  videoId: string;
  audioUrl: string;
  videoUrl?: string | null;
  youtubeEmbedUrl: string;
  title?: string;
  processedAt: number; // timestamp
  fileSize?: number;
}

// Initialize the cache
export async function initCache() {
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
  try {
    const data = await fs.readFile(CACHE_INDEX_PATH, 'utf-8');
    return JSON.parse(data);
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

  // Verify that the files actually exist
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

// Add a video to the cache
export async function addToCache(entry: CacheEntry): Promise<void> {
  const cacheIndex = await getCacheIndex();

  // Remove existing entry if it exists
  const existingIndex = cacheIndex.findIndex(e => e.videoId === entry.videoId);
  if (existingIndex !== -1) {
    cacheIndex.splice(existingIndex, 1);
  }

  // Calculate file sizes if not provided
  if (!entry.fileSize && entry.audioUrl) {
    try {
      const audioPath = path.join(process.cwd(), 'public', entry.audioUrl);
      const stats = await fs.stat(audioPath);
      entry.fileSize = stats.size;
    } catch (error) {
      console.error(`Failed to get file size for ${entry.audioUrl}:`, error);
    }
  }

  // Add new entry
  cacheIndex.push(entry);

  // Save updated index
  await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify(cacheIndex, null, 2));
}

// Remove a video from the cache
export async function removeCacheEntry(videoId: string): Promise<void> {
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
