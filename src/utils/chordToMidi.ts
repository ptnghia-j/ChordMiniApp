/**
 * Chord-to-MIDI Note Utilities
 * 
 * Shared utility for converting chord names to MIDI note numbers and note names.
 * Extracted from soundfontChordPlaybackService for reuse in piano visualization
 * and future MIDI export functionality.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const NOTE_INDEX_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

export const CHORD_STRUCTURES: Record<string, number[]> = {
  major:    [0, 4, 7],
  minor:    [0, 3, 7],
  dom7:     [0, 4, 7, 10],
  maj7:     [0, 4, 7, 11],
  min7:     [0, 3, 7, 10],
  sus2:     [0, 2, 7],
  sus4:     [0, 5, 7],
  dim:      [0, 3, 6],
  aug:      [0, 4, 8],
  dim7:     [0, 3, 6, 9],
  hdim7:    [0, 3, 6, 10],
  add9:     [0, 4, 7, 14],
  dom9:     [0, 4, 7, 10, 14],
  maj9:     [0, 4, 7, 11, 14],
  min9:     [0, 3, 7, 10, 14],
  dom11:    [0, 4, 7, 10, 14, 17],
  dom13:    [0, 4, 7, 10, 14, 21],
  six:      [0, 4, 7, 9],
  min6:     [0, 3, 7, 9],
  minmaj7:  [0, 3, 7, 11],
  min11:    [0, 3, 7, 10, 14, 17],
  min13:    [0, 3, 7, 10, 14, 21],
  maj11:    [0, 4, 7, 11, 14, 17],
  maj13:    [0, 4, 7, 11, 14, 21],
};

export const CHORD_TYPE_ALIASES: Record<string, string> = {
  '': 'major', 'maj': 'major', 'major': 'major',
  'm': 'minor', 'min': 'minor', 'minor': 'minor',
  '7': 'dom7', 'dom7': 'dom7',
  'M7': 'maj7', 'maj7': 'maj7', 'Maj7': 'maj7',
  'm7': 'min7', 'min7': 'min7',
  'sus2': 'sus2',
  'sus4': 'sus4',
  '°': 'dim', 'dim': 'dim',
  '+': 'aug', 'aug': 'aug',
  '°7': 'dim7', 'dim7': 'dim7',
  'ø7': 'hdim7', 'hdim7': 'hdim7', 'm7b5': 'hdim7',
  'add9': 'add9',
  '9': 'dom9', 'dom9': 'dom9',
  'M9': 'maj9', 'maj9': 'maj9', 'Maj9': 'maj9',
  'm9': 'min9', 'min9': 'min9',
  '11': 'dom11', 'dom11': 'dom11',
  '13': 'dom13', 'dom13': 'dom13',
  '6': 'six',
  'm6': 'min6', 'min6': 'min6',
  'mmaj7': 'minmaj7', 'mMaj7': 'minmaj7', 'minmaj7': 'minmaj7',
  'mM7': 'minmaj7', 'minMaj7': 'minmaj7',
  'm11': 'min11', 'min11': 'min11',
  'm13': 'min13', 'min13': 'min13',
  'maj11': 'maj11', 'Maj11': 'maj11',
  'maj13': 'maj13', 'Maj13': 'maj13',
};

// ─── Types ───────────────────────────────────────────────────────────────────

/** A note with name, octave, and MIDI number */
export interface MidiNote {
  /** Note name with octave, e.g. "C4", "F#5" */
  name: string;
  /** Note name without octave, e.g. "C", "F#" */
  noteName: string;
  /** Octave number (0-8) */
  octave: number;
  /** MIDI note number (0-127). C4 = 60 */
  midi: number;
}

