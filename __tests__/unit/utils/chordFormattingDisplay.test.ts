import { formatChordWithMusicalSymbols, getBassNoteFromInversion } from '@/utils/chordFormatting';

describe('chordFormatting inversion display', () => {
  it('resolves sharp-root minor flat-seventh inversions to concrete bass notes', () => {
    expect(getBassNoteFromInversion('C#', 'min', 'b7')).toBe('B');
    expect(getBassNoteFromInversion('F#', 'min', 'b7')).toBe('E');
  });

  it('formats C#:min/b7 as C#m/B', () => {
    const formatted = formatChordWithMusicalSymbols('C#:min/b7');

    expect(formatted).toContain('♯');
    expect(formatted).toContain('m');
    expect(formatted).toContain('/');
    expect(formatted).toContain('B');
    expect(formatted).not.toContain('b7');
  });

  it('formats canonical half-diminished quality hdim7 as a half-diminished symbol', () => {
    const formatted = formatChordWithMusicalSymbols('A:hdim7');

    expect(formatted).toContain('A');
    expect(formatted).toContain('ø');
    expect(formatted).toContain('7');
  });

  it('renders parenthesized major extensions with the delta symbol', () => {
    const formatted = formatChordWithMusicalSymbols('Cmaj(9)');

    expect(formatted).toContain('Δ');
    expect(formatted).toContain('(9)');
    expect(formatted).not.toContain('maj');
  });

  it('renders major extension family labels with the delta symbol', () => {
    const formatted = formatChordWithMusicalSymbols('Cmaj9');

    expect(formatted).toContain('Δ');
    expect(formatted).toContain('9');
    expect(formatted).not.toContain('maj');
  });

  it('renders long-form major seventh labels with the delta symbol', () => {
    const formatted = formatChordWithMusicalSymbols('Cmajor7');

    expect(formatted).toContain('Δ');
    expect(formatted).toContain('7');
    expect(formatted).not.toContain('major');
  });
});
