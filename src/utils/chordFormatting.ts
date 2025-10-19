/**
 * Utility functions for formatting chord names with proper musical notation
 * Following industry-standard conventions used in professional music notation software
 * Enhanced with ChordGrid-specific formatting functions
 */

import React from 'react';
import { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationColorForBeat } from '@/utils/segmentationColors';

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



  // Handle special cases
  if (chordName === 'N' || chordName === 'N/C' || chordName === 'N.C.' || chordName === 'X') {
    // Use optimized inline SVG quarter rest symbol for "No Chord" notation
    // if (chordName === 'N/C' || chordName === 'N.C.') {
    if (chordName === 'N/C' || chordName === 'N' || chordName === 'N.C.') {
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

  // Replace sharp (#) with proper Unicode sharp symbol (♯)
  // Handle double sharps (##) with double sharp symbol (𝄪)
  root = root.replace(/##/g, '𝄪').replace(/#/g, '♯');
  if (bassNote) {
    bassNote = bassNote.replace(/##/g, '𝄪').replace(/#/g, '♯');
  }

  // Replace flat (b) with proper Unicode flat symbol (♭) in root and bass notes
  // Handle double flats (bb) with double flat symbol (𝄫)
  // More precise pattern: only replace 'b' when it's part of a note name (after A-G)
  root = root.replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
  if (bassNote) {
    bassNote = bassNote.replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
  }

  // Handle existing ° symbols in the quality string (from AI corrections)
  if (quality.includes('°')) {
    // If ° symbol is already present, format it properly and remove any 'dim' text
    quality = quality.replace(/dim/g, ''); // Remove 'dim' text if present with °
    quality = quality.replace(/°/g, '<span style="font-weight: 400; position:relative;top:-1px">°</span>');
  }

  // Apply professional chord quality notation with uniform font weight
  // All parts of chord labels use regular font weight for cleaner appearance
  const formattedRoot = `<span style="font-weight: 400;">${root}</span>`;

  if (quality === 'maj') {
    // Major chords don't need a suffix in standard notation
    quality = '';
  } else if (quality === 'min' || quality === 'minor') {
    // Use 'm' instead of 'min'/'minor' for minor chords (industry standard)
    quality = '<span style="font-weight: 400;">m</span>';
  } else if (quality.includes('sus')) {
    // FIXED: Handle sus chords with consistent formatting to prevent layout shifts
    // Process sus with parentheses first to avoid conflicts
    if (quality.includes('sus') && quality.includes('(')) {
      // Handle "sus4(b7)" -> "sus⁴⁽♭⁷⁾" with consistent superscript sizing
      quality = quality.replace(/sus(\d+)(?=\()/g, '<span style="font-weight: 400;">sus</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1;">$1</sup>');
      // Handle "sus(b7)" -> "sus⁽♭⁷⁾"
      quality = quality.replace(/sus(?=\()/g, '<span style="font-weight: 400;">sus</span>');
    } else {
      // Handle simple sus chords: "sus4" -> "sus⁴"
      quality = quality.replace(/sus(\d+)/g, '<span style="font-weight: 400;">sus</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1;">$1</sup>');
    }
  } else if (quality === 'm7b5' || quality === 'min7b5' || quality.includes('half-dim') || quality.includes('halfdim')) {
    // FIXED: Half-diminished 7th chords with consistent superscript sizing
    quality = '<span style="font-weight: 400; position:relative;top:-1px">ø</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">7</sup>';
  } else if (quality.includes('dim') && !quality.includes('°')) {
    // Use standard diminished symbol (°) for better readability
    // Only replace 'dim' if ° symbol is not already present
    quality = quality.replace('dim', '<span style="font-weight: 400; position:relative;top:-1px">°</span>');
  } else if (quality.includes('aug')) {
    // Use standard augmented symbol (+) for better readability
    quality = quality.replace('aug', '<span style="font-weight: 400; position:relative">+</span>');
  } else if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    // Handle extensions with proper formatting

    // FIXED: Handle complex cases with consistent superscript sizing
    if (quality.startsWith('min')) {
      quality = '<span style="font-weight: 400;">m</span>' + quality.substring(3).replace(/(\d+)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">$1</sup>');
    } else if (quality.startsWith('maj')) {
      // Use triangle (Δ) for major 7th chords - industry standard
      if (quality === 'maj7') {
        quality = '<span style="font-weight: 400; position:relative;top:-1px">Δ</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">7</sup>';
      } else {
        quality = '<span style="font-weight: 400;">maj</span>' + quality.substring(3).replace(/(\d+)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">$1</sup>');
      }
    } else {
      // Make numeric extensions superscript with consistent sizing
      quality = '<span style="font-weight: 400;">' + quality.replace(/(\d+)/g, '</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">$1</sup><span style="font-weight: 400;">') + '</span>';
      // Clean up empty spans
      quality = quality.replace(/<span style="font-weight: 400;"><\/span>/g, '');
    }
  } else if (quality) {
    // Wrap any other quality in lighter weight span
    quality = `<span style="font-weight: 400;">${quality}</span>`;
  }

  // FIXED: Handle altered notes with consistent superscript sizing
  if (quality.includes('add')) {
    quality = quality.replace(/add(\d+)/g, '<span style="font-weight: 400;">add</span><sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">$1</sup>');
  }

  // FIXED: Handle parentheses around chord extensions with consistent sizing and stable layout
  if (quality.includes('(') && quality.includes(')')) {
    // Handle flat extensions in parentheses: (b5), (b7), (b9), (b13) -> ⁽♭⁵⁾, ⁽♭⁷⁾, etc.
    quality = quality.replace(/\(b(\d+)\)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">⁽♭$1⁾</sup>');
    // Handle sharp extensions in parentheses: (#5), (#9), (#11) -> ⁽♯⁵⁾, ⁽♯⁹⁾, etc.
    quality = quality.replace(/\(#(\d+)\)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">⁽♯$1⁾</sup>');
    // Handle numeric extensions in parentheses: (7), (9), (11), (13) -> ⁽⁷⁾, ⁽⁹⁾, etc.
    quality = quality.replace(/\((\d+)\)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">⁽$1⁾</sup>');
  }

  // FIXED: Handle non-parenthesized extensions with consistent sizing
  if (quality.includes('b5') || quality.includes('b7') || quality.includes('b9') || quality.includes('b13')) {
    quality = quality.replace(/b(\d+)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">♭$1</sup>');
  }

  if (quality.includes('#5') || quality.includes('#9') || quality.includes('#11')) {
    quality = quality.replace(/#(\d+)/g, '<sup style="font-weight: 300; font-size: 0.7em; line-height: 1; vertical-align: super;">♯$1</sup>');
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
function getEnharmonicSpelling(note: string, keyContext: string): string {
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
  const primaryNoteArray = preferFlats ? notesWithFlats : preferSharps ? notes : (usesFlats ? notesWithFlats : notes);

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
    if (preferFlats && result.includes('#')) {
      const enharmonicMap: Record<string, string> = {
        'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
      };
      result = enharmonicMap[result] || result;
    } else if (preferSharps && result.includes('b')) {
      const enharmonicMap: Record<string, string> = {
        'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
      };
      result = enharmonicMap[result] || result;
    } else {
      // Default: keep computed spelling or apply context-aware enhancement
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
 * FIXED: Generates container styles for chord labels with stable layout for superscripts
 * Prevents layout shifts and auto-scroll jitter by providing consistent dimensions
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
    overflow: 'visible', // Allow superscripts to extend beyond container
    padding: '0.0625rem', // Minimal padding for very tight layout
    // CRITICAL: Reserve space for superscripts to prevent layout shifts
    minHeight: '1.5em', // Ensure enough vertical space for superscripts
    lineHeight: '1.2', // Consistent line height for stable measurements
  };
}

/**
 * Formats Roman numerals with proper figure bass notation
 */
export const formatRomanNumeral = (romanNumeral: string): React.ReactElement | string => {
  if (!romanNumeral) return '';

  // Handle figure bass notation (e.g., "I64", "ii6", "V7")
  const figureMatch = romanNumeral.match(/^([ivxIVX]+)(.*)$/);
  if (figureMatch) {
    const [, baseRoman, figures] = figureMatch;

    if (figures) {
      // Handle different figure bass patterns
      if (figures === '64') {
        // Create I64 with stacked superscript figures
        return React.createElement('span', {
          style: {
            position: 'relative',
            display: 'inline-block',
          },
          key: 'roman-64'
        }, [
          React.createElement('span', { key: 'base' }, baseRoman),
          React.createElement('span', {
            key: 'figures',
            style: {
              position: 'absolute',
              left: '100%',
              top: '-0.5em',
              fontSize: '0.7em', // Consistent with chord superscripts
              lineHeight: '1', // Stable line height
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginLeft: '1px', // Reduced margin for closer positioning
              fontWeight: 'normal',
              zIndex: 10
            }
          }, [
            React.createElement('span', {
              key: '6',
              style: {
                display: 'block',
                textAlign: 'center'
              }
            }, '6'),
            React.createElement('span', {
              key: '4',
              style: {
                display: 'block',
                marginTop: '-0.15em',
                textAlign: 'center'
              }
            }, '4')
          ])
        ]);
      } else if (figures === '43') {
        return React.createElement('span', { style: { position: 'relative', display: 'inline-block' } }, [
          baseRoman,
          React.createElement('span', {
            key: 'figures',
            style: {
              position: 'absolute',
              left: '100%',
              top: '-0.3em',
              fontSize: '0.6em',
              lineHeight: '0.8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginLeft: '1px'
            }
          }, [
            React.createElement('span', { key: '4' }, '4'),
            React.createElement('span', { key: '3' }, '3')
          ])
        ]);
      } else if (figures === '6') {
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', { key: 'sup', style: { fontSize: '0.7em' } }, '6')
        ]);
      } else if (figures === '7') {
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', {
            key: 'sup',
            style: {
              fontSize: '0.7em',
              lineHeight: '1',
              verticalAlign: 'super'
            }
          }, '7')
        ]);
      } else if (figures.includes('/')) {
        // Handle secondary dominants like "V7/vi"
        return React.createElement('span', {}, romanNumeral);
      } else {
        // FIXED: Handle other figure combinations with consistent styling
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', {
            key: 'sup',
            style: {
              fontSize: '0.7em',
              lineHeight: '1',
              verticalAlign: 'super'
            }
          }, figures)
        ]);
      }
    }

    return baseRoman;
  }

  return romanNumeral;
};

/**
 * Builds mapping from beat index to chord sequence index for Roman numerals
 */
export const buildBeatToChordSequenceMap = (
  chordsLength: number,
  shiftedChords: string[],
  romanNumeralData: { analysis: string[] } | null,
  sequenceCorrections: { correctedSequence: string[] } | null
): Record<number, number> => {
  if (chordsLength === 0 || !romanNumeralData?.analysis) return {};

  const map: Record<number, number> = {};
  const normalizeChord = (chord: string) => {
    if (chord === 'N' || chord === 'N.C.' || chord === 'N/C' || chord === 'NC') {
      return 'N';
    }
    return chord;
  };

  // Use corrected sequence if available, otherwise use original chord sequence for mapping
  const referenceSequence = sequenceCorrections?.correctedSequence || shiftedChords;
  let sequenceIndex = 0;
  let lastNormalizedChord = '';

  for (let beatIndex = 0; beatIndex < shiftedChords.length; beatIndex++) {
    const currentChord = shiftedChords[beatIndex];

    if (!currentChord || currentChord === '') {
      continue;
    }

    const normalizedCurrent = normalizeChord(currentChord);

    // Only advance the sequence index when the chord actually changes
    if (normalizedCurrent !== lastNormalizedChord) {
      if (sequenceCorrections?.correctedSequence) {
        // Using corrected sequence - find the next matching chord
        if (lastNormalizedChord !== '') {
          // Look for the next occurrence of this chord in the corrected sequence
          let found = false;
          for (let i = sequenceIndex + 1; i < referenceSequence.length; i++) {
            const correctedChord = normalizeChord(referenceSequence[i]);
            if (correctedChord === normalizedCurrent) {
              sequenceIndex = i;
              found = true;
              break;
            }
          }

          // If not found ahead, increment by 1 (fallback)
          if (!found) {
            sequenceIndex = Math.min(sequenceIndex + 1, referenceSequence.length - 1);
          }
        }
      } else {
        // Using original sequence - simple mapping based on chord changes
        if (lastNormalizedChord !== '' && sequenceIndex < romanNumeralData.analysis.length - 1) {
          sequenceIndex++;
        }
      }
      lastNormalizedChord = normalizedCurrent;
    }

    // Map this beat to the current sequence index
    if (sequenceIndex < romanNumeralData.analysis.length) {
      map[beatIndex] = sequenceIndex;
    }
  }

  return map;
};

/**
 * Gets segmentation color for a specific beat index
 */
export const getSegmentationColorForBeatIndex = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  originalAudioMapping?: Array<{ visualIndex: number; timestamp: number }>,
  timestamp?: number | null
): string | undefined => {
  // Try to get timestamp from originalAudioMapping first for accuracy
  let finalTimestamp: number | null = timestamp || null;

  if (originalAudioMapping && finalTimestamp === null) {
    const mappingEntry = originalAudioMapping.find(item => item.visualIndex === beatIndex);
    if (mappingEntry) {
      finalTimestamp = mappingEntry.timestamp;
    }
  }

  // Fallback to beats array if no mapping found
  if (finalTimestamp === null) {
    finalTimestamp = beats[beatIndex];
  }

  // Use the enhanced segmentation function with direct timestamp
  return getSegmentationColorForBeat(beatIndex, beats, segmentationData, showSegmentation, finalTimestamp);
};
