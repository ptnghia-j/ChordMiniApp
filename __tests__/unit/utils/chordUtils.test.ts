import { estimateKeySignatureFromChords, getDisplayAccidentalPreference } from '@/utils/chordUtils';

describe('getDisplayAccidentalPreference', () => {
  it('preserves exact sequence spelling when a sequence correction payload is present', () => {
    expect(getDisplayAccidentalPreference({
      chords: ['C#', 'D#', 'G#'],
      keySignature: 'Db major',
      preserveExactSpelling: true,
    })).toBeUndefined();
  });

  it('falls back to the detected key signature when no sequence spelling must be preserved', () => {
    expect(getDisplayAccidentalPreference({
      chords: ['C#', 'D#', 'G#'],
      keySignature: 'Db major',
    })).toBe('flat');
  });

  it('uses chord heuristics when no key signature is available', () => {
    expect(getDisplayAccidentalPreference({
      chords: ['Db', 'Eb', 'Ab'],
      keySignature: null,
    })).toBe('flat');
  });
});

describe('estimateKeySignatureFromChords', () => {
  it('prefers flat key spellings when the chord vocabulary is flat-based', () => {
    expect(estimateKeySignatureFromChords(['Bb:maj', 'Eb:maj', 'F:maj']).keySignature).toBe('Bb major');
  });

  it('prefers sharp key spellings when the chord vocabulary is sharp-based', () => {
    expect(estimateKeySignatureFromChords(['F#:maj', 'C#:maj', 'B:maj']).keySignature).toBe('F# major');
  });

  it('detects minor-mode lean from Harte-style minor chords', () => {
    const result = estimateKeySignatureFromChords(['A:min', 'E:maj', 'A:min', 'D:min']);
    expect(result.keySignature).toBe('A minor');
    expect(result.mode).toBe('minor');
  });

  it('keeps the home key when a major progression uses several chained secondary dominants', () => {
    const result = estimateKeySignatureFromChords([
      'C:maj',
      'E:7',
      'A:7',
      'D:min',
      'G:7',
      'C:maj',
    ]);

    expect(result.keySignature).toBe('C major');
    expect(result.mode).toBe('major');
  });

  it('keeps the tonic major key when a dominant chain tonicizes multiple diatonic targets', () => {
    const result = estimateKeySignatureFromChords([
      'G:maj',
      'B:7',
      'E:min',
      'A:7',
      'D:7',
      'G:maj',
    ]);

    expect(result.keySignature).toBe('G major');
    expect(result.mode).toBe('major');
  });

  it('keeps the tonic minor key when applied dominants point back to a minor center', () => {
    const result = estimateKeySignatureFromChords([
      'A:min',
      'B:7',
      'E:7',
      'A:min',
      'D:min',
      'E:7',
      'A:min',
    ]);

    expect(result.keySignature).toBe('A minor');
    expect(result.mode).toBe('minor');
  });

  it('prefers the key whose diatonic collection explains more chord tones, not just repeated roots', () => {
    const result = estimateKeySignatureFromChords([
      'D:7',
      'G:7',
      'C:maj',
      'A:7',
      'D:min',
      'G:7',
      'C:maj',
    ]);

    expect(result.keySignature).toBe('C major');
    expect(result.mode).toBe('major');
  });
});