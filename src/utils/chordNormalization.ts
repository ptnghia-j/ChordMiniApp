/**
 * Normalize chord labels to their canonical display form for deduplication.
 *
 * Different raw chord strings can render identically in the UI. For example,
 * "B:maj" and "B" both display as "B" (major quality is hidden). Without
 * normalization, dedup by raw string fails and the user sees "B B".
 *
 * This function applies the same quality transformations that
 * `formatChordWithMusicalSymbols` would, but returns a plain string suitable
 * for equality comparison.
 */
export function normalizeChordForDedup(chord: string): string {
  if (!chord) return chord;

  // Split off bass note (slash chord): B:maj/3 → mainPart = "B:maj", bassPart = "/3"
  let mainPart: string;
  let bassPart = '';

  const slashIdx = chord.indexOf('/');
  if (slashIdx >= 0) {
    mainPart = chord.substring(0, slashIdx);
    bassPart = chord.substring(slashIdx); // includes the '/'
  } else {
    mainPart = chord;
  }

  // Handle colon format (Harte notation): B:maj → B, B:major → B
  if (mainPart.includes(':')) {
    const colonIdx = mainPart.indexOf(':');
    const quality = mainPart.substring(colonIdx + 1);
    if (quality === 'maj' || quality === 'major') {
      mainPart = mainPart.substring(0, colonIdx);
    }
  } else {
    // Handle non-colon format: Bmaj → B, Bmajor → B
    const rootMatch = mainPart.match(/^([A-G][#b]?)/);
    if (rootMatch) {
      const root = rootMatch[1];
      const quality = mainPart.substring(root.length);
      if (quality === 'maj' || quality === 'major') {
        mainPart = root;
      }
    }
  }

  // Strip trailing colon if any: B: → B
  mainPart = mainPart.replace(/:$/, '');

  return mainPart + bassPart;
}
