const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockQuery = jest.fn();
const mockSetDoc = jest.fn();
const mockTimestampNow = jest.fn(() => 'mock-timestamp');
const mockWhere = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockWriteBatch = jest.fn();
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn();

jest.mock('@/config/firebase', () => ({
  db: { kind: 'db' },
  auth: { kind: 'auth' },
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => mockTimestampNow() },
  where: (...args: unknown[]) => mockWhere(...args),
  writeBatch: (...args: unknown[]) => {
    mockWriteBatch(...args);
    return { set: mockBatchSet, commit: mockBatchCommit };
  },
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

jest.mock('@/utils/youtubeMetadata', () => ({
  normalizeThumbnailUrl: (_videoId: string, thumb: string | undefined) => thumb || null,
}));

import { saveTranscription, updateTranscriptionEnrichment } from '@/services/firebase/firestoreService';

describe('firestoreService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue('doc-ref');
    mockSetDoc.mockResolvedValue(undefined);
    mockBatchCommit.mockResolvedValue(undefined);
    // getDocs returns empty snapshot (no sibling variants)
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockOnAuthStateChanged.mockImplementation((_auth, callback: (user: { uid: string }) => void) => {
      callback({ uid: 'anon-user' });
      return jest.fn();
    });
  });

  it('persists additive transcription enrichment fields during save via writeBatch', async () => {
    const result = await saveTranscription({
      videoId: 'abc123def45',
      title: 'Test Song',
      channelTitle: 'Test Channel',
      thumbnail: 'https://example.com/thumb.jpg',
      beatModel: 'beat-transformer',
      chordModel: 'btc-sl',
      beats: [{ time: 0, strength: 1, beatNum: 1 }],
      chords: [{ chord: 'C', start: 0, end: 1, confidence: 0.9 }],
      synchronizedChords: [{ chord: 'C', beatIndex: 0, beatNum: 1 }],
      chordCorrections: { 'C#': 'Db' },
      romanNumerals: {
        analysis: ['I'],
        keyContext: 'C major',
      },
    });

    expect(result).toBe(true);
    // saveTranscription now uses writeBatch instead of setDoc
    expect(mockWriteBatch).toHaveBeenCalled();
    expect(mockBatchSet).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();

    // Verify the batch.set call includes the transcription data
    const savedData = mockBatchSet.mock.calls[0][1];
    expect(savedData).toEqual(expect.objectContaining({
      title: 'Test Song',
      channelTitle: 'Test Channel',
      chordCorrections: { 'C#': 'Db' },
      romanNumerals: {
        analysis: ['I'],
        keyContext: 'C major',
      },
      createdAt: 'mock-timestamp',
    }));
  });

  it('merges focused enrichment updates into an existing transcription doc', async () => {
    const result = await updateTranscriptionEnrichment('abc123def45', 'beat-transformer', 'btc-sl', {
      keySignature: 'C major',
      keyModulation: 'G major',
      chordCorrections: { 'F#': 'Gb' },
      romanNumerals: {
        analysis: ['I', 'V'],
        keyContext: 'C major',
      },
    });

    expect(result).toBe(true);
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'transcriptions', 'abc123def45_beat-transformer_btc-sl');
    expect(mockSetDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        keySignature: 'C major',
        keyModulation: 'G major',
        chordCorrections: { 'F#': 'Gb' },
      }),
      { merge: true }
    );
  });
});