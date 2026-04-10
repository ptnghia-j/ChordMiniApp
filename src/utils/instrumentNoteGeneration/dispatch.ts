import { isNoChordChordName } from '@/utils/chordToMidi';

import { generateGuitarNotes } from './generators/guitar';
import { generateBassNotes, generateFluteNotes, generateMelodyViolinNotes, generateSaxophoneNotes, generateViolinNotes } from './generators/otherInstruments';
import { generatePianoNotes } from './generators/piano';
import type { InstrumentName, NoteGenerationParams, ScheduledNote } from './types';

export function generateNotesForInstrument(
  instrument: InstrumentName,
  params: NoteGenerationParams,
): ScheduledNote[] {
  const {
    chordName,
    chordNotes,
    duration,
    beatDuration,
    startTime,
    segmentationData,
    signalDynamics,
    timeSignature = 4,
    guitarVoicing,
    targetKey,
  } = params;

  if (isNoChordChordName(chordName) || chordNotes.length === 0) {
    return [];
  }

  // Separate bass (octave 2) from main chord tones (octave 4/5)
  const bassEntry = chordNotes.find(n => n.octave === 2);
  const chordTones = chordNotes.filter(n => n.octave !== 2);
  if (chordTones.length === 0 && instrument !== 'bass') return [];

  const rootName = chordTones.length > 0 ? chordTones[0].noteName : (bassEntry?.noteName ?? 'C');
  const bassName = bassEntry ? bassEntry.noteName : rootName;

  const fullBeatDelay = beatDuration;

  // Duration measured in beats
  const durationInBeats = duration / beatDuration;
  const isLongChord = durationInBeats >= 2;

  switch (instrument) {
    case 'piano':
      return generatePianoNotes(
        chordTones, bassEntry, chordName, rootName, bassName,
        duration,
        fullBeatDelay,
        durationInBeats,
        isLongChord,
        startTime,
        timeSignature,
        segmentationData,
        signalDynamics,
      );

    case 'guitar':
      return generateGuitarNotes(
        chordName,
        chordTones,
        duration,
        beatDuration,
        timeSignature,
        signalDynamics,
        guitarVoicing,
        targetKey,
      );

    case 'violin':
      return generateViolinNotes(rootName, duration);

    case 'melodyViolin':
      return generateMelodyViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(rootName, bassName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'saxophone':
      return generateSaxophoneNotes();

    case 'bass':
      return generateBassNotes(bassName, duration);

    default:
      return [];
  }
}
