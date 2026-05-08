const mockUploadAudioBlobWithRetry = jest.fn();
const mockUploadAudioFromUrlWithRetry = jest.fn();

jest.mock('@/services/firebase/streamingFirebaseUpload', () => ({
  uploadAudioBlobWithRetry: (...args: unknown[]) => mockUploadAudioBlobWithRetry(...args),
  uploadAudioFromUrlWithRetry: (...args: unknown[]) => mockUploadAudioFromUrlWithRetry(...args),
}));

describe('parallelPipelineService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads the complete file, caches it, and stores background blob-upload results', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const blob = new Blob(['audio-bytes'], { type: 'audio/mp4' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    mockUploadAudioBlobWithRetry.mockResolvedValue({
      success: true,
      audioUrl: 'https://firebase.example/audio.mp4',
    });

    const service = await import('@/services/api/parallelPipelineService');
    const result = await service.startParallelPipeline({
      videoId: 'video-1',
      title: 'Song',
      directUrl: 'https://cdn.example/audio.mp4',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(result).toEqual({
      success: true,
      directUrl: 'https://cdn.example/audio.mp4',
      firebaseUrl: undefined,
      uploadTime: undefined,
      hasCompleteFile: true,
    });
    expect(service.getCachedAudioFile('video-1')).toBe(blob);
    expect(service.getCachedAudioMeta('video-1')).toEqual({
      present: true,
      ageMs: 0,
      size: blob.size,
      timestamp: 1000,
      expiresInMs: 600000,
    });
    expect(service.getFirebaseUrlIfReady('video-1')).toBe('https://firebase.example/audio.mp4');
    nowSpy.mockRestore();
  });

  it('falls back to direct-url upload when complete download fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });
    mockUploadAudioFromUrlWithRetry.mockResolvedValue({
      success: true,
      audioUrl: 'https://firebase.example/fallback.mp4',
    });

    const service = await import('@/services/api/parallelPipelineService');
    const result = await service.startParallelPipeline({
      videoId: 'video-2',
      title: 'Song',
      directUrl: 'https://cdn.example/fallback.mp4',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(result).toEqual({
      success: true,
      directUrl: 'https://cdn.example/fallback.mp4',
      firebaseUrl: undefined,
      uploadTime: undefined,
      hasCompleteFile: false,
    });
    expect(mockUploadAudioFromUrlWithRetry).toHaveBeenCalledWith('https://cdn.example/fallback.mp4', {
      videoId: 'video-2',
      title: 'Song',
      contentType: 'audio/mp4',
    });
    expect(service.getCachedAudioFile('video-2')).toBeNull();
    expect(service.getFirebaseUrlIfReady('video-2')).toBe('https://firebase.example/fallback.mp4');
  });

  it('expires cached audio after ten minutes and rejects Firebase storage URLs for direct backend use', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(2000);

    const blob = new Blob(['audio-bytes'], { type: 'audio/mp4' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    mockUploadAudioBlobWithRetry.mockResolvedValue({
      success: true,
      audioUrl: 'https://firebase.example/audio.mp4',
    });

    const service = await import('@/services/api/parallelPipelineService');
    await service.startParallelPipeline({
      videoId: 'video-3',
      title: 'Song',
      directUrl: 'https://cdn.example/audio.mp4',
    });
    await Promise.resolve();
    await Promise.resolve();

    nowSpy.mockReturnValue(2000 + 10 * 60 * 1000 + 1);

    expect(service.getCachedAudioFile('video-3')).toBeNull();
    expect(service.getCachedAudioMeta('video-3')).toEqual({ present: false });
    expect(service.canUseDirectUrlWithBackend('https://files.example/audio.mp4')).toBe(true);
    expect(service.canUseDirectUrlWithBackend('https://firebasestorage.googleapis.com/file')).toBe(false);
    expect(service.canUseDirectUrlWithBackend('not-a-valid-url')).toBe(false);
    expect(service.getBackendEndpointForDirectUrl('beats')).toBe('/api/detect-beats');
    expect(service.getBackendEndpointForDirectUrl('chords')).toBe('/api/recognize-chords');

    nowSpy.mockRestore();
  });
});