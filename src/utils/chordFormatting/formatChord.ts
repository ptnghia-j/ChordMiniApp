/**
 * Utility functions for formatting chord names with proper musical notation
 * Following industry-standard conventions used in professional music notation software
 * Enhanced with ChordGrid-specific formatting functions
 */

import { getBassNoteFromInversion, translateScaleDegreeInversion } from './inversions';

// Inline SVG content for quarter rest symbols (optimized to prevent loading delays and flickering)
const QUARTER_REST_SVG_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" style="width: 100%; height: 100%;">
  <path d="M64.803,74.67c-0.98-1.278-7.545-9.942-7.901-10.349c-13.58-17.867-7.955-15.804,4.359-30.901c0,0-19.013-26.224-19.694-27.125c-0.681-0.901-0.86-1.063-1.348-0.708c-0.488,0.354,0.029-0.042-0.689,0.5c-0.718,0.542-0.59,0.445,0,1.25c15.479,21.868,0.753,31.257-3.728,35.5c5.457,6.805,14.635,18.344,17.25,21.708c-17.729-7.792-28.104,16.146-2.542,30.042c1.458-0.667,0,0,1.458-0.667C42.261,84.691,39.846,67.136,64.803,74.67z"/>
</svg>`;

const QUARTER_REST_SVG_DARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" style="width: 100%; height: 100%;">
  <path fill="#ffffff" d="M64.803,74.67c-0.98-1.278-7.545-9.942-7.901-10.349c-13.58-17.867-7.955-15.804,4.359-30.901c0,0-19.013-26.224-19.694-27.125c-0.681-0.901-0.86-1.063-1.348-0.708c-0.488,0.354,0.029-0.042-0.689,0.5c-0.718,0.542-0.59,0.445,0,1.25c15.479,21.868,0.753,31.257-3.728,35.5c5.457,6.805,14.635,18.344,17.25,21.708c-17.729-7.792-28.104,16.146-2.542,30.042c1.458-0.667,0,0,1.458-0.667C42.261,84.691,39.846,67.136,64.803,74.67z"/>
</svg>`;

// Memoized rest symbol cache to prevent re-rendering and improve performance
const restSymbolCache = new Map<string, string>();

/**
 * Get optimized quarter rest symbol (memoized to prevent re-rendering)
 * @param isDarkMode Whether dark mode is active
 * @returns Cached HTML string for the rest symbol
 */
function getQuarterRestSymbol(isDarkMode: boolean): string {
  const cacheKey = isDarkMode ? 'dark' : 'light';

  if (!restSymbolCache.has(cacheKey)) {
    const svgContent = isDarkMode ? QUARTER_REST_SVG_DARK : QUARTER_REST_SVG_LIGHT;
    const html = `<span style="display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em;" class="chord-rest-symbol quarter-rest-responsive">
      ${svgContent}
    </span>`;
    restSymbolCache.set(cacheKey, html);
  }

  return restSymbolCache.get(cacheKey)!;
}

/**
 * Formats chord names with proper musical notation and standardized chord suffixes
 *
 * @param chordName The chord name to format (e.g., "C#:min", "Bb:maj", "C#:maj/3")
 * @param isDarkMode Whether dark mode is active (for theme-aware SVG selection)
 * @returns Formatted chord name with proper musical symbols and professional notation
 */
