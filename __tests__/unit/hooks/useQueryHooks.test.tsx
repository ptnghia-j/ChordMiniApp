import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useModelInfoQuery } from '@/hooks/query/useModelInfoQuery';
import { useCachedLyricsQuery } from '@/hooks/query/useCachedLyricsQuery';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

const mockFetch = global.fetch as jest.Mock;

describe('query hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('deduplicates concurrent model-info consumers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        beat_model_info: {
          madmom: { name: 'Madmom' },
        },
        chord_model_info: {
          'btc-sl': { name: 'BTC SL' },
        },
      }),
    });

    const { result } = renderHook(() => ({
      first: useModelInfoQuery(),
      second: useModelInfoQuery(),
    }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.first.isSuccess).toBe(true));
    expect(result.current.second.isSuccess).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/model-info', { method: 'GET' });
  });

  it('returns cached lyrics data from the cache-only lyrics query', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        lyrics: {
          lines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
        },
      }),
    });

    const { result } = renderHook(() => useCachedLyricsQuery({
      videoId: 'video-1',
      audioUrl: 'https://cdn.example/audio.mp3',
      enabled: true,
    }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      lines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/transcribe-lyrics', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        videoId: 'video-1',
        audioPath: 'https://cdn.example/audio.mp3',
        forceRefresh: false,
        checkCacheOnly: true,
      }),
    }));
  });

  it('returns null when no cached lyrics are available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, lyrics: null }),
    });

    const { result } = renderHook(() => useCachedLyricsQuery({
      videoId: 'video-1',
      audioUrl: 'https://cdn.example/audio.mp3',
      enabled: true,
    }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
