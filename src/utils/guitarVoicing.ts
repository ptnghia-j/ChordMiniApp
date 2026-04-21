import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import { chordMappingService } from '@/services/chord-analysis/chordMappingService';
import { midiToNoteName, parseChordToMidiNotes, type MidiNote } from '@/utils/chordToMidi';
import { calculateTargetKey, transposeChord } from '@/utils/chordTransposition';

export interface GuitarVoicingSelection {
  capoFret: number;
  selectedPositions: Record<string, number>;
}

export interface ResolvedGuitarVoicing {
  source: 'diagram' | 'fallback';
  soundingChordName: string;
  shapeChordName: string;
  capoFret: number;
  positionIndex: number;
  midi: number[];
  noteNames: string[];
  /** Per-string fret values relative to `baseFret` (−1 muted, 0 open). Only populated for diagram voicings. */
  frets?: number[];
  /** Starting fret of the diagram window (1-based). Only populated for diagram voicings. */
  baseFret?: number;
  /** Barre spans across strings, if any. Only populated for diagram voicings. */
  barres?: number[];
}

export type GuitarStrumDirection = 'down' | 'up';

export interface GuitarStrumStroke {
  startOffset: number;
  direction: GuitarStrumDirection;
}

export interface SuggestedCapoPosition {
  capoFret: number;
  score: number;
  uniqueChordCount: number;
  missingShapes: number;
  barreShapes: number;
  totalBarres: number;
  averageRelativeFret: number;
}

const SHORT_GUITAR_CHORD_BEATS = 3;
export const DEFAULT_MAX_CAPO_SUGGESTION_FRET = 7;

const STRUM_TIMING_EPSILON = 1e-6;

function clampStrumDrive(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Single scalar 0…1 from audio contours so we can pick a strum density.
 * Higher → busier patterns (8ths, pop syncopation); lower → fewer strokes.
 */
export function resolveGuitarStrumDrive(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) {
    return 0.48;
  }
  const bandNudge = signalDynamics.intensityBand === 'loud'
    ? 0.1
    : signalDynamics.intensityBand === 'quiet'
      ? -0.12
      : 0;
  return clampStrumDrive(
    (1 - signalDynamics.quietness) * 0.34
      + signalDynamics.fullness * 0.26
      + signalDynamics.motion * 0.18
      + signalDynamics.attack * 0.08
      + signalDynamics.normalizedIntensity * 0.14
      + bandNudge,
  );
}

type StrumBeatDef = { beat: number; direction: GuitarStrumDirection };

function defsToStrokes(defs: readonly StrumBeatDef[], beatDuration: number): GuitarStrumStroke[] {
  const sorted = [...defs].sort((a, b) => a.beat - b.beat);
  const out: GuitarStrumStroke[] = [];
  for (const { beat, direction } of sorted) {
    const startOffset = beat * beatDuration;
    const last = out[out.length - 1];
    if (last && Math.abs(last.startOffset - startOffset) < STRUM_TIMING_EPSILON) {
      continue;
    }
    out.push({ startOffset, direction });
  }
  return out;
}

/** 4/4: sparse ballad — downs on 1 and 3 only */
const STRUM_4_4_SPARSE: readonly StrumBeatDef[] = [
  { beat: 0, direction: 'down' },
  { beat: 2, direction: 'down' },
];

/**
 * 4/4: pop-rock with a half-note anchor and a driving tail — "D - - - D U D U".
 * The long breath through beat 2 lets the chord ring; the 3-&-4-& tail
 * delivers the groove. Very common feel in mid-tempo pop (Brown Eyed Girl,
 * Let It Be-adjacent).
 */
const STRUM_4_4_CLASSIC: readonly StrumBeatDef[] = [
  { beat: 0, direction: 'down' },   // 1
  { beat: 2, direction: 'down' },   // 3
  { beat: 2.5, direction: 'up' },   // 3&
  { beat: 3, direction: 'down' },   // 4
  { beat: 3.5, direction: 'up' },   // 4&
];

/**
 * 4/4: "Island Strum" — D - D U - U D U.
 * Ubiquitous pop/folk syncopation (e.g. "I'm Yours", "Riptide").
 * The skipped "and" of 1 and the skipped "3" create the characteristic
 * floating pocket between measures.
 */
const STRUM_4_4_POP_SYNCOPATED: readonly StrumBeatDef[] = [
  { beat: 0, direction: 'down' },   // 1
  { beat: 1, direction: 'down' },   // 2
  { beat: 1.5, direction: 'up' },   // 2&
  { beat: 2.5, direction: 'up' },   // 3&
  { beat: 3, direction: 'down' },   // 4
  { beat: 3.5, direction: 'up' },   // 4&
];

