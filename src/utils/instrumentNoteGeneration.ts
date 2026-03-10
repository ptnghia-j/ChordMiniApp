/**
 * Shared Instrument Note Generation Module
 *
 * Single source of truth for instrument-specific note voicing patterns.
 * Used by both:
 *   - FallingNotesCanvas.tsx (visual rendering)
 *   - soundfontChordPlaybackService.ts (audio playback)
 *
 * This ensures falling notes exactly match the audio that is played.
 */

import {
  noteNameToMidi,
  NOTE_INDEX_MAP,
  isNoChordChordName,
  type ChordEvent,
  type MidiNote,
} from '@/utils/chordToMidi';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported instrument names (lowercase) */
export type InstrumentName = 'piano' | 'guitar' | 'violin' | 'flute' | 'saxophone' | 'bass';

/** A scheduled note with timing and velocity information */
export interface ScheduledNote {
  /** Note name with octave, e.g. "C3", "E5" */
  noteName: string;
  /** MIDI note number (computed from noteName) */
  midi: number;
  /** Start time offset in seconds relative to chord start */
  startOffset: number;
  /** Duration in seconds (from startOffset to end of chord) */
  duration: number;
  /** Velocity multiplier (0-1 scale, 1 = base velocity) */
  velocityMultiplier: number;
  /** Whether this is a bass note (gets velocity boost in audio) */
  isBass: boolean;
}

/** Result of generating notes for a single chord + instrument */
export interface InstrumentChordNotes {
  instrument: InstrumentName;
  chordName: string;
  notes: ScheduledNote[];
}

