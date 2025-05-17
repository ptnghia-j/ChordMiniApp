/**
 * Utility functions for formatting chord names with proper musical notation
 */

/**
 * Formats chord names with proper musical notation and simplified chord suffixes
 *
 * @param chordName The chord name to format (e.g., "C#:min", "Bb:maj", "C#:maj/3")
 * @returns Formatted chord name with proper musical symbols and simplified notation
 */
export function formatChordWithMusicalSymbols(chordName: string): string {
  if (!chordName) return chordName;

  // Handle special cases
  if (chordName === 'N' || chordName === 'N/C' || chordName === 'X') {
    return chordName;
  }

  // Split chord into root and quality parts
  const parts = chordName.split(':');
  let root = parts[0];
  let quality = parts.length > 1 ? parts[1] : '';

  // Check for inversions
  let inversion = '';
  let bassNote = '';

  if (quality.includes('/')) {
    const inversionParts = quality.split('/');
    quality = inversionParts[0];
    inversion = inversionParts[1];

    // Convert numeric inversion to actual bass note
    if (inversion === '3' || inversion === '5' || inversion === '7' || inversion === '9' ||
        inversion === 'b3' || inversion === 'b5' || inversion === 'b7' || inversion === 'b9' ||
        inversion === '#3' || inversion === '#5' || inversion === '#7' || inversion === '#9') {
      bassNote = getBassNoteFromInversion(root, quality, inversion);
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

  // Simplify chord quality notation
  if (quality === 'maj') {
    // Major chords don't need a suffix
    quality = '';
  } else if (quality === 'min') {
    // Use 'm' instead of 'min' for minor chords
    quality = 'm';
  } else if (quality.includes('sus')) {
    // Make suspension superscript
    quality = quality.replace(/sus(\d)/, 'sus<sup>$1</sup>');
  } else if (quality.includes('dim')) {
    // Keep diminished as is, but could use ° symbol if preferred
    quality = quality.replace('dim', 'dim');
  } else if (quality.includes('aug')) {
    // Keep augmented as is, but could use + symbol if preferred
    quality = quality.replace('aug', 'aug');
  } else if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    // Make extensions superscript
    // First handle complex cases with both quality and extension
    if (quality.startsWith('min')) {
      quality = 'm' + quality.substring(3);
    } else if (quality.startsWith('maj')) {
      quality = 'maj' + quality.substring(3);
    }

    // Make numeric extensions superscript
    quality = quality.replace(/(\d+)/g, '<sup>$1</sup>');
  }

  // Combine root, quality, and bass note
  let formattedChord = quality ? `${root}${quality}` : root;
  if (bassNote) {
    formattedChord += `/${bassNote}`;
  }

  return formattedChord;
}

/**
 * Converts a numeric inversion to the actual bass note
 *
 * @param root The root note of the chord
 * @param quality The quality of the chord (maj, min, etc.)
 * @param inversion The inversion number (3, 5, 7, etc.)
 * @returns The bass note as a string
 */
function getBassNoteFromInversion(root: string, quality: string, inversion: string): string {
  // Define the notes in order
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesWithFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Determine if the root uses sharps or flats
  const usesFlats = root.includes('b');

  // For minor chords, prefer flat notation for the third (e.g., Em/G instead of Em/F#)
  const isMinor = quality === 'min' || quality === 'm' || quality.startsWith('min') || quality.startsWith('m');
  const preferFlatsForMinor = isMinor && (inversion === '3' || inversion === 'b3');

  // Choose the appropriate note array
  const noteArray = usesFlats || preferFlatsForMinor ? notesWithFlats : notes;

  // Find the root note index
  let rootIndex = -1;
  for (let i = 0; i < noteArray.length; i++) {
    if (noteArray[i] === root) {
      rootIndex = i;
      break;
    }
  }

  if (rootIndex === -1) return inversion; // Fallback if root not found

  // Determine chord type and intervals
  let intervals: number[] = [];

  if (quality === 'maj' || quality === '') {
    // Major chord: root, major third (4 semitones), perfect fifth (7 semitones)
    intervals = [0, 4, 7];
  } else if (quality === 'min' || quality === 'm') {
    // Minor chord: root, minor third (3 semitones), perfect fifth (7 semitones)
    intervals = [0, 3, 7];
  } else if (quality === 'dim') {
    // Diminished chord: root, minor third (3 semitones), diminished fifth (6 semitones)
    intervals = [0, 3, 6];
  } else if (quality === 'aug') {
    // Augmented chord: root, major third (4 semitones), augmented fifth (8 semitones)
    intervals = [0, 4, 8];
  } else if (quality.includes('7')) {
    if (quality.includes('maj7')) {
      // Major seventh chord: root, major third, perfect fifth, major seventh (11 semitones)
      intervals = [0, 4, 7, 11];
    } else if (quality.includes('min7') || quality.includes('m7')) {
      // Minor seventh chord: root, minor third, perfect fifth, minor seventh (10 semitones)
      intervals = [0, 3, 7, 10];
    } else if (quality.includes('dim7')) {
      // Diminished seventh chord: root, minor third, diminished fifth, diminished seventh (9 semitones)
      intervals = [0, 3, 6, 9];
    } else {
      // Dominant seventh chord: root, major third, perfect fifth, minor seventh (10 semitones)
      intervals = [0, 4, 7, 10];
    }
  } else if (quality.startsWith('m') || quality.startsWith('min')) {
    // Any other minor chord variant
    intervals = [0, 3, 7];
  } else {
    // Default to major triad if quality not recognized
    intervals = [0, 4, 7];
  }

  // Determine which note to use based on inversion
  let intervalIndex = -1;
  let intervalAdjustment = 0;

  // Parse the inversion to handle different types of inversions
  let inversionNumber = inversion;

  // We already have isMinor defined above, so we'll reuse it here
  // For minor chords, 'b3' refers to the minor third (not a chromatically altered note)
  // So we don't apply an interval adjustment for minor chords with b3

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

  // Map inversion number to interval index
  if (inversionNumber === '3') {
    intervalIndex = 1; // Third of the chord
  } else if (inversionNumber === '5') {
    intervalIndex = 2; // Fifth of the chord
  } else if (inversionNumber === '7') {
    intervalIndex = 3; // Seventh of the chord (if it exists)
  } else if (inversionNumber === '9') {
    intervalIndex = 4; // Ninth of the chord (if it exists)
  }

  if (intervalIndex === -1 || intervalIndex >= intervals.length) {
    return inversion; // Fallback if inversion not applicable
  }

  // Calculate the bass note index with the adjustment for altered inversions
  const bassIndex = (rootIndex + intervals[intervalIndex] + intervalAdjustment) % 12;
  return noteArray[bassIndex];
}

/**
 * Calculates an appropriate font size based on the chord name length and container size
 *
 * @param chordName The chord name to display
 * @returns CSS class for the appropriate font size
 */
export function getResponsiveChordFontSize(chordName: string): string {
  // Base size classes - consistent for all chord labels
  const baseClasses = "font-medium text-left text-gray-800";

  // Use a consistent font size for most chords
  // The base size is medium (md:text-base) which works well for most chord names
  let sizeClass = "text-sm md:text-base";

  // Only reduce size for exceptionally long chord names (e.g., complex chords with extensions and inversions)
  if (chordName && chordName.length > 8) {
    sizeClass = "text-xs md:text-sm";
  }

  // Add truncation for extremely long chord names
  // This ensures text doesn't overflow and maintains consistent appearance
  const truncateClass = chordName && chordName.length > 12 ? "truncate max-w-full" : "";

  return `${baseClasses} ${sizeClass} ${truncateClass}`;
}

/**
 * Generates inline styles for chord labels to ensure consistent appearance
 *
 * @param chordName The chord name to display
 * @returns Object with CSS styles
 */
export function getChordLabelStyles(chordName: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.5rem',
    lineHeight: '1.2',
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start', // Left-align the text
    alignItems: 'center',
    minHeight: '1.5rem',
    // Apply a minimum width to ensure consistent cell sizing
    minWidth: '2rem'
  };
}