/**
 * 4/4: "Old Faithful" driving variant — D - D U D - D U.
 * Downstrokes on every quarter-note pulse with upstroke backbeats on 2&
 * and 4&, and symmetric rests on 1& and 3& so the bar breathes twice
 * instead of running as mechanical eighth notes.
 */
const STRUM_4_4_EIGHTHS: readonly StrumBeatDef[] = [
  { beat: 0, direction: 'down' },   // 1
  { beat: 1, direction: 'down' },   // 2
  { beat: 1.5, direction: 'up' },   // 2&
  { beat: 2, direction: 'down' },   // 3
  { beat: 3, direction: 'down' },   // 4
  { beat: 3.5, direction: 'up' },   // 4&
];

function patternForMeasure4_4(drive: number, beatDuration: number): GuitarStrumStroke[] {
  if (drive < 0.34) {
    return defsToStrokes(STRUM_4_4_SPARSE, beatDuration);
  }
  if (drive < 0.52) {
    return defsToStrokes(STRUM_4_4_CLASSIC, beatDuration);
  }
  if (drive < 0.72) {
    return defsToStrokes(STRUM_4_4_POP_SYNCOPATED, beatDuration);
  }
  return defsToStrokes(STRUM_4_4_EIGHTHS, beatDuration);
}

/** 3/4: one down per bar — very soft */
const STRUM_3_4_SPARSE: readonly StrumBeatDef[] = [{ beat: 0, direction: 'down' }];

/** 3/4: waltz — downs on 1 and 3 */
const STRUM_3_4_WALTZ: readonly StrumBeatDef[] = [
  { beat: 0, direction: 'down' },
  { beat: 2, direction: 'down' },
];

/** 3/4: six eighth-notes D U D U D U */
const STRUM_3_4_EIGHTHS: readonly StrumBeatDef[] = Array.from({ length: 6 }, (_, i) => ({
  beat: i * 0.5,
  direction: (i % 2 === 0 ? 'down' : 'up') as GuitarStrumDirection,
}));

function patternForMeasure3_4(drive: number, beatDuration: number): GuitarStrumStroke[] {
  if (drive < 0.36) {
    return defsToStrokes(STRUM_3_4_SPARSE, beatDuration);
  }
  if (drive < 0.62) {
    return defsToStrokes(STRUM_3_4_WALTZ, beatDuration);
  }
  return defsToStrokes(STRUM_3_4_EIGHTHS, beatDuration);
}

/** 6/8 compound: three downs on strong pulses (legacy) */
function patternForMeasure6_8Sparse(beatDuration: number): GuitarStrumStroke[] {
  return Array.from({ length: 3 }, (_, index) => ({
    startOffset: beatDuration * index * 2,
    direction: 'down' as const,
  }));
}

/** 6/8: alternating on each eighth of the bar */
const STRUM_6_8_EIGHTHS: readonly StrumBeatDef[] = Array.from({ length: 6 }, (_, i) => ({
  beat: i,
  direction: (i % 2 === 0 ? 'down' : 'up') as GuitarStrumDirection,
}));

function patternForMeasure6_8(drive: number, beatDuration: number): GuitarStrumStroke[] {
  if (drive < 0.4) {
    return patternForMeasure6_8Sparse(beatDuration);
  }
  return defsToStrokes(STRUM_6_8_EIGHTHS, beatDuration);
}

/**
 * Generic time signatures (5, 7, etc.): shape strokes into three rhythmic tiers
 * rather than blindly filling every eighth-note slot.
 *  - sparse:   downs on every other strong beat (ballad pulse)
 *  - stable:   a downstroke on every beat (steady quarters)
 *  - driving:  "Old Faithful" feel — downs on every beat plus an upstroke on
 *              odd-indexed off-beats only (2&, 4&, …), so the bar breathes on
 *              1&, 3&, 5& and the final off-beat lands into the next measure.
 */
function patternForMeasureGeneric(
  timeSignature: number,
  drive: number,
  beatDuration: number,
): GuitarStrumStroke[] {
  if (drive < 0.45 || timeSignature <= 2) {
    const count = Math.max(1, Math.ceil(timeSignature / 2));
    return Array.from({ length: count }, (_, index) => ({
      startOffset: beatDuration * index * 2,
      direction: 'down' as const,
    }));
  }

  if (drive < 0.68) {
    return Array.from({ length: timeSignature }, (_, index) => ({
      startOffset: beatDuration * index,
      direction: 'down' as const,
    }));
  }

  const defs: StrumBeatDef[] = [];
  for (let i = 0; i < timeSignature; i += 1) {
    defs.push({ beat: i, direction: 'down' });
    if (i % 2 === 1 && i < timeSignature - 1) {
      defs.push({ beat: i + 0.5, direction: 'up' });
    }
  }
  return defsToStrokes(defs, beatDuration);
}

