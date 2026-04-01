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

  if (candidate.score !== currentBest.score) {
    return candidate.score - currentBest.score;
  }

  if (candidate.averageRelativeFret !== currentBest.averageRelativeFret) {
    return candidate.averageRelativeFret - currentBest.averageRelativeFret;
  }

  return candidate.capoFret - currentBest.capoFret;
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
  return {
    source: 'diagram',
    soundingChordName,
    shapeChordName,
    capoFret,
    positionIndex,
    midi: soundingMidi,
    noteNames: soundingMidi.map((value) => midiToNoteName(value)),
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

export function buildGuitarStrumPattern(
  duration: number,
  beatDuration: number,
  timeSignature: number = 4,
): GuitarStrumStroke[] {
  if (duration <= 0 || beatDuration <= 0) {
    return [];
  }

  const durationInBeats = duration / beatDuration;
  if (durationInBeats < SHORT_GUITAR_CHORD_BEATS || timeSignature <= 2) {
    return [{ startOffset: 0, direction: 'down' }];
  }

  const measureDuration = beatDuration * timeSignature;
  const strokes: GuitarStrumStroke[] = [];

  const patternForMeasure = (): GuitarStrumStroke[] => {
    if (timeSignature === 4) {
      return [
        { startOffset: 0, direction: 'down' },
        { startOffset: beatDuration * 2.5, direction: 'up' },
        { startOffset: beatDuration * 3, direction: 'down' },
      ];
    }

    if (timeSignature === 3) {
      return [
        { startOffset: 0, direction: 'down' },
        { startOffset: beatDuration * 2, direction: 'down' },
      ];
    }

    return Array.from({ length: Math.max(1, Math.ceil(timeSignature / 2)) }, (_, index) => ({
      startOffset: beatDuration * index * 2,
      direction: 'down' as const,
    }));
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