export function formatChordWithMusicalSymbols(chordName: string, isDarkMode: boolean = false, accidentalPreference?: 'sharp' | 'flat'): string {
  if (!chordName) return chordName;

  const ACCIDENTAL_STYLE = 'font-weight: 700; display:inline-block; text-shadow: 0.018em 0 0 currentColor, -0.018em 0 0 currentColor;';
  const MAJOR_TRIANGLE_STYLE = 'font-weight: 500; position:relative; top:-0.03em;';
  const SUPERSCRIPT_STYLE = 'font-weight: inherit; font-size: 0.7em; line-height: 1; vertical-align: super;';
  const PAREN_GROUP_STYLE = 'display: inline-flex; align-items: flex-start; font-weight: inherit; font-size: 0.7em; line-height: 1; position: relative; top: -0.42em; white-space: nowrap;';
  const stylizeAccidentals = (text: string) => text.replace(/([♭♯𝄫𝄪])/gu, `<span style="${ACCIDENTAL_STYLE}">$1</span>`);



  // Handle special cases
  if (chordName === 'N' || chordName === 'N/C' || chordName === 'N.C.' || chordName === 'X') {
    // Use optimized inline SVG quarter rest symbol for "No Chord" notation
    // if (chordName === 'N/C' || chordName === 'N.C.') {
    if (chordName === 'N/C' || chordName === 'N' || chordName === 'N.C.') {
      return getQuarterRestSymbol(isDarkMode);
    }

    return chordName;
  }

  const ROOT_PATTERN = /^([A-G])((?:##|bb|#|b|♯|♭|𝄪|𝄫)?)/;

  const normalizeQualityForDisplay = (value: string) => {
    if (!value) return value;

    let normalizedQuality = value.trim();

    // Normalize symbolic qualities into the textual forms the formatter already knows.
    normalizedQuality = normalizedQuality
      .replace(/°/g, 'dim')
      .replace(/\+/g, 'aug');

    return normalizedQuality;
  };

  // Parse chord name - handle both colon and non-colon formats
  let root = '';
  let quality = '';
  let inversion = '';
  let bassNote = '';

  // First check for inversion (slash notation)
  if (chordName.includes('/')) {
    const slashParts = chordName.split('/');
    const chordPart = slashParts[0];
    inversion = slashParts[1];

    // Now parse the chord part (before the slash)
    if (chordPart.includes(':')) {
      // Colon format: "C#:min" or "Bb:maj7"
      const colonParts = chordPart.split(':');
      root = colonParts[0];
      quality = colonParts[1];
    } else {
      // Non-colon format: "C#m", "B7", "F#dim", "D##dim", etc.
      const rootMatch = chordPart.match(ROOT_PATTERN);
      if (rootMatch) {
        root = `${rootMatch[1]}${rootMatch[2] || ''}`;
        quality = chordPart.substring(root.length);
      } else {
        root = chordPart;
        quality = '';
      }
    }
  } else {
    // No inversion - parse chord normally
    if (chordName.includes(':')) {
      // Colon format: "C#:min" or "Bb:maj7"
      const colonParts = chordName.split(':');
      root = colonParts[0];
      quality = colonParts[1];
    } else {
      // Non-colon format: "C#m", "B7", "F#dim", "D##dim", etc.
      const rootMatch = chordName.match(ROOT_PATTERN);
      if (rootMatch) {
        root = `${rootMatch[1]}${rootMatch[2] || ''}`;
        quality = chordName.substring(root.length);
      } else {
        root = chordName;
        quality = '';
      }
    }
  }

  quality = normalizeQualityForDisplay(quality);
  bassNote = bassNote ? bassNote.trim() : bassNote;

  // Normalize chord quality for consistent display
  // Convert "min" and "minor" to "m" for shorter, industry-standard notation
  if (quality === 'min' || quality === 'minor') {
    quality = 'm';
  } else if (quality.startsWith('min') && quality.length > 3 && quality !== 'minor') {
    // Handle complex minor qualities like "min7", "min9", etc.
    // Exclude "minor" to prevent it from becoming "mor"
    quality = 'm' + quality.substring(3);
  }

  // Apply global accidental preference to root if provided
  if (accidentalPreference) {
    if (accidentalPreference === 'flat' && root.includes('#')) {
      const sharpToFlat: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
      root = sharpToFlat[root] || root;
    } else if (accidentalPreference === 'sharp' && root.includes('b')) {
      const flatToSharp: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
      root = flatToSharp[root] || root;
    }
  }

  // Process inversion if present
  if (inversion) {

    // Check if inversion is a scale degree (numeric with optional accidental)
    const scaleDegreeMatcher = /^[b#]?\d+$/;
    if (scaleDegreeMatcher.test(inversion)) {
      // FIXED: For standard chord inversions, use chord tone intervals, not scale degree intervals
      // Support comprehensive range: /2, /b3, /3, /4, /5, /6, /b7, /7, /9, etc.
      if (inversion === '2' || inversion === '3' || inversion === '4' || inversion === '5' ||
          inversion === '6' || inversion === '7' || inversion === '9' ||
          inversion === 'b2' || inversion === 'b3' || inversion === 'b4' || inversion === 'b5' ||
          inversion === 'b6' || inversion === 'b7' || inversion === 'b9' ||
          inversion === '#2' || inversion === '#3' || inversion === '#4' || inversion === '#5' ||
          inversion === '#6' || inversion === '#7' || inversion === '#9') {
        // Use chord tone intervals for standard inversions
        bassNote = getBassNoteFromInversion(root, quality, inversion, accidentalPreference);
      } else {
        // Use scale degree translation for unusual inversions (like /8, /10, /11, /13)
        bassNote = translateScaleDegreeInversion(root, quality, inversion);
      }
    } else {
      // If it's already a note name, keep it
      bassNote = inversion;
    }
  }

  // Apply global accidental preference to bass note if provided
  if (accidentalPreference && bassNote) {
    if (accidentalPreference === 'flat' && bassNote.includes('#')) {
      const sharpToFlat: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
      bassNote = sharpToFlat[bassNote] || bassNote;
    } else if (accidentalPreference === 'sharp' && bassNote.includes('b')) {
      const flatToSharp: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
      bassNote = flatToSharp[bassNote] || bassNote;
    }
  }

  // Replace ASCII accidentals with proper Unicode symbols.
  // Handle double sharps (##) and double flats (bb) before single accidental replacement.
  root = root.replace(/##/g, '𝄪').replace(/bb/g, '𝄫').replace(/#/g, '♯');
  if (bassNote) {
    bassNote = bassNote.replace(/##/g, '𝄪').replace(/bb/g, '𝄫').replace(/#/g, '♯');
  }

  // Replace flat (b) with proper Unicode flat symbol (♭) in root and bass notes
  // More precise pattern: only replace 'b' when it's part of a note name (after A-G)
  root = root.replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
  if (bassNote) {
    bassNote = bassNote.replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
  }

  root = stylizeAccidentals(root);
  if (bassNote) {
    bassNote = stylizeAccidentals(bassNote);
  }

  // Handle existing ° symbols in the quality string (from AI corrections)
  if (quality.includes('°')) {
    // If ° symbol is already present, format it properly and remove any 'dim' text
    quality = quality.replace(/dim/g, ''); // Remove 'dim' text if present with °
    quality = quality.replace(/°/g, '<span style="font-weight: inherit; position:relative;top:-1px">°</span>');
  }

  if (quality.includes('Δ')) {
    quality = quality.replace(/Δ/g, `<span style="${MAJOR_TRIANGLE_STYLE}">Δ</span>`);
  }

  // Apply professional chord quality notation with uniform font weight
  // All parts of chord labels use regular font weight for cleaner appearance
  const formattedRoot = `<span style="font-weight: inherit;">${root}</span>`;

  if (quality === 'maj') {
    // Major chords don't need a suffix in standard notation
    quality = '';
  } else if (quality === 'min' || quality === 'minor') {
    // Use 'm' instead of 'min'/'minor' for minor chords (industry standard)
    quality = '<span style="font-weight: inherit;">m</span>';
  } else if (quality.includes('sus')) {
    // FIXED: Handle sus chords with consistent formatting to prevent layout shifts
    // Process sus with parentheses first to avoid conflicts
    if (quality.includes('sus') && quality.includes('(')) {
      // Handle "sus4(b7)" -> "sus⁴⁽♭⁷⁾" with consistent superscript sizing
      quality = quality.replace(/sus(\d+)(?=\()/g, `<span style="font-weight: inherit;">sus</span><sup style="${SUPERSCRIPT_STYLE}">$1</sup>`);
      // Handle "sus(b7)" -> "sus⁽♭⁷⁾"
      quality = quality.replace(/sus(?=\()/g, '<span style="font-weight: inherit;">sus</span>');
    } else {
      // Handle simple sus chords: "sus4" -> "sus⁴"
      quality = quality.replace(/sus(\d+)/g, `<span style="font-weight: inherit;">sus</span><sup style="${SUPERSCRIPT_STYLE}">$1</sup>`);
    }
  } else if (quality === 'm7b5' || quality === 'min7b5' || quality.includes('half-dim') || quality.includes('halfdim')) {
    // FIXED: Half-diminished 7th chords with consistent superscript sizing
    quality = `<span style="font-weight: inherit; position:relative;top:-1px">ø</span><sup style="${SUPERSCRIPT_STYLE}">7</sup>`;
  } else if (quality.includes('dim') && !quality.includes('°')) {
    // Use standard diminished symbol (°) for better readability
    // Only replace 'dim' if ° symbol is not already present
    quality = quality.replace('dim', '<span style="font-weight: inherit; position:relative;top:-1px">°</span>');
  } else if (quality.includes('aug')) {
    // Use standard augmented symbol (+) for better readability
    quality = quality.replace('aug', '<span style="font-weight: inherit; position:relative">+</span>');
  } else if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    // Handle extensions with proper formatting

    // FIXED: Handle complex cases with consistent superscript sizing
    if (quality.startsWith('min')) {
      quality = '<span style="font-weight: inherit;">m</span>' + quality.substring(3).replace(/(\d+)/g, `<sup style="${SUPERSCRIPT_STYLE}">$1</sup>`);
    } else if (quality.startsWith('maj')) {
      // Use triangle (Δ) for major 7th chords - industry standard
      if (quality === 'maj7') {
        quality = `<span style="${MAJOR_TRIANGLE_STYLE}">Δ</span><sup style="${SUPERSCRIPT_STYLE}">7</sup>`;
      } else {
        quality = '<span style="font-weight: inherit;">maj</span>' + quality.substring(3).replace(/(\d+)/g, `<sup style="${SUPERSCRIPT_STYLE}">$1</sup>`);
      }
    } else {
      // Make numeric extensions superscript with consistent sizing
      quality = '<span style="font-weight: inherit;">' + quality.replace(/(\d+)/g, `</span><sup style="${SUPERSCRIPT_STYLE}">$1</sup><span style="font-weight: inherit;">`) + '</span>';
      // Clean up empty spans
      quality = quality.replace(/<span style="font-weight: inherit;"><\/span>/g, '');
    }
  } else if (quality) {
    // Wrap any other quality in lighter weight span
    quality = `<span style="font-weight: inherit;">${quality}</span>`;
  }

  // FIXED: Handle altered notes with consistent superscript sizing
  if (quality.includes('add')) {
    quality = quality.replace(/add(\d+)/g, `<span style="font-weight: inherit;">add</span><sup style="${SUPERSCRIPT_STYLE}">$1</sup>`);
  }

  // FIXED: Handle parentheses around chord extensions with consistent sizing and stable layout
  if (quality.includes('(') && quality.includes(')')) {
    // Handle flat extensions in parentheses as a positioned inline group so the parentheses align with the accidental+number
    quality = quality.replace(/\(b(\d+)\)/g, `<span style="${PAREN_GROUP_STYLE}">(<span style="${ACCIDENTAL_STYLE}">♭</span>$1)</span>`);
    // Handle sharp extensions in parentheses similarly
    quality = quality.replace(/\(#(\d+)\)/g, `<span style="${PAREN_GROUP_STYLE}">(<span style="${ACCIDENTAL_STYLE}">♯</span>$1)</span>`);
    // Handle numeric-only parenthesized extensions
    quality = quality.replace(/\((\d+)\)/g, `<span style="${PAREN_GROUP_STYLE}">($1)</span>`);
  }

  // FIXED: Handle non-parenthesized extensions with consistent sizing
  if (quality.includes('b5') || quality.includes('b7') || quality.includes('b9') || quality.includes('b13')) {
    quality = quality.replace(/b(\d+)/g, `<sup style="${SUPERSCRIPT_STYLE}"><span style="${ACCIDENTAL_STYLE}">♭</span>$1</sup>`);
  }

  if (quality.includes('#5') || quality.includes('#9') || quality.includes('#11')) {
    quality = quality.replace(/#(\d+)/g, `<sup style="${SUPERSCRIPT_STYLE}"><span style="${ACCIDENTAL_STYLE}">♯</span>$1</sup>`);
  }

  // Combine root, quality, and bass note with proper spacing
  let formattedChord = quality ? `${formattedRoot}${quality}` : formattedRoot;
  if (bassNote) {
    formattedChord += `<span style="font-weight: inherit; margin:0 0.1em">/</span><span style="font-weight: inherit;">${bassNote}</span>`;
  }

  return formattedChord;
}
