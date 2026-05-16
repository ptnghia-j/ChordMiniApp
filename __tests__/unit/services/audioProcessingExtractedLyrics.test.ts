import { apiPost } from '@/config/api';
import { transcribeLyricsWithAI } from '@/services/audio/audioProcessingExtracted';
import { getMusicAiApiKeyWithValidation } from '@/utils/apiKeyUtils';
import type { AudioProcessingServiceDependencies } from '@/services/audio/audioProcessingExtracted';
import type { LyricsData } from '@/types/musicAiTypes';

jest.mock('@/config/api', () => ({
  apiPost: jest.fn(),
}));

jest.mock('@/utils/apiKeyUtils', () => ({
  getMusicAiApiKeyWithValidation: jest.fn(),
}));

jest.mock('@/services/firebase/firestoreService', () => ({
  getTranscription: jest.fn(),
}));

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockGetMusicAiApiKeyWithValidation = getMusicAiApiKeyWithValidation as jest.MockedFunction<
  typeof getMusicAiApiKeyWithValidation
>;

const createDeps = (
  overrides: Partial<AudioProcessingServiceDependencies> = {},
): AudioProcessingServiceDependencies => ({
  setAudioProcessingState: jest.fn(),
  setAnalysisResults: jest.fn(),
  setDuration: jest.fn(),
  setShowExtractionNotification: jest.fn(),
  setLyrics: jest.fn(),
  setShowLyrics: jest.fn(),
  setHasCachedLyrics: jest.fn(),
  setActiveTab: jest.fn(),
  setIsTranscribingLyrics: jest.fn(),
  setLyricsError: jest.fn(),
  processingContext: {
    stage: '',
    progress: 0,
    setStage: jest.fn(),
    setProgress: jest.fn(),
    setStatusMessage: jest.fn(),
    startProcessing: jest.fn(),
    completeProcessing: jest.fn(),
    failProcessing: jest.fn(),
  },
  analyzeAudioFromService: jest.fn(),
  audioRef: { current: null },
  extractionLockRef: { current: false },
  beatDetectorRef: { current: 'madmom' },
  chordDetectorRef: { current: 'btc-sl' },
  videoId: 'video-123',
  titleFromSearch: null,
  durationFromSearch: null,
  channelFromSearch: null,
  thumbnailFromSearch: null,
  audioProcessingState: {
    isExtracting: false,
    isDownloading: false,
    isExtracted: true,
    isAnalyzing: false,
    isAnalyzed: false,
    audioUrl: 'https://cdn.example/audio.mp3',
    videoUrl: null,
    youtubeEmbedUrl: null,
    fromCache: false,
    fromFirestoreCache: false,
    error: null,
  },
  beatDetector: 'madmom',
  chordDetector: 'btc-sl',
  progress: 0,
  lyrics: null,
  requestId: 'request-1',
  isRequestStillCurrent: () => true,
  ...overrides,
});

describe('transcribeLyricsWithAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMusicAiApiKeyWithValidation.mockResolvedValue({
      isValid: true,
      apiKey: 'music-ai-key',
    });
  });

  it('notifies callers with the successful lyrics payload so query cache can be updated', async () => {
    const lyrics: LyricsData = {
      lines: [{ text: 'Hello', startTime: 0, endTime: 1 }],
    };
    mockApiPost.mockResolvedValue({
      json: async () => ({ lyrics }),
    } as Response);
    const onLyricsTranscribed = jest.fn();
    const deps = createDeps({ onLyricsTranscribed });

    await transcribeLyricsWithAI(deps);

    expect(deps.setLyrics).toHaveBeenCalledWith(lyrics);
    expect(onLyricsTranscribed).toHaveBeenCalledWith(lyrics);
    expect(mockApiPost).toHaveBeenCalledWith('TRANSCRIBE_LYRICS', {
      videoId: 'video-123',
      audioPath: 'https://cdn.example/audio.mp3',
      checkCacheOnly: false,
      forceRefresh: false,
      musicAiApiKey: 'music-ai-key',
    });
  });

  it('does not notify cache listeners when api key validation fails', async () => {
    mockGetMusicAiApiKeyWithValidation.mockResolvedValue({
      isValid: false,
      apiKey: null,
      error: 'Missing key',
    });
    const onLyricsTranscribed = jest.fn();
    const deps = createDeps({ onLyricsTranscribed });

    await transcribeLyricsWithAI(deps);

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(onLyricsTranscribed).not.toHaveBeenCalled();
    expect(deps.setLyricsError).toHaveBeenCalledWith('Missing key');
  });
});
