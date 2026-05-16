jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: jest.fn(() => 'mock-signal'),
}));

import {
  isDirectUrl,
  isFirebaseStorageUrl,
  parseAndValidateAudioSourceUrl,
  validateFirebaseStorageUrl,
  validateUrlAccessibility,
  waitForUrlAccessibility,
} from '@/utils/urlValidationUtils';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

describe('urlValidationUtils', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('identifies Firebase Storage URLs and direct URLs', () => {
    expect(isFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/x')).toBe(true);
    expect(isFirebaseStorageUrl('https://storage.googleapis.com/bucket/file.mp3')).toBe(true);
    expect(isFirebaseStorageUrl('https://firebasestorage.googleapis.com.evil.test/file.mp3')).toBe(false);
    expect(isFirebaseStorageUrl('https://example.com/file.mp3')).toBe(false);

    expect(isDirectUrl('https://example.com/file.mp3')).toBe(true);
    expect(isDirectUrl('https://firebasestorage.googleapis.com/v0/b/x')).toBe(false);
  });

  it('accepts approved audio hosts and rejects hostname suffix tricks', () => {
    expect(parseAndValidateAudioSourceUrl('https://quicktube.app/dl/[abc]').hostname).toBe('quicktube.app');
    expect(() => parseAndValidateAudioSourceUrl('https://quicktube.app.evil.test/dl/[abc]')).toThrow('URL domain not allowed');
    expect(() => parseAndValidateAudioSourceUrl('https://evilquicktube.app/dl/[abc]')).toThrow('URL domain not allowed');
  });

  it('accepts the private configured yt-mp3-go host without a hardcoded public endpoint', () => {
    process.env.YT_MP3_GO_BASE_URL = 'https://yt-private.example.com/';

    expect(parseAndValidateAudioSourceUrl('https://yt-private.example.com/yt-downloader/downloads/job/audio.mp3').hostname)
      .toBe('yt-private.example.com');
  });

  it('rejects unsafe protocols, credentials, and unexpected ports', () => {
    expect(() => parseAndValidateAudioSourceUrl('http://quicktube.app/audio.mp3')).toThrow('Only HTTPS URLs are allowed');
    expect(() => parseAndValidateAudioSourceUrl('https://user:pass@quicktube.app/audio.mp3')).toThrow('URL credentials are not allowed');
    expect(() => parseAndValidateAudioSourceUrl('https://quicktube.app:8443/audio.mp3')).toThrow('URL port not allowed');
  });

  it('returns accessibility metadata for successful HEAD requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const result = await validateUrlAccessibility('https://example.com/audio.mp3', 1234, 1);

    expect(createSafeTimeoutSignal).toHaveBeenCalledWith(1234);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/audio.mp3',
      expect.objectContaining({
        method: 'HEAD',
        signal: 'mock-signal',
      })
    );
    expect(result).toMatchObject({
      isAccessible: true,
      statusCode: 200,
    });
  });

  it('retries and returns the final HTTP failure details', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    jest.useFakeTimers();
    const promise = validateUrlAccessibility('https://example.com/audio.mp3', 1000, 2);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      isAccessible: false,
      statusCode: 404,
      error: '404 Not Found',
    });
  });

  it('returns the final thrown error after exhausting retries', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('still down'));

    jest.useFakeTimers();
    const promise = validateUrlAccessibility('https://example.com/audio.mp3', 1000, 2);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toMatchObject({
      isAccessible: false,
      error: 'still down',
    });
  });

  it('uses the Firebase-specific defaults while delegating to the same validator', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const result = await validateFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/x');

    expect(createSafeTimeoutSignal).toHaveBeenCalledWith(15000);
    expect(result.isAccessible).toBe(true);
  });

  it('polls until a URL becomes accessible', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    jest.useFakeTimers();
    const promise = waitForUrlAccessibility('https://example.com/audio.mp3', 4000, 1000);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      isAccessible: true,
      statusCode: 200,
    });
  });
});
