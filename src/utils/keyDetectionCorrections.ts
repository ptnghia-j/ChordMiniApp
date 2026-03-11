type SequenceKeyAnalysis = {
  sections?: Array<{ startIndex: number; endIndex: number; key: string; confidence?: number; chords?: string[] }>;
  modulations?: Array<{ atIndex?: number; atChordIndex?: number; fromKey: string; toKey: string; pivotChord?: string }>;
};

export type SequenceCorrectionsPayload = {
  originalSequence?: string[];
  correctedSequence?: string[];
  keyAnalysis?: SequenceKeyAnalysis;
} | null | undefined;

export interface SanitizedSequenceCorrections {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{ startIndex: number; endIndex: number; key: string; confidence?: number; chords: string[] }>;
    modulations?: Array<{ atIndex: number; fromKey: string; toKey: string; pivotChord?: string }>;
  };
}

const BASE_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function getPitchClass(note: string): number | null {
  const match = note.match(/^([A-G])([#b]{0,2})$/);
  if (!match) return null;
  const [, letter, accidentals] = match;
  const delta = [...accidentals].reduce((sum, accidental) => sum + (accidental === '#' ? 1 : -1), 0);
  return (BASE_PITCH[letter] + delta + 12) % 12;
}

function parseChordSymbol(chord: string) {
  const match = chord.trim().match(/^([A-G](?:#{1,2}|b{1,2})?)([^/]*?)(?:\/([A-G](?:#{1,2}|b{1,2})?|[#b]?[1-7]))?$/);
  if (!match) return null;
  return {
    root: match[1],
    descriptor: match[2] || '',
    bass: match[3] || null,
  };
}

export function isValidEnharmonicChordCorrection(original: string, corrected: string): boolean {
  if (!corrected || original === corrected) return true;
  if (original === 'N.C.' || corrected === 'N.C.') return original === corrected;

  const originalParsed = parseChordSymbol(original);
  const correctedParsed = parseChordSymbol(corrected);
  if (!originalParsed || !correctedParsed) return false;
  if (originalParsed.descriptor !== correctedParsed.descriptor) return false;

  const originalRoot = getPitchClass(originalParsed.root);
  const correctedRoot = getPitchClass(correctedParsed.root);
  if (originalRoot === null || correctedRoot === null || originalRoot !== correctedRoot) return false;

  if (Boolean(originalParsed.bass) !== Boolean(correctedParsed.bass)) return false;
  if (!originalParsed.bass && !correctedParsed.bass) return true;
  if (originalParsed.bass === correctedParsed.bass) return true;

  const originalBass = getPitchClass(originalParsed.bass || '');
  const correctedBass = getPitchClass(correctedParsed.bass || '');
  return originalBass !== null && correctedBass !== null && originalBass === correctedBass;
}

export function sanitizeLegacyCorrections(
  chordSequence: string[],
  corrections: Record<string, string> | null | undefined
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  if (!corrections) return sanitized;

  chordSequence.forEach((original) => {
    const corrected = corrections[original];
    if (corrected && original !== corrected && isValidEnharmonicChordCorrection(original, corrected)) {
      sanitized[original] = corrected;
    }
  });

  return sanitized;
}

export function sanitizeSequenceCorrections(
  chordSequence: string[],
  payload: SequenceCorrectionsPayload
): SanitizedSequenceCorrections {
  const candidateSequence = payload?.correctedSequence || [];
  const correctedSequence = chordSequence.map((original, index) => {
    const candidate = candidateSequence[index];
    return typeof candidate === 'string' && isValidEnharmonicChordCorrection(original, candidate)
      ? candidate
      : original;
  });

  const sections = (payload?.keyAnalysis?.sections || [])
    .filter((section) =>
      Number.isInteger(section.startIndex) &&
      Number.isInteger(section.endIndex) &&
      section.startIndex >= 0 &&
      section.endIndex >= section.startIndex &&
      section.endIndex < correctedSequence.length &&
      typeof section.key === 'string' &&
      section.key.trim().length > 0
    )
    .map((section) => ({
      startIndex: section.startIndex,
      endIndex: section.endIndex,
      key: section.key,
      confidence: section.confidence,
      chords: correctedSequence.slice(section.startIndex, section.endIndex + 1),
    }));

  const modulations = (payload?.keyAnalysis?.modulations || [])
    .filter((modulation) =>
      Number.isInteger(modulation.atIndex ?? modulation.atChordIndex) &&
      (modulation.atIndex ?? modulation.atChordIndex)! >= 0 &&
      (modulation.atIndex ?? modulation.atChordIndex)! < correctedSequence.length &&
      typeof modulation.fromKey === 'string' &&
      typeof modulation.toKey === 'string'
    )
    .map((modulation) => ({
      atIndex: modulation.atIndex ?? modulation.atChordIndex ?? 0,
      fromKey: modulation.fromKey,
      toKey: modulation.toKey,
      pivotChord: modulation.pivotChord,
    }));

  return {
    originalSequence: [...chordSequence],
    correctedSequence,
    keyAnalysis: sections.length || modulations.length ? { sections, modulations } : undefined,
  };
}