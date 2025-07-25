/**
 * Enhanced lyrics service with LRClib-Genius fallback system
 * Handles service availability and seamless switching between providers
 */

import { searchLRCLibLyrics, parseVideoTitle } from './lrclibService';
import { apiService } from './apiService';

interface GeniusApiResponse {
  lyrics?: string;
  song_info?: {
    title?: string;
    artist?: string;
    url?: string;
    id?: number;
    thumbnail?: string;
  };
  source?: string;
}

export interface LyricsServiceResponse {
  success: boolean;
  has_synchronized: boolean;
  synchronized_lyrics?: Array<{ time: number; text: string }>;
  plain_lyrics?: string;
  metadata: {
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    source: 'lrclib' | 'genius' | 'fallback';
    genius_url?: string;
    genius_id?: number;
    thumbnail_url?: string;
  };
  source: string;
  error?: string;
  fallback_used?: boolean;
}

export interface LyricsSearchParams {
  artist?: string;
  title?: string;
  search_query?: string;
  prefer_synchronized?: boolean;
}

/**
 * Service availability checker with timeout
 */
async function checkServiceAvailability(url: string, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn(`Service availability check failed for ${url}:`, error);
    return false;
  }
}

/**
 * Enhanced lyrics search with intelligent fallback
 */
export async function searchLyricsWithFallback(params: LyricsSearchParams): Promise<LyricsServiceResponse> {
  const { artist, title, search_query, prefer_synchronized = true } = params;
  
  // Parse search parameters
  const parsedParams = artist && title 
    ? { artist, title }
    : parseVideoTitle(search_query || '');

  console.log('🎵 Starting lyrics search with fallback system...');
  console.log('📋 Search params:', { parsedParams, prefer_synchronized });

  // Strategy 1: Try LRClib first if synchronized lyrics are preferred
  if (prefer_synchronized) {
    try {
      console.log('🔄 Attempting LRClib search...');
      
      // Quick availability check for LRClib
      const lrclibAvailable = await checkServiceAvailability('https://lrclib.net/api/search', 3000);
      
      if (lrclibAvailable) {
        const lrclibResponse = await searchLRCLibLyrics(parsedParams);
        
        if (lrclibResponse.success) {
          console.log('✅ LRClib search successful');
          return {
            success: true,
            has_synchronized: lrclibResponse.has_synchronized,
            synchronized_lyrics: lrclibResponse.synchronized_lyrics,
            plain_lyrics: lrclibResponse.plain_lyrics,
            metadata: {
              title: lrclibResponse.metadata.title,
              artist: lrclibResponse.metadata.artist,
              album: lrclibResponse.metadata.album,
              duration: lrclibResponse.metadata.duration,
              source: 'lrclib'
            },
            source: 'lrclib.net'
          };
        }
      } else {
        console.warn('⚠️ LRClib service appears to be unavailable');
        console.log('🔍 LRClib availability check failed, proceeding to Genius fallback');
      }
    } catch (error) {
      console.warn('⚠️ LRClib search failed:', error);
    }
  }

  // Strategy 2: Fallback to Genius API
  try {
    console.log('🔄 Falling back to Genius API...');
    
    const searchQuery = search_query || `${parsedParams.artist} ${parsedParams.title}`;
    const geniusResponse = await apiService.getGeniusLyrics(
      parsedParams.artist || '',
      parsedParams.title || '',
      searchQuery
    );

    if (geniusResponse.success && geniusResponse.data) {
      console.log('✅ Genius API fallback successful');
      console.log('🔍 Genius response data:', geniusResponse.data);

      const geniusData = geniusResponse.data as GeniusApiResponse;
      return {
        success: true,
        has_synchronized: false, // Genius doesn't provide synchronized lyrics
        plain_lyrics: geniusData.lyrics || '',
        metadata: {
          title: geniusData.song_info?.title || parsedParams.title || '',
          artist: geniusData.song_info?.artist || parsedParams.artist || '',
          source: 'genius',
          genius_url: geniusData.song_info?.url,
          genius_id: geniusData.song_info?.id,
          thumbnail_url: geniusData.song_info?.thumbnail
        },
        source: geniusData.source || 'genius_api',
        fallback_used: true
      };
    }
  } catch (error) {
    console.error('❌ Genius API fallback failed:', error);
    console.error('🔍 Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      searchParams: { parsedParams, search_query }
    });
  }

  // Strategy 3: Return failure with helpful message
  console.error('❌ All lyrics services failed');
  return {
    success: false,
    has_synchronized: false,
    metadata: {
      title: parsedParams.title || '',
      artist: parsedParams.artist || '',
      source: 'fallback'
    },
    source: 'none',
    error: 'All lyrics services are currently unavailable. Please try again later.',
    fallback_used: true
  };
}

/**
 * Service health check for monitoring
 */
export async function checkLyricsServicesHealth(): Promise<{
  lrclib: boolean;
  genius: boolean;
  overall: boolean;
}> {
  const [lrclibHealth, geniusHealth] = await Promise.allSettled([
    checkServiceAvailability('https://lrclib.net/api/search', 5000),
    // For Genius, we'll assume it's available if our API endpoint responds
    fetch('/api/genius-lyrics', { method: 'OPTIONS' }).then(r => r.ok).catch(() => false)
  ]);

  const lrclib = lrclibHealth.status === 'fulfilled' ? lrclibHealth.value : false;
  const genius = geniusHealth.status === 'fulfilled' ? geniusHealth.value : false;

  return {
    lrclib,
    genius,
    overall: lrclib || genius
  };
}
