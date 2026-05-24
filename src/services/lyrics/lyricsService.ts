/**
 * LRCLIB-only lyrics service.
 */

import {
  searchLRCLibLyrics,
  parseVideoTitle,
  type LRCLibCandidate,
  type LRCLibConfidence,
  type LRCLibLyricMode,
} from './lrclibService';
import type { LyricsData } from '@/types/musicAiTypes';

export interface LyricsServiceResponse {
  success: boolean;
  has_synchronized: boolean;
  has_word_synced: boolean;
  lyric_mode?: LRCLibLyricMode;
  lyrics?: LyricsData;
  synchronized_lyrics?: Array<{ time: number; text: string }>;
  plain_lyrics?: string;
  synced_lyrics?: string;
  lyricsfile?: string;
  metadata: {
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    source: 'lrclib' | 'fallback';
    lrclib_id?: number;
  };
  source: string;
  confidence?: LRCLibConfidence;
  durationDelta?: number;
  matchReason?: string;
  candidates?: LRCLibCandidate[];
  search?: {
    query: string;
    cleanedQuery: string;
    parsedArtist?: string;
    parsedTitle?: string;
    duration?: number;
  };
  error?: string;
}

export interface LyricsSearchParams {
  artist?: string;
  title?: string;
  search_query?: string;
  duration?: number;
  prefer_synchronized?: boolean;
}

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

export async function searchLyricsWithFallback(params: LyricsSearchParams): Promise<LyricsServiceResponse> {
  const { artist, title, search_query, duration } = params;
  const parsedParams = artist && title
    ? { artist, title }
    : parseVideoTitle(search_query || '');

  try {
    const lrclibResponse = await searchLRCLibLyrics({
      ...parsedParams,
      search_query: search_query || `${parsedParams.artist || ''} ${parsedParams.title || ''}`.trim(),
      duration,
    });

    if (!lrclibResponse.success) {
      return {
        success: false,
        has_synchronized: false,
        has_word_synced: false,
        metadata: {
          title: parsedParams.title || '',
          artist: parsedParams.artist || '',
          duration,
          source: 'fallback',
        },
        source: 'none',
        candidates: lrclibResponse.candidates,
        search: lrclibResponse.search,
        error: lrclibResponse.error || 'No lyrics found on LRCLIB.',
      };
    }

    return {
      success: true,
      has_synchronized: lrclibResponse.has_synchronized,
      has_word_synced: lrclibResponse.has_word_synced,
      lyric_mode: lrclibResponse.lyric_mode,
      lyrics: lrclibResponse.lyrics,
      synchronized_lyrics: lrclibResponse.synchronized_lyrics,
      plain_lyrics: lrclibResponse.plain_lyrics,
      synced_lyrics: lrclibResponse.synced_lyrics,
      lyricsfile: lrclibResponse.lyricsfile,
      metadata: {
        title: lrclibResponse.metadata.title,
        artist: lrclibResponse.metadata.artist,
        album: lrclibResponse.metadata.album,
        duration: lrclibResponse.metadata.duration,
        source: 'lrclib',
        lrclib_id: lrclibResponse.metadata.lrclib_id,
      },
      source: 'lrclib.net',
      confidence: lrclibResponse.confidence,
      durationDelta: lrclibResponse.durationDelta,
      matchReason: lrclibResponse.matchReason,
      candidates: lrclibResponse.candidates,
      search: lrclibResponse.search,
    };
  } catch (error) {
    console.warn('LRCLIB lyrics search failed:', error);
    return {
      success: false,
      has_synchronized: false,
      has_word_synced: false,
      metadata: {
        title: parsedParams.title || '',
        artist: parsedParams.artist || '',
        duration,
        source: 'fallback',
      },
      source: 'none',
      error: 'LRCLIB is currently unavailable. Please try again later.',
    };
  }
}

export async function checkLyricsServicesHealth(): Promise<{
  lrclib: boolean;
  overall: boolean;
}> {
  const lrclib = await checkServiceAvailability('https://lrclib.net/api/search', 5000);
  return {
    lrclib,
    overall: lrclib,
  };
}
