const ENHARMONIC_ROOTS: Record<string, string[]> = {
  'c#': ['db'],
  db: ['c#'],
  'd#': ['eb'],
  eb: ['d#'],
  'f#': ['gb'],
  gb: ['f#'],
  'g#': ['ab'],
  ab: ['g#'],
  'a#': ['bb'],
  bb: ['a#'],
};

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

export function buildSearchableKeys(keySignature?: string | null): string[] {
  const normalized = normalizeKeyForComparison(keySignature);
  if (!normalized) return [];

  const match = normalized.match(/^([a-g](?:#|b)?)(?:\s+(major|minor))?$/i);
  if (!match) return [normalized];

  const [, root, quality] = match;
  const roots = [root, ...(ENHARMONIC_ROOTS[root] || [])];

  return Array.from(
    new Set(
      roots.map((rootVariant) => (
        quality ? `${rootVariant} ${quality.toLowerCase()}` : rootVariant
      ))
    )
  );
}