function isNoChord(chordName: string | null | undefined): boolean {
  return !chordName || chordName === 'N.C.' || chordName === 'N' || chordName === 'N/C' || chordName === 'NC';
}

function midiToMidiNote(midi: number): MidiNote | null {
  const name = midiToNoteName(midi);
  const match = name.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return null;
  return {
    name,
    noteName: match[1],
    octave: Number(match[2]),
    midi,
  };
}

function buildFallbackVoicing(chordName: string): ResolvedGuitarVoicing | null {
  const parsed = parseChordToMidiNotes(chordName);
  if (parsed.length === 0) return null;

  const midi = parsed.map((note) => note.midi);
  return {
    source: 'fallback',
    soundingChordName: chordName,
    shapeChordName: chordName,
    capoFret: 0,
    positionIndex: 0,
    midi,
    noteNames: midi.map((value) => midiToNoteName(value)),
  };
}

type ChordPositionDifficulty = {
  score: number;
  hasBarre: boolean;
  barreCount: number;
  relativeBaseFret: number;
  openStrings: number;
};

function estimateChordPositionDifficulty(
  position: {
    frets: number[];
    baseFret?: number;
    barres?: number[];
  },
): ChordPositionDifficulty {
  const frets = Array.isArray(position.frets) ? position.frets : [];
  const barreCount = Array.isArray(position.barres) ? position.barres.length : 0;
  const relativeBaseFret = Math.max(1, Number(position.baseFret) || 1);
  const openStrings = frets.filter((fret) => fret === 0).length;
  const mutedStrings = frets.filter((fret) => fret < 0).length;
  const pressedFrets = frets.filter((fret) => fret > 0);
  const fretSpan = pressedFrets.length > 1
    ? Math.max(...pressedFrets) - Math.min(...pressedFrets)
    : 0;

  return {
    score:
      (barreCount * 5) +
      (Math.max(0, relativeBaseFret - 1) * 1.35) +
      (Math.max(0, fretSpan - 4) * 0.75) +
      (Math.max(0, mutedStrings - 1) * 0.2) -
      (openStrings * 0.2),
    hasBarre: barreCount > 0,
    barreCount,
    relativeBaseFret,
    openStrings,
  };
}

function getEasiestChordPositionDifficulty(
  chordData: {
    positions?: Array<{
      frets: number[];
      baseFret: number;
      barres: number[];
    }>;
  } | null,
): ChordPositionDifficulty | null {
  const positions = chordData?.positions;
  if (!positions || positions.length === 0) {
    return null;
  }

  return positions.reduce<ChordPositionDifficulty | null>((best, position) => {
    const difficulty = estimateChordPositionDifficulty(position);
    if (!best) {
      return difficulty;
    }

    if (difficulty.score !== best.score) {
      return difficulty.score < best.score ? difficulty : best;
    }

    if (difficulty.barreCount !== best.barreCount) {
      return difficulty.barreCount < best.barreCount ? difficulty : best;
    }

    if (difficulty.relativeBaseFret !== best.relativeBaseFret) {
      return difficulty.relativeBaseFret < best.relativeBaseFret ? difficulty : best;
    }

    if (difficulty.openStrings !== best.openStrings) {
      return difficulty.openStrings > best.openStrings ? difficulty : best;
    }

    return best;
  }, null);
}

function compareCapoSuggestions(
  candidate: SuggestedCapoPosition,
  currentBest: SuggestedCapoPosition,
): number {
  if (candidate.missingShapes !== currentBest.missingShapes) {
    return candidate.missingShapes - currentBest.missingShapes;
  }

  if (candidate.barreShapes !== currentBest.barreShapes) {
    return candidate.barreShapes - currentBest.barreShapes;
  }

  if (candidate.totalBarres !== currentBest.totalBarres) {
    return candidate.totalBarres - currentBest.totalBarres;
  }

  // Same aggregate barre workload: prefer lower capo before overall difficulty score.
  if (candidate.capoFret !== currentBest.capoFret) {
    return candidate.capoFret - currentBest.capoFret;
  }

  if (candidate.score !== currentBest.score) {
    return candidate.score - currentBest.score;
  }

  if (candidate.averageRelativeFret !== currentBest.averageRelativeFret) {
    return candidate.averageRelativeFret - currentBest.averageRelativeFret;
  }

  return 0;
}

