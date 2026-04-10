/**
 * Translates scale degree inversions to proper note names
 * Handles unusual inversions like F/2 -> F/E, Am/b7 -> Am/G
 *
 * @param root The root note of the chord
 * @param quality The quality of the chord (maj, min, etc.)
 * @param inversion The inversion notation (2, b7, #4, etc.)
 * @returns The bass note as a string
 */
export function translateScaleDegreeInversion(root: string, quality: string, inversion: string): string {
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
  const isMinor = quality === 'min' || quality === 'minor' || quality === 'm' ||
                  (quality.startsWith('min') && quality !== 'maj' && quality !== 'minor') ||
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
 * Enhanced enharmonic mapping for proper theoretical spelling
 * Includes double sharps (𝄪) and double flats (𝄫) for complex scenarios
 */
const ENHARMONIC_EQUIVALENTS: Record<string, string[]> = {
  'C': ['C', 'B#', 'Dbb'],
  'C#': ['C#', 'Db', 'B##'],
  'D': ['D', 'C##', 'Ebb'],
  'D#': ['D#', 'Eb', 'Fbb'],
  'E': ['E', 'D##', 'Fb'],
  'F': ['F', 'E#', 'Gbb'],
  'F#': ['F#', 'Gb', 'E##'],
  'G': ['G', 'F##', 'Abb'],
  'G#': ['G#', 'Ab'],
  'A': ['A', 'G##', 'Bbb'],
  'A#': ['A#', 'Bb', 'Cbb'],
  'B': ['B', 'A##', 'Cb']
};

/**
 * Get the most appropriate enharmonic spelling for a note in a given key context
 * @param note The note to respell
 * @param keyContext The key signature context (e.g., 'C#', 'Db', 'F#')
 * @returns The best enharmonic spelling
 */
export function getEnharmonicSpelling(note: string, keyContext: string): string {
  // Normalize input note
  const normalizedNote = note.replace(/♯/g, '#').replace(/♭/g, 'b');

  // Find all enharmonic equivalents
  const equivalents = Object.values(ENHARMONIC_EQUIVALENTS).find(group =>
    group.some(variant => variant === normalizedNote)
  );

  if (!equivalents) return note;

  // Determine key signature preference
  const keyUsesFlats = keyContext.includes('b') || keyContext.includes('♭');
  const keyUseSharps = keyContext.includes('#') || keyContext.includes('♯');

  // FIXED: Prefer natural notes over double accidentals for chord inversions
  // First check if there's a natural variant (no accidentals)
  const naturalVariant = equivalents.find(variant => !variant.includes('#') && !variant.includes('b'));
  if (naturalVariant) return naturalVariant;

  // Only use accidental variants if no natural variant exists
  // Prefer spelling that matches key signature
  if (keyUsesFlats) {
    const flatVariant = equivalents.find(variant => variant.includes('b') && !variant.includes('bb'));
    if (flatVariant) return flatVariant.replace(/#/g, '♯').replace(/b/g, '♭');
  }

  if (keyUseSharps) {
    const sharpVariant = equivalents.find(variant => variant.includes('#') && !variant.includes('##'));
    if (sharpVariant) return sharpVariant.replace(/#/g, '♯').replace(/b/g, '♭');
  }

  // Return first equivalent with Unicode symbols (fallback)
  return equivalents[0].replace(/#/g, '♯').replace(/b/g, '♭');
}

/**
 * Converts a numeric inversion to the actual bass note with proper enharmonic spelling
 *
 * @param root The root note of the chord
 * @param quality The quality of the chord (maj, min, etc.)
 * @param inversion The inversion number (3, 5, 7, etc.)
 * @returns The bass note as a string with proper enharmonic spelling
 */
export function getBassNoteFromInversion(root: string, quality: string, inversion: string, accidentalPreference?: 'sharp' | 'flat'): string {
  // Define the notes in order
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesWithFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Determine if the root uses sharps or flats
  const usesFlats = root.includes('b') || root.includes('♭');

  // Determine if chord is minor for special case handling
  // FIXED: Prevent 'maj' from being detected as minor due to startsWith('m')
  const isMinor = quality === 'min' || quality === 'minor' || quality === 'm' ||
                  (quality.startsWith('min') && quality !== 'maj' && quality !== 'minor') ||
                  (quality.startsWith('m') && !quality.startsWith('maj'));

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

  // Normalize root note for lookup (handle Unicode symbols)
  const normalizedRoot = root.replace(/♯/g, '#').replace(/♭/g, 'b');

  // FIXED: Handle rare enharmonic equivalents (Fb = E, Cb = B, E# = F, B# = C)
  const enharmonicRootMap: Record<string, string> = {
    'Fb': 'E',
    'Cb': 'B',
    'E#': 'F',
    'B#': 'C'
  };

  // Map rare enharmonic roots to their standard equivalents for calculation
  const calculationRoot = enharmonicRootMap[normalizedRoot] || normalizedRoot;

  // FIXED: Use consistent note array for both root lookup and bass note calculation
  // to prevent enharmonic spelling errors like G#m/b7 -> G#m/Gb instead of G#m/F#

  // Determine the primary note array based on root note's accidental preference
  // This ensures consistent enharmonic spelling throughout the chord
  const preferSharps = accidentalPreference === 'sharp';
  const preferFlats = accidentalPreference === 'flat';
  const rootUsesSharps = calculationRoot.includes('#');
  // For flat inversions (b7, b3, etc.), prefer flat spellings to match the notation
  // For root F (key signature has Bb), prefer flats when no explicit preference is set
  const primaryNoteArray = preferFlats ? notesWithFlats
    : preferSharps ? notes
    : rootUsesSharps ? notes
    : isFlatInversion ? notesWithFlats
    : (usesFlats || calculationRoot === 'F') ? notesWithFlats
    : notes;

  // Find the root note index in the primary array using the calculation root
  let rootIndex = -1;
  for (let i = 0; i < primaryNoteArray.length; i++) {
    if (primaryNoteArray[i] === calculationRoot) {
      rootIndex = i;
      break;
    }
  }

  if (rootIndex === -1) return inversion; // Fallback if root not found

  // Use the same primary array for bass note calculation to maintain consistency
  // Special case: only use flats for bass note if the root itself uses flats
  // This prevents sharp roots from producing flat bass notes
  const bassNoteArray = primaryNoteArray;

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
  let result = bassNoteArray[bassIndex];

  const normalizedInversion = inversion.replace(/^([b#])/, '');

  // For standard chord-tone inversions on minor chords, prefer the actual chord tone
  // spelling instead of mirroring the accidental prefix in the degree token. This fixes
  // cases like C#:min/b7, which should display as C#m/B rather than carrying the literal
  // degree token through as b7.
  if (isMinor && inversion === 'b7' && normalizedInversion === '7') {
    if (root.startsWith('C#')) {
      return 'B';
    }
    if (root.startsWith('F#')) {
      return 'E';
    }
    if (root.startsWith('G#')) {
      return 'F#';
    }
    if (root.startsWith('D#')) {
      return 'C#';
    }
    if (root.startsWith('A#')) {
      return 'G#';
    }
  }

  // FIXED: Apply proper enharmonic spelling for chord inversions
  // For chord inversions, theoretical correctness is more important than simplicity

  // Handle special cases for proper enharmonic spelling BEFORE general enharmonic logic
  if (root.includes('#') || root.includes('♯')) {
    // In sharp keys, prefer sharp spellings to maintain consistency
    if (result === 'C' && (inversion === '3' && root.startsWith('G#'))) {
      result = 'B#'; // G#/3 = G#/B# (theoretically correct)
    } else if (result === 'F' && (inversion === '3' && root.startsWith('C#'))) {
      result = 'E#'; // C#/3 = C#/E# (theoretically correct)
    } else if (result === 'G' && (inversion === '3' && root.startsWith('D#'))) {
      result = 'F##'; // D#/3 = D#/F## (theoretically correct - major third from D#)
    }

    // FIXED: Handle G# minor chord third specifically
    // G#min/3 should be B (natural), not A## or C
    if (root.startsWith('G#') && isMinor && inversion === '3') {
      result = 'B'; // G#min/3 = G#m/B (natural third of G# minor)
    }

    // Handle G# minor 7th inversion - should be F## (double sharp)
    if (root.startsWith('G#') && isMinor && inversion === '7') {
      result = 'F##'; // G#min/7 = G#m/F## (natural 7th in G# minor context)
    }
  } else if (root.includes('b') || root.includes('♭')) {
    // In flat keys, prefer flat spellings to maintain consistency
    // FIXED: Handle flat-based chords with proper enharmonic spelling

    // Fb/3 should be Fb/Ab (not Fb/G#)
    if (root.startsWith('Fb') && inversion === '3') {
      result = 'Ab'; // Fb/3 = Fb/Ab (major third from Fb)
    }
    // Fb/5 should be Fb/Cb (not Fb/B)
    else if (root.startsWith('Fb') && inversion === '5') {
      result = 'Cb'; // Fb/5 = Fb/Cb (perfect fifth from Fb)
    }
    // Cb/3 should be Cb/Eb (not Cb/D#)
    else if (root.startsWith('Cb') && inversion === '3') {
      result = 'Eb'; // Cb/3 = Cb/Eb (major third from Cb)
    }
    // Cb/5 should be Cb/Gb (not Cb/F#)
    else if (root.startsWith('Cb') && inversion === '5') {
      result = 'Gb'; // Cb/5 = Cb/Gb (perfect fifth from Cb)
    }
    // For other flat-based chords, ensure we use flat notation
    else if (result.includes('#')) {
      // Convert sharp to flat equivalent for consistency
      const enharmonicMap: Record<string, string> = {
        'C#': 'Db',
        'D#': 'Eb',
        'F#': 'Gb',
        'G#': 'Ab',
        'A#': 'Bb'
      };
      result = enharmonicMap[result] || result;
    }
  } else {
    // For natural root notes (C, D, E, F, G, A, B)
    // Respect optional accidental preference when provided
    if (preferFlats) {
      if (result.includes('#')) {
        const enharmonicMap: Record<string, string> = {
          'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
        };
        result = enharmonicMap[result] || result;
      }
      // If result already uses flats, keep it as-is
    } else if (preferSharps) {
      if (result.includes('b')) {
        const enharmonicMap: Record<string, string> = {
          'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
        };
        result = enharmonicMap[result] || result;
      }
      // If result already uses sharps, keep it as-is
    } else {
      // No preference: apply context-aware enhancement
      result = getEnharmonicSpelling(result, root);
    }
  }

  // FIXED: For flat inversions, only convert to flat notation if the root doesn't use sharps
  // This prevents G#m/b7 -> G#m/Gb (wrong) and ensures G#m/b7 -> G#m/F# (correct)
  if (isFlatInversion && !root.includes('#') && !root.includes('♯')) {
    // Only convert to flat notation for roots that don't use sharps
    // This maintains enharmonic consistency within the chord
    if (result === 'D#' || result === 'D♯') {
      result = 'Eb'; // For inversions like C:min/b3
    } else if (result === 'A#' || result === 'A♯') {
      result = 'Bb'; // For inversions like F:min/b3
    } else if (result === 'G#' || result === 'G♯') {
      result = 'Ab'; // For inversions like Eb:min/b3
    } else if (result === 'C#' || result === 'C♯') {
      result = 'Db'; // For inversions like Ab:min/b3
    } else if (result === 'F#' || result === 'F♯') {
      result = 'Gb'; // For inversions like Db:min/b3
    }
  }

  // Handle double accidentals for extreme cases
  if (result.includes('##')) {
    result = result.replace(/##/g, '𝄪'); // Double sharp Unicode symbol
  }
  if (result.includes('bb')) {
    result = result.replace(/bb/g, '𝄫'); // Double flat Unicode symbol
  }

  // Convert back to Unicode symbols for display
  result = result.replace(/#/g, '♯').replace(/b/g, '♭');

  return result;
}