/** Parameters for note generation */
export interface NoteGenerationParams {
  /** The chord event with notes, timing, etc. */
  chordName: string;
  /** Parsed chord notes from ChordEvent (MidiNote[]) */
  chordNotes: MidiNote[];
  /** Total duration of the chord in seconds */
  duration: number;
  /** Average beat duration in seconds (60 / BPM) */
  beatDuration: number;
  /** Absolute start time of this chord/event in the song timeline */
  startTime?: number;
  /** Estimated total song duration in seconds */
  totalDuration?: number;
  /** Time signature (beats per measure, e.g. 3 for 3/4, default 4) */
  timeSignature?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Volume reduction for short chord clusters */
export const CLUSTER_VOLUME_REDUCTION = 0.75;

/** Bass note velocity boost multiplier */
export const BASS_VELOCITY_BOOST = 1.25;

/** Minimum chord length (in beats) required for the piano repeating rhythm pattern */
export const PIANO_PATTERN_MIN_BEATS = 4;

/** Scale down the short-chord piano bass pickup so it reads as a light syncopation */
export const SHORT_CHORD_BASS_PICKUP_VELOCITY_REDUCTION = 0.65;

/** Make the short-chord piano bass pickup brief */
export const SHORT_CHORD_BASS_PICKUP_DURATION_FACTOR = 0.4;

/** Four 4/4 measures before the end, stop using the dense piano long-pattern */
export const PIANO_ENDGAME_FULL_PATTERN_CUTOFF_MEASURES = 4;

/** In the last four measures but before the final two, strike the piano chord twice */
export const PIANO_ENDGAME_DOUBLE_STRIKE_CUTOFF_MEASURES = 2;

/** Small epsilon for floating-point comparisons in timing math */
const TIMING_EPSILON = 1e-6;

// Chromatic scale for note name resolution
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merge consecutive chord events with the same chord name into single events.
 * The audio playback service only triggers on chord changes, so the visualization
 * should mirror that behavior — one visual event per chord change, spanning the
 * full duration until the next change.
 */
export function mergeConsecutiveChordEvents(events: ChordEvent[]): ChordEvent[] {
  if (events.length === 0) return [];

  const merged: ChordEvent[] = [];
  let current: ChordEvent = {
    ...events[0],
    beatCount: events[0].beatCount ?? 1,
  };

  for (let i = 1; i < events.length; i++) {
    const isContiguous = Math.abs(events[i].startTime - current.endTime) <= TIMING_EPSILON;
    if (events[i].chordName === current.chordName && isContiguous) {
      // Same chord — extend endTime
      current.endTime = events[i].endTime;
      current.beatCount = (current.beatCount ?? 1) + (events[i].beatCount ?? 1);
    } else {
      // Chord changed — push previous and start new
      merged.push(current);
      current = {
        ...events[i],
        beatCount: events[i].beatCount ?? 1,
      };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Estimate average beat duration from raw chord events.
 */
export function estimateBeatDuration(events: ChordEvent[]): number {
  if (events.length < 2) return 0.5; // fallback
  const totalSpan = events[events.length - 1].endTime - events[0].startTime;
  return totalSpan / events.length;
}

/**
 * Get beat duration from BPM.
 */
export function beatDurationFromBpm(bpm: number): number {
  if (bpm <= 0 || !isFinite(bpm)) return 0.5;
  return 60 / bpm;
}

// ─── Core Note Generation ────────────────────────────────────────────────────

/**
 * Generate scheduled notes for a single instrument playing a single chord.
 *
 * Patterns:
 * - **Piano**: For chords lasting at least 4 beats, upper tones repeat on beats 1/2/3/4
 *              while bass follows 1/2.5/3/4; shorter chords play the full chord once,
 *              voiced in octaves 3 and 4
 * - **Guitar**: Octave-aware arpeggiation with half-beat spacing:
 *   - Short (<2 beats): cluster at octave 3
 *   - Medium (2-3 beats): Root(2)→Fifth(3)→Third(4)
 *   - Long (3-5 beats): +Root(3)
 *   - Very Long (5-7 beats): Root(2)→Fifth(3)→Third(4)→Fifth(4)→Root(4)
 *   - Extra Long (≥7 beats): ascend+descend (9 notes)
 * - **Violin**: Root note only at octave 6 (sustained)
 * - **Flute**: Short chords sustain the bass/3rd at octave 5; long chords (≥4 beats)
 *              switch to the 5th at octave 5 with a syncopated re-attack
 * - **Saxophone**: Guide-tone lead phrase with syncopated accents for instrumental sections
 * - **Bass**: Single low note (E-B → octave 1, C-D# → octave 2)
 */
export function generateNotesForInstrument(
  instrument: InstrumentName,
  params: NoteGenerationParams,
): ScheduledNote[] {
  const { chordName, chordNotes, duration, beatDuration, startTime, totalDuration, timeSignature = 4 } = params;

  if (isNoChordChordName(chordName) || chordNotes.length === 0) {
    return [];
  }

  // Separate bass (octave 2) from main chord tones (octave 4/5)
  const bassEntry = chordNotes.find(n => n.octave === 2);
  const chordTones = chordNotes.filter(n => n.octave !== 2);
  if (chordTones.length === 0 && instrument !== 'bass') return [];

  const rootName = chordTones.length > 0 ? chordTones[0].noteName : (bassEntry?.noteName ?? 'C');
  const bassName = bassEntry ? bassEntry.noteName : rootName;

  const halfBeatDelay = beatDuration / 2;
  const fullBeatDelay = beatDuration;

  // Duration measured in beats
  const durationInBeats = duration / beatDuration;
  const isLongChord = durationInBeats >= 2;

  switch (instrument) {
    case 'piano':
      return generatePianoNotes(
        chordTones, bassEntry, rootName, bassName,
        duration, fullBeatDelay, durationInBeats, isLongChord, startTime, totalDuration, timeSignature,
      );

    case 'guitar':
      return generateGuitarNotes(
        chordTones, rootName,
        duration, halfBeatDelay, durationInBeats, isLongChord,
      );

    case 'violin':
      return generateViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(rootName, bassName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'saxophone':
      return generateSaxophoneNotes(rootName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'bass':
      return generateBassNotes(bassName, duration);

    default:
      return [];
  }
}

// ─── Instrument-Specific Generators ──────────────────────────────────────────

function generatePianoNotes(
  chordTones: MidiNote[],
  bassEntry: MidiNote | undefined,
  rootName: string,
  bassName: string,
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
  isLongChord: boolean,
  startTime?: number,
  totalDuration?: number,
  timeSignature: number = 4,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  // For compound time (6/8), the repeating pattern unit is 3 beats (one compound beat group),
  // not the full 6-beat measure. This lets chords spanning a half-measure (3 beats)
  // still get the waltz "oom-pah-pah" feel — matching the 3/4 strategy.
  const isCompoundTime = timeSignature === 6;
  const patternBeats = isCompoundTime ? 3 : timeSignature;
  const patternMeasureDuration = fullBeatDelay * patternBeats;
  const chordStartTime = startTime ?? 0;
  const chordEndTime = chordStartTime + duration;

  // Bass note MIDI (raised to octave 3)
  const bassNoteName = `${bassEntry ? bassName : rootName}3`;
  const bassMidi = noteNameToMidi(bassNoteName);

  const useRepeatingPattern = isLongChord && durationInBeats >= patternBeats;
  const shortChordNeedsBassPickup = isLongChord && !useRepeatingPattern;

  const clampDuration = (startOffset: number, requestedDuration: number) => {
    const remaining = duration - startOffset;
    return Math.max(0, Math.min(requestedDuration, remaining));
  };

  const pushSingleChord = (
    startOffset: number,
    noteDuration: number,
    volumeReduction: number,
    skipFifth: boolean = false,
  ) => {
    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      startOffset,
      duration: noteDuration,
      velocityMultiplier: (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * volumeReduction,
      isBass: !!bassEntry,
    });

    for (let toneIdx = 0; toneIdx < chordTones.length; toneIdx++) {
      // Skip the 5th (index 2) when requested — differentiates piano from guitar
      if (skipFifth && toneIdx === 2) continue;
      const tone = chordTones[toneIdx];
      const name = `${tone.noteName}4`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue;
      notes.push({
        noteName: name,
        midi,
        startOffset,
        duration: noteDuration,
        velocityMultiplier: volumeReduction,
        isBass: false,
      });
    }
  };

  const pushSingleChordAbsolute = (
    absoluteStartTime: number,
    absoluteEndTime: number,
    volumeReduction: number,
    skipFifth: boolean = false,
  ) => {
    const startOffset = Math.max(0, absoluteStartTime - chordStartTime);
    const noteDuration = clampDuration(startOffset, absoluteEndTime - absoluteStartTime);
    if (noteDuration <= 0) return;
    pushSingleChord(startOffset, noteDuration, volumeReduction, skipFifth);
  };

  const pushRepeatedNotesInWindow = (
    noteName: string,
    midi: number,
    patternOffsets: number[],
    velocityMultiplier: number,
    isBassNote: boolean,
    windowStartTime: number,
    windowEndTime: number,
  ) => {
    if (windowEndTime - windowStartTime < patternMeasureDuration - TIMING_EPSILON) {
      return;
    }

    const fullPatternCycles = Math.floor((windowEndTime - windowStartTime + TIMING_EPSILON) / patternMeasureDuration);
    for (let cycleIndex = 0; cycleIndex < fullPatternCycles; cycleIndex += 1) {
      const measureStart = windowStartTime + cycleIndex * patternMeasureDuration;
      for (let i = 0; i < patternOffsets.length; i += 1) {
        const absoluteStartTime = measureStart + patternOffsets[i];
        if (absoluteStartTime >= windowEndTime - TIMING_EPSILON) continue;
        const nextStart = patternOffsets[i + 1] !== undefined
          ? measureStart + patternOffsets[i + 1]
          : measureStart + patternMeasureDuration;
        const absoluteEndTime = Math.min(windowEndTime, nextStart);
        const startOffset = Math.max(0, absoluteStartTime - chordStartTime);
        const noteDuration = clampDuration(
          startOffset,
          Math.max(fullBeatDelay / 2, absoluteEndTime - absoluteStartTime),
        );
        if (noteDuration <= 0) continue;
        notes.push({
          noteName,
          midi,
          startOffset,
          duration: noteDuration,
          velocityMultiplier,
          isBass: isBassNote,
        });
      }
    }
  };

  if (!useRepeatingPattern) {
    // ── FULL-CHORD ONCE PATTERN (shorter chords) ──
    // Skip the 5th to differentiate piano voicing from guitar
    pushSingleChord(0, duration, CLUSTER_VOLUME_REDUCTION, chordTones.length >= 3);

    if (shortChordNeedsBassPickup) {
      const bassPickupOffset = fullBeatDelay * 1.5;
      const bassPickupDuration = clampDuration(
        bassPickupOffset,
        fullBeatDelay * SHORT_CHORD_BASS_PICKUP_DURATION_FACTOR,
      );
      if (bassPickupDuration > 0) {
        notes.push({
          noteName: bassNoteName,
          midi: bassMidi,
          startOffset: bassPickupOffset,
          duration: bassPickupDuration,
          velocityMultiplier: (bassEntry ? BASS_VELOCITY_BOOST : 1.0)
            * CLUSTER_VOLUME_REDUCTION
            * SHORT_CHORD_BASS_PICKUP_VELOCITY_REDUCTION,
          isBass: !!bassEntry,
        });
      }
    }

    return notes;
  }

  // Build beat offsets based on time signature.
  // In 4/4 time: upper [1,2,3,4], bass [1,2.5,3,4] (syncopated).
  // In 3/4 time: waltz pattern — bass on beat 1 only, upper tones on beats 2 & 3.
  // In 6/8 time: compound waltz — same waltz pattern per 3-beat group, repeats
  //              naturally for chords spanning 6+ beats ("oom-pah-pah oom-pah-pah").
  const isWaltz = timeSignature === 3 || isCompoundTime;
  const upperPatternOffsets = isWaltz
    ? [fullBeatDelay, fullBeatDelay * 2]
    : Array.from({ length: timeSignature }, (_, i) => fullBeatDelay * i);
  const bassPatternOffsets = isWaltz
    ? [0]
    : timeSignature === 4
      ? [0, fullBeatDelay * 1.5, fullBeatDelay * 2, fullBeatDelay * 3]
      : Array.from({ length: timeSignature }, (_, i) => fullBeatDelay * i);

  const canApplyEndgameShape = totalDuration !== undefined && patternMeasureDuration > 0;
  const densePatternEndTime = canApplyEndgameShape
    ? Math.max(0, totalDuration - PIANO_ENDGAME_FULL_PATTERN_CUTOFF_MEASURES * patternMeasureDuration)
    : chordEndTime;
  const finalSustainStartTime = canApplyEndgameShape
    ? Math.max(0, totalDuration - PIANO_ENDGAME_DOUBLE_STRIKE_CUTOFF_MEASURES * patternMeasureDuration)
    : Number.POSITIVE_INFINITY;

  // Detect the last chord: its end time should be at or near the song's total duration.
  // Use a tolerance of half a beat to handle floating-point accumulation.
  const lastChordTolerance = fullBeatDelay * 0.5;
  const isLastChord = canApplyEndgameShape && (totalDuration - chordEndTime) < lastChordTolerance;

  // For the last chord, play a single sustained chord capped at one measure.
  // No repeating pattern — just hold the chord for one measure then let it decay.
  // Deterministic 50/50 fifth-skip based on chord start time.
  if (isLastChord) {
    const cappedDuration = Math.min(duration, patternMeasureDuration);
    const skipFifthHere = chordTones.length >= 3 && Math.floor(chordStartTime * 10) % 2 === 1;
    pushSingleChord(0, cappedDuration, CLUSTER_VOLUME_REDUCTION, skipFifthHere);
    return notes;
  }

  const denseWindowStart = chordStartTime;
  const denseWindowEnd = Math.min(chordEndTime, densePatternEndTime);
  if (denseWindowEnd - denseWindowStart >= patternMeasureDuration - TIMING_EPSILON) {
    pushRepeatedNotesInWindow(
      bassNoteName,
      bassMidi,
      bassPatternOffsets,
      bassEntry ? BASS_VELOCITY_BOOST : 1.0,
      !!bassEntry,
      denseWindowStart,
      denseWindowEnd,
    );

    for (const tone of chordTones) {
      const name = `${tone.noteName}4`;
      const midi = noteNameToMidi(name);
      pushRepeatedNotesInWindow(name, midi, upperPatternOffsets, 1.0, false, denseWindowStart, denseWindowEnd);
    }
  }

  const sparseWindowStart = Math.max(chordStartTime, densePatternEndTime);
  const sparseWindowEnd = Math.min(chordEndTime, finalSustainStartTime);
  if (sparseWindowEnd - sparseWindowStart > TIMING_EPSILON) {
    let sparseStrikeIdx = 0;
    for (
      let strikeStart = sparseWindowStart;
      strikeStart < sparseWindowEnd - TIMING_EPSILON;
      strikeStart += patternMeasureDuration
    ) {
      const strikeEnd = Math.min(sparseWindowEnd, strikeStart + patternMeasureDuration);
      // Deterministic 50/50: alternate strikes skip the 5th for voicing variety
      const skipFifthHere = chordTones.length >= 3 && sparseStrikeIdx % 2 === 1;
      pushSingleChordAbsolute(strikeStart, strikeEnd, CLUSTER_VOLUME_REDUCTION, skipFifthHere);
      sparseStrikeIdx++;
    }
  }

  const finalWindowStart = Math.max(chordStartTime, finalSustainStartTime);
  if (chordEndTime - finalWindowStart > TIMING_EPSILON) {
    const skipFifthFinal = chordTones.length >= 3 && Math.floor(finalWindowStart * 10) % 2 === 1;
    pushSingleChordAbsolute(finalWindowStart, chordEndTime, CLUSTER_VOLUME_REDUCTION, skipFifthFinal);
  }

  return notes;
}

function generateGuitarNotes(
  chordTones: MidiNote[],
  _rootName: string,
  duration: number,
  halfBeatDelay: number,
  durationInBeats: number,
  isLongChord: boolean,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];

  if (isLongChord && chordTones.length >= 2) {
    // ── ARPEGGIATION ──
    const rootIdx = 0;
    const thirdIdx = chordTones.length >= 2 ? 1 : 0;
    const fifthIdx = chordTones.length >= 3 ? 2 : (chordTones.length >= 2 ? 1 : 0);

    const noteAtOctave = (idx: number, oct: number) => ({
      noteName: chordTones[idx].noteName,
      oct,
    });

    let arpPattern: Array<{ noteName: string; oct: number }>;

    if (durationInBeats < 3) {
      // MEDIUM (2-3 beats): Root(2) → Fifth(3) → Third(4)
      arpPattern = [
        noteAtOctave(rootIdx, 2),
        noteAtOctave(fifthIdx, 3),
        noteAtOctave(thirdIdx, 4),
      ];
    } else if (durationInBeats < 5) {
      // LONG (3-5 beats): Root(2) → Fifth(3) → Third(4) → Root(3)
      arpPattern = [
        noteAtOctave(rootIdx, 2),
        noteAtOctave(fifthIdx, 3),
        noteAtOctave(thirdIdx, 4),
        noteAtOctave(rootIdx, 3),
      ];
    } else if (durationInBeats < 7) {
      // VERY LONG (5-7 beats): Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4)
      arpPattern = [
        noteAtOctave(rootIdx, 2),
        noteAtOctave(fifthIdx, 3),
        noteAtOctave(thirdIdx, 4),
        noteAtOctave(fifthIdx, 4),
        noteAtOctave(rootIdx, 4),
      ];
    } else {
      // EXTRA LONG (≥7 beats): Ascend then descend
      arpPattern = [
        noteAtOctave(rootIdx, 2),
        noteAtOctave(fifthIdx, 3),
        noteAtOctave(thirdIdx, 4),
        noteAtOctave(fifthIdx, 4),
        noteAtOctave(rootIdx, 4),
        noteAtOctave(fifthIdx, 4),
        noteAtOctave(thirdIdx, 4),
        noteAtOctave(rootIdx, 3),
        noteAtOctave(rootIdx, 2),
      ];
    }

    for (let i = 0; i < arpPattern.length; i++) {
      const { noteName, oct } = arpPattern[i];
      const fullName = `${noteName}${oct}`;
      const midi = noteNameToMidi(fullName);
      const startOffset = i * halfBeatDelay;
      // Each arpeggio note sustains to the chord end, creating legato overlap.
      // Add a small extra sustain tail so the note's decay bridges any
      // micro-gap caused by the soundfont's attack time on the next note.
      const noteDuration = duration - startOffset + halfBeatDelay * 0.5;
      notes.push({
        noteName: fullName,
        midi,
        startOffset,
        duration: Math.min(noteDuration, duration - startOffset + halfBeatDelay),
        velocityMultiplier: oct === 2 ? BASS_VELOCITY_BOOST : 1.0,
        isBass: oct === 2,
      });
    }
  } else {
    // ── CLUSTER (short chords) ──
    // Skip the 3rd (index 1) to differentiate guitar voicing from piano
    for (let toneIdx = 0; toneIdx < chordTones.length; toneIdx++) {
      if (toneIdx === 1 && chordTones.length >= 3) continue;
      const tone = chordTones[toneIdx];
      const name = `${tone.noteName}3`;
      const midi = noteNameToMidi(name);
      notes.push({
        noteName: name,
        midi,
        startOffset: 0,
        duration: duration,
        velocityMultiplier: CLUSTER_VOLUME_REDUCTION,
        isBass: false,
      });
    }
  }

  return notes;
}

function generateViolinNotes(
  rootName: string,
  duration: number,
): ScheduledNote[] {
  const name = `${rootName}6`;
  const midi = noteNameToMidi(name);
  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration,
    velocityMultiplier: 1.0,
    isBass: false,
  }];
}

function generateFluteNotes(
  rootName: string,
  bassName: string,
  chordTones: MidiNote[],
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
): ScheduledNote[] {
  const useLongPattern = durationInBeats >= PIANO_PATTERN_MIN_BEATS;

  if (!useLongPattern) {
    const fluteNoteName = bassName === rootName && chordTones.length >= 2
      ? chordTones[1].noteName
      : bassName;
    const name = `${fluteNoteName}5`;
    const midi = noteNameToMidi(name);
    return [{
      noteName: name,
      midi,
      startOffset: 0,
      duration,
      velocityMultiplier: 1.0,
      isBass: false,
    }];
  }

  const flutePatternNote = chordTones.length >= 3
    ? chordTones[2].noteName
    : (chordTones.length >= 2 ? chordTones[1].noteName : bassName);
  const name = `${flutePatternNote}5`;
  const midi = noteNameToMidi(name);
  const syncopatedOffset = fullBeatDelay * 1.5;
  const syncopatedDuration = Math.max(fullBeatDelay * 0.5, duration - syncopatedOffset);

  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration: Math.max(fullBeatDelay, syncopatedOffset),
    velocityMultiplier: 0.95,
    isBass: false,
  }, {
    noteName: name,
    midi,
    startOffset: syncopatedOffset,
    duration: Math.max(fullBeatDelay * 0.5, syncopatedDuration),
    velocityMultiplier: 0.85,
    isBass: false,
  }];
}

function generateSaxophoneNotes(
  rootName: string,
  chordTones: MidiNote[],
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
): ScheduledNote[] {
  const guideTone = chordTones.length >= 2 ? chordTones[1].noteName : rootName;
  const accentTone = chordTones.length >= 3 ? chordTones[2].noteName : guideTone;
  const notes: ScheduledNote[] = [];

  const pushNote = (
    noteName: string,
    octave: number,
    startOffset: number,
    requestedDuration: number,
    velocityMultiplier: number,
  ) => {
    if (startOffset >= duration) return;

    const actualDuration = Math.min(requestedDuration, duration - startOffset);
    if (actualDuration <= 0) return;

    const name = `${noteName}${octave}`;
    const midi = noteNameToMidi(name);
    notes.push({
      noteName: name,
      midi,
      startOffset,
      duration: actualDuration,
      velocityMultiplier,
      isBass: false,
    });
  };

  if (durationInBeats < 2) {
    pushNote(guideTone, 5, 0, duration, 0.96);
    return notes;
  }

  if (durationInBeats < PIANO_PATTERN_MIN_BEATS) {
    pushNote(guideTone, 5, 0, fullBeatDelay * 0.8, 0.94);
    pushNote(accentTone, 5, fullBeatDelay * 1.5, duration, 1.04);
    return notes;
  }

  const cycleDuration = fullBeatDelay * 2;
  for (let cycleStart = 0; cycleStart < duration - fullBeatDelay * 0.5; cycleStart += cycleDuration) {
    pushNote(guideTone, 5, cycleStart, fullBeatDelay * 0.65, 0.94);
    pushNote(accentTone, 5, cycleStart + fullBeatDelay * 1.5, fullBeatDelay * 0.4, 1.08);
  }

  pushNote(rootName, 6, Math.max(0, duration - fullBeatDelay), fullBeatDelay, 0.9);
  return notes;
}

