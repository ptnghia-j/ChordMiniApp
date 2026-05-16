const mockGetDocs = jest.fn();
const mockStartAfter = jest.fn((cursor) => ({ type: 'startAfter', cursor }));

jest.mock('@/config/firebase', () => ({
  db: { app: 'firestore' },
  ensureFirebaseInitialized: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, name) => ({ db, name })),
  query: jest.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: jest.fn((field, direction) => ({ type: 'orderBy', field, direction })),
  limit: jest.fn((count) => ({ type: 'limit', count })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  startAfter: (...args: unknown[]) => mockStartAfter(...args),
  where: jest.fn((field, op, value) => ({ type: 'where', field, op, value })),
}));

import {
  ALL_KEYS_VALUE,
  createInitialRecentVideosPageParam,
  fetchRecentVideosPage,
  mapTranscriptionDocToRecentVideo,
  transcriptionMatchesSelectedKey,
} from '@/services/query/recentVideos';

const makeDoc = (data: Record<string, unknown>) => ({
  data: () => data,
});

const makeSnapshot = (docs: Array<ReturnType<typeof makeDoc>>) => ({
  docs,
  size: docs.length,
  forEach: (callback: (doc: ReturnType<typeof makeDoc>) => void) => docs.forEach(callback),
});

const baseDoc = {
  videoId: 'video-1',
  title: 'Song One',
  channelTitle: 'Channel',
  thumbnail: 'https://img.example/thumb.jpg',
  createdAt: { seconds: 100 },
  audioDuration: 185,
  beatModel: 'madmom',
  chordModel: 'btc-sl',
  bpm: 120,
  timeSignature: 4,
  keySignature: 'C major',
  beats: [{ time: 0 }],
  chords: [{ chord: 'C' }],
};

describe('recent videos query fetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps valid Firestore transcription docs into homepage video cards', () => {
    expect(mapTranscriptionDocToRecentVideo(baseDoc)).toEqual(expect.objectContaining({
      videoId: 'video-1',
      title: 'Song One',
      processedAt: 100_000,
      duration: 185,
      keySignature: 'C major',
    }));
  });

  it('filters documents by selected key using searchable keys or derived keys', () => {
    expect(transcriptionMatchesSelectedKey({ ...baseDoc, searchableKeys: ['c major'] }, 'C major')).toBe(true);
    expect(transcriptionMatchesSelectedKey({ ...baseDoc, searchableKeys: ['g minor'] }, 'C major')).toBe(false);
    expect(transcriptionMatchesSelectedKey({ ...baseDoc, searchableKeys: undefined, keySignature: 'A minor' }, 'A minor')).toBe(true);
  });

  it('fetches the primary recent videos page', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([makeDoc(baseDoc)]));

    const result = await fetchRecentVideosPage({
      selectedKey: ALL_KEYS_VALUE,
      pageParam: createInitialRecentVideosPageParam(),
    });

    expect(result.queryMode).toBe('primary');
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('video-1');
    expect(result.hasMore).toBe(false);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy scanning when the first primary page is empty', async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([makeDoc({ ...baseDoc, videoId: 'legacy-1' })]));

    const result = await fetchRecentVideosPage({
      selectedKey: ALL_KEYS_VALUE,
      pageParam: createInitialRecentVideosPageParam(),
    });

    expect(result.queryMode).toBe('legacy');
    expect(result.videos).toEqual([expect.objectContaining({ videoId: 'legacy-1' })]);
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  it('uses the supplied cursor for subsequent pages', async () => {
    const cursor = makeDoc(baseDoc) as never;
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([makeDoc({ ...baseDoc, videoId: 'video-2' })]));

    await fetchRecentVideosPage({
      selectedKey: ALL_KEYS_VALUE,
      pageParam: {
        cursor,
        mode: 'primary',
        existingVideoIds: ['video-1'],
      },
    });

    expect(mockStartAfter).toHaveBeenCalledWith(cursor);
  });
});
