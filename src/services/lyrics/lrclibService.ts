/**
 * Service for interacting with LRCLIB API for synchronized lyrics.
 */

import YAML from 'yaml';
import type { LyricsData, LyricLine, LyricWordTiming } from '@/types/musicAiTypes';

export type LRCLibLyricMode = 'word' | 'line' | 'plain';
export type LRCLibConfidence = 'high' | 'medium' | 'low';

export interface LRCTimestamp {
  time: number;
  text: string;
}

export interface LRCLibMetadata {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  lrclib_id: number;
  instrumental: boolean;
}

export interface LRCLibCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  lyric_mode: LRCLibLyricMode;
  has_synchronized: boolean;
  has_word_synced: boolean;
  synchronized_lyrics?: LRCTimestamp[];
  plain_lyrics?: string;
  synced_lyrics?: string;
  lyricsfile?: string;
  lyrics?: LyricsData;
  score: number;
  confidence: LRCLibConfidence;
  durationDelta?: number;
  matchReason: string;
}

export interface LRCLibSearchInfo {
  query: string;
  cleanedQuery: string;
  parsedArtist?: string;
  parsedTitle?: string;
  duration?: number;
}

export interface LRCLibResponse {
  success: boolean;
  has_synchronized: boolean;
  has_word_synced: boolean;
  lyric_mode?: LRCLibLyricMode;
  synchronized_lyrics?: LRCTimestamp[];
  plain_lyrics?: string;
  synced_lyrics?: string;
  lyricsfile?: string;
  lyrics?: LyricsData;
  metadata: LRCLibMetadata;
  source: string;
  confidence?: LRCLibConfidence;
  durationDelta?: number;
  matchReason?: string;
  candidates?: LRCLibCandidate[];
  search?: LRCLibSearchInfo;
  error?: string;
}

interface RawLRCLibSearchItem {
  id?: number;
  trackName?: string;
  name?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  lyricsfile?: string | null;
}

interface LyricsfileWord {
  text?: string;
  start_ms?: number;
  end_ms?: number;
}

interface LyricsfileLine {
  text?: string;
  start_ms?: number;
  end_ms?: number;
  words?: LyricsfileWord[];
}

const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
const WORD_MODE_WEIGHT = 300;
const LINE_MODE_WEIGHT = 200;
const PLAIN_MODE_WEIGHT = 80;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripVideoNoise(title: string): string {
  return normalizeWhitespace(
    title
      .replace(/\[[^\]]*(official|audio|video|lyrics?|mv|hd|4k|live)[^\]]*\]/gi, ' ')
      .replace(/\([^)]*(official|audio|video|lyrics?|mv|hd|4k|live)[^)]*\)/gi, ' ')
      .replace(/\b(official\s+)?(music\s+)?video\b/gi, ' ')
      .replace(/\blyrics?\b/gi, ' ')
  );
}