export function resolveGuitarShapeChordName(
  soundingChordName: string,
  capoFret: number,
  targetKey: string = 'C',
): string {
  if (isNoChord(soundingChordName)) {
    return 'N.C.';
  }

  const shapeChord = capoFret > 0
    ? transposeChord(soundingChordName, -capoFret, calculateTargetKey(targetKey, -capoFret))
    : soundingChordName;

  return chordMappingService.getPreferredDiagramChordName(shapeChord);
}

export function resolveGuitarVoicing(
  soundingChordName: string,
  selection?: Partial<GuitarVoicingSelection>,
  targetKey: string = 'C',
): ResolvedGuitarVoicing | null {
  if (isNoChord(soundingChordName)) {
    return null;
  }

  const capoFret = Math.max(0, Math.min(12, selection?.capoFret ?? 0));
  const shapeChordName = resolveGuitarShapeChordName(soundingChordName, capoFret, targetKey);
  const chordData = chordMappingService.getChordDataSync(shapeChordName);
  const selectedIndex = Math.max(0, selection?.selectedPositions?.[shapeChordName] ?? 0);

  if (!chordData || chordData.positions.length === 0) {
    return buildFallbackVoicing(soundingChordName);
  }

  const positionIndex = Math.min(selectedIndex, chordData.positions.length - 1);
  const position = chordData.positions[positionIndex];
  const diagramMidi = Array.isArray(position.midi)
    ? position.midi.filter((value): value is number => Number.isFinite(value))
    : [];

  if (diagramMidi.length === 0) {
    return buildFallbackVoicing(soundingChordName);
  }

  const soundingMidi = diagramMidi.map((value) => value + capoFret);
  const frets = Array.isArray(position.frets) ? [...position.frets] : undefined;
  const baseFret = typeof position.baseFret === 'number' ? position.baseFret : undefined;
  const barres = Array.isArray(position.barres) ? [...position.barres] : undefined;
  return {
    source: 'diagram',
    soundingChordName,
    shapeChordName,
    capoFret,
    positionIndex,
    midi: soundingMidi,
    noteNames: soundingMidi.map((value) => midiToNoteName(value)),
    frets,
    baseFret,
    barres,
  };
}

export function resolveGuitarVoicingMidiNotes(
  soundingChordName: string,
  selection?: Partial<GuitarVoicingSelection>,
  targetKey: string = 'C',
): MidiNote[] {
  const voicing = resolveGuitarVoicing(soundingChordName, selection, targetKey);
  if (!voicing) {
    return [];
  }

  return voicing.midi
    .map(midiToMidiNote)
    .filter((note): note is MidiNote => note !== null);
}

export function suggestCapoPosition(
  soundingChordNames: string[],
  options: {
    maxCapo?: number;
    targetKey?: string;
  } = {},
): SuggestedCapoPosition | null {
  const uniqueSoundingChords = Array.from(
    new Set(
      soundingChordNames
        .map((chord) => chord?.trim())
        .filter((chord): chord is string => Boolean(chord) && !isNoChord(chord))
    )
  );

  if (uniqueSoundingChords.length === 0) {
    return null;
  }

  const maxCapo = Math.max(0, Math.min(12, Math.floor(options.maxCapo ?? DEFAULT_MAX_CAPO_SUGGESTION_FRET)));
  const targetKey = options.targetKey ?? 'C';

  let bestSuggestion: SuggestedCapoPosition | null = null;

  for (let capoFret = 0; capoFret <= maxCapo; capoFret += 1) {
    let totalScore = 0;
    let totalRelativeFret = 0;
    let missingShapes = 0;
    let barreShapes = 0;
    let totalBarres = 0;

    for (const soundingChordName of uniqueSoundingChords) {
      const shapeChordName = resolveGuitarShapeChordName(soundingChordName, capoFret, targetKey);
      const chordData = chordMappingService.getChordDataSync(shapeChordName);
      const easiestPosition = getEasiestChordPositionDifficulty(chordData);

      if (!easiestPosition) {
        missingShapes += 1;
        totalScore += 12;
        totalRelativeFret += 8;
        continue;
      }

      totalScore += easiestPosition.score;
      totalRelativeFret += easiestPosition.relativeBaseFret;
      totalBarres += easiestPosition.barreCount;
      if (easiestPosition.hasBarre) {
        barreShapes += 1;
      }
    }

    const suggestion: SuggestedCapoPosition = {
      capoFret,
      score: Number(totalScore.toFixed(3)),
      uniqueChordCount: uniqueSoundingChords.length,
      missingShapes,
      barreShapes,
      totalBarres,
      averageRelativeFret: Number((totalRelativeFret / uniqueSoundingChords.length).toFixed(3)),
    };

    if (!bestSuggestion || compareCapoSuggestions(suggestion, bestSuggestion) < 0) {
      bestSuggestion = suggestion;
    }
  }

  return bestSuggestion;
}

