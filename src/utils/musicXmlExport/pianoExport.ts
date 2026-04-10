import {
  DEFAULT_BPM,
  GENERIC_DIVISIONS_PER_QUARTER,
} from './constants';
import { buildPianoNotationNoteEvents } from './absoluteEvents';
import {
  quantizeAbsoluteNoteEvents,
  quantizeMelodyPlaybackAlignedNoteEvents,
} from './notationQuantization';
import { renderNotationScoreToMusicXml } from './notationRender';
import { buildNotationScore } from './notationScore';
import { assignPianoHands, assignVoicesForStaff } from './notationVoices';
import { buildMeasureLayout } from './shared';
import type { PianoVisualizerScoreInput } from './types';

export function exportPianoVisualizerScoreToMusicXml(input: PianoVisualizerScoreInput): string {
  const bpm = input.bpm ?? DEFAULT_BPM;
  const timeSignature = input.timeSignature ?? 4;
  const melodyQuantization = quantizeMelodyPlaybackAlignedNoteEvents(
    input.melodyNoteEvents ?? [],
    {
      bpm,
      timeSignature,
      divisionsPerQuarter: GENERIC_DIVISIONS_PER_QUARTER,
      enableLeadingSilenceAnacrusisSearch: input.enableLeadingSilenceAnacrusisSearch,
    },
    input.melodyBeatTimes,
  );
  const pianoAbsoluteNotes = buildPianoNotationNoteEvents(input.chordEvents, {
    bpm,
    timeSignature,
    segmentationData: input.segmentationData,
    signalAnalysis: input.signalAnalysis,
  });
  const melodyNotes = melodyQuantization.notes.map((event) => ({
    ...event,
    staff: 1,
  }));
  const pianoNotes = quantizeAbsoluteNoteEvents(pianoAbsoluteNotes, 'PPiano', {
    bpm,
    timeSignature,
    divisionsPerQuarter: GENERIC_DIVISIONS_PER_QUARTER,
    enableLeadingSilenceAnacrusisSearch: input.enableLeadingSilenceAnacrusisSearch,
    allowMergedOnsets: false,
    preserveSourceOnsets: true,
  });
  const hasExplicitPickupBeatCount = Number.isFinite(input.pickupBeatCount);
  const preferredPickupBeatCount = hasExplicitPickupBeatCount
    ? Math.max(0, Math.round(input.pickupBeatCount ?? 0))
    : null;
  const preferredPickupDivisions = preferredPickupBeatCount !== null
    ? preferredPickupBeatCount * GENERIC_DIVISIONS_PER_QUARTER
    : null;
  const preferredGridLayout = preferredPickupDivisions !== null
    ? buildMeasureLayout(preferredPickupDivisions, timeSignature * GENERIC_DIVISIONS_PER_QUARTER)
    : undefined;

  assignVoicesForStaff(melodyNotes, 1);
  assignPianoHands(pianoNotes, timeSignature, GENERIC_DIVISIONS_PER_QUARTER);
  assignVoicesForStaff(pianoNotes, 1);
  assignVoicesForStaff(pianoNotes, 2);

  const score = buildNotationScore({
    bpm,
    timeSignature,
    title: input.title?.trim() || 'ChordMini Piano Visualizer Score',
    keySignature: input.keySignature,
    keySections: input.keySections,
    chordEvents: input.chordEvents,
    beatTimes: input.melodyBeatTimes,
    melodyNotes,
    pianoNotes,
    enableLeadingSilenceAnacrusisSearch: input.enableLeadingSilenceAnacrusisSearch ?? true,
    preferredLayout: preferredGridLayout ?? (pianoNotes.length === 0 && melodyNotes.length > 0 ? melodyQuantization.layout : undefined),
    preferredAnacrusisDivisions: preferredPickupDivisions !== null
      ? preferredPickupDivisions
      : (pianoNotes.length === 0 && melodyNotes.length > 0
      ? melodyQuantization.anacrusisDivisions
      : undefined),
  });

  return renderNotationScoreToMusicXml(score);
}