function normalizeForCompare(value?: string): string {
  return stripVideoNoise(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function secondsFromMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value / 1000 : undefined;
}

function toFiniteSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function inferLineEnd(
  lines: LyricsfileLine[],
  index: number,
  fallbackDuration?: number
): number {
  const line = lines[index];
  const explicitEnd = secondsFromMs(line.end_ms);
  if (explicitEnd !== undefined) return explicitEnd;

  const nextStart = secondsFromMs(lines[index + 1]?.start_ms);
  if (nextStart !== undefined) return nextStart;

  const start = secondsFromMs(line.start_ms) ?? 0;
  if (fallbackDuration && fallbackDuration > start) return fallbackDuration;
  return start + 3;
}

function buildWordTimings(
  line: LyricsfileLine,
  lineText: string,
  lineStartTime: number,
  lineEndTime: number
): LyricWordTiming[] {
  if (!Array.isArray(line.words) || line.words.length === 0) return [];

  let cursor = 0;
  return line.words
    .map((word, index) => {
      const rawText = typeof word.text === 'string' ? word.text : '';
      const displayText = rawText.trim();
      const rawStart = lineText.indexOf(rawText, cursor);
      const fallbackStart = lineText.indexOf(displayText, cursor);
      const segmentStart = rawStart >= 0 ? rawStart : fallbackStart;
      const startChar = Math.max(0, segmentStart >= 0 ? segmentStart + rawText.search(/\S|$/) : cursor);
      const endChar = Math.max(startChar, startChar + Math.max(displayText.length - 1, 0));
      const startTime = secondsFromMs(word.start_ms) ?? lineStartTime;
      const nextStart = secondsFromMs(line.words?.[index + 1]?.start_ms);
      const endTime = secondsFromMs(word.end_ms) ?? nextStart ?? lineEndTime;

      cursor = segmentStart >= 0 ? segmentStart + rawText.length : endChar + 1;

      if (!displayText) return null;
      return {
        text: displayText,
        startTime: Math.max(lineStartTime, startTime),
        endTime: Math.max(startTime, Math.min(lineEndTime, endTime)),
        startChar: Math.min(startChar, Math.max(lineText.length - 1, 0)),
        endChar: Math.min(endChar, Math.max(lineText.length - 1, 0)),
      };
    })
    .filter((word): word is LyricWordTiming => Boolean(word));
}

export function parseLyricsfileToLyricsData(
  lyricsfile: string,
  duration?: number
): { lyrics: LyricsData; mode: Exclude<LRCLibLyricMode, 'plain'> } | null {
  if (!lyricsfile.trim()) return null;

  try {
    const document = YAML.parse(lyricsfile) as { lines?: LyricsfileLine[]; plain?: string; metadata?: { duration_ms?: number } } | null;
    const lines = Array.isArray(document?.lines) ? document.lines : [];
    if (lines.length === 0) return null;

    const fallbackDuration = duration || secondsFromMs(document?.metadata?.duration_ms);
    const parsedLines = lines
      .map<LyricLine | null>((line, index) => {
        const startTime = secondsFromMs(line.start_ms);
        if (startTime === undefined) return null;

        const endTime = Math.max(startTime, inferLineEnd(lines, index, fallbackDuration));
        const textFromWords = Array.isArray(line.words)
          ? line.words.map((word) => word.text || '').join('').trimEnd()
          : '';
        const text = typeof line.text === 'string' && line.text.trim()
          ? line.text.trim()
          : textFromWords.trim();

        if (!text) return null;

        const wordTimings = buildWordTimings(line, textFromWords || text, startTime, endTime);
        return {
          startTime,
          endTime,
          text,
          chords: [],
          wordTimings: wordTimings.length ? wordTimings : undefined,
        };
      })
      .filter((line): line is LyricLine => Boolean(line))
      .sort((a, b) => a.startTime - b.startTime);

    if (parsedLines.length === 0) return null;

    const hasWords = parsedLines.some((line) => line.wordTimings?.length);
    return {
      lyrics: { lines: parsedLines },
      mode: hasWords ? 'word' : 'line',
    };
  } catch (error) {
    console.warn('Failed to parse LRCLIB lyricsfile:', error);
    return null;
  }
}

/**
 * Parse LRC format lyrics into structured data.
 */
export function parseLRCFormat(lrcContent: string): LRCTimestamp[] {
  if (!lrcContent) return [];

  const lines: LRCTimestamp[] = [];
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/;

  for (const line of lrcContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const match = trimmedLine.match(timestampPattern);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fraction = match[3] || '0';
    const milliseconds = fraction.length === 2 ? parseInt(fraction, 10) * 10 : parseInt(fraction, 10);
    lines.push({
      time: minutes * 60 + seconds + (milliseconds / 1000),
      text: match[4].trim(),
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

function lrcToLyricsData(lines: LRCTimestamp[], duration?: number): LyricsData | undefined {
  if (lines.length === 0) return undefined;

  return {
    lines: lines.map((line, index) => ({
      startTime: line.time,
      endTime: lines[index + 1]?.time ?? duration ?? line.time + 3,
      text: line.text,
      chords: [],
    })),
  };
}

function getModeWeight(mode: LRCLibLyricMode): number {
  if (mode === 'word') return WORD_MODE_WEIGHT;
  if (mode === 'line') return LINE_MODE_WEIGHT;
  return PLAIN_MODE_WEIGHT;
}

function durationScore(candidateDuration: number, expectedDuration?: number): { score: number; delta?: number; confidence: LRCLibConfidence } {
  if (!expectedDuration || !candidateDuration) return { score: 20, confidence: 'medium' };

  const delta = Math.abs(candidateDuration - expectedDuration);
  const looseTolerance = Math.min(10, expectedDuration * 0.05);

  if (delta <= 2) return { score: 80, delta, confidence: 'high' };
  if (delta <= 5) return { score: 55, delta, confidence: 'high' };
  if (delta <= looseTolerance) return { score: 30, delta, confidence: 'medium' };
  return { score: -60, delta, confidence: 'low' };
}

function textMatchScore(candidate: RawLRCLibSearchItem, parsed: ReturnType<typeof parseVideoTitle>, cleanedQuery: string): number {
  const candidateTitle = normalizeForCompare(candidate.trackName || candidate.name);
  const candidateArtist = normalizeForCompare(candidate.artistName);
  const parsedTitle = normalizeForCompare(parsed.title);
  const parsedArtist = normalizeForCompare(parsed.artist);
  const query = normalizeForCompare(cleanedQuery);

  let score = 0;
  if (parsedTitle && candidateTitle === parsedTitle) score += 90;
  else if (parsedTitle && (candidateTitle.includes(parsedTitle) || parsedTitle.includes(candidateTitle))) score += 55;

  if (parsedArtist && candidateArtist === parsedArtist) score += 70;
  else if (parsedArtist && (candidateArtist.includes(parsedArtist) || parsedArtist.includes(candidateArtist))) score += 35;

  if (!parsedTitle && query && candidateTitle && query.includes(candidateTitle)) score += 35;
  if (!parsedArtist && query && candidateArtist && query.includes(candidateArtist)) score += 20;

  return score;
}

export function normalizeLRCLibCandidate(
  item: RawLRCLibSearchItem,
  parsed: ReturnType<typeof parseVideoTitle>,
  cleanedQuery: string,
  expectedDuration?: number
): LRCLibCandidate | null {
  const id = typeof item.id === 'number' ? item.id : 0;
  const trackName = item.trackName || item.name || '';
  const artistName = item.artistName || '';
  const duration = toFiniteSeconds(item.duration) ?? 0;
  const plainLyrics = typeof item.plainLyrics === 'string' && item.plainLyrics.trim() ? item.plainLyrics : undefined;
  const syncedLyrics = typeof item.syncedLyrics === 'string' && item.syncedLyrics.trim() ? item.syncedLyrics : undefined;
  const lyricsfile = typeof item.lyricsfile === 'string' && item.lyricsfile.trim() ? item.lyricsfile : undefined;

  const parsedLyricsfile = lyricsfile ? parseLyricsfileToLyricsData(lyricsfile, duration || expectedDuration) : null;
  const synchronizedLyrics = syncedLyrics ? parseLRCFormat(syncedLyrics) : undefined;
  const lyrics = parsedLyricsfile?.lyrics ?? (synchronizedLyrics ? lrcToLyricsData(synchronizedLyrics, duration || expectedDuration) : undefined);
  const lyricMode: LRCLibLyricMode = parsedLyricsfile?.mode ?? (synchronizedLyrics?.length ? 'line' : 'plain');

  if (!plainLyrics && !syncedLyrics && !lyricsfile && !lyrics?.lines.length) return null;

  const textScore = textMatchScore(item, parsed, cleanedQuery);
  const durationMatch = durationScore(item.duration || 0, expectedDuration);
  const score = getModeWeight(lyricMode) + textScore + durationMatch.score;
  const confidence: LRCLibConfidence = durationMatch.confidence === 'low' && textScore < 120 ? 'low' : (score >= 285 ? 'high' : score >= 190 ? 'medium' : 'low');

  return {
    id,
    trackName,
    artistName,
    albumName: item.albumName || undefined,
    duration: item.duration || 0,
    instrumental: Boolean(item.instrumental),
    lyric_mode: lyricMode,
    has_synchronized: lyricMode === 'word' || lyricMode === 'line',
    has_word_synced: lyricMode === 'word',
    synchronized_lyrics: synchronizedLyrics,
    plain_lyrics: plainLyrics,
    synced_lyrics: syncedLyrics,
    lyricsfile,
    lyrics,
    score,
    confidence,
    durationDelta: durationMatch.delta,
    matchReason: `${lyricMode} sync, ${durationMatch.delta === undefined ? 'duration not compared' : `${durationMatch.delta.toFixed(1)}s duration delta`}`,
  };
}

export function rankLRCLibCandidates(
  items: RawLRCLibSearchItem[],
  parsed: ReturnType<typeof parseVideoTitle>,
  cleanedQuery: string,
  expectedDuration?: number
): LRCLibCandidate[] {
  const byId = new Map<number, LRCLibCandidate>();

  items.forEach((item) => {
    const candidate = normalizeLRCLibCandidate(item, parsed, cleanedQuery, expectedDuration);
    if (!candidate) return;

    const key = candidate.id || Number.MAX_SAFE_INTEGER - byId.size;
    const existing = byId.get(key);
    if (!existing || candidate.score > existing.score) {
      byId.set(key, candidate);
    }
  });

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

async function fetchSearchResults(params: URLSearchParams): Promise<RawLRCLibSearchItem[]> {
  const response = await fetch(`${LRCLIB_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    console.warn(`LRCLIB API returned status ${response.status}`);
    return [];
  }

  const searchResults = await response.json();
  return Array.isArray(searchResults) ? searchResults : [];
}

/**
 * Search for lyrics using LRCLIB API directly.
 */
export async function searchLRCLibLyrics(params: {
  artist?: string;
  title?: string;
  search_query?: string;
  duration?: number;
}): Promise<LRCLibResponse> {
  const originalSearchQuery = params.search_query || `${params.artist || ''} ${params.title || ''}`.trim();
  const cleanedQuery = stripVideoNoise(originalSearchQuery);
  const parsedParams = params.artist && params.title
    ? { artist: params.artist, title: params.title, search_query: originalSearchQuery }
    : parseVideoTitle(cleanedQuery || originalSearchQuery);

  const searches: URLSearchParams[] = [];
  if (parsedParams.artist && parsedParams.title) {
    searches.push(new URLSearchParams({ artist_name: parsedParams.artist, track_name: parsedParams.title }));
    searches.push(new URLSearchParams({ artist_name: parsedParams.title, track_name: parsedParams.artist }));
  }
  if (cleanedQuery || originalSearchQuery) {
    searches.push(new URLSearchParams({ q: cleanedQuery || originalSearchQuery }));
  }

  const rawResults = (await Promise.all(searches.map(fetchSearchResults))).flat();
  let candidates = rankLRCLibCandidates(rawResults, parsedParams, cleanedQuery || originalSearchQuery, params.duration);
  let bestMatch = candidates[0];

  // Try automatic search query refinement if initial search failed
  if (!bestMatch && (cleanedQuery || originalSearchQuery)) {
    const refined = refineSearchQuery(cleanedQuery || originalSearchQuery);
    if (refined && (refined.title || refined.artist)) {
      const refinedSearches: URLSearchParams[] = [];
      const refinedParsedParams = {
        artist: refined.artist,
        title: refined.title,
        search_query: `${refined.artist || ''} ${refined.title || ''}`.trim()
      };

      if (refined.artist && refined.title) {
        refinedSearches.push(new URLSearchParams({ artist_name: refined.artist, track_name: refined.title }));
        refinedSearches.push(new URLSearchParams({ artist_name: refined.title, track_name: refined.artist }));
      }
      const refQuery = `${refined.artist || ''} ${refined.title || ''}`.trim();
      if (refQuery) {
        refinedSearches.push(new URLSearchParams({ q: refQuery }));
      }

      const refinedRawResults = (await Promise.all(refinedSearches.map(fetchSearchResults))).flat();
      const refinedCandidates = rankLRCLibCandidates(
        refinedRawResults,
        refinedParsedParams,
        refQuery,
        params.duration
      );

      if (refinedCandidates.length > 0) {
        candidates = refinedCandidates;
        bestMatch = candidates[0];
      }
    }
  }

  const search: LRCLibSearchInfo = {
    query: originalSearchQuery,
    cleanedQuery: cleanedQuery || originalSearchQuery,
    parsedArtist: parsedParams.artist,
    parsedTitle: parsedParams.title,
    duration: params.duration,
  };

  if (!bestMatch) {
    return {
      success: false,
      has_synchronized: false,
      has_word_synced: false,
      metadata: {
        title: parsedParams.title || '',
        artist: parsedParams.artist || '',
        duration: params.duration || 0,
        lrclib_id: 0,
        instrumental: false,
      },
      source: 'lrclib.net',
      candidates: [],
      search,
      error: 'No lyrics found on LRCLIB',
    };
  }

  return {
    success: true,
    has_synchronized: bestMatch.has_synchronized,
    has_word_synced: bestMatch.has_word_synced,
    lyric_mode: bestMatch.lyric_mode,
    synchronized_lyrics: bestMatch.synchronized_lyrics,
    plain_lyrics: bestMatch.plain_lyrics,
    synced_lyrics: bestMatch.synced_lyrics,
    lyricsfile: bestMatch.lyricsfile,
    lyrics: bestMatch.lyrics,
    metadata: {
      title: bestMatch.trackName,
      artist: bestMatch.artistName,
      album: bestMatch.albumName || '',
      duration: bestMatch.duration,
      lrclib_id: bestMatch.id,
      instrumental: bestMatch.instrumental,
    },
    source: 'lrclib.net',
    confidence: bestMatch.confidence,
    durationDelta: bestMatch.durationDelta,
    matchReason: bestMatch.matchReason,
    candidates,
    search,
  };
}

/**
 * Find the current lyrics line based on playback time.
 */
export function getCurrentLyricsLine(
  synchronizedLyrics: LRCTimestamp[],
  currentTime: number
): {
  currentIndex: number;
  currentLine?: LRCTimestamp;
  nextLine?: LRCTimestamp;
} {
  if (!synchronizedLyrics || synchronizedLyrics.length === 0) {
    return { currentIndex: -1 };
  }

  let currentIndex = -1;
  for (let i = 0; i < synchronizedLyrics.length; i += 1) {
    if (synchronizedLyrics[i].time <= currentTime) {
      currentIndex = i;
    } else {
      break;
    }
  }

  return {
    currentIndex,
    currentLine: currentIndex >= 0 ? synchronizedLyrics[currentIndex] : undefined,
    nextLine: currentIndex + 1 < synchronizedLyrics.length ? synchronizedLyrics[currentIndex + 1] : undefined,
  };
}

/**
 * Parse video title to extract potential artist and song title.
 */
export function parseVideoTitle(videoTitle: string): {
  artist?: string;
  title?: string;
  search_query: string;
} {
  const cleanedTitle = stripVideoNoise(videoTitle);
  const patterns = [
    /^(.+?)\s*[-–—]\s*(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/,
    /^(.+?)\s*:\s*(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/,
    /^(.+?)\s+by\s+(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedTitle.match(pattern);
    if (!match) continue;

    if (pattern.source.includes('by')) {
      return {
        title: normalizeWhitespace(match[1]),
        artist: normalizeWhitespace(match[2]),
        search_query: cleanedTitle,
      };
    }

    return {
      artist: normalizeWhitespace(match[1]),
      title: normalizeWhitespace(match[2]),
      search_query: cleanedTitle,
    };
  }

  return {
    search_query: cleanedTitle || videoTitle,
  };
}

/**
 * Clean up potential noise like parentheses, brackets, and extra spaces in title/artist names.
 */
function cleanArtistOrTitle(text: string): string {
  if (!text) return '';
  return stripVideoNoise(text)
    .replace(/\([^)]*\)/g, ' ') // Remove parentheses and their contents
    .replace(/\[[^\]]*\]/g, ' ') // Remove square brackets and their contents
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Try to refine a search query by extracting titles from quotes ("...", '...')
 * or Chinese song brackets (《...》, 〈...〉, <...>, ［...］) and hyphens/pipes.
 */
export function refineSearchQuery(query: string): { artist?: string; title?: string } | null {
  if (!query) return null;

  // 1. Try parsing Chinese/special song brackets: 《...》, 〈...〉, <...>, ［...］ or quotes: "...", '...', “...”, ‘...’
  const bracketMatch = query.match(/[《〈<［]([^》〉>］]+)[》〉>］]/) || query.match(/["'“‘]([^"'”’]+)["'”’]/);
  
  if (bracketMatch) {
    const title = bracketMatch[1].trim();
    const fullMatchText = bracketMatch[0];

    // Split the query by common separators: dashes, pipes, tildes
    const parts = query.split(/\s*[-–—~|]\s*/);
    
    // Find other parts that do not contain the matched title
    const otherParts = parts
      .filter((part) => !part.includes(fullMatchText))
      .map((part) => cleanArtistOrTitle(part))
      .filter((part) => part.length > 0);

    // If we have other parts, the first non-empty one is likely the artist
    if (otherParts.length > 0) {
      return { artist: otherParts[0], title };
    }

    // Fallback: remove the title part and clean the remainder
    const remainder = query.replace(fullMatchText, ' ');
    const artist = cleanArtistOrTitle(remainder);
    return { artist: artist || undefined, title };
  }

  // 2. Fallback if no brackets/quotes: split by common separators
  const parts = query.split(/\s*[-–—~|]\s*/);
  const cleanedParts = parts
    .map((part) => cleanArtistOrTitle(part))
    .filter((part) => part.length > 0);

  if (cleanedParts.length >= 2) {
    // Return first part as artist, second as title
    return { artist: cleanedParts[0], title: cleanedParts[1] };
  }

  return null;
}
