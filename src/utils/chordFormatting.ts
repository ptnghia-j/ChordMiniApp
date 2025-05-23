/**
 * Utility functions for formatting chord names with proper musical notation
 * Following industry-standard conventions used in professional music notation software
 */

/**
 * Formats chord names with proper musical notation and standardized chord suffixes
 *
 * @param chordName The chord name to format (e.g., "C#:min", "Bb:maj", "C#:maj/3")
 * @returns Formatted chord name with proper musical symbols and professional notation
 */
export function formatChordWithMusicalSymbols(chordName: string): string {
  if (!chordName) return chordName;

  // Handle special cases
  if (chordName === 'N' || chordName === 'N/C' || chordName === 'X') {
    return chordName === 'N/C' ? 'N.C.' : chordName; // Use standard "No Chord" notation
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

  // Apply professional chord quality notation
  if (quality === 'maj') {
    // Major chords don't need a suffix in standard notation
    quality = '';
  } else if (quality === 'min') {
    // Use 'm' instead of 'min' for minor chords (industry standard)
    quality = 'm';
  } else if (quality.includes('sus')) {
    // Format suspension with proper superscript
    quality = quality.replace(/sus(\d)/, 'sus<sup>$1</sup>');
  } else if (quality.includes('dim')) {
    // Use standard diminished symbol (°) for better readability
    quality = quality.replace('dim', '<span style="position:relative;top:-1px">°</span>');
  } else if (quality.includes('aug')) {
    // Use standard augmented symbol (+) for better readability
    quality = quality.replace('aug', '<span style="position:relative">+</span>');
  } else if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    // Handle extensions with proper formatting

    // First handle complex cases with both quality and extension
    if (quality.startsWith('min')) {
      quality = 'm' + quality.substring(3);
    } else if (quality.startsWith('maj')) {
      // Use triangle (Δ) for major 7th chords - industry standard
      if (quality === 'maj7') {
        quality = '<span style="position:relative;top:-1px">Δ</span><sup>7</sup>';
      } else {
        quality = 'maj' + quality.substring(3).replace(/(\d+)/g, '<sup>$1</sup>');
      }
    } else {
      // Make numeric extensions superscript
      quality = quality.replace(/(\d+)/g, '<sup>$1</sup>');
    }
  }

  // Handle altered notes (add, b5, #9, etc.)
  if (quality.includes('add')) {
    quality = quality.replace(/add(\d+)/g, 'add<sup>$1</sup>');
  }

  if (quality.includes('b5') || quality.includes('b9') || quality.includes('b13')) {
    quality = quality.replace(/b(\d+)/g, '<sup>♭$1</sup>');
  }

  if (quality.includes('#5') || quality.includes('#9') || quality.includes('#11')) {
    quality = quality.replace(/#(\d+)/g, '<sup>♯$1</sup>');
  }

  // Combine root, quality, and bass note with proper spacing
  let formattedChord = quality ? `${root}${quality}` : root;
  if (bassNote) {
    formattedChord += `<span style="margin:0 0.1em">/</span>${bassNote}`;
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
 * Provides consistent font size and styling for chord labels
 * Uses a standardized approach rather than responsive sizing to ensure consistency
 *
 * @param chordName The chord name to display
 * @returns CSS class for the chord label
 */
export function getResponsiveChordFontSize(chordName: string): string {
  // Use consistent base classes for all chord labels
  // This ensures uniform appearance across the application
  return "font-medium text-gray-800 text-base whitespace-normal";
}

/**
 * Generates professional inline styles for chord labels
 * Based on industry-standard music notation software
 *
 * @param chordName The chord name to display
 * @returns Object with CSS styles for professional chord display
 */
export function getChordLabelStyles(chordName: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.5rem',
    lineHeight: '1.3',
    width: '100%',
    display: 'flex',
    justifyContent: 'center', // Center-align for better readability
    alignItems: 'center',
    minHeight: '1.75rem',
    minWidth: '2.5rem',
    fontFamily: 'var(--font-roboto-mono), "Roboto Mono", monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto', // Use monospace for better chord alignment
    letterSpacing: '0.01em', // Slight letter spacing for better readability
    overflow: 'visible', // Prevent truncation
    textOverflow: 'clip', // Don't use ellipsis
    hyphens: 'none', // Prevent hyphenation
    wordBreak: 'keep-all', // Prevent breaking within chord names
    // Add a subtle shadow for better visibility
    textShadow: '0 0 1px rgba(0,0,0,0.05)'
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
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow content to overflow for complex chord names
    padding: '0.25rem'
  };
}
