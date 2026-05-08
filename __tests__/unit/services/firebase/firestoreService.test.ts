globalThis.Headers ??= class HeadersMock {} as unknown as typeof globalThis.Headers;
globalThis.Request ??= class RequestMock {} as unknown as typeof globalThis.Request;
globalThis.Response ??= class ResponseMock {} as unknown as typeof globalThis.Response;

const { normalizeTranscriptionData } = require('@/services/firebase/firestoreService') as typeof import('@/services/firebase/firestoreService');
type TranscriptionData = import('@/services/firebase/firestoreService').TranscriptionData;

describe('normalizeTranscriptionData', () => {
  const baseTranscription = {
    videoId: 'abc123xyz89',
    beatModel: 'madmom',
    chordModel: 'chord-cnn-lstm',
    beats: [],
    chords: [],
    synchronizedChords: [],
    createdAt: {} as TranscriptionData['createdAt'],
  } as TranscriptionData;

  it('maps Gemini enrichment cache fields into the frontend transcription shape', () => {
    const normalized = normalizeTranscriptionData({
      ...baseTranscription,
      primaryKey: 'E major',
      modulation: 'Ab major',
      corrections: { 'C#:maj': 'Db' },
      sequenceCorrections: {
        originalSequence: ['C#:maj', 'Eb:maj'],
        correctedSequence: ['Db', 'Eb'],
      },
      correctedChords: ['Db', 'Eb'],
      originalChords: ['C#:maj', 'Eb:maj'],
    });

    expect(normalized.keySignature).toBe('E major');
    expect(normalized.keyModulation).toBe('Ab major');
    expect(normalized.chordCorrections).toEqual({ 'C#:maj': 'Db' });
    expect(normalized.sequenceCorrections?.correctedSequence).toEqual(['Db', 'Eb']);
    expect(normalized.correctedChords).toEqual(['Db', 'Eb']);
  });

  it('reconstructs sequence corrections from original/corrected chord arrays when needed', () => {
    const normalized = normalizeTranscriptionData({
      ...baseTranscription,
      originalChords: ['C#:maj', 'Eb:maj'],
      correctedChords: ['Db', 'Eb'],
    });

    expect(normalized.sequenceCorrections).toEqual({
      originalSequence: ['C#:maj', 'Eb:maj'],
      correctedSequence: ['Db', 'Eb'],
      romanNumerals: null,
    });
  });

  it('reconstructs sequence corrections from legacy chord corrections and cached chord stream', () => {
    const normalized = normalizeTranscriptionData({
      ...baseTranscription,
      keySignature: 'Db major',
      chordCorrections: { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab' },
      synchronizedChords: [
        { chord: 'C#', beatIndex: 0 },
        { chord: 'D#', beatIndex: 1 },
        { chord: 'G#7', beatIndex: 2 },
      ],
    });

    expect(normalized.sequenceCorrections).toEqual({
      originalSequence: ['C#', 'D#', 'G#7'],
      correctedSequence: ['Db', 'Eb', 'Ab7'],
      romanNumerals: null,
    });
    expect(normalized.originalChords).toEqual(['C#', 'D#', 'G#7']);
    expect(normalized.correctedChords).toEqual(['Db', 'Eb', 'Ab7']);
  });
});