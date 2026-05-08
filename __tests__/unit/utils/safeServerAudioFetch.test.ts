jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'node:dns/promises';

import { safeFetchAudioSource } from '@/utils/safeServerAudioFetch';

describe('safeServerAudioFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('follows redirects only after validating the redirect target', async () => {
    (lookup as jest.Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const redirectResponse = {
      status: 302,
      headers: {
        get: jest.fn((name: string) =>
          name.toLowerCase() === 'location' ? 'https://dl.quicktube.app/audio.mp3' : null
        ),
      },
    } as unknown as Response;

    const finalResponse = {
      status: 200,
      headers: {
        get: jest.fn(() => null),
      },
    } as unknown as Response;

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(finalResponse);

    const response = await safeFetchAudioSource('https://quicktube.app/dl/[abc]', {
      method: 'HEAD',
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://quicktube.app/dl/[abc]',
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://dl.quicktube.app/audio.mp3',
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
      })
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(response).toBe(finalResponse);
  });

  it('rejects redirect targets that resolve to private IP space', async () => {
    (lookup as jest.Mock)
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }]);

    (global.fetch as jest.Mock).mockResolvedValue({
      status: 302,
      headers: {
        get: jest.fn((name: string) =>
          name.toLowerCase() === 'location'
            ? 'https://storage.googleapis.com/chordmini/audio.mp3'
            : null
        ),
      },
    });

    await expect(
      safeFetchAudioSource('https://quicktube.app/dl/[abc]', {
        method: 'GET',
      })
    ).rejects.toThrow('URL resolves to a disallowed IP address');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
