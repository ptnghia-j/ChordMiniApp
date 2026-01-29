/**
 * Service for interacting with LRClib API for synchronized lyrics
 */

export interface LRCTimestamp {
  time: number; // Time in seconds
  text: string; // Lyrics text for this timestamp
}

export interface LRCLibMetadata {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  lrclib_id: number;
  instrumental: boolean;
}

export interface LRCLibResponse {
  success: boolean;
  has_synchronized: boolean;
  synchronized_lyrics?: LRCTimestamp[];
  plain_lyrics?: string;
  metadata: LRCLibMetadata;
  source: string;
  error?: string;
}

/**
 * Search for synchronized lyrics using LRClib API directly
 */
export async function searchLRCLibLyrics(params: {
  artist?: string;
  title?: string;
  search_query?: string;
}): Promise<LRCLibResponse> {
  const searchUrl = 'https://lrclib.net/api/search';
  const originalSearchQuery = params.search_query || '';

  // Helper function to perform the actual API call and process results
  const performSearch = async (urlParams: URLSearchParams): Promise<LRCLibResponse | null> => {
    try {
      const response = await fetch(`${searchUrl}?${urlParams.toString()}`);

      if (!response.ok) {
        console.warn(`LRClib API returned status ${response.status}`);
        return null;
      }

      const searchResults = await response.json();

      if (!searchResults || searchResults.length === 0) {
        return null;
      }

      // Get the best match (first result)
      const bestMatch = searchResults[0];

      // Check if synchronized lyrics are available
      const syncedLyrics = bestMatch.syncedLyrics;
      const plainLyrics = bestMatch.plainLyrics;

      if (!syncedLyrics && !plainLyrics) {
        return null;
      }

      // Parse synchronized lyrics if available
      const parsedLyrics = syncedLyrics ? parseLRCFormat(syncedLyrics) : null;

      return {
        success: true,
        has_synchronized: !!syncedLyrics,
        synchronized_lyrics: parsedLyrics || undefined,
        plain_lyrics: plainLyrics,
        metadata: {
          title: bestMatch.trackName || '',
          artist: bestMatch.artistName || '',
          album: bestMatch.albumName || '',
          duration: bestMatch.duration || 0,
          lrclib_id: bestMatch.id,
          instrumental: bestMatch.instrumental || false,
        },
        source: 'lrclib.net',
      };
    } catch (error) {
      console.warn('LRClib search attempt failed:', error);
      return null;
    }
  };

  try {
    // Parse search query to extract artist and title if not provided
    const parsedParams = params.artist && params.title
      ? { artist: params.artist, title: params.title, search_query: originalSearchQuery }
      : parseVideoTitle(originalSearchQuery);

    // Strategy 1: Try specific artist_name/track_name search if we have parsed values
    if (parsedParams.artist && parsedParams.title) {
      console.log('🔍 LRClib: Trying specific search with artist:', parsedParams.artist, 'title:', parsedParams.title);

      const specificParams = new URLSearchParams();
      specificParams.append('artist_name', parsedParams.artist);
      specificParams.append('track_name', parsedParams.title);

      const result = await performSearch(specificParams);
      if (result) {
        console.log('✅ LRClib: Found lyrics with specific search');
        return result;
      }

      // Strategy 2: Try with swapped artist/title (handles "Song - Artist" format)
      console.log('🔄 LRClib: Trying swapped search with artist:', parsedParams.title, 'title:', parsedParams.artist);

      const swappedParams = new URLSearchParams();
      swappedParams.append('artist_name', parsedParams.title);
      swappedParams.append('track_name', parsedParams.artist);

      const swappedResult = await performSearch(swappedParams);
      if (swappedResult) {
        console.log('✅ LRClib: Found lyrics with swapped artist/title search');
        return swappedResult;
      }
    }

    // Strategy 3: Fallback to general 'q' search parameter with original query
    if (originalSearchQuery) {
      console.log('🔍 LRClib: Falling back to general q search:', originalSearchQuery);

      const generalParams = new URLSearchParams();
      generalParams.append('q', originalSearchQuery);

      const generalResult = await performSearch(generalParams);
      if (generalResult) {
        console.log('✅ LRClib: Found lyrics with general search');
        return generalResult;
      }
    }

    // All strategies failed
    throw new Error('No synchronized lyrics found on LRClib');
  } catch (error) {
    console.error('Error fetching LRClib lyrics:', error);
    throw error;
  }
}

/**
 * Find the current lyrics line based on playback time
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

  // Find the last line that has started (time <= currentTime)
  let currentIndex = -1;
  for (let i = 0; i < synchronizedLyrics.length; i++) {
    if (synchronizedLyrics[i].time <= currentTime) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const currentLine = currentIndex >= 0 ? synchronizedLyrics[currentIndex] : undefined;
  const nextLine = currentIndex + 1 < synchronizedLyrics.length ? synchronizedLyrics[currentIndex + 1] : undefined;

  return {
    currentIndex,
    currentLine,
    nextLine,
  };
}

/**
 * Parse LRC format lyrics into structured data
 */
function parseLRCFormat(lrcContent: string): LRCTimestamp[] {
  if (!lrcContent) {
    return [];
  }

  const lines: LRCTimestamp[] = [];
  // Regex to match LRC timestamp format [mm:ss.xx] or [mm:ss]
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;

  for (const line of lrcContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const match = trimmedLine.match(timestampPattern);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3] || '0', 10);

      // Convert to total seconds
      const totalSeconds = minutes * 60 + seconds + (milliseconds / 1000);

      // Get lyrics text
      const lyricsText = match[4].trim();

      lines.push({
        time: totalSeconds,
        text: lyricsText,
      });
    }
  }

  // Sort by time to ensure proper order
  lines.sort((a, b) => a.time - b.time);

  return lines;
}

/**
 * Parse video title to extract potential artist and song title
 */
export function parseVideoTitle(videoTitle: string): {
  artist?: string;
  title?: string;
  search_query: string;
} {
  // Common patterns in YouTube video titles
  const patterns = [
    /^(.+?)\s*[-–—]\s*(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/,  // "Artist - Song"
    /^(.+?)\s*:\s*(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/,      // "Artist: Song"
    /^(.+?)\s*by\s+(.+?)(?:\s*\(.*\))?(?:\s*\[.*\])?$/i,    // "Song by Artist"
  ];

  for (const pattern of patterns) {
    const match = videoTitle.match(pattern);
    if (match) {
      if (pattern.source.includes('by')) {
        // "Song by Artist" pattern
        return {
          title: match[1].trim(),
          artist: match[2].trim(),
          search_query: videoTitle,
        };
      } else {
        // "Artist - Song" or "Artist: Song" patterns
        return {
          artist: match[1].trim(),
          title: match[2].trim(),
          search_query: videoTitle,
        };
      }
    }
  }

  // If no pattern matches, use the whole title as search query
  return {
    search_query: videoTitle,
  };
}
