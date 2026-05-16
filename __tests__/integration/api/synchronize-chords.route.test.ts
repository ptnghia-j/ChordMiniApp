/**
 * Integration Tests: synchronize-chords API route
 *
 * Covers request validation, beat format conversion, and successful
 * synchronization responses for the Next.js route handler.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { POST } from '@/app/api/synchronize-chords/route';

describe('POST /api/synchronize-chords', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeRequest = (body: unknown) =>
    ({
      json: async () => body,
    }) as any;

  it('returns 400 for missing chord or beat arrays', async () => {
    const missingChords = await POST(makeRequest({ beats: [0, 1] }));
    expect(missingChords.status).toBe(400);
    await expect(missingChords.json()).resolves.toMatchObject({
      success: false,
      error: 'Chords array is required',
    });

    const missingBeats = await POST(makeRequest({ chords: [] }));
    expect(missingBeats.status).toBe(400);
    await expect(missingBeats.json()).resolves.toMatchObject({
      success: false,
      error: 'Beats array is required',
    });
  });

  it('returns 400 for empty arrays and malformed chord timing', async () => {
    const emptyResponse = await POST(makeRequest({ chords: [], beats: [] }));
    expect(emptyResponse.status).toBe(400);
    await expect(emptyResponse.json()).resolves.toMatchObject({
      success: false,
      error: 'Chords array cannot be empty',
    });

    const invalidChord = await POST(
      makeRequest({
        chords: [{ chord: 'C', start: '0', end: 1 }],
        beats: [0, 1],
      })
    );
    expect(invalidChord.status).toBe(400);
    await expect(invalidChord.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid chord timing at index 0: start and end must be numbers',
    });
  });

  it('returns 400 for invalid beat timing values', async () => {
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'C', start: 0, end: 1, time: 0, confidence: 0.9 }],
        beats: [{ time: -1, strength: 0.8, beatNum: 1 }],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid beat timing at index 0: -1',
    });
  });

  it('returns 500 when a beat entry cannot be converted into BeatInfo', async () => {
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'C', start: 0, end: 1, time: 0, confidence: 0.9 }],
        beats: [{ strength: 0.8, beatNum: 1 }],
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid beat format at index 0'),
    });
  });

  it('synchronizes chords successfully and converts numeric beats to BeatInfo', async () => {
    const response = await POST(
      makeRequest({
        chords: [
          { chord: 'C', start: 0.1, end: 0.9, time: 0.1, confidence: 0.9 },
          { chord: 'N', start: 2.6, end: 3.2, time: 2.6, confidence: 0.7 },
        ],
        beats: [0, 1, 2, 3],
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      synchronizedChords: [
        { chord: 'C', beatIndex: 0 },
        { chord: 'C', beatIndex: 1 },
        { chord: 'C', beatIndex: 2 },
        { chord: 'N/C', beatIndex: 3 },
      ],
      summary: {
        inputChords: 2,
        inputBeats: 4,
        outputSynchronizedChords: 4,
      },
    });
  });
});
