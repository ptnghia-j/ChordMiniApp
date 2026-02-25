import { NextRequest, NextResponse } from 'next/server';
import { parseVideoTitle } from '@/services/lyrics/lrclibService';

/* ------------------------------------------------------------------ */
/*  MusicBrainz constants                                              */
/* ------------------------------------------------------------------ */

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT =
  'ChordMiniApp/1.0 (https://github.com/ptnghia-j/ChordMiniApp)';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mbFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
}

/** Strip common YouTube noise from a title before searching. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(
      /\b(official|video|audio|lyrics|lyric|hd|hq|4k|music\s*video|mv|visualizer|live|remix|cover|karaoke|instrumental)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/*  MusicBrainz API wrappers                                           */
/* ------------------------------------------------------------------ */

interface MBTag {
  name: string;
  count: number;
}

interface MBRelease {
  id: string;
  title: string;
  date?: string;
  'release-group'?: { id: string; title: string; 'primary-type'?: string };
}

interface MBRecording {
  id: string;
  title: string;
  'first-release-date'?: string;
  releases?: MBRelease[];
  tags?: MBTag[];
}

async function searchRecording(
  artist: string,
  title: string,
): Promise<MBRecording | null> {
  const q = encodeURIComponent(
    `recording:"${title}" AND artist:"${artist}"`,
  );
  const res = await mbFetch(
    `${MB_BASE}/recording?query=${q}&limit=3&fmt=json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.recordings?.[0] ?? null;
}

async function searchRecordingGeneral(
  query: string,
): Promise<MBRecording | null> {
  const q = encodeURIComponent(query);
  const res = await mbFetch(
    `${MB_BASE}/recording?query=${q}&limit=3&fmt=json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.recordings?.[0] ?? null;
}

interface MBReleaseDetail {
  'label-info'?: { label?: { name: string } }[];
  genres?: MBTag[];
}

async function lookupRelease(
  releaseId: string,
): Promise<MBReleaseDetail | null> {
  const res = await mbFetch(
    `${MB_BASE}/release/${releaseId}?inc=labels+genres&fmt=json`,
  );
  if (!res.ok) return null;
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Route handler (GET /api/musicbrainz?title=...)                     */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const rawTitle = new URL(request.url).searchParams.get('title');
    if (!rawTitle) {
      return NextResponse.json(
        { error: 'title query parameter is required' },
        { status: 400 },
      );
    }

    /* ---------- 1. Parse title into artist / title ---------- */

    const cleaned = cleanTitle(rawTitle);
    const parsed = parseVideoTitle(cleaned);

    /* ---------- 2. Search MusicBrainz (max 2 search calls) ---------- */

    let recording: MBRecording | null = null;

    if (parsed.artist && parsed.title) {
      // Try the parsed order first
      recording = await searchRecording(parsed.artist, parsed.title);

      if (!recording) {
        // Respect rate limit then try swapped order
        await delay(1100);
        recording = await searchRecording(parsed.title, parsed.artist);
      }
    } else {
      // No clear separator – do a general search with cleaned query
      recording = await searchRecordingGeneral(cleaned);
    }

    if (!recording) {
      return NextResponse.json({ metadata: null });
    }

    /* ---------- 3. Build metadata from recording ---------- */

    const metadata: Record<string, unknown> = {};

    if (recording['first-release-date']) {
      metadata.releaseDate = recording['first-release-date'];
    }

    const release = recording.releases?.[0];
    if (release?.title) {
      metadata.albumName = release.title;
    }

    // Recording-level tags (fallback for genres)
    const recordingTags = recording.tags
      ?.filter((t) => t.count > 0)
      ?.sort((a, b) => b.count - a.count)
      ?.map((t) => t.name)
      ?.slice(0, 5);

    /* ---------- 4. Release lookup for label + genres ---------- */

    if (release?.id) {
      await delay(1100);
      const detail = await lookupRelease(release.id);

      if (detail) {
        const label = detail['label-info']?.[0]?.label?.name;
        if (label) metadata.label = label;

        const genres = detail.genres
          ?.filter((g) => g.count > 0)
          ?.sort((a, b) => b.count - a.count)
          ?.map((g) => g.name)
          ?.slice(0, 5);

        metadata.genres =
          genres?.length ? genres : recordingTags?.length ? recordingTags : undefined;
      } else if (recordingTags?.length) {
        metadata.genres = recordingTags;
      }
    } else if (recordingTags?.length) {
      metadata.genres = recordingTags;
    }

    // Drop undefined values
    for (const key of Object.keys(metadata)) {
      if (metadata[key] === undefined) delete metadata[key];
    }

    return NextResponse.json({
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (error) {
    console.error('MusicBrainz API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metadata from MusicBrainz' },
      { status: 500 },
    );
  }
}
