import type { AudioDynamicsAnalysisResult } from '@/services/audio/audioDynamicsTypes';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { SheetSageNoteEvent } from '@/types/sheetSage';
import type { HandHint, NotationPartId, RenderNoteType } from './constants';

export interface LeadSheetChordEvent {
  chordName: string;
  startTime: number;
  endTime: number;
  beatIndex?: number;
  beatCount?: number;
}

export interface LeadSheetMeasureChord {
  measureIndex: number;
  labels: string[];
}

export interface MusicXmlExportOptions {
  bpm?: number;
  timeSignature?: number;
  title?: string;
  keySignature?: string | null;
  enableLeadingSilenceAnacrusisSearch?: boolean;
}

export interface MusicXmlKeySection {
  startBeatIndex: number;
  keySignature: string;
}

export interface MeasureLayoutConfig {
  divisionsPerMeasure: number;
  firstMeasureDivisions: number;
}

export interface QuantizedNoteEvent {
  pitch: number;
  startDivision: number;
  endDivision: number;
}

export interface AnacrusisSelectionResult {
  anacrusisDivisions: number;
  layout: MeasureLayoutConfig;
  quantizedNotes: QuantizedNoteEvent[];
}

export interface MeasureNoteSegment {
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitch: number;
  tieStart: boolean;
  tieStop: boolean;
  beatCarryDuration: number;
}

export type MeasureEvent =
  | { kind: 'rest'; duration: number; startInMeasure: number }
  | {
      kind: 'note';
      pitch: number;
      duration: number;
      startInMeasure: number;
      tieStart: boolean;
      tieStop: boolean;
    };

export interface AbsoluteNoteEvent {
  pitch: number;
  onset: number;
  offset: number;
  velocity: number;
  chordName?: string;
  chordStartTime: number;
  chordEndTime?: number;
  beatIndex: number;
  beatOnset?: number;
  beatOffset?: number;
  chordStartBeat?: number;
  chordEndBeat?: number;
  source: 'melody' | 'piano';
  handHint?: HandHint;
  staffHint?: 1 | 2;
}

export interface NotationQuantOptions {
  bpm: number;
  timeSignature: number;
  divisionsPerQuarter?: number;
  enableLeadingSilenceAnacrusisSearch?: boolean;
  allowMergedOnsets?: boolean;
  preserveSourceOnsets?: boolean;
}

export interface NotationTuplet {
  actualNotes: number;
  normalNotes: number;
  displayDuration: number;
  type: RenderNoteType;
  startDivision: number;
  endDivision: number;
  index: number;
  count: number;
}

export interface NotationChord {
  startDivision: number;
  endDivision: number;
  pitches: number[];
  chordName?: string;
  voice: number;
  staff: number;
  tieStart: boolean;
  tieStop: boolean;
  tuplet?: NotationTuplet | null;
}

export interface NotationVoice {
  voice: number;
  staff: number;
  chords: NotationChord[];
}

export interface NotationStaff {
  staff: number;
  clefSign: 'G' | 'F';
  clefLine: number;
  voices: NotationVoice[];
}

export interface NotationMeasure {
  measureIndex: number;
  startDivision: number;
  lengthDivisions: number;
  keyContext: {
    keySignature: string | null;
    keyFifths: number;
    accidentalPreference: 'sharp' | 'flat' | null | undefined;
    isKeyChange: boolean;
  };
  chordDirections: Array<{
    label: string;
    startDivision: number;
  }>;
  melodyStaff: NotationStaff | null;
  pianoStaves: NotationStaff[];
}

export interface NotationScore {
  title?: string;
  bpm: number;
  timeSignature: number;
  divisionsPerQuarter: number;
  layout: MeasureLayoutConfig;
  measures: NotationMeasure[];
  keyFifths: number;
  accidentalPreference: 'sharp' | 'flat' | null | undefined;
  selectedAnacrusisDivisions: number;
  selectedAnacrusisSeconds: number;
  measureStartScoreTimes: number[];
  measureStartAudioTimes: number[];
  includeMelody: boolean;
}

export interface PianoVisualizerScoreInput extends MusicXmlExportOptions {
  chordEvents: ChordEvent[];
  melodyNoteEvents?: SheetSageNoteEvent[];
  melodyBeatTimes?: Array<number | null>;
  pickupBeatCount?: number;
  keySections?: MusicXmlKeySection[];
  segmentationData?: SegmentationResult | null;
  signalAnalysis?: AudioDynamicsAnalysisResult | null;
}

export interface BuildPianoNotationNoteEventsOptions {
  bpm?: number;
  timeSignature?: number;
  segmentationData?: SegmentationResult | null;
  signalAnalysis?: AudioDynamicsAnalysisResult | null;
}

export interface GenericDurationMapping {
  value: number;
  type: RenderNoteType;
  dots?: number;
}

export interface ProtoChord {
  rawStartDivision: number;
  rawChordStartDivision: number;
  eventIndices: number[];
  hasChordBoundaryAttack: boolean;
  tuplet: NotationTuplet | null;
}

export interface TupletDisplayInfo {
  displayDuration: number;
  type: RenderNoteType;
  normalNotes: number;
}

export interface QuantizedNotationNoteEvent extends AbsoluteNoteEvent {
  partId: NotationPartId;
  rawStartDivision: number;
  rawEndDivision: number;
  rawChordStartDivision: number;
  rawChordEndDivision: number;
  startDivision: number;
  endDivision: number;
  staff: number;
  voice: number;
  tuplet: NotationTuplet | null;
}

export interface GenericMeasureNoteSegment {
  partId: NotationPartId;
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitch: number;
  chordName?: string;
  staff: number;
  voice: number;
  tieStart: boolean;
  tieStop: boolean;
  beatCarryDuration: number;
  tuplet: NotationTuplet | null;
}

export interface GenericMeasureChordSegment {
  partId: NotationPartId;
  measureIndex: number;
  startInMeasure: number;
  duration: number;
  pitches: number[];
  chordName?: string;
  staff: number;
  voice: number;
  tieStart: boolean;
  tieStop: boolean;
  beatCarryDuration: number;
  tuplet: NotationTuplet | null;
}

export type GenericMeasureEvent =
  | {
      kind: 'rest';
      duration: number;
      startInMeasure: number;
      type: RenderNoteType;
      dots: number;
    }
  | {
      kind: 'chord';
      pitches: number[];
      chordName?: string;
      duration: number;
      startInMeasure: number;
      tieStart: boolean;
      tieStop: boolean;
      type: RenderNoteType;
      dots: number;
      timeModification?: { actualNotes: number; normalNotes: number };
      tupletStart?: boolean;
      tupletStop?: boolean;
    };

export interface MelodyQuantizationResult {
  notes: QuantizedNotationNoteEvent[];
  layout: MeasureLayoutConfig;
  anacrusisDivisions: number;
}

export interface ResolvedScoreKeySection {
  startBeatIndex: number;
  startDivision: number;
  keySignature: string | null;
  keyFifths: number;
  accidentalPreference: 'sharp' | 'flat' | null | undefined;
}