/** A chord event for the piano roll timeline */
export interface ChordEvent {
  /** Chord name as it appears in the grid */
  chordName: string;
  /** Parsed MIDI notes for this chord */
  notes: MidiNote[];
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Beat index in the chord grid */
  beatIndex: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert note name + octave string (e.g. "C4") to MIDI note number.
 * C4 = 60 (middle C).
 */
export function noteNameToMidi(noteWithOctave: string): number {
  const match = noteWithOctave.match(/^([A-G][#b]?)(\d+)$/);
  if (!match) return -1;
  const [, note, octStr] = match;
  const octave = parseInt(octStr, 10);
  const noteIndex = NOTE_INDEX_MAP[note];
  if (noteIndex === undefined) return -1;
  // MIDI: C-1 = 0, C0 = 12, C4 = 60
  return (octave + 1) * 12 + noteIndex;
}

/**
 * Convert MIDI note number to note name with octave.
 */
export function midiToNoteName(midi: number): string {
  if (midi < 0 || midi > 127) return '';
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Check if a MIDI note number corresponds to a black key.
 */
export function isBlackKey(midi: number): boolean {
  const noteIndex = midi % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex);
}

/**
 * Convert interval notation to semitones (e.g. "b7" → 10).
 */
function intervalToSemitones(interval: string): number {
  const match = interval.match(/^([#b]?)(\d+)$/);
  if (!match) return 0;
  const [, accidental, intervalNum] = match;
  const intervalNumber = parseInt(intervalNum);
  const intervalMap: Record<number, number> = {
    1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21
  };
  let semitones = intervalMap[intervalNumber] || 0;
  if (accidental === '#') semitones += 1;
  if (accidental === 'b') semitones -= 1;
  return semitones;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Parse a chord name string into an array of MidiNote objects.
 * Handles slash chords, interval-based bass notes, and all standard chord types.
 * 
 * @example
 * parseChordToMidiNotes("Am7")  → [{name:"A4", midi:69}, {name:"C5", midi:72}, ...]
 * parseChordToMidiNotes("C/G")  → [{name:"G2", midi:43}, {name:"C4", midi:60}, ...]
 */
export function parseChordToMidiNotes(chordName: string): MidiNote[] {
  if (!chordName || chordName === 'N.C.' || chordName === 'N' || chordName === 'N/C' || chordName === 'NC') {
    return [];
  }

  // Handle slash chords
  const parts = chordName.split('/');
  const baseChord = parts[0];
  const bassSpecifier = parts[1];

  // Extract root note and chord type
  const match = baseChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return [];

  const [, root, chordType] = match;
  const rootIndex = NOTE_INDEX_MAP[root];
  if (rootIndex === undefined) return [];

  // Normalize chord type
  const cleanedType = chordType.replace(/^[^A-Za-z0-9#b°ø+]+/, '').replace(/\s+/g, '');
  const normalizedChordType = CHORD_TYPE_ALIASES[cleanedType] ?? CHORD_TYPE_ALIASES[cleanedType.toLowerCase()] ?? 'major';
  const intervals = CHORD_STRUCTURES[normalizedChordType];
  if (!intervals) return [];

  // Resolve bass specifier
  let bassNoteName: string | undefined;
  if (bassSpecifier) {
    const isNoteName = /^[A-G][#b]?$/.test(bassSpecifier);
    const isInterval = /^[#b]?\d+$/.test(bassSpecifier);
    if (isNoteName) {
      bassNoteName = bassSpecifier;
    } else if (isInterval) {
      const semitones = intervalToSemitones(bassSpecifier);
      const bassNoteIndex = (rootIndex + semitones) % 12;
      bassNoteName = NOTE_NAMES[bassNoteIndex];
    }
  }

  const notes: MidiNote[] = [];
  const isRootPosition = !bassNoteName || bassNoteName === root;

  // Add bass note in lower octave
  if (!isRootPosition && bassNoteName) {
    const midi = noteNameToMidi(`${bassNoteName}2`);
    notes.push({
      name: `${bassNoteName}2`,
      noteName: bassNoteName,
      octave: 2,
      midi,
    });
  }

  // Add chord tones
  intervals.forEach(interval => {
    const noteIndex = (rootIndex + interval) % 12;
    const noteName = NOTE_NAMES[noteIndex];
    if (!isRootPosition && noteName === bassNoteName) return;
    const octave = interval < 12 ? 4 : 5;
    const midi = noteNameToMidi(`${noteName}${octave}`);
    notes.push({
      name: `${noteName}${octave}`,
      noteName,
      octave,
      midi,
    });
  });

  return notes;
}

/**
 * Build a timeline of ChordEvent objects from chord grid data.
 * This is the primary data source for the piano roll visualizer.
 * 
 * @param chords - Array of chord name strings
 * @param beats - Array of beat timestamps (seconds), may contain null for padding
 * @param paddingCount - Number of padding beats at the start
 * @param shiftCount - Number of shift beats at the start
 * @returns Array of ChordEvent objects with start/end times and notes
 */
export function buildChordTimeline(
  chords: string[],
  beats: (number | null)[],
  paddingCount: number = 0,
  shiftCount: number = 0,
): ChordEvent[] {
  const events: ChordEvent[] = [];
  const skipCount = shiftCount + paddingCount;

  for (let i = skipCount; i < chords.length; i++) {
    const chord = chords[i];
    if (!chord || chord === 'N.C.' || chord === 'N' || chord === 'N/C' || chord === 'NC') continue;

    const startTime = beats[i];
    if (startTime === null || startTime === undefined) continue;

    // Find end time: next beat's timestamp or estimate
    let endTime: number;
    if (i + 1 < beats.length && beats[i + 1] !== null && beats[i + 1] !== undefined) {
      endTime = beats[i + 1] as number;
    } else {
      // Last beat — estimate duration from previous beat interval
      const prevInterval = i > 0 && beats[i - 1] !== null
        ? startTime - (beats[i - 1] as number)
        : 0.5;
      endTime = startTime + prevInterval;
    }

    const notes = parseChordToMidiNotes(chord);
    if (notes.length === 0) continue;

    events.push({
      chordName: chord,
      notes,
      startTime,
      endTime,
      beatIndex: i,
    });
  }

  return events;
}

/**
 * Get the MIDI range (lowest and highest note) from chord events.
 * Useful for determining piano keyboard range.
 */
export function getMidiRange(events: ChordEvent[]): { min: number; max: number } {
  let min = 127;
  let max = 0;
  for (const event of events) {
    for (const note of event.notes) {
      if (note.midi < min) min = note.midi;
      if (note.midi > max) max = note.midi;
    }
  }
  // Fallback to reasonable piano range if no events
  if (min > max) {
    min = 48; // C3
    max = 84; // C6
  }
  return { min, max };
}
