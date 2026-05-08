const mockAnalyzeAudioWithRateLimit = jest.fn();
const mockGetTranscription = jest.fn();
const mockSaveTranscription = jest.fn();
const mockUpdateTranscriptionEnrichment = jest.fn();

jest.mock('@/services/chord-analysis/chordRecognitionService', () => ({
  analyzeAudioWithRateLimit: (...args: unknown[]) => mockAnalyzeAudioWithRateLimit(...args),
}));

jest.mock('@/services/firebase/firestoreService', () => ({
  getTranscription: (...args: unknown[]) => mockGetTranscription(...args),
  saveTranscription: (...args: unknown[]) => mockSaveTranscription(...args),
  updateTranscriptionEnrichment: (...args: unknown[]) => mockUpdateTranscriptionEnrichment(...args),
}));

import { AudioProcessingService } from '@/services/audio/audioProcessingService';

const analysisResults = {
  chords: [{ chord: 'C', start: 0, end: 1, time: 0, confidence: 0.9 }],
  beats: [{ time: 0, strength: 1, beatNum: 1 }],
  downbeats: [0],
  downbeats_with_measures: [{ time: 0, measureNum: 1 }],
  synchronizedChords: [{ chord: 'C', beatIndex: 0, beatNum: 1 }],
  beatModel: 'beat-transformer',
  chordModel: 'btc-sl',
  audioDuration: 120,
  beatDetectionResult: {
    time_signature: 4,
    bpm: 120,
    beatShift: 0,
  },
};

describe('AudioProcessingService.analyzeAudioFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveTranscription.mockResolvedValue(true);
    mockAnalyzeAudioWithRateLimit.mockResolvedValue(analysisResults);
  });

  it('skips the duplicate Firestore lookup when the caller already checked and found no cache', async () => {
    const onTranscriptionSaved = jest.fn();

    const result = await AudioProcessingService.getInstance().analyzeAudioFile(
      'https://example.com/audio.mp3',
      'abc123def45',
      'beat-transformer',
      'btc-sl',
      'Test Song',
      {
        prefetchedTranscription: null,
        onTranscriptionSaved,
      }
    );

    expect(result).toEqual(analysisResults);
    expect(mockGetTranscription).not.toHaveBeenCalled();
    expect(mockAnalyzeAudioWithRateLimit).toHaveBeenCalledWith(
      'https://example.com/audio.mp3',
      'beat-transformer',
      'btc-sl',
      'abc123def45'
    );
    expect(mockSaveTranscription).toHaveBeenCalledWith(expect.objectContaining({
      videoId: 'abc123def45',
      title: 'Test Song',
      beatModel: 'beat-transformer',
      chordModel: 'btc-sl',
    }));
    expect(onTranscriptionSaved).toHaveBeenCalledWith(expect.objectContaining({
      videoId: 'abc123def45',
      beatModel: 'beat-transformer',
      chordModel: 'btc-sl',
    }));
  });

  it('reuses a prefetched cached transcription without re-querying or re-running analysis', async () => {
    const cachedTranscription = {
      videoId: 'abc123def45',
      beatModel: 'beat-transformer',
      chordModel: 'btc-sl',
      beats: [{ time: 0, strength: 1, beatNum: 1 }],
      chords: [{ chord: 'C', start: 0, end: 1, time: 0, confidence: 0.9 }],
      downbeats: [0],
      downbeats_with_measures: [{ time: 0, measureNum: 1 }],
      synchronizedChords: [{ chord: 'C', beatIndex: 0, beatNum: 1 }],
      audioDuration: 120,
      timeSignature: 4,
      bpm: 120,
      beatShift: 0,
    };

    const result = await AudioProcessingService.getInstance().analyzeAudioFile(
      'https://example.com/audio.mp3',
      'abc123def45',
      'beat-transformer',
      'btc-sl',
      'Test Song',
      {
        prefetchedTranscription: cachedTranscription,
      }
    );

    expect(result).toEqual(expect.objectContaining({
      beatModel: 'beat-transformer',
      chordModel: 'btc-sl',
      audioDuration: 120,
    }));
    expect(mockGetTranscription).not.toHaveBeenCalled();
    expect(mockAnalyzeAudioWithRateLimit).not.toHaveBeenCalled();
    expect(mockSaveTranscription).not.toHaveBeenCalled();
  });

  it('falls back to requested beat model when fresh analysis omits beatModel', async () => {
    mockAnalyzeAudioWithRateLimit.mockResolvedValueOnce({
      ...analysisResults,
      beatModel: undefined,
    });

    const result = await AudioProcessingService.getInstance().analyzeAudioFile(
      'https://example.com/audio.mp3',
      'abc123def45',
      'madmom',
      'chord-cnn-lstm',
      'Test Song'
    );

    expect(result).toEqual(expect.objectContaining({
      beatModel: 'madmom',
    }));
  });
});