/**
 * Unit Tests: chordToMidi utilities
 *
 * Tests MIDI note generation from chord names, chord timeline building,
 * and helper functions (noteNameToMidi, midiToNoteName, isBlackKey, etc.)
 */

import {
  NOTE_INDEX_MAP,
  CHORD_STRUCTURES,
  CHORD_TYPE_ALIASES,
  noteNameToMidi,
  midiToNoteName,
  isBlackKey,
  parseChordToMidiNotes,
  buildChordTimeline,
  getMidiRange,
} from '@/utils/chordToMidi';

describe('chordToMidi utilities', () => {
  describe('noteNameToMidi', () => {
    it('converts C4 (middle C) to MIDI 60', () => {
      expect(noteNameToMidi('C4')).toBe(60);
    });

    it('converts A4 to MIDI 69', () => {
      expect(noteNameToMidi('A4')).toBe(69);
    });

    it('handles sharps and flats', () => {
      expect(noteNameToMidi('C#4')).toBe(61);
      expect(noteNameToMidi('Db4')).toBe(61);
      expect(noteNameToMidi('Bb3')).toBe(58);
    });

    it('handles different octaves', () => {
      expect(noteNameToMidi('C0')).toBe(12);
      expect(noteNameToMidi('C5')).toBe(72);
    });
  });

  describe('midiToNoteName', () => {
    it('converts MIDI 60 to C4', () => {
      expect(midiToNoteName(60)).toBe('C4');
    });

    it('converts MIDI 69 to A4', () => {
      expect(midiToNoteName(69)).toBe('A4');
    });

    it('round-trips with noteNameToMidi for natural notes', () => {
      const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
      notes.forEach(note => {
        expect(midiToNoteName(noteNameToMidi(note))).toBe(note);
      });
    });
  });

  describe('isBlackKey', () => {
    it('identifies black keys correctly', () => {
      // C#/Db, D#/Eb, F#/Gb, G#/Ab, A#/Bb
      expect(isBlackKey(61)).toBe(true);  // C#4
      expect(isBlackKey(63)).toBe(true);  // D#4
      expect(isBlackKey(66)).toBe(true);  // F#4
      expect(isBlackKey(68)).toBe(true);  // G#4
      expect(isBlackKey(70)).toBe(true);  // A#4
    });

    it('identifies white keys correctly', () => {
      expect(isBlackKey(60)).toBe(false); // C4
      expect(isBlackKey(62)).toBe(false); // D4
      expect(isBlackKey(64)).toBe(false); // E4
      expect(isBlackKey(65)).toBe(false); // F4
      expect(isBlackKey(67)).toBe(false); // G4
      expect(isBlackKey(69)).toBe(false); // A4
      expect(isBlackKey(71)).toBe(false); // B4
    });
  });


  describe('parseChordToMidiNotes', () => {
    it('parses a simple major chord', () => {
      const notes = parseChordToMidiNotes('C');
      expect(notes.length).toBeGreaterThan(0);
      // C major should contain C, E, G notes
      const noteNames = notes.map(n => n.noteName);
      expect(noteNames).toContain('C');
      expect(noteNames).toContain('E');
      expect(noteNames).toContain('G');
    });

    it('parses a minor chord', () => {
      const notes = parseChordToMidiNotes('Am');
      expect(notes.length).toBeGreaterThan(0);
      const noteNames = notes.map(n => n.noteName);
      expect(noteNames).toContain('A');
      expect(noteNames).toContain('C');
      expect(noteNames).toContain('E');
    });

    it('parses a seventh chord', () => {
      const notes = parseChordToMidiNotes('G7');
      expect(notes.length).toBeGreaterThanOrEqual(4);
      const noteNames = notes.map(n => n.noteName);
      expect(noteNames).toContain('G');
      expect(noteNames).toContain('B');
    });

    it('parses slash chords with bass note', () => {
      const notes = parseChordToMidiNotes('C/G');
      expect(notes.length).toBeGreaterThan(0);
      // Bass note should be the lowest
      const midiValues = notes.map(n => n.midi);
      const lowestNote = notes.find(n => n.midi === Math.min(...midiValues));
      expect(lowestNote?.noteName).toBe('G');
    });

    it('handles N.C. (no chord) marker', () => {
      const notes = parseChordToMidiNotes('N.C.');
      expect(notes).toHaveLength(0);
    });

    it('handles empty string', () => {
      const notes = parseChordToMidiNotes('');
      expect(notes).toHaveLength(0);
    });

    it('handles sharps and flats in root', () => {
      const cSharp = parseChordToMidiNotes('C#');
      const dFlat = parseChordToMidiNotes('Db');
      // Both should produce the same root pitch class
      expect(cSharp.length).toBeGreaterThan(0);
      expect(dFlat.length).toBeGreaterThan(0);
    });

    it('handles complex chord types', () => {
      const chordTypes = ['Cmaj7', 'Am7', 'Bdim', 'Faug', 'Dsus4', 'Gsus2'];
      chordTypes.forEach(chord => {
        const notes = parseChordToMidiNotes(chord);
        expect(notes.length).toBeGreaterThan(0);
      });
    });

    it('parses half-diminished aliases with unicode flats without collapsing to major', () => {
      const notes = parseChordToMidiNotes('A:min7♭5');
      const noteNames = notes.map((note) => note.noteName);

      expect(noteNames).toEqual(expect.arrayContaining(['A', 'C', 'D#', 'G']));
      expect(noteNames).not.toContain('E');
    });
  });

  describe('buildChordTimeline', () => {
    it('builds timeline from chord and beat arrays', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5] as (number | null)[];

      const timeline = buildChordTimeline(chords, beats);

      expect(timeline.length).toBeGreaterThan(0);
      timeline.forEach(event => {
        expect(event.chordName).toBeDefined();
        expect(event.notes).toBeDefined();
        expect(typeof event.startTime).toBe('number');
        expect(typeof event.endTime).toBe('number');
        expect(event.endTime).toBeGreaterThan(event.startTime);
      });
    });

    it('handles padding and shift counts', () => {
      const chords = ['', '', 'C', 'Am', 'F', 'G'];
      const beats = [null, null, 0.5, 1.0, 1.5, 2.0] as (number | null)[];

      const timeline = buildChordTimeline(chords, beats, 2, 0);
      // Padded chords should not produce timeline events
      expect(timeline.every(e => e.chordName !== '')).toBe(true);
    });

    it('preserves timed padding no-chord beats after visual alignment', () => {
      const chords = ['', 'N.C.', 'C'];
      const beats = [null, 0, 0.5] as (number | null)[];

      const timeline = buildChordTimeline(chords, beats, 1, 1);

      expect(timeline.map((event) => event.chordName)).toEqual(['N.C.', 'C']);
      expect(timeline[0].notes).toEqual([]);
      expect(timeline[0].startTime).toBe(0);
      expect(timeline[0].endTime).toBe(0.5);
    });

    it('returns empty array for empty input', () => {
      expect(buildChordTimeline([], [])).toEqual([]);
    });

    it('handles N.C. markers in progression', () => {
      const chords = ['C', 'N.C.', 'Am', 'N.C.'];
      const beats = [0, 0.5, 1.0, 1.5] as (number | null)[];

      const timeline = buildChordTimeline(chords, beats);
      expect(timeline.map((event) => event.chordName)).toEqual(['C', 'N.C.', 'Am', 'N.C.']);
      // N.C. events should still be in timeline but with no notes
      const ncEvents = timeline.filter(e => e.chordName === 'N.C.');
      ncEvents.forEach(e => {
        expect(e.notes).toHaveLength(0);
      });
    });
  });

  describe('getMidiRange', () => {
    it('returns correct range from chord events', () => {
      const chords = ['C', 'Am', 'G'];
      const beats = [0, 0.5, 1.0] as (number | null)[];
      const timeline = buildChordTimeline(chords, beats);

      const range = getMidiRange(timeline);
      expect(range.min).toBeLessThan(range.max);
      expect(range.min).toBeGreaterThanOrEqual(0);
      expect(range.max).toBeLessThanOrEqual(127);
    });

    it('handles empty events array', () => {
      const range = getMidiRange([]);
      expect(range.min).toBeDefined();
      expect(range.max).toBeDefined();
    });
  });

  describe('constant exports', () => {
    it('exports NOTE_INDEX_MAP with all 12 pitch classes', () => {
      const naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      naturalNotes.forEach(note => {
        expect(NOTE_INDEX_MAP[note]).toBeDefined();
      });
      expect(NOTE_INDEX_MAP['C']).toBe(0);
      expect(NOTE_INDEX_MAP['B']).toBe(11);
    });

    it('exports CHORD_STRUCTURES with standard chord types', () => {
      expect(CHORD_STRUCTURES.major).toEqual([0, 4, 7]);
      expect(CHORD_STRUCTURES.minor).toEqual([0, 3, 7]);
      expect(CHORD_STRUCTURES.dom7).toEqual([0, 4, 7, 10]);
      expect(CHORD_STRUCTURES.dim).toEqual([0, 3, 6]);
    });

    it('exports CHORD_TYPE_ALIASES mapping common names', () => {
      expect(CHORD_TYPE_ALIASES['']).toBe('major');
      expect(CHORD_TYPE_ALIASES['m']).toBe('minor');
      expect(CHORD_TYPE_ALIASES['7']).toBe('dom7');
      expect(CHORD_TYPE_ALIASES['dim']).toBe('dim');
    });
  });
});
