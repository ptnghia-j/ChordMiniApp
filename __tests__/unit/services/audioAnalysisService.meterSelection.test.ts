import { analyzeAudioWithRateLimit } from '@/services/audio/audioAnalysisService';
import { detectBeatsWithRateLimit } from '@/services/audio/beatDetectionService';
import { recognizeChordsWithRateLimit } from '@/services/chord-analysis/chordService';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';
import { isLocalBackend } from '@/utils/backendConfig';

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

jest.mock('@/workers/chordAnalysisClient', () => ({
  getChordAnalysisWorker: jest.fn(() => null),
}));

jest.mock('@/utils/debug/beatGridDebug', () => ({
  beatGridDebugLog: jest.fn(),
  beatGridDebugVerboseLog: jest.fn(),
  isBeatGridDebugEnabled: jest.fn(() => false),
}));

describe('audioAnalysisService meter candidate selection', () => {
  const makeFile = () => new File([new Uint8Array(1024)], 'meter.wav', { type: 'audio/wav' });
  const beats = Array.from({ length: 12 }, (_, index) => index);
  const candidates = {
    '3': [0, 3, 6, 9],
    '4': [0, 4, 8],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    (isLocalBackend as jest.Mock).mockReturnValue(true);
    (getAudioDurationFromFile as jest.Mock).mockResolvedValue(12);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects 3/4 candidates when chord changes align with a three-beat meter', async () => {
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [...beats],
      downbeats: [],
      downbeat_candidates: candidates,
      bpm: 120,
      time_signature: 4,
    });
    (recognizeChordsWithRateLimit as jest.Mock).mockResolvedValue([
      { start: 0, end: 2.8, chord: 'C', confidence: 0.9 },
      { start: 3, end: 5.8, chord: 'F', confidence: 0.9 },
      { start: 6, end: 8.8, chord: 'G', confidence: 0.9 },
      { start: 9, end: 11.8, chord: 'C', confidence: 0.9 },
    ]);

    const result = await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(result.beatDetectionResult.time_signature).toBe(3);
    expect(result.downbeats).toEqual(candidates['3']);
    expect(result.synchronizedChords).toHaveLength(beats.length);
  });

  it('selects 4/4 candidates when chord changes align with a four-beat meter', async () => {
    (detectBeatsWithRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      beats: [...beats],
      downbeats: [],
      downbeat_candidates: candidates,
      bpm: 120,
      time_signature: 3,
    });
    (recognizeChordsWithRateLimit as jest.Mock).mockResolvedValue([
      { start: 0, end: 3.8, chord: 'C', confidence: 0.9 },
      { start: 4, end: 7.8, chord: 'Am', confidence: 0.9 },
      { start: 8, end: 11.8, chord: 'F', confidence: 0.9 },
    ]);

    const result = await analyzeAudioWithRateLimit(makeFile(), 'madmom', 'chord-cnn-lstm');

    expect(result.beatDetectionResult.time_signature).toBe(4);
    expect(result.downbeats).toEqual(candidates['4']);
    expect(result.synchronizedChords.map((entry) => entry.beatIndex)).toEqual(beats.map((_, index) => index));
  });
});