/**
 * Count how many strings change absolute fret position between two diagram
 * voicings. An "anchor finger" is a string whose absolute fret (or mute/open
 * state) is preserved across the transition, so a lower count means the next
 * chord shares more anchors with the current one and is easier to reach for.
 *
 * Returns `null` when either voicing lacks diagram-level fret data (fallback
 * voicings, end-of-song, no-chord), signalling that the caller should fall
 * back to its default decision rather than treat the transition as "hard".
 */
export function countAnchorFingerChanges(
  current: ResolvedGuitarVoicing | null | undefined,
  next: ResolvedGuitarVoicing | null | undefined,
): number | null {
  if (!current || !next) return null;
  if (!current.frets || !next.frets) return null;

  const currentBase = current.baseFret ?? 1;
  const nextBase = next.baseFret ?? 1;
  const stringCount = Math.max(current.frets.length, next.frets.length);

  const absolute = (fret: number | undefined, base: number): number => {
    if (fret === undefined || fret < 0) return -1;
    if (fret === 0) return 0;
    return fret + base - 1;
  };

  let changes = 0;
  for (let i = 0; i < stringCount; i += 1) {
    const currentAbs = absolute(current.frets[i], currentBase);
    const nextAbs = absolute(next.frets[i], nextBase);
    if (currentAbs !== nextAbs) {
      changes += 1;
    }
  }
  return changes;
}

export function buildGuitarStrumPattern(
  duration: number,
  beatDuration: number,
  timeSignature: number = 4,
  signalDynamics?: ChordSignalDynamics | null,
  options: { allowShortMeasureUpstrum?: boolean } = {},
): GuitarStrumStroke[] {
  if (duration <= 0 || beatDuration <= 0) {
    return [];
  }

  const { allowShortMeasureUpstrum = true } = options;
  const durationInBeats = duration / beatDuration;
  if (timeSignature <= 2 || durationInBeats < SHORT_GUITAR_CHORD_BEATS) {
    // 2-beat chord holds are long enough that the ear craves a fill-in stroke.
    // Emit [D - - U] across the four 8th-note slots so the upstrum lands on
    // the "and" of beat 2. The off-beat upstroke is resolved downstream by
    // `resolveStrumAccentScale`, which maps it to a low accent scale,
    // preserving the softer upstrumming rule. The upstroke is gated by
    // `allowShortMeasureUpstrum` so that transitions requiring more than two
    // anchor-finger changes omit the syncopation and give the player extra
    // time to reshape.
    const upstrumOffset = beatDuration * 1.5;
    if (
      allowShortMeasureUpstrum
      && durationInBeats >= SHORT_GUITAR_CHORD_BEATS - 1
      && upstrumOffset < duration - STRUM_TIMING_EPSILON
    ) {
      return [
        { startOffset: 0, direction: 'down' },
        { startOffset: upstrumOffset, direction: 'up' },
      ];
    }
    return [{ startOffset: 0, direction: 'down' }];
  }

  const measureDuration = beatDuration * timeSignature;
  const strokes: GuitarStrumStroke[] = [];
  const drive = resolveGuitarStrumDrive(signalDynamics);

  const patternForMeasure = (): GuitarStrumStroke[] => {
    if (timeSignature === 4) {
      return patternForMeasure4_4(drive, beatDuration);
    }

    if (timeSignature === 3) {
      return patternForMeasure3_4(drive, beatDuration);
    }

    if (timeSignature === 6) {
      return patternForMeasure6_8(drive, beatDuration);
    }

    return patternForMeasureGeneric(timeSignature, drive, beatDuration);
  };

  const measurePattern = patternForMeasure();
  for (let cycleStart = 0; cycleStart < duration - 1e-6; cycleStart += measureDuration) {
    for (const stroke of measurePattern) {
      const absoluteStart = cycleStart + stroke.startOffset;
      if (absoluteStart >= duration - 1e-6) {
        continue;
      }
      strokes.push({
        startOffset: absoluteStart,
        direction: stroke.direction,
      });
    }
  }

  return strokes.length > 0 ? strokes : [{ startOffset: 0, direction: 'down' }];
}
