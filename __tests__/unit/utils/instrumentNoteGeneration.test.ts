import { parseChordToMidiNotes, type ChordEvent } from '@/utils/chordToMidi';
import {
  generateAllInstrumentVisualNotes,
  generateNotesForInstrument,
  mergeConsecutiveChordEvents,
} from '@/utils/instrumentNoteGeneration';
import { countAnchorFingerChanges, resolveGuitarVoicing } from '@/utils/guitarVoicing';
import { useUIStore } from '@/stores/uiStore';

describe('instrumentNoteGeneration octave defaults', () => {
  const chordNotes = parseChordToMidiNotes('C');
  const baseParams = {
    chordName: 'C',
    chordNotes,
    duration: 2,
    beatDuration: 0.5,
  };
  const shortParams = {
    ...baseParams,
    duration: 1.5,
  };
  const extendedLongParams = {
    ...baseParams,
    duration: 4,
  };
  const preEndingLongParams = {
    ...extendedLongParams,
    startTime: 20,
    totalDuration: 32,
  };
  const sparseWindowLongParams = {
    ...extendedLongParams,
    startTime: 24,
    totalDuration: 32,
  };
  const crossWindowLongParams = {
    ...extendedLongParams,
    startTime: 27,
    totalDuration: 32,
  };
  const finalLongParams = {
    ...extendedLongParams,
    startTime: 28,
    totalDuration: 32,
  };

  it('generates violin root notes one octave higher at octave 6', () => {
    const notes = generateNotesForInstrument('violin', baseParams);

    expect(notes).toHaveLength(1);
    expect(notes[0].noteName).toBe('C6');
  });

  it('generates flute tones using the 5th at octave 5 with a syncopated pattern', () => {
    // Flute now always uses a two-note syncopated pattern (even for short chords)
    const notes = generateNotesForInstrument('flute', shortParams);

    expect(notes).toHaveLength(2);
    expect(notes[0].noteName).toBe('G5');
    expect(notes[1].noteName).toBe('G5');
    expect(notes[0].startOffset).toBe(0);
    expect(notes[1].startOffset).toBeCloseTo(0.55, 2);
  });

  it('keeps flute on the 3rd for slash chords with syncopated pattern', () => {
    const notes = generateNotesForInstrument('flute', {
      ...shortParams,
      chordName: 'C/G',
      chordNotes: parseChordToMidiNotes('C/G'),
    });

    expect(notes).toHaveLength(2);
    expect(notes[0].noteName).toBe('E5');
    expect(notes[1].noteName).toBe('E5');
  });

  it('uses the flute long pattern with alternating 3rd and 5th', () => {
    const notes = generateNotesForInstrument('flute', baseParams);

    expect(notes).toHaveLength(3);
    expect(notes.map((note) => note.noteName)).toEqual(['E5', 'G5', 'E5']);
    expect(notes[0].startOffset).toBe(0);
    expect(notes[1].startOffset).toBeCloseTo(0.625, 3);
    expect(notes[2].startOffset).toBe(1);
    expect(notes[1].velocityMultiplier).toBeLessThan(notes[0].velocityMultiplier);
  });

  it('generates no scheduled chord-pattern notes for saxophone because sax is reserved for melody playback only', () => {
    const notes = generateNotesForInstrument('saxophone', baseParams);

    expect(notes).toEqual([]);
  });

  it('keeps melodyViolin aligned with violin note generation for the same chord', () => {
    const violinNotes = generateNotesForInstrument('violin', {
      ...baseParams,
      chordName: 'Dm',
      chordNotes: parseChordToMidiNotes('Dm'),
    });
    const melodyNotes = generateNotesForInstrument('melodyViolin', {
      ...baseParams,
      chordName: 'Dm',
      chordNotes: parseChordToMidiNotes('Dm'),
    });

    expect(melodyNotes).toEqual(violinNotes);
  });

  it('keeps melodyViolin at the original detected pitch register used by violin playback', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
    });

    expect(notes).toEqual([]);
  });

  it('does not infer Eb minor when the explicit song key is just Eb for melody-only sax retirement path', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      chordName: 'Cm',
      chordNotes: parseChordToMidiNotes('Cm'),
      duration: 4,
      targetKey: 'Eb',
    });

    expect(notes).toEqual([]);
  });

  it('returns no saxophone chord notes even for longer phrases', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
    });

    expect(notes).toHaveLength(0);
  });

  it('returns no saxophone chord notes regardless of key-aware context', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      chordName: 'G7',
      chordNotes: parseChordToMidiNotes('G7'),
      duration: 4,
      targetKey: 'C major',
    });
    expect(notes).toEqual([]);
  });

  it('returns no saxophone chord notes for key-safe ornament tests because the sax path is retired', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      chordName: 'G7',
      chordNotes: parseChordToMidiNotes('G7'),
      duration: 4,
      targetKey: 'C major',
    });
    expect(notes).toEqual([]);
  });

  it('returns no saxophone chord notes on strong harmonic positions because melody playback is handled separately', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      chordName: 'G7',
      chordNotes: parseChordToMidiNotes('G7'),
      duration: 4,
      targetKey: 'C major',
    });
    expect(notes).toEqual([]);
  });

  it('returns no saxophone cell pattern into a phrase ending because the sax motif generator was removed', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
      targetKey: 'C major',
    });

    expect(notes).toEqual([]);
  });

  it('returns no sustained saxophone ending because the runtime melody line uses Sheet Sage instead', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
      targetKey: 'C major',
    });

    expect(notes).toEqual([]);
  });

  it('returns no long saxophone ending on a four-beat phrase because direct sax scheduling is disabled', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
      targetKey: 'C major',
    });

    expect(notes).toEqual([]);
  });

  it('returns no saxophone pitch range for chord playback because the sax generator is retired', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
      targetKey: 'C major',
    });

    expect(notes).toEqual([]);
  });

  it('returns no saxophone ornamentation notes because ornamented sax playback is no longer generated from chords', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      chordName: 'G7',
      chordNotes: parseChordToMidiNotes('G7'),
      duration: 4,
      targetKey: 'C major',
    });
    expect(notes).toEqual([]);
  });

  it('avoids two-note ostinato behavior in the saxophone motif', () => {
    const notes = generateNotesForInstrument('saxophone', {
      ...baseParams,
      duration: 4,
      targetKey: 'C major',
    });
    const pitchClasses = notes.map((note) => note.noteName.replace(/\d+$/, ''));

    const hasAlternatingOstinatoWindow = pitchClasses.some((_, index) => {
      const window = pitchClasses.slice(index, index + 4);
      return window.length === 4
        && window[0] === window[2]
        && window[1] === window[3]
        && window[0] !== window[1];
    });

    expect(hasAlternatingOstinatoWindow).toBe(false);
  });

  it('uses a block chord + arpeggio piano pattern for chords spanning at least four beats', () => {
    const notes = generateNotesForInstrument('piano', baseParams);

    // The current pattern starts with a full chord block at offset 0, then arpeggiated upper notes
    expect(notes.filter((note) => note.noteName === 'C3').map((note) => note.startOffset)).toEqual([0]);
    expect(notes.filter((note) => note.startOffset === 0).map((note) => note.noteName)).toEqual(['C3', 'C4', 'E4', 'G4']);
    // Additional piano activity follows after the initial attack, including off-beat fills.
    expect(notes.length).toBeGreaterThan(4);
    expect(notes.some((note) => note.startOffset > 0 && !note.isBass)).toBe(true);
    expect(notes.some((note) => note.startOffset === 0.75 && !note.isBass)).toBe(true);
  });

  it('uses the piano arpeggio pattern for slash chords with the bass note', () => {
    const notes = generateNotesForInstrument('piano', {
      ...baseParams,
      chordName: 'C/G',
      chordNotes: parseChordToMidiNotes('C/G'),
    });

    // Bass note G3 appears at offset 0
    expect(notes.filter((note) => note.noteName === 'G3').map((note) => note.startOffset)).toEqual([0]);
    // Full chord at offset 0 followed by arpeggio
    expect(notes.length).toBeGreaterThan(4);
  });

  it('keeps the flattened fifth in sparse half-diminished piano voicings', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      chordName: 'Am7b5',
      chordNotes: parseChordToMidiNotes('Am7b5'),
      signalDynamics: {
        energy: 0.06,
        spectralFlux: 0.08,
        onsetStrength: 0.08,
        intensity: 0.08,
        normalizedIntensity: 0.08,
        quietness: 0.95,
        fullness: 0.2,
        motion: 0.12,
        attack: 0.08,
        intensityBand: 'quiet',
      },
    });

    const openingUpperNotes = notes
      .filter((note) => note.startOffset === 0 && !note.isBass)
      .map((note) => note.noteName);

    expect(openingUpperNotes).toContain('D#4');
  });

  it('adds an opening upper attack in quiet half-note piano patterns', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      signalDynamics: {
        energy: 0.05,
        spectralFlux: 0.1,
        onsetStrength: 0.08,
        intensity: 0.08,
        normalizedIntensity: 0.08,
        quietness: 0.95,
        fullness: 0.2,
        motion: 0.2,
        attack: 0.1,
        intensityBand: 'quiet',
      },
    });

    expect(notes.some((note) => note.startOffset === 0 && !note.isBass)).toBe(true);
  });

  it('uses a full block chord when the piano chord span is shorter than four beats', () => {
    const notes = generateNotesForInstrument('piano', shortParams);

    expect(notes.map((note) => note.noteName)).toEqual(['C3', 'C4', 'E4', 'G4']);
    expect(notes.every((note) => note.startOffset === 0)).toBe(true);
  });

  it('applies cluster volume reduction to very short piano chords', () => {
    const notes = generateNotesForInstrument('piano', {
      ...baseParams,
      duration: 1,
    });
    const bassNote = notes.find((note) => note.noteName === 'C3');

    expect(bassNote).toBeDefined();
    expect(notes.every((note) => note.startOffset === 0)).toBe(true);
    expect(bassNote!.velocityMultiplier).toBeLessThan(1);
  });

  it('uses scheduled note durations in generated piano visual notes', () => {
    const progression = [
      'C', 'C', 'C', 'C',
      'F', 'F', 'F', 'F',
      'G', 'G', 'G', 'G',
      'C', 'C', 'C', 'C',
      'Am', 'Am', 'Am', 'Am',
      'G', 'G', 'G', 'G',
    ];
    const chordEvents: ChordEvent[] = progression.map((chordName, beatIndex) => ({
      chordName,
      notes: parseChordToMidiNotes(chordName),
      startTime: beatIndex * 0.5,
      endTime: (beatIndex + 1) * 0.5,
      beatIndex,
    }));
    const visualNotes = generateAllInstrumentVisualNotes(
      chordEvents,
      [{ name: 'piano', color: '#fff' }],
      new Map(),
    );

    const repeatedUpperTone = visualNotes.find(
      (note) => note.chordName === 'F' && note.startTime >= 2.5 && note.startTime < 3,
    );

    expect(repeatedUpperTone).toBeDefined();
    expect(repeatedUpperTone!.endTime).toBeGreaterThanOrEqual(2.99);
  });

  it('uses local chord span timing instead of global bpm when visual beats are slower', () => {
    const slowFourBeatEvent: ChordEvent[] = [
      {
        chordName: 'C',
        notes: parseChordToMidiNotes('C'),
        startTime: 0,
        endTime: 4,
        beatIndex: 0,
        beatCount: 4,
      },
      {
        chordName: 'F',
        notes: parseChordToMidiNotes('F'),
        startTime: 20,
        endTime: 20.5,
        beatIndex: 20,
        beatCount: 1,
      },
    ];

    const visualNotes = generateAllInstrumentVisualNotes(
      slowFourBeatEvent,
      [{ name: 'piano', color: '#fff' }],
      new Map(),
      240,
    );

    // The C chord spans 4 seconds local timing. Bass C3 appears at start.
    const c3Notes = visualNotes.filter((note) => note.chordName === 'C' && note.midi === 48);
    expect(c3Notes.length).toBeGreaterThanOrEqual(1);
    expect(c3Notes[0].startTime).toBe(0);
  });

  it('allows piano notes to extend to the full duration for longer chords', () => {
    const notes = generateNotesForInstrument('piano', {
      ...baseParams,
      duration: 2.01,
    });

    // The arpeggio pattern may extend to offset 2 since chord duration is 2.01
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.startOffset <= 2.01)).toBe(true);
  });

  it('does not generate notes for silent no-chord events', () => {
    const notes = generateNotesForInstrument('bass', {
      chordName: 'N.C.',
      chordNotes: [],
      duration: 1,
      beatDuration: 0.5,
    });

    expect(notes).toEqual([]);
  });

  it('does not merge the same chord across a silent beat gap', () => {
    const merged = mergeConsecutiveChordEvents([
      {
        chordName: 'C',
        notes: parseChordToMidiNotes('C'),
        startTime: 0,
        endTime: 0.5,
        beatIndex: 0,
      },
      {
        chordName: 'N.C.',
        notes: [],
        startTime: 0.5,
        endTime: 1,
        beatIndex: 1,
      },
      {
        chordName: 'C',
        notes: parseChordToMidiNotes('C'),
        startTime: 1,
        endTime: 1.5,
        beatIndex: 2,
      },
    ]);

    expect(merged).toHaveLength(3);
    expect(merged.map((event) => event.chordName)).toEqual(['C', 'N.C.', 'C']);
  });

  it('does not leak the first long-chord pattern into the next consecutive long chord', () => {
    const chordEvents: ChordEvent[] = [
      {
        chordName: 'C',
        notes: parseChordToMidiNotes('C'),
        startTime: 0,
        endTime: 2.01,
        beatIndex: 0,
      },
      {
        chordName: 'F',
        notes: parseChordToMidiNotes('F'),
        startTime: 2.01,
        endTime: 4.02,
        beatIndex: 4,
      },
    ];

    const visualNotes = generateAllInstrumentVisualNotes(
      chordEvents,
      [{ name: 'piano', color: '#fff' }],
      new Map(),
    );

    expect(
      visualNotes.some((note) => note.chordName === 'C' && note.startTime >= 2.01),
    ).toBe(false);
  });

  it('uses a block chord + arpeggio piano pattern away from the end of the song', () => {
    const notes = generateNotesForInstrument('piano', preEndingLongParams);

    // Bass C3 appears at the start
    expect(notes.filter((note) => note.noteName === 'C3').map((note) => note.startOffset)).toEqual([0]);
    // Full pattern has block chord + arpeggio
    expect(notes.length).toBeGreaterThan(4);
  });

  it('uses a block chord + arpeggio pattern even in the endgame window', () => {
    const notes = generateNotesForInstrument('piano', sparseWindowLongParams);

    // Bass C3 at offset 0
    expect(notes.filter((note) => note.noteName === 'C3').map((note) => note.startOffset)).toEqual([0]);
    // Has block chord at 0 plus arpeggio notes
    expect(notes.filter((note) => note.startOffset === 0).length).toBeGreaterThanOrEqual(4);
  });

  it('uses a block chord + arpeggio pattern in the cross-window region', () => {
    const notes = generateNotesForInstrument('piano', crossWindowLongParams);

    expect(notes.filter((note) => note.noteName === 'C3').map((note) => note.startOffset)).toEqual([0]);
    expect(notes.length).toBeGreaterThan(4);
  });

  it('uses a block chord + arpeggio pattern in the final measures of the song', () => {
    const notes = generateNotesForInstrument('piano', finalLongParams);

    expect(notes).toHaveLength(4);
    expect(notes.map((note) => note.noteName)).toEqual(['C3', 'C4', 'E4', 'G4']);
    expect(notes.every((note) => note.startOffset === 0)).toBe(true);
  });

  it('keeps quiet long piano sections from turning into constant eighth-note ostinatos', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      signalDynamics: {
        energy: 0.12,
        spectralFlux: 0.16,
        onsetStrength: 0.12,
        intensity: 0.1,
        normalizedIntensity: 0.1,
        quietness: 0.92,
        fullness: 0.12,
        motion: 0.18,
        attack: 0.12,
        intensityBand: 'quiet',
      },
    });
    const upperOffsets = notes
      .filter((note) => !note.isBass && note.startOffset > 0)
      .map((note) => note.startOffset);
    const openingUpperDurations = notes
      .filter((note) => !note.isBass && note.startOffset === 0)
      .map((note) => note.duration);

    expect(upperOffsets.length).toBeGreaterThan(0);
    expect(upperOffsets).not.toContain(0.75);
    expect(upperOffsets).not.toContain(1.25);
    expect(upperOffsets.every((offset) => Number.isInteger(offset / 0.5))).toBe(true);
    expect(Math.min(...openingUpperDurations)).toBeGreaterThan(0.75);
  });

  it('uses longer half-note-style sustains in very quiet 4/4 piano sections', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      signalDynamics: {
        energy: 0.1,
        spectralFlux: 0.12,
        onsetStrength: 0.08,
        intensity: 0.08,
        normalizedIntensity: 0.08,
        quietness: 0.96,
        fullness: 0.1,
        motion: 0.12,
        attack: 0.1,
        intensityBand: 'quiet',
      },
    });
    const upperNotes = notes
      .filter((note) => !note.isBass)
      .sort((left, right) => left.startOffset - right.startOffset || left.midi - right.midi);
    const laterUpperOffsets = upperNotes
      .filter((note) => note.startOffset > 0)
      .map((note) => note.startOffset);
    const openingUpperDurations = upperNotes
      .filter((note) => note.startOffset === 0)
      .map((note) => note.duration);

    expect(laterUpperOffsets.length).toBeGreaterThan(0);
    expect(laterUpperOffsets).not.toContain(0.5);
    expect(laterUpperOffsets).not.toContain(1.5);
    expect(laterUpperOffsets.every((offset) => Number.isInteger(offset))).toBe(true);
    expect(Math.min(...openingUpperDurations)).toBeGreaterThanOrEqual(0.95);
  });

  it('extends low-activity 4/4 piano sections into half-note pulses before they become extremely quiet', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      signalDynamics: {
        energy: 0.18,
        spectralFlux: 0.22,
        onsetStrength: 0.18,
        intensity: 0.18,
        normalizedIntensity: 0.18,
        quietness: 0.78,
        fullness: 0.22,
        motion: 0.28,
        attack: 0.18,
        intensityBand: 'quiet',
      },
    });
    const upperNotes = notes
      .filter((note) => !note.isBass)
      .sort((left, right) => left.startOffset - right.startOffset || left.midi - right.midi);
    const laterUpperOffsets = upperNotes
      .filter((note) => note.startOffset > 0)
      .map((note) => note.startOffset);

    expect(laterUpperOffsets.length).toBeGreaterThan(0);
    expect(laterUpperOffsets).not.toContain(0.5);
    expect(laterUpperOffsets).not.toContain(1.5);
    expect(laterUpperOffsets.every((offset) => Number.isInteger(offset))).toBe(true);
  });

  it('extends sparse endgame piano sections into longer sustains when low-activity signal data is available', () => {
    const notes = generateNotesForInstrument('piano', {
      ...sparseWindowLongParams,
      signalDynamics: {
        energy: 0.18,
        spectralFlux: 0.2,
        onsetStrength: 0.16,
        intensity: 0.16,
        normalizedIntensity: 0.16,
        quietness: 0.62,
        fullness: 0.2,
        motion: 0.24,
        attack: 0.16,
        intensityBand: 'quiet',
      },
    });
    const upperNotes = notes
      .filter((note) => !note.isBass)
      .sort((left, right) => left.startOffset - right.startOffset || left.midi - right.midi);
    const laterUpperOffsets = upperNotes
      .filter((note) => note.startOffset > 0)
      .map((note) => note.startOffset);

    expect(laterUpperOffsets.length).toBeGreaterThan(0);
    expect(laterUpperOffsets).not.toContain(0.5);
    expect(laterUpperOffsets).not.toContain(1.5);
    expect(laterUpperOffsets.every((offset) => Number.isInteger(offset))).toBe(true);
  });

  it('keeps dense right-hand piano fills inside one rhythmic line before the next onset', () => {
    const notes = generateNotesForInstrument('piano', {
      ...extendedLongParams,
      signalDynamics: {
        energy: 0.62,
        spectralFlux: 0.7,
        onsetStrength: 0.66,
        intensity: 0.68,
        normalizedIntensity: 0.68,
        quietness: 0.16,
        fullness: 0.72,
        motion: 0.74,
        attack: 0.66,
        intensityBand: 'loud',
      },
    });
    const upperNotes = notes
      .filter((note) => !note.isBass)
      .sort((left, right) => left.startOffset - right.startOffset || left.midi - right.midi);

    expect(upperNotes.some((note) => note.startOffset === 0.75)).toBe(true);
    expect(upperNotes.some((note) => note.startOffset === 1.25)).toBe(true);
    expect(upperNotes.some((note) => note.startOffset === 1.75)).toBe(true);

    for (let index = 0; index < upperNotes.length;) {
      const onset = upperNotes[index].startOffset;
      let nextIndex = index + 1;

      while (nextIndex < upperNotes.length && upperNotes[nextIndex].startOffset === onset) {
        nextIndex += 1;
      }

      const nextOnset = upperNotes[nextIndex]?.startOffset;
      if (nextOnset !== undefined) {
        const onsetGroup = upperNotes.slice(index, nextIndex);
        expect(onsetGroup.every((note) => note.startOffset + note.duration <= nextOnset + 1e-6)).toBe(true);
      }

      index = nextIndex;
    }
  });

  it('backs off to a sparse ending pattern before the final cadence window', () => {
    const notes = generateNotesForInstrument('piano', {
      chordName: 'C',
      chordNotes: parseChordToMidiNotes('C'),
      duration: 4,
      beatDuration: 0.5,
      startTime: 28.5,
      totalDuration: 32,
      signalDynamics: {
        energy: 0.68,
        spectralFlux: 0.74,
        onsetStrength: 0.72,
        intensity: 0.7,
        normalizedIntensity: 0.7,
        quietness: 0.14,
        fullness: 0.74,
        motion: 0.76,
        attack: 0.72,
        intensityBand: 'loud',
      },
    });
    const upperOffsets = notes.filter((note) => !note.isBass && note.startOffset > 0).map((note) => note.startOffset);

    expect(upperOffsets).not.toContain(0.75);
    expect(upperOffsets.every((offset) => Number.isInteger(offset / 0.5))).toBe(true);
  });

  it('keeps dense piano subdivisions in a compact register for seventh chords', () => {
    const notes = generateNotesForInstrument('piano', {
      chordName: 'G#m7',
      chordNotes: parseChordToMidiNotes('G#m7'),
      duration: 2,
      beatDuration: 0.5,
    });
    const upperSubdivisionNotes = notes
      .filter((note) => note.startOffset > 0 && !note.isBass)
      .sort((a, b) => a.startOffset - b.startOffset);
    const melodicLeaps = upperSubdivisionNotes.slice(1).map((note, index) => (
      Math.abs(note.midi - upperSubdivisionNotes[index].midi)
    ));

    expect(upperSubdivisionNotes.length).toBeGreaterThan(1);
    expect(Math.max(...melodicLeaps)).toBeLessThanOrEqual(8);
  });

  it('uses block chord + arpeggio piano pattern in 3/4 time', () => {
    const waltzParams = {
      chordName: 'C',
      chordNotes: parseChordToMidiNotes('C'),
      duration: 1.5,
      beatDuration: 0.5,
      timeSignature: 3,
    };
    const notes = generateNotesForInstrument('piano', waltzParams);

    // Bass note on beat 1
    const bassOffsets = notes.filter((n) => n.noteName === 'C3').map((n) => n.startOffset);
    expect(bassOffsets).toEqual([0]);

    // E4 still appears at the onset and later in the pattern
    const upperOffsets = notes.filter((n) => n.noteName === 'E4').map((n) => n.startOffset);
    expect(upperOffsets).toContain(0);
    expect(upperOffsets.some((offset) => offset > 0)).toBe(true);
  });

  it('uses block chord + arpeggio pattern in 6/8 time', () => {
    const compoundWaltzParams = {
      chordName: 'C',
      chordNotes: parseChordToMidiNotes('C'),
      duration: 3.0,
      beatDuration: 0.5,
      timeSignature: 6,
    };
    const notes = generateNotesForInstrument('piano', compoundWaltzParams);

    // Bass on first beat only
    const bassOffsets = notes.filter((n) => n.noteName === 'C3').map((n) => n.startOffset);
    expect(bassOffsets).toEqual([0]);

    // E4 occurs in the pattern
    const upperOffsets = notes.filter((n) => n.noteName === 'E4').map((n) => n.startOffset);
    expect(upperOffsets).toContain(0);
  });

  it('uses block chord pattern for 6/8 chords spanning only 3 beats (half-measure)', () => {
    const halfMeasureParams = {
      chordName: 'C',
      chordNotes: parseChordToMidiNotes('C'),
      duration: 1.5,
      beatDuration: 0.5,
      timeSignature: 6,
    };
    const notes = generateNotesForInstrument('piano', halfMeasureParams);

    // Bass on beat 1 only
    const bassOffsets = notes.filter((n) => n.noteName === 'C3').map((n) => n.startOffset);
    expect(bassOffsets).toEqual([0]);

    // E4 at offset 0 in the block chord
    const upperOffsets = notes.filter((n) => n.noteName === 'E4').map((n) => n.startOffset);
    expect(upperOffsets).toContain(0);
  });

  it('generates diagram-driven 4/4 guitar strums from the displayed voicing', () => {
    const notes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 2,
      beatDuration: 0.5,
      timeSignature: 4,
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });

    const resolvedVoicing = resolveGuitarVoicing('G', { capoFret: 0, selectedPositions: { G: 0 } }, 'C');
    const firstDownstroke = notes.filter((note) => note.startOffset < 0.1);
    const secondFullDownstroke = notes.filter((note) => note.startOffset >= 0.95 && note.startOffset < 1.1);
    const ghostUpstroke = notes.filter((note) => note.startOffset >= 1.24 && note.startOffset < 1.35);

    expect(resolvedVoicing).toBeDefined();
    expect(firstDownstroke.map((note) => note.noteName)).toEqual(resolvedVoicing?.noteNames);
    expect(secondFullDownstroke).toHaveLength(firstDownstroke.length);
    expect(ghostUpstroke.length).toBeGreaterThan(0);
    expect(ghostUpstroke.length).toBeLessThan(firstDownstroke.length);
    expect(notes.every((note) => note.startOffset >= 0 && note.startOffset < 2)).toBe(true);
    expect(notes.every((note) => note.duration >= 0)).toBe(true);
    expect(notes.every((note) => note.startOffset + note.duration <= 2.05)).toBe(true);
  });

  it('generates diagram-driven 3/4 guitar strums with two strums', () => {
    const notes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 1.5,
      beatDuration: 0.5,
      timeSignature: 3,
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });

    const distinctStrumStarts = Array.from(new Set(notes.map((note) => Number(note.startOffset.toFixed(2)))));
    expect(distinctStrumStarts[0]).toBe(0);
    expect(distinctStrumStarts.some((offset) => offset >= 1 && offset < 1.1)).toBe(true);
    expect(notes.every((note) => note.startOffset >= 0 && note.startOffset < 1.5)).toBe(true);
  });

  it('keeps the syncopated upstroke on short guitar spans when the transition allows it', () => {
    const notes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 1,
      beatDuration: 0.5,
      timeSignature: 4,
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });

    const downstroke = notes.filter((note) => note.startOffset < 0.1);
    const upstroke = notes.filter((note) => note.startOffset >= 0.74 && note.startOffset < 0.85);

    expect(downstroke.length).toBeGreaterThan(0);
    expect(upstroke.length).toBeGreaterThan(0);
    expect(upstroke.length).toBeLessThan(downstroke.length);
  });

  it('switches to beat-based fingerpicking for quiet sparse guitar dynamics', () => {
    const notes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 2,
      beatDuration: 0.5,
      timeSignature: 4,
      signalDynamics: {
        energy: 0.12,
        spectralFlux: 0.15,
        onsetStrength: 0.12,
        intensity: 0.1,
        normalizedIntensity: 0.1,
        quietness: 1,
        fullness: 0.04,
        motion: 0.18,
        attack: 0.12,
        intensityBand: 'quiet',
      },
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });

    expect(notes).toHaveLength(4);
    expect(notes.map((note) => note.startOffset)).toEqual([0, 0.5, 1, 1.5]);
    expect(notes.filter((note) => note.isBass).length).toBeGreaterThanOrEqual(1);
    expect(notes.filter((note) => note.isBass).every((note) => Number.isInteger(note.startOffset / 0.5))).toBe(true);
    expect(notes.every((note) => note.startOffset + note.duration <= 2)).toBe(true);
  });

  it('softens near-threshold guitar strums when transitioning out of fingerpicking', () => {
    const transitioningNotes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 1,
      beatDuration: 0.5,
      timeSignature: 4,
      signalDynamics: {
        energy: 0.3,
        spectralFlux: 0.26,
        onsetStrength: 0.24,
        intensity: 0.28,
        normalizedIntensity: 0.28,
        quietness: 0.57,
        fullness: 0,
        motion: 0.26,
        attack: 0.24,
        intensityBand: 'medium',
      },
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });
    const fullStrumNotes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 1,
      beatDuration: 0.5,
      timeSignature: 4,
      signalDynamics: {
        energy: 0.72,
        spectralFlux: 0.74,
        onsetStrength: 0.7,
        intensity: 0.74,
        normalizedIntensity: 0.74,
        quietness: 0.16,
        fullness: 0.78,
        motion: 0.74,
        attack: 0.7,
        intensityBand: 'loud',
      },
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0 } },
      targetKey: 'C',
    });

    expect(transitioningNotes.length).toBeGreaterThan(3);
    expect(fullStrumNotes.length).toBeGreaterThan(transitioningNotes.length);
    expect(Math.max(...transitioningNotes.map((note) => note.velocityMultiplier))).toBeLessThan(
      Math.max(...fullStrumNotes.map((note) => note.velocityMultiplier)),
    );
  });

  it('suppresses short-measure syncopation when the next chord requires a hard voicing jump', () => {
    const anchorChanges = countAnchorFingerChanges(resolveGuitarVoicing('G'), resolveGuitarVoicing('C'));
    expect(anchorChanges).not.toBeNull();
    expect(anchorChanges!).toBeGreaterThan(2);

    const notes = generateNotesForInstrument('guitar', {
      chordName: 'G',
      chordNotes: parseChordToMidiNotes('G'),
      duration: 1,
      beatDuration: 0.5,
      timeSignature: 4,
      guitarVoicing: { capoFret: 0, selectedPositions: { G: 0, C: 0 } },
      targetKey: 'C',
      nextChordName: 'C',
    });

    const downstroke = notes.filter((note) => note.startOffset < 0.1);
    const lateUpstroke = notes.filter((note) => note.startOffset >= 0.74 && note.startOffset < 0.85);

    expect(downstroke.length).toBeGreaterThan(0);
    expect(lateUpstroke).toHaveLength(0);
  });

  it('keeps guitar visual notes aligned with the same shared voicing context', () => {
    useUIStore.setState({
      guitarCapoFret: 0,
      guitarSelectedPositions: { G: 0 },
    });

    const visualNotes = generateAllInstrumentVisualNotes(
      [{
        chordName: 'G',
        notes: parseChordToMidiNotes('G'),
        startTime: 0,
        endTime: 2,
        beatIndex: 0,
        beatCount: 4,
      }],
      [{ name: 'guitar', color: '#fff' }],
      new Map(),
      120,
      4,
      { capoFret: 0, selectedPositions: { G: 0 } },
      'C',
    );

    // First 6 notes form the first strum with correct MIDI values
    expect(visualNotes.slice(0, 6).map((note) => note.midi)).toEqual([43, 47, 50, 55, 59, 67]);
    // Second strum should exist
    expect(visualNotes.length).toBeGreaterThan(6);
  });
});