function generateBassNotes(
  bassName: string,
  duration: number,
): ScheduledNote[] {
  // E-B → octave 1, C-D# → octave 2
  const noteIdx = NOTE_INDEX_MAP[bassName];
  const octave = (noteIdx !== undefined && noteIdx > 3) ? 1 : 2; // D# index is 3; E=4 and above → oct 1
  const canonical = noteIdx !== undefined ? CHROMATIC_SCALE[noteIdx] : bassName;
  const name = `${canonical}${octave}`;
  const midi = noteNameToMidi(name);
  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration,
    velocityMultiplier: 1.0,
    isBass: true,
  }];
}

// ─── Batch Generation for Visualization ──────────────────────────────────────

/** Active instrument descriptor (matches existing interface in FallingNotesCanvas) */
export interface ActiveInstrument {
  name: string;
  color: string;
}

/** A visual note with position information for canvas rendering */
export interface VisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  chordName: string;
  pos: { x: number; width: number } | null;
}

/**
 * Generate visual notes for all instruments across all chord events.
 * This is the visualization entry point — it produces VisualNote[] from
 * ChordEvent[] + ActiveInstrument[].
 */
export function generateAllInstrumentVisualNotes(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  posLookup: Map<number, { x: number; width: number }>,
  bpm?: number,
  timeSignature?: number,
): VisualNote[] {
  const notes: VisualNote[] = [];

  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);
  const totalSongDuration = merged.reduce((maxEnd, event) => Math.max(maxEnd, event.endTime), 0);

  // Use BPM-based beat duration when available (matches audio path exactly).
  // Fall back to estimated beat duration from raw events when beat counts are unavailable.
  const bd = bpm ? beatDurationFromBpm(bpm) : estimateBeatDuration(events);

  for (const event of merged) {
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;
    const eventBeatCount = Math.max(1, event.beatCount ?? 1);
    const eventBeatDuration = duration > 0 ? duration / eventBeatCount : bd;

    for (const inst of instruments) {
      const instrumentName = inst.name.toLowerCase() as InstrumentName;
      const color = inst.color;

      const scheduled = generateNotesForInstrument(instrumentName, {
        chordName,
        chordNotes,
        duration,
        beatDuration: eventBeatDuration,
        startTime,
        totalDuration: totalSongDuration,
        timeSignature,
      });

      for (const sn of scheduled) {
        notes.push({
          midi: sn.midi,
          startTime: startTime + sn.startOffset,
          endTime: startTime + sn.startOffset + sn.duration,
          color,
          chordName,
          pos: posLookup.get(sn.midi) ?? null,
        });
      }
    }
  }

  return notes;
}
