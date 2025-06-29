/**
 * Utility functions for formatting chord names with proper musical notation
 * Following industry-standard conventions used in professional music notation software
 */

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
export function formatChordWithMusicalSymbols(chordName: string, isDarkMode: boolean = false): string {
  if (!chordName) return chordName;

  // Handle special cases
  if (chordName === 'N' || chordName === 'N/C' || chordName === 'N.C.' || chordName === 'X') {
    // Use optimized inline SVG quarter rest symbol for "No Chord" notation
    if (chordName === 'N/C' || chordName === 'N.C.') {
      return getQuarterRestSymbol(isDarkMode);
    }
    return chordName;
  }

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
      // Non-colon format: "C#m", "B7", "F#dim", etc.
      // Extract root note (handle sharps and flats)
      const rootMatch = chordPart.match(/^([A-G][#b]?)/);
      if (rootMatch) {
        root = rootMatch[1];
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
      // Non-colon format: "C#m", "B7", "F#dim", etc.
      // Extract root note (handle sharps and flats)
      const rootMatch = chordName.match(/^([A-G][#b]?)/);
      if (rootMatch) {
        root = rootMatch[1];
        quality = chordName.substring(root.length);
      } else {
        root = chordName;
        quality = '';
      }
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
        bassNote = getBassNoteFromInversion(root, quality, inversion);
      } else {
        // Use scale degree translation for unusual inversions (like /8, /10, /11, /13)
        bassNote = translateScaleDegreeInversion(root, quality, inversion);
      }
    } else {
      // If it's already a note name, keep it
      bassNote = inversion;
    }
  }

  // Replace sharp (#) with proper Unicode sharp symbol (♯)
  root = root.replace(/#/g, '♯');
  if (bassNote) {
    bassNote = bassNote.replace(/#/g, '♯');
  }

  // Replace flat (b) with proper Unicode flat symbol (♭)
  root = root.replace(/b(?![a-zA-Z]{2,})/g, '♭');
  if (bassNote) {
    bassNote = bassNote.replace(/b(?![a-zA-Z]{2,})/g, '♭');
  }

  // Apply professional chord quality notation with uniform font weight
  // All parts of chord labels use regular font weight for cleaner appearance
  const formattedRoot = `<span style="font-weight: 400;">${root}</span>`;

  if (quality === 'maj') {
    // Major chords don't need a suffix in standard notation
    quality = '';
  } else if (quality === 'min') {
    // Use 'm' instead of 'min' for minor chords (industry standard)
    quality = '<span style="font-weight: 400;">m</span>';
  } else if (quality.includes('sus')) {
    // Format suspension with proper superscript - entire "sus" suffix should be in superscript
    quality = quality.replace(/sus(\d)/, '<sup style="font-weight: 300; font-size: 0.75em;">sus$1</sup>');
  } else if (quality === 'm7b5' || quality === 'min7b5' || quality.includes('half-dim') || quality.includes('halfdim')) {
    // Half-diminished 7th chords: use slashed circle (ø) with superscript 7
    quality = '<span style="font-weight: 400; position:relative;top:-1px">ø</span><sup style="font-weight: 300; font-size: 0.75em;">7</sup>';
  } else if (quality.includes('dim')) {
    // Use standard diminished symbol (°) for better readability
    quality = quality.replace('dim', '<span style="font-weight: 400; position:relative;top:-1px">°</span>');
  } else if (quality.includes('aug')) {
    // Use standard augmented symbol (+) for better readability
    quality = quality.replace('aug', '<span style="font-weight: 400; position:relative">+</span>');
  } else if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    // Handle extensions with proper formatting

    // First handle complex cases with both quality and extension
    if (quality.startsWith('min')) {
      quality = '<span style="font-weight: 400;">m</span>' + quality.substring(3).replace(/(\d+)/g, '<sup style="font-weight: 300; font-size: 0.75em;">$1</sup>');
    } else if (quality.startsWith('maj')) {
      // Use triangle (Δ) for major 7th chords - industry standard
      if (quality === 'maj7') {
        quality = '<span style="font-weight: 400; position:relative;top:-1px">Δ</span><sup style="font-weight: 300; font-size: 0.75em;">7</sup>';
      } else {
        quality = '<span style="font-weight: 400;">maj</span>' + quality.substring(3).replace(/(\d+)/g, '<sup style="font-weight: 300; font-size: 0.75em;">$1</sup>');
      }
    } else {
      // Make numeric extensions superscript with lighter weight
      quality = '<span style="font-weight: 400;">' + quality.replace(/(\d+)/g, '</span><sup style="font-weight: 300; font-size: 0.75em;">$1</sup><span style="font-weight: 400;">') + '</span>';
      // Clean up empty spans
      quality = quality.replace(/<span style="font-weight: 400;"><\/span>/g, '');
    }
  } else if (quality) {
    // Wrap any other quality in lighter weight span
    quality = `<span style="font-weight: 400;">${quality}</span>`;
  }

  // Handle altered notes (add, b5, #9, etc.)
  if (quality.includes('add')) {
    quality = quality.replace(/add(\d+)/g, '<span style="font-weight: 400;">add</span><sup style="font-weight: 300; font-size: 0.75em;">$1</sup>');
  }

  if (quality.includes('b5') || quality.includes('b9') || quality.includes('b13')) {
    quality = quality.replace(/b(\d+)/g, '<sup style="font-weight: 300; font-size: 0.75em;">♭$1</sup>');
  }

  if (quality.includes('#5') || quality.includes('#9') || quality.includes('#11')) {
    quality = quality.replace(/#(\d+)/g, '<sup style="font-weight: 300; font-size: 0.75em;">♯$1</sup>');
  }

  // Combine root, quality, and bass note with proper spacing
  let formattedChord = quality ? `${formattedRoot}${quality}` : formattedRoot;
  if (bassNote) {
    formattedChord += `<span style="font-weight: 400; margin:0 0.1em">/</span><span style="font-weight: 400;">${bassNote}</span>`;
  }

  return formattedChord;
}

/**
 * Translates scale degree inversions to proper note names
 * Handles unusual inversions like F/2 -> F/E, Am/b7 -> Am/G
 *
 * @param root The root note of the chord
 * @param quality The quality of the chord (maj, min, etc.)
 * @param inversion The inversion notation (2, b7, #4, etc.)
 * @returns The bass note as a string
 */
function translateScaleDegreeInversion(root: string, quality: string, inversion: string): string {
  // Define chromatic scale starting from C
  const chromaticScale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const chromaticScaleFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Determine if we should use flats or sharps based on the root note
  const usesFlats = root.includes('b');
  const noteArray = usesFlats ? chromaticScaleFlats : chromaticScale;

  // Find root note index
  let rootIndex = -1;
  for (let i = 0; i < noteArray.length; i++) {
    if (noteArray[i] === root) {
      rootIndex = i;
      break;
    }
  }

  if (rootIndex === -1) return inversion; // Fallback if root not found

  // Determine if chord is minor for scale degree calculation
  // FIXED: Prevent 'maj' from being detected as minor due to startsWith('m')
  const isMinor = quality === 'min' || quality === 'm' ||
                  (quality.startsWith('min') && quality !== 'maj') ||
                  (quality.startsWith('m') && !quality.startsWith('maj'));

  // Parse the inversion to handle accidentals
  let scaleDegree = inversion;
  let accidental = 0; // 0 = natural, -1 = flat, 1 = sharp

  if (inversion.startsWith('b')) {
    accidental = -1;
    scaleDegree = inversion.substring(1);
  } else if (inversion.startsWith('#')) {
    accidental = 1;
    scaleDegree = inversion.substring(1);
  }

  // Convert scale degree to semitone interval
  let semitones = 0;
  const degree = parseInt(scaleDegree);

  if (isNaN(degree)) return inversion; // Not a numeric scale degree

  // Calculate semitones based on scale degree and chord quality
  if (isMinor) {
    // Natural minor scale intervals: 0, 2, 3, 5, 7, 8, 10
    const minorIntervals = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22];
    if (degree >= 1 && degree <= minorIntervals.length) {
      semitones = minorIntervals[degree - 1];
    }
  } else {
    // Major scale intervals: 0, 2, 4, 5, 7, 9, 11
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
    if (degree >= 1 && degree <= majorIntervals.length) {
      semitones = majorIntervals[degree - 1];
    }
  }

  // Apply accidental
  semitones += accidental;

  // Calculate the bass note
  const bassIndex = (rootIndex + semitones) % 12;
  return noteArray[bassIndex];
}

/**
 * Converts a numeric inversion to the actual bass note
 *
 * @param root The root note of the chord
 * @param quality The quality of the chord (maj, min, etc.)
 * @param inversion The inversion number (3, 5, 7, etc.)
 * @returns The bass note as a string
 */
export function getBassNoteFromInversion(root: string, quality: string, inversion: string): string {
  // Define the notes in order
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesWithFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Determine if the root uses sharps or flats
  const usesFlats = root.includes('b');

  // For minor chords, prefer flat notation for the third (e.g., Em/G instead of Em/F#)
  // FIXED: Prevent 'maj' from being detected as minor due to startsWith('m')
  const isMinor = quality === 'min' || quality === 'm' ||
                  (quality.startsWith('min') && quality !== 'maj') ||
                  (quality.startsWith('m') && !quality.startsWith('maj'));
  const preferFlatsForMinor = isMinor && (inversion === '3' || inversion === 'b3');

  // DEBUG: Log input parameters and chord quality detection
  // console.log(`🔍 getBassNoteFromInversion DEBUG:`, {
  //   root,
  //   quality,
  //   inversion,
  //   isMinor,
  //   preferFlatsForMinor,
  //   usesFlats
  // });

  // For flat inversions, prefer flat notation (e.g., C/b7 -> C/Bb instead of C/A#)
  const isFlatInversion = inversion.startsWith('b');

  // Choose the appropriate note array for the root note lookup
  const rootNoteArray = usesFlats ? notesWithFlats : notes;

  // Find the root note index
  let rootIndex = -1;
  for (let i = 0; i < rootNoteArray.length; i++) {
    if (rootNoteArray[i] === root) {
      rootIndex = i;
      break;
    }
  }

  if (rootIndex === -1) return inversion; // Fallback if root not found

  // Choose the note array for the bass note result based on inversion type
  const bassNoteArray = (usesFlats || preferFlatsForMinor || isFlatInversion) ? notesWithFlats : notes;

  // Parse the inversion to handle different types of inversions
  let inversionNumber = inversion;
  let intervalAdjustment = 0;

  // Handle accidentals
  if (inversion.startsWith('b')) {
    inversionNumber = inversion.substring(1);
    // Only apply flat adjustment for non-minor chords or for degrees other than 3
    if (!(isMinor && inversionNumber === '3')) {
      intervalAdjustment = -1; // Flat: lower by one semitone
    }
  } else if (inversion.startsWith('#')) {
    inversionNumber = inversion.substring(1);
    intervalAdjustment = 1; // Sharp: raise by one semitone
  }

  // Calculate the bass note directly using standard interval theory
  let bassSemitones = 0;
  const degree = parseInt(inversionNumber);

  if (isNaN(degree)) return inversion; // Not a numeric inversion

  // Use standard interval calculations regardless of chord quality
  // This ensures consistent bass note calculation for all chord types
  switch (degree) {
    case 2:
      bassSemitones = 2; // Major second
      break;
    case 3:
      // For minor chords, the third is already minor (3 semitones)
      // For major chords, the third is major (4 semitones)
      bassSemitones = isMinor ? 3 : 4;
      // console.log(`🔍 Case 3: isMinor=${isMinor}, bassSemitones=${bassSemitones}`);
      break;
    case 4:
      bassSemitones = 5; // Perfect fourth
      break;
    case 5:
      bassSemitones = 7; // Perfect fifth
      break;
    case 6:
      bassSemitones = 9; // Major sixth
      break;
    case 7:
      // FIXED: Always start with natural 7th (major 7th = 11 semitones)
      // Then let the accidental adjustment handle flat/sharp modifications
      bassSemitones = 11; // Natural 7th (major seventh)
      break;
    case 9:
      bassSemitones = 14; // Major ninth (octave + major second)
      break;
    default:
      return inversion; // Unsupported inversion
  }

  // Apply accidental adjustment
  bassSemitones += intervalAdjustment;

  // Calculate the bass note index
  const bassIndex = (rootIndex + bassSemitones) % 12;
  const result = bassNoteArray[bassIndex];

  // DEBUG: Log final calculation
  // console.log(`🔍 Final calculation:`, {
  //   rootIndex,
  //   bassSemitones,
  //   intervalAdjustment,
  //   bassIndex,
  //   result,
  //   bassNoteArray: bassNoteArray === notes ? 'sharps' : 'flats'
  // });

  return result;
}

/**
 * Provides consistent font size and styling for chord labels
 * Uses a standardized approach rather than responsive sizing to ensure consistency
 *
 * @param chordName The chord name to display
 * @returns CSS class for the chord label
 */
export function getResponsiveChordFontSize(): string {
  // Use uniform font weight for cleaner appearance, matching commercial products
  // All chord parts use regular weight for consistent styling
  return "font-normal text-gray-800 dark:text-gray-200 text-base whitespace-normal transition-colors duration-300";
}

/**
 * Generates professional inline styles for chord labels
 * Based on industry-standard music notation software like Chordify
 *
 * @param chordName The chord name to display
 * @returns Object with CSS styles for professional chord display
 */
export function getChordLabelStyles(): React.CSSProperties {
  return {
    padding: '0.125rem 0.125rem 0.125rem 0.0625rem', // Minimal left padding (1px), small right padding
    lineHeight: '1.2', // Slightly tighter line height
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start', // Left-align like commercial products
    alignItems: 'center',
    minHeight: '1.5rem', // Reduced min height
    minWidth: '2rem', // Reduced min width
    fontFamily: '"Helvetica Neue", "Arial", sans-serif', // Use cleaner, more modern font like Chordify
    fontWeight: '400', // Slightly lighter base weight for better contrast with bold roots
    letterSpacing: '0.005em', // Minimal letter spacing for cleaner look
    fontSize: '0.95rem', // Slightly smaller for better proportion
    overflow: 'visible', // Prevent truncation
    textOverflow: 'clip', // Don't use ellipsis
    hyphens: 'none', // Prevent hyphenation
    wordBreak: 'keep-all', // Prevent breaking within chord names
    // Remove text shadow for cleaner appearance like commercial apps
  };
}

/**
 * Generates container styles for chord labels in the chord grid
 * Ensures consistent sizing and prevents layout shifts
 *
 * @returns Object with CSS styles for the chord container
 */
export function getChordContainerStyles(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'flex-start', // Left-align container to match label alignment
    alignItems: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow content to overflow for complex chord names
    padding: '0.0625rem' // Minimal padding for very tight layout
  };
}
