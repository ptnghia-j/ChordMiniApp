var mockAudioMetadataCache: {
  get: jest.Mock;
  set: jest.Mock;
  peek: jest.Mock;
  invalidate: jest.Mock;
  getStats: jest.Mock;
};

var mockFindExistingAudioFile: jest.Mock;
var mockFindExistingAudioFiles: jest.Mock;
var mockFindExistingLocalAudioFile: jest.Mock;
var mockFindExistingLocalAudioFiles: jest.Mock;
var mockSaveLocalAudioMetadata: jest.Mock;
var mockNormalizeThumbnailUrl: jest.Mock;
var mockLogStorageOperation: jest.Mock;

jest.mock('@/services/cache/smartFirebaseCache', () => ({
  audioMetadataCache: (mockAudioMetadataCache = {
    get: jest.fn(),
    set: jest.fn(),
    peek: jest.fn(),
    invalidate: jest.fn(),
    getStats: jest.fn(),
  }),
}));

jest.mock('@/services/firebase/firebaseStorageService', () => ({
  findExistingAudioFile: (...args: unknown[]) => (mockFindExistingAudioFile ||= jest.fn())(...args),
  findExistingAudioFiles: (...args: unknown[]) => (mockFindExistingAudioFiles ||= jest.fn())(...args),
}));

jest.mock('@/services/storage/localAudioStorageService', () => ({
  findExistingLocalAudioFile: (...args: unknown[]) => (mockFindExistingLocalAudioFile ||= jest.fn())(...args),
  findExistingLocalAudioFiles: (...args: unknown[]) => (mockFindExistingLocalAudioFiles ||= jest.fn())(...args),
  saveLocalAudioMetadata: (...args: unknown[]) => (mockSaveLocalAudioMetadata ||= jest.fn())(...args),
}));

jest.mock('@/services/storage/storageMonitoringService', () => ({
  storageMonitoringService: {
    logStorageOperation: (...args: unknown[]) => (mockLogStorageOperation ||= jest.fn())(...args),
  },
}));

jest.mock('@/utils/youtubeMetadata', () => ({
  normalizeThumbnailUrl: (...args: unknown[]) => (mockNormalizeThumbnailUrl ||= jest.fn())(...args),
}));

import { firebaseStorageSimplified } from '@/services/firebase/firebaseStorageSimplified';

describe('firebaseStorageSimplified local fallback', () => {
  beforeEach(() => {
    mockFindExistingAudioFile ||= jest.fn();
    mockFindExistingAudioFiles ||= jest.fn();
    mockFindExistingLocalAudioFile ||= jest.fn();
    mockFindExistingLocalAudioFiles ||= jest.fn();
    mockSaveLocalAudioMetadata ||= jest.fn();
    mockNormalizeThumbnailUrl ||= jest.fn();
    mockLogStorageOperation ||= jest.fn();
    jest.clearAllMocks();

    mockAudioMetadataCache.get.mockImplementation(async (_key: string, queryFn: () => Promise<unknown>) => queryFn());
    mockAudioMetadataCache.getStats.mockReturnValue({
      totalEntries: 0,
      incompleteEntries: 0,
      errorEntries: 0,
      suppressedWarnings: 0,
    });
    mockNormalizeThumbnailUrl.mockImplementation((videoId: string, thumbnail: string | null | undefined) => {
      return thumbnail || `thumb-${videoId}`;
    });
    mockFindExistingAudioFiles.mockResolvedValue(new Map());
    mockFindExistingLocalAudioFiles.mockResolvedValue(new Map());
  });

  it('returns cached local temp audio when Firebase storage is unavailable', async () => {
    mockFindExistingAudioFile.mockResolvedValue(null);
    mockFindExistingLocalAudioFile.mockResolvedValue({
      videoId: 'abc123def45',
      filename: 'My_Song-[abc123def45].mp3',
      filePath: '/repo/temp/My_Song-[abc123def45].mp3',
      fileSize: 321,
      audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
      title: 'My Song',
      duration: 215,
      createdAt: '2026-04-09T01:02:03.000Z',
      sourceDir: '/repo/temp',
    });

    const result = await firebaseStorageSimplified.getCachedAudioMetadata('abc123def45');

    expect(result).toEqual(expect.objectContaining({
      videoId: 'abc123def45',
      audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
      title: 'My Song',
      duration: 215,
      fileSize: 321,
      isStreamUrl: false,
      extractionService: 'local-temp-cache',
    }));
    expect(mockFindExistingLocalAudioFile).toHaveBeenCalledWith('abc123def45');
    expect(mockLogStorageOperation).toHaveBeenCalled();
  });

  it('persists metadata for local serve-local-audio URLs', async () => {
    mockFindExistingLocalAudioFile.mockResolvedValue({
      videoId: 'abc123def45',
      filename: 'My_Song-[abc123def45].mp3',
      filePath: '/repo/temp/My_Song-[abc123def45].mp3',
      fileSize: 654,
      audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
      sourceDir: '/repo/temp',
    });

    const saved = await firebaseStorageSimplified.saveAudioMetadata({
      videoId: 'abc123def45',
      audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
      title: 'My Song',
      duration: 215,
      fileSize: 654,
    });

    expect(saved).toBe(true);
    expect(mockAudioMetadataCache.set).toHaveBeenCalledWith(
      'audio_abc123def45',
      expect.objectContaining({
        videoId: 'abc123def45',
        title: 'My Song',
      }),
      true
    );
    expect(mockSaveLocalAudioMetadata).toHaveBeenCalledWith(expect.objectContaining({
      videoId: 'abc123def45',
      title: 'My Song',
      filename: 'My_Song-[abc123def45].mp3',
      filePath: '/repo/temp/My_Song-[abc123def45].mp3',
    }));
  });

  it('includes local temp files in batch cache lookups', async () => {
    mockAudioMetadataCache.peek.mockReturnValue(undefined);
    mockFindExistingLocalAudioFiles.mockResolvedValue(new Map([
      ['abc123def45', {
        videoId: 'abc123def45',
        filename: 'My_Song-[abc123def45].mp3',
        filePath: '/repo/temp/My_Song-[abc123def45].mp3',
        fileSize: 777,
        audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
        title: 'My Song',
        duration: 215,
        createdAt: '2026-04-09T01:02:03.000Z',
        sourceDir: '/repo/temp',
      }],
    ]));

    const result = await firebaseStorageSimplified.getMultipleCachedAudio(['abc123def45']);

    expect(result.get('abc123def45')).toEqual(expect.objectContaining({
      audioUrl: 'http://localhost:3000/api/serve-local-audio?filename=My_Song-%5Babc123def45%5D.mp3',
      title: 'My Song',
      extractionService: 'local-temp-cache',
    }));
    expect(mockFindExistingLocalAudioFiles).toHaveBeenCalledWith(['abc123def45']);
  });
});
