/**
 * MusicBrainz service – client-side helper that calls our own API route.
 */

export interface SongMetadata {
  releaseDate?: string;
  albumName?: string;
  label?: string;
  genres?: string[];
}

/**
 * Fetch song metadata (release date, album, label, genres) from MusicBrainz
 * via the `/api/musicbrainz` proxy route.
 *
 * @param videoTitle – raw YouTube / file title (e.g. "Ed Sheeran - Shape of You")
 */
export async function fetchSongMetadata(
  videoTitle: string,
  signal?: AbortSignal,
): Promise<SongMetadata | null> {
  try {
    const res = await fetch(
      `/api/musicbrainz?title=${encodeURIComponent(videoTitle)}`,
      { signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.metadata ?? null;
  } catch {
    return null;
  }
}
