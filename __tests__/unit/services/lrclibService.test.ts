import {
  parseLyricsfileToLyricsData,
  parseLRCFormat,
  rankLRCLibCandidates,
  parseVideoTitle,
} from '@/services/lyrics/lrclibService';

describe('lrclibService', () => {
  const parsed = parseVideoTitle('Test Artist - Test Song');

  it('parses lyricsfile word-level timings', () => {
    const result = parseLyricsfileToLyricsData(`
version: "1.0"
metadata:
  title: Test Song
  artist: Test Artist
  instrumental: false
  duration_ms: 10000
lines:
  - text: Hello world
    start_ms: 1000
    end_ms: 3000
    words:
      - text: "Hello "
        start_ms: 1000
      - text: "world"
        start_ms: 2000
`, 10);

    expect(result?.mode).toBe('word');
    expect(result?.lyrics.lines[0]).toMatchObject({
      text: 'Hello world',
      startTime: 1,
      endTime: 3,
    });
    expect(result?.lyrics.lines[0].wordTimings).toEqual([
      { text: 'Hello', startTime: 1, endTime: 2, startChar: 0, endChar: 4 },
      { text: 'world', startTime: 2, endTime: 3, startChar: 6, endChar: 10 },
    ]);
  });

  it('parses lyricsfile line sync when words are empty', () => {
    const result = parseLyricsfileToLyricsData(`
version: "1.0"
metadata:
  title: Test Song
  artist: Test Artist
  instrumental: false
lines:
  - text: First line
    start_ms: 1000
    words: []
  - text: Second line
    start_ms: 4000
    words: []
`, 8);

    expect(result?.mode).toBe('line');
    expect(result?.lyrics.lines[0]).toMatchObject({
      text: 'First line',
      startTime: 1,
      endTime: 4,
    });
  });

  it('parses normal LRC timestamps', () => {
    expect(parseLRCFormat('[00:01.50] First\n[00:04.000] Second')).toEqual([
      { time: 1.5, text: 'First' },
      { time: 4, text: 'Second' },
    ]);
  });

  it('returns null for malformed lyricsfile', () => {
    expect(parseLyricsfileToLyricsData('not: [valid', 10)).toBeNull();
  });

  it('ranks word sync above line and plain when match quality is acceptable', () => {
    const candidates = rankLRCLibCandidates([
      {
        id: 1,
        trackName: 'Test Song',
        artistName: 'Test Artist',
        duration: 181,
        plainLyrics: 'Plain only',
      },
      {
        id: 2,
        trackName: 'Test Song',
        artistName: 'Test Artist',
        duration: 182,
        syncedLyrics: '[00:01.00] Line',
        plainLyrics: 'Line',
      },
      {
        id: 3,
        trackName: 'Test Song',
        artistName: 'Test Artist',
        duration: 183,
        lyricsfile: `
version: "1.0"
metadata:
  title: Test Song
  artist: Test Artist
lines:
  - text: Word line
    start_ms: 1000
    end_ms: 2000
    words:
      - text: Word
        start_ms: 1000
`,
      },
    ], parsed, 'Test Artist - Test Song', 181);

    expect(candidates[0].id).toBe(3);
    expect(candidates[0].lyric_mode).toBe('word');
  });

  it('keeps small duration drift high confidence and large mismatches low confidence', () => {
    const candidates = rankLRCLibCandidates([
      {
        id: 1,
        trackName: 'Test Song',
        artistName: 'Test Artist',
        duration: 182,
        syncedLyrics: '[00:01.00] Line',
      },
      {
        id: 2,
        trackName: 'Test Song',
        artistName: 'Different Artist',
        duration: 240,
        syncedLyrics: '[00:01.00] Wrong version',
      },
    ], parsed, 'Test Artist - Test Song', 180);

    expect(candidates[0].id).toBe(1);
    expect(candidates[0].confidence).toBe('high');
    expect(candidates.find((candidate) => candidate.id === 2)?.confidence).toBe('low');
  });
});
