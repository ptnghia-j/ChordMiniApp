jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: jest.fn(() => 'mock-signal'),
}));

jest.mock('@/utils/safeServerAudioFetch', () => ({
  safeFetchAudioSource: jest.fn(),
}));

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { safeFetchAudioSource } from '@/utils/safeServerAudioFetch';
import { RETRY_STRATEGIES, retryAudioDownload, retryFetch } from '@/utils/retryUtils';

const createResponse = ({
  ok = true,
  status = 200,
  statusText = 'OK',
  contentLength = '4',
  buffer = new Uint8Array([1, 2, 3, 4]).buffer,
} = {}) =>
  ({
    ok,
    status,
    statusText,
    headers: {
      get: jest.fn((name: string) => (name.toLowerCase() === 'content-length' ? contentLength : null)),
    },
    arrayBuffer: jest.fn().mockResolvedValue(buffer),
  }) as unknown as Response;

describe('retryUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns the first successful response and validates the URL', async () => {
    const response = createResponse();
    const onRetry = jest.fn();
    const onSuccess = jest.fn();
    (safeFetchAudioSource as jest.Mock).mockResolvedValue(response);

    const result = await retryFetch('https://example.com/audio.mp3', { onRetry, onSuccess });

    expect(createSafeTimeoutSignal).toHaveBeenCalledWith(120000);
    expect(safeFetchAudioSource).toHaveBeenCalledWith(
      'https://example.com/audio.mp3',
      expect.objectContaining({
        headers: RETRY_STRATEGIES[0].headers,
        signal: 'mock-signal',
      })
    );
    expect(onRetry).toHaveBeenCalledWith(1, RETRY_STRATEGIES[0]);
    expect(onSuccess).toHaveBeenCalledWith(1, RETRY_STRATEGIES[0], response);
    expect(result).toMatchObject({
      success: true,
      attempt: 1,
      strategy: RETRY_STRATEGIES[0],
      response,
      allErrors: [],
    });
    expect(result.buffer?.byteLength).toBe(4);
  });

  it('retries with later strategies and returns the final failure state', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onRetry = jest.fn();

    (safeFetchAudioSource as jest.Mock)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(createResponse({ contentLength: '0' }))
      .mockResolvedValueOnce(createResponse({ buffer: new ArrayBuffer(0) }));

    const promise = retryFetch('https://example.com/fail.mp3', {
      maxAttempts: 3,
      onRetry,
    });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(onRetry).toHaveBeenNthCalledWith(1, 1, RETRY_STRATEGIES[0]);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, RETRY_STRATEGIES[1]);
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, RETRY_STRATEGIES[2]);
    expect(safeFetchAudioSource).toHaveBeenNthCalledWith(
      2,
      'https://example.com/fail.mp3',
      expect.objectContaining({ headers: RETRY_STRATEGIES[1].headers })
    );
    expect(result.success).toBe(false);
    expect(result.attempt).toBe(3);
    expect(result.strategy).toBe(RETRY_STRATEGIES[2]);
    expect(result.error?.message).toContain('Empty response body');
    expect(result.allErrors.map((error) => error.message)).toEqual([
      'network',
      'Response indicates empty content (Content-Length: 0)',
      'Empty response body (0 bytes)',
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('uses retryAudioDownload wrappers and URL cache-busting strategy', async () => {
    jest.useFakeTimers();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onSuccess = jest.fn();

    (safeFetchAudioSource as jest.Mock)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockRejectedValueOnce(new Error('third failure'))
      .mockRejectedValueOnce(new Error('fourth failure'))
      .mockResolvedValueOnce(createResponse());

    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const promise = retryAudioDownload('https://example.com/audio.mp3?x=1', { onSuccess });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(4000);

    const result = await promise;

    expect(safeFetchAudioSource).toHaveBeenLastCalledWith(
      expect.stringContaining('https://example.com/audio.mp3?x=1&cb=1700000000000&v='),
      expect.objectContaining({ headers: RETRY_STRATEGIES[4].headers })
    );
    expect(result.success).toBe(true);
    expect(result.attempt).toBe(5);
    expect(result.strategy).toBe(RETRY_STRATEGIES[4]);
    expect(onSuccess).toHaveBeenCalledWith(5, RETRY_STRATEGIES[4], expect.any(Object));
    expect(logSpy).toHaveBeenCalledWith(
      '🔄 Starting audio download with retry strategies for: https://example.com/audio.mp3?x=1'
    );
    expect(errorSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    mathRandomSpy.mockRestore();
  });
});
