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

const SHORT_GUITAR_CHORD_BEATS = 3;

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
