import { detectKey, formatKeyInfo, extractKeyName } from '@/services/audio/keyDetectionService';
import type { KeyDetectionResult, ChordData } from '@/services/audio/keyDetectionService';

// fetch is already mocked globally in jest.setup.js
const mockFetch = global.fetch as jest.Mock;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('detectKey', () => {
  const sampleChords: ChordData[] = [
    { chord: 'C', time: 0 },
    { chord: 'G', time: 2 },
    { chord: 'Am', time: 4 },
    { chord: 'F', time: 6 },
  ];

  it('sends a POST request to /api/detect-key with chords', async () => {
    const mockResult: KeyDetectionResult = { primaryKey: 'C major', modulation: null };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const result = await detectKey(sampleChords);

    expect(mockFetch).toHaveBeenCalledWith('/api/detect-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chords: sampleChords,
        includeEnharmonicCorrection: false,
        bypassCache: false,
        includeRomanNumerals: false,
      }),
    });
    expect(result).toEqual(mockResult);
  });

  it('passes optional flags correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ primaryKey: 'A minor', modulation: null }),
    });

    await detectKey(sampleChords, true, true, true);

    expect(mockFetch).toHaveBeenCalledWith('/api/detect-key', expect.objectContaining({
      body: JSON.stringify({
        chords: sampleChords,
        includeEnharmonicCorrection: true,
        bypassCache: true,
        includeRomanNumerals: true,
      }),
    }));
  });

  it('throws when HTTP response is not ok', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(detectKey(sampleChords)).rejects.toThrow('Failed to detect musical key');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error detecting key:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('throws when fetch rejects (network error)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(detectKey(sampleChords)).rejects.toThrow('Failed to detect musical key');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error detecting key:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('returns result with modulation data', async () => {
    const mockResult: KeyDetectionResult = {
      primaryKey: 'G major',
      modulation: 'B minor',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const result = await detectKey(sampleChords);
    expect(result.primaryKey).toBe('G major');
    expect(result.modulation).toBe('B minor');
  });
});

describe('formatKeyInfo', () => {
  it('formats a simple key', () => {
    expect(formatKeyInfo({ primaryKey: 'C major', modulation: null })).toBe('Key: C major');
  });

  it('formats key with modulation', () => {
    expect(formatKeyInfo({ primaryKey: 'G major', modulation: 'B minor' })).toBe(
      'Key: G major → B minor',
    );
  });

  it('ignores modulation of "None"', () => {
    expect(formatKeyInfo({ primaryKey: 'A minor', modulation: 'None' })).toBe('Key: A minor');
  });

  it('returns "Key: Unknown" when primaryKey is empty', () => {
    expect(formatKeyInfo({ primaryKey: '', modulation: null })).toBe('Key: Unknown');
  });

  it('returns "Key: Unknown" when primaryKey is "Unknown"', () => {
    expect(formatKeyInfo({ primaryKey: 'Unknown', modulation: null })).toBe('Key: Unknown');
  });
});

describe('extractKeyName', () => {
  it('returns the primary key', () => {
    expect(extractKeyName({ primaryKey: 'D minor', modulation: null })).toBe('D minor');
  });

  it('returns "Unknown" when primaryKey is empty', () => {
    expect(extractKeyName({ primaryKey: '', modulation: null })).toBe('Unknown');
  });

  it('returns "Unknown" when primaryKey is undefined/falsy', () => {
    expect(extractKeyName({ primaryKey: undefined as unknown as string, modulation: null })).toBe(
      'Unknown',
    );
  });
});
