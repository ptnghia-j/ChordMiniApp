import musicAiService from '@/services/lyrics/musicAiService';

describe('musicAiService result processing behavior', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('normalizes direct line payloads while preserving word timings for later chord placement', async () => {
    const result = await musicAiService.processLyricsResult({
      lines: [
        {
          text: ' Hello world ',
          startTime: 1,
          endTime: 3,
          wordTimings: [
            { text: 'Hello', startTime: 1, endTime: 2, startChar: 0, endChar: 4 },
            { text: 'world', startTime: 2, endTime: 3, startChar: 6, endChar: 10 },
          ],
        },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.lines).toEqual([
      {
        startTime: 1,
        endTime: 3,
        text: 'Hello world',
        wordTimings: [
          { text: 'Hello', startTime: 1, endTime: 2, startChar: 0, endChar: 4 },
          { text: 'world', startTime: 2, endTime: 3, startChar: 6, endChar: 10 },
        ],
      },
    ]);
  });

  it('builds lyric lines from word timestamps and line breaks', async () => {
    const result = await musicAiService.processLyricsResult({
      transcript: 'First line\nSecond line',
      wordTimestamps: [
        { text: 'First', startTime: 0, endTime: 0.5 },
        { text: 'line', startTime: 0.5, endTime: 1 },
        { text: '\nSecond', startTime: 2, endTime: 2.5 },
        { text: 'line', startTime: 2.5, endTime: 3 },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.lines.map((line) => line.text)).toEqual(['First line', 'Second line']);
    expect(result.lines[1].startTime).toBe(2);
  });

  it('fetches URL-backed lyrics payloads and reports fetch failures as user-facing errors', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          lines: [{ text: 'Remote line', start: 4, end: 5 }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

    await expect(musicAiService.processLyricsResult({ lyrics: 'https://cdn.example/lyrics.json' }))
      .resolves.toEqual({ lines: [{ startTime: 4, endTime: 5, text: 'Remote line' }] });

    const failed = await musicAiService.processLyricsResult({ lyrics: 'https://cdn.example/missing.json' });
    expect(failed.lines).toEqual([]);
    expect(failed.error).toContain('Failed to fetch lyrics data');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('places chords on the nearest timed word without fabricating chords for empty input', async () => {
    const synchronized = await musicAiService.synchronizeLyricsWithChords({
      lines: [{
        startTime: 10,
        endTime: 14,
        text: 'Hold me close',
        wordTimings: [
          { text: 'Hold', startTime: 10, endTime: 11, startChar: 0, endChar: 3 },
          { text: 'me', startTime: 11, endTime: 12, startChar: 5, endChar: 6 },
          { text: 'close', startTime: 12, endTime: 14, startChar: 8, endChar: 12 },
        ],
      }],
    }, [
      { time: 10.5, chord: 'C' },
      { time: 13.5, chord: 'G' },
      { time: 15, chord: 'F' },
    ]);

    expect(synchronized.lines[0].chords).toEqual([
      { time: 10.5, chord: 'C', position: 2 },
      { time: 13.5, chord: 'G', position: 11 },
    ]);

    await expect(musicAiService.synchronizeLyricsWithChords({ lines: [] }, [{ time: 0, chord: 'C' }]))
      .resolves.toMatchObject({ lines: [], error: 'No lyrics available' });
  });
});
