import { analyzeAudioWithRateLimit } from '@/services/audio/audioAnalysisService';
import { detectBeatsWithRateLimit } from '@/services/audio/beatDetectionService';
import { recognizeChordsWithRateLimit } from '@/services/chord-analysis/chordService';
import { offloadUploadService } from '@/services/storage/offloadUploadService';
import { isLocalBackend } from '@/utils/backendConfig';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

jest.mock('@/utils/backendConfig', () => ({
  isLocalBackend: jest.fn(),
}));

jest.mock('@/utils/audioDurationUtils', () => ({
  getAudioDurationFromFile: jest.fn(),
}));

jest.mock('@/utils/analysisDurationLimit', () => ({
  getAnalysisDurationLimitReason: jest.fn(() => null),
}));

jest.mock('@/services/storage/offloadUploadService', () => ({
  offloadUploadService: {
    uploadToOffload: jest.fn(),
    recognizeChordsFromOffloadUrl: jest.fn(),
    detectBeatsFromOffloadUrl: jest.fn(),
    deleteOffload: jest.fn(),
    getFileSizeString: jest.fn(() => '1.00MB'),
  },
}));

jest.mock('@/services/audio/beatDetectionService', () => ({
  detectBeatsFromFile: jest.fn(),
  detectBeatsWithRateLimit: jest.fn(),
}));

jest.mock('@/services/chord-analysis/chordService', () => ({
  recognizeChordsWithRateLimit: jest.fn(),
}));

jest.mock('@/utils/chordSynchronization', () => ({
  synchronizeChords: jest.fn(() => [{ chord: 'C', beatIndex: 0 }]),
  scoreDownbeatAlignment: jest.fn(() => ({ score: 1 })),
}));

jest.mock('@/workers/chordAnalysisClient', () => ({
  getChordAnalysisWorker: jest.fn(() => null),
}));

jest.mock('@/utils/debug/beatGridDebug', () => ({
  beatGridDebugLog: jest.fn(),
}));

describe('audioAnalysisService universal offload orchestration', () => {
  const makeFile = (size = 1024, name = 'audio.wav') =>
    new File([new Uint8Array(size)], name, { type: 'audio/wav' });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    (getAudioDurationFromFile as jest.Mock).mockResolvedValue(12);
    (offloadUploadService.uploadToOffload as jest.Mock).mockResolvedValue('https://firebasestorage.googleapis.com/test-audio');
    (offloadUploadService.recognizeChordsFromOffloadUrl as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        chords: [{ start: 0, end: 1, chord: 'C', confidence: 0.9 }],
      },
    });
    (offloadUploadService.detectBeatsFromOffloadUrl as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        beats: [0, 1],
        downbeats: [0],
        bpm: 120,
        time_signature: 4,
      },
    });
    (offloadUploadService.deleteOffload as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses a single offload upload in production and does not call direct multipart services', async () => {
    (isLocalBackend as jest.Mock).mockReturnValue(false);

    await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(offloadUploadService.uploadToOffload).toHaveBeenCalledTimes(1);
    expect(offloadUploadService.recognizeChordsFromOffloadUrl).toHaveBeenCalledWith(
      'https://firebasestorage.googleapis.com/test-audio',
      'chord-cnn-lstm',
      { deleteAfterProcessing: false }
    );
    expect(offloadUploadService.detectBeatsFromOffloadUrl).toHaveBeenCalledWith(
      'https://firebasestorage.googleapis.com/test-audio',
      'madmom',
      { deleteAfterProcessing: false, audioDuration: 12 }
    );
    expect(detectBeatsWithRateLimit).not.toHaveBeenCalled();
    expect(recognizeChordsWithRateLimit).not.toHaveBeenCalled();
    expect(offloadUploadService.deleteOffload).toHaveBeenCalledWith(
      'https://firebasestorage.googleapis.com/test-audio'
    );
  });

  it('keeps local development on direct multipart services', async () => {
    (isLocalBackend as jest.Mock).mockReturnValue(true);
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [0, 1],
      downbeats: [0],
      bpm: 120,
      time_signature: 4,
    });
    (recognizeChordsWithRateLimit as jest.Mock).mockResolvedValue([
      { start: 0, end: 1, chord: 'C', confidence: 0.9 },
    ]);

    await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(detectBeatsWithRateLimit).toHaveBeenCalledTimes(1);
    expect(recognizeChordsWithRateLimit).toHaveBeenCalledTimes(1);
    expect(offloadUploadService.uploadToOffload).not.toHaveBeenCalled();
    expect(offloadUploadService.recognizeChordsFromOffloadUrl).not.toHaveBeenCalled();
    expect(offloadUploadService.detectBeatsFromOffloadUrl).not.toHaveBeenCalled();
  });

  it('waits for both offload requests to settle before deleting the shared offload URL', async () => {
    (isLocalBackend as jest.Mock).mockReturnValue(false);

    let resolveBeat!: (value: unknown) => void;
    const beatDeferred = new Promise((resolve) => {
      resolveBeat = resolve;
    });

    (offloadUploadService.recognizeChordsFromOffloadUrl as jest.Mock).mockResolvedValue({
      success: false,
      error: 'chord failed',
    });
    (offloadUploadService.detectBeatsFromOffloadUrl as jest.Mock).mockReturnValue(beatDeferred);

    const analysisPromise = analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    await Promise.resolve();
    expect(offloadUploadService.deleteOffload).not.toHaveBeenCalled();

    resolveBeat({
      success: true,
      data: { success: true, beats: [0], downbeats: [0], bpm: 120, time_signature: 4 },
    });

    await expect(analysisPromise).rejects.toThrow('chord failed');
    expect(offloadUploadService.deleteOffload).toHaveBeenCalledWith(
      'https://firebasestorage.googleapis.com/test-audio'
    );
  });
});
