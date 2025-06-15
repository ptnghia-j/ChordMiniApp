import { promises as fs } from 'fs';
import path from 'path';

// Define the cache directory
const CACHE_DIR = path.join(process.cwd(), 'cache');
const SEARCH_CACHE_PATH = path.join(CACHE_DIR, 'search_cache.json');

// Define search result types
export interface SearchResult {
  id: string;
  title: string;
  url?: string;
  description?: string;
  thumbnail?: string;
  duration?: string;
  [key: string]: unknown; // Allow additional properties
}

// Define the search cache entry type
export interface SearchCacheEntry {
  query: string;
  results: SearchResult[];
  timestamp: number;
  expiresAt: number;
}

// Initialize cache directory and file if they don't exist
export async function initSearchCache(): Promise<void> {
  try {
    // Create cache directory if it doesn't exist
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch {
      // Ignore if directory already exists
    }

    // Create search cache file if it doesn't exist
    try {
      await fs.access(SEARCH_CACHE_PATH);
    } catch {
      // File doesn't exist, create it with an empty array
      await fs.writeFile(SEARCH_CACHE_PATH, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Failed to initialize search cache:', error);
  }
}

// Get all cached search entries
export async function getSearchCache(): Promise<SearchCacheEntry[]> {
  try {
    await initSearchCache();
    const data = await fs.readFile(SEARCH_CACHE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read search cache:', error);
    return [];
  }
}

// Check if a query is in the cache and not expired
export async function getCachedSearch(query: string): Promise<SearchCacheEntry | null> {
  const normalizedQuery = query.trim().toLowerCase();
  const cache = await getSearchCache();
  
  // Find the entry with the exact query
  const entry = cache.find(entry => entry.query.toLowerCase() === normalizedQuery);
  
  if (!entry) return null;
  
  // Check if the entry is expired
  const now = Date.now();
  if (entry.expiresAt && entry.expiresAt < now) {
    // Entry is expired, remove it from cache
    await removeFromSearchCache(query);
    return null;
  }
  
  return entry;
}

// Add a search result to the cache
export async function addToSearchCache(
  query: string,
  results: SearchResult[],
  ttlHours: number = 24
): Promise<void> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !results || results.length === 0) return;
  
  const cache = await getSearchCache();
  
  // Remove existing entry if it exists
  const existingIndex = cache.findIndex(e => e.query.toLowerCase() === normalizedQuery.toLowerCase());
  if (existingIndex !== -1) {
    cache.splice(existingIndex, 1);
  }
  
  // Calculate expiration time
  const now = Date.now();
  const expiresAt = now + (ttlHours * 60 * 60 * 1000);
  
  // Add new entry
  const newEntry: SearchCacheEntry = {
    query: normalizedQuery,
    results,
    timestamp: now,
    expiresAt
  };
  
  cache.push(newEntry);
  
  // Limit cache size to 100 entries, removing oldest first
  if (cache.length > 100) {
    cache.sort((a, b) => b.timestamp - a.timestamp);
    cache.splice(100);
  }
  
  // Save updated cache
  await fs.writeFile(SEARCH_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// Remove a search from the cache
export async function removeFromSearchCache(query: string): Promise<void> {
  const normalizedQuery = query.trim().toLowerCase();
  const cache = await getSearchCache();
  const updatedCache = cache.filter(entry => entry.query.toLowerCase() !== normalizedQuery);
  await fs.writeFile(SEARCH_CACHE_PATH, JSON.stringify(updatedCache, null, 2));
}

// Clean expired entries from the cache
export async function cleanExpiredSearchCache(): Promise<void> {
  const cache = await getSearchCache();
  const now = Date.now();
  const updatedCache = cache.filter(entry => !entry.expiresAt || entry.expiresAt > now);
  
  if (updatedCache.length !== cache.length) {
    await fs.writeFile(SEARCH_CACHE_PATH, JSON.stringify(updatedCache, null, 2));
    console.log(`Cleaned ${cache.length - updatedCache.length} expired search cache entries`);
  }
}
