export type ParsedKeyQuality = 'major' | 'minor';

export interface ParsedKeySignature {
  root: string;
  quality: ParsedKeyQuality | null;
  usedCompactMinorSuffix: boolean;
}

const NOTE_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const PITCH_CLASS_ROOT_VARIANTS: string[][] = [
  ['C', 'B#'],
  ['C#', 'Db'],
  ['D'],
  ['D#', 'Eb'],
  ['E', 'Fb'],
  ['F', 'E#'],
  ['F#', 'Gb'],
  ['G'],
  ['G#', 'Ab'],
  ['A'],
  ['A#', 'Bb'],
  ['B', 'Cb'],
];

const CANONICAL_MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const CANONICAL_MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;
const CANONICAL_NEUTRAL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const PRESERVED_TIED_ROOTS = new Set(['F#', 'Gb']);

function normalizeKeyForComparison(value?: string | null): string {
  return (
    value
      ?.trim()
      .replace(/♭/g, 'b')
      .replace(/♯/g, '#')
      .replace(/\s+/g, ' ')
      .toLowerCase() || ''
  );
}

function normalizeRootToken(root: string): string {
  const normalized = root.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  if (!normalized) {
    return normalized;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function parseKeySignature(keySignature?: string | null): ParsedKeySignature | null {
  const normalized = keySignature
    ?.trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  const spacedMatch = normalized.match(/^([A-G](?:#|b)?)(?:\s+(major|minor))?$/i);
  if (spacedMatch) {
    return {
      root: normalizeRootToken(spacedMatch[1]),
      quality: (spacedMatch[2]?.toLowerCase() as ParsedKeyQuality | undefined) ?? null,
      usedCompactMinorSuffix: false,
    };
  }

  const compactMinorMatch = normalized.match(/^([A-G](?:#|b)?)m$/i);
  if (compactMinorMatch) {
    return {
      root: normalizeRootToken(compactMinorMatch[1]),
      quality: 'minor',
      usedCompactMinorSuffix: true,
    };
  }

  return null;
}

export function getKeyPitchClass(root: string): number | null {
  const normalizedRoot = normalizeRootToken(root);
  return NOTE_TO_PITCH_CLASS[normalizedRoot] ?? null;
}

export function formatKeySignature(
  root: string,
  quality: ParsedKeyQuality | null,
  options?: { preserveCompactMinor?: boolean },
): string {
  if (quality === 'minor') {
    return options?.preserveCompactMinor ? `${root}m` : `${root} minor`;
  }

  if (quality === 'major') {
    return `${root} major`;
  }

  return root;
}

export function canonicalizeKeyRoot(
  root: string,
  quality: ParsedKeyQuality | null = null,
): string | null {
  const normalizedRoot = normalizeRootToken(root);
  const pitchClass = getKeyPitchClass(normalizedRoot);

  if (pitchClass === null) {
    return null;
  }

  if (pitchClass === 6 && PRESERVED_TIED_ROOTS.has(normalizedRoot)) {
    return normalizedRoot;
  }

  if (quality === 'major') {
    return CANONICAL_MAJOR_ROOTS[pitchClass];
  }

  if (quality === 'minor') {
    return CANONICAL_MINOR_ROOTS[pitchClass];
  }

  return CANONICAL_NEUTRAL_ROOTS[pitchClass];
}

export function canonicalizeKeySignature(keySignature?: string | null): string | null {
  const parsed = parseKeySignature(keySignature);
  if (!parsed) {
    return keySignature?.trim() || null;
  }

  const canonicalRoot = canonicalizeKeyRoot(parsed.root, parsed.quality) ?? parsed.root;
  return formatKeySignature(canonicalRoot, parsed.quality, {
    preserveCompactMinor: parsed.usedCompactMinorSuffix,
  });
}

export function buildSearchableKeys(keySignature?: string | null): string[] {
  const normalized = normalizeKeyForComparison(keySignature);
  if (!normalized) return [];

  const parsed = parseKeySignature(normalized);
  if (!parsed) return [normalized];

  const pitchClass = getKeyPitchClass(parsed.root);
  if (pitchClass === null) {
    return [normalized];
  }

  const variants = PITCH_CLASS_ROOT_VARIANTS[pitchClass] ?? [parsed.root];
  const normalizedRoot = parsed.root.toLowerCase();
  const orderedRoots = [
    normalizedRoot,
    ...variants
      .map((variant) => variant.toLowerCase())
      .filter((variant) => variant !== normalizedRoot),
  ];

  return Array.from(
    new Set(
      orderedRoots.map((rootVariant) => (
        parsed.quality ? `${rootVariant} ${parsed.quality}` : rootVariant
      )),
    ),
  );
}
