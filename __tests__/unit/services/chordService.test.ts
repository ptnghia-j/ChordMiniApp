/**
 * Unit Tests: chordService
 *
 * Covers local direct multipart requests and explicit production offload helpers.
 */

import {
  recognizeChordsFromOffloadUrl,
  recognizeChordsWithRateLimit,
} from '@/services/chord-analysis/chordService';
import { offloadUploadService } from '@/services/storage/offloadUploadService';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import {
  getChordRecognitionEndpoint,
  getSafeChordModel,
} from '@/utils/modelFiltering';

jest.mock('@/services/storage/offloadUploadService', () => ({
  offloadUploadService: {
    recognizeChordsFromOffloadUrl: jest.fn(),
  },
}));

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: jest.fn(),
}));

jest.mock('@/utils/modelFiltering', () => ({
  getChordRecognitionEndpoint: jest.fn(),
  getSafeChordModel: jest.fn(),
}));

describe('chordService', () => {
  const makeFile = (size = 256, name = 'audio.wav') =>
    new File([new Uint8Array(size)], name, { type: 'audio/wav' });

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    fetchSpy = jest.spyOn(global, 'fetch');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    (getChordRecognitionEndpoint as jest.Mock).mockImplementation((model: string) => `/api/${model}`);
    (getSafeChordModel as jest.Mock).mockImplementation((model: string) => model);
    (createSafeTimeoutSignal as jest.Mock).mockReturnValue(new AbortController().signal);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects invalid audio files before making any requests', async () => {
    await expect(recognizeChordsWithRateLimit({ size: 0 } as File)).rejects.toThrow(
      'Invalid audio file for chord recognition'
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(offloadUploadService.recognizeChordsFromOffloadUrl).not.toHaveBeenCalled();
  });

  it('posts to the selected endpoint and filters invalid chord payloads for local direct flow', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        chords: [
          null,
          { start: 0, end: 0.9, chord: 'C', confidence: 0.9 },
          { start: 1, end: 0.5, chord: 'BadRange' },
          { start: Number.NaN, end: 2, chord: 'BadNaN' },
          { start: 2, end: 3, chord: '' },
          { start: 3, end: 4, chord: 'G' },
        ],
      }),
    } as any);

    const result = await recognizeChordsWithRateLimit(makeFile(), 'btc-sl');

    expect(result).toEqual([
      { start: 0, end: 0.9, time: 0, chord: 'C', confidence: 0.9 },
      { start: 3, end: 4, time: 3, chord: 'G', confidence: 0.8 },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/btc-sl',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    );

    const requestBody = fetchSpy.mock.calls[0][1].body as FormData;
    expect(requestBody.get('file')).toBeInstanceOf(File);
    expect(requestBody.get('detector')).toBe('btc-sl');
    expect(requestBody.get('chord_dict')).toBe('large_voca');
  });

  it('uses the full chord dictionary for the CNN-LSTM model', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        chords: [{ start: 0, end: 1, chord: 'C' }],
      }),
    } as any);

    await recognizeChordsWithRateLimit(makeFile(), 'chord-cnn-lstm');

    const requestBody = fetchSpy.mock.calls[0][1].body as FormData;
    expect(requestBody.get('chord_dict')).toBe('full');
  });

  it('surfaces AirTunes port conflicts on 403 responses', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ server: 'AirTunes/105.1' }),
      json: jest.fn().mockRejectedValue(new Error('bad json')),
      text: jest.fn().mockResolvedValue('Forbidden'),
    } as any);

    await expect(recognizeChordsWithRateLimit(makeFile())).rejects.toThrow(/Port conflict/);
  });

  it('returns chords from an existing offload URL', async () => {
    (offloadUploadService.recognizeChordsFromOffloadUrl as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        chords: [{ start: 0, end: 1, chord: 'Am', confidence: 0.93 }],
      },
    });

    const result = await recognizeChordsFromOffloadUrl('https://firebasestorage.googleapis.com/audio.wav');

    expect(result).toEqual([{ start: 0, end: 1, chord: 'Am', confidence: 0.93 }]);
    expect(offloadUploadService.recognizeChordsFromOffloadUrl).toHaveBeenCalledWith(
      'https://firebasestorage.googleapis.com/audio.wav',
      'chord-cnn-lstm',
      { deleteAfterProcessing: true }
    );
  });

  it('throws when offload chord payload is malformed', async () => {
    (offloadUploadService.recognizeChordsFromOffloadUrl as jest.Mock).mockResolvedValue({
      success: true,
      data: { chords: null },
    });

    await expect(
      recognizeChordsFromOffloadUrl('https://firebasestorage.googleapis.com/audio.wav')
    ).rejects.toThrow('Invalid chord recognition response: missing or invalid chords array');
  });
});