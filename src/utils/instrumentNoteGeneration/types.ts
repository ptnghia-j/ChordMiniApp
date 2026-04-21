import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { MidiNote } from '@/utils/chordToMidi';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';

/** Supported instrument names (lowercase) */
export type InstrumentName = 'piano' | 'guitar' | 'violin' | 'melodyViolin' | 'flute' | 'saxophone' | 'bass';

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

export interface PlaybackAdjustmentOptions {
  instrumentName: InstrumentName;
  elapsedInChord?: number;
  latePianoOnsetGraceSeconds?: number;
  latePianoMinAudibleSeconds?: number;
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
  /** Absolute song duration used for end-of-song pattern shaping */
  totalDuration?: number;
  /** Time signature (beats per measure, e.g. 3 for 3/4, default 4) */
  timeSignature?: number;
  /** Optional song segmentation for section-aware pattern shaping */
  segmentationData?: SegmentationResult | null;
  /** Optional signal-derived intensity snapshot for this chord window */
  signalDynamics?: ChordSignalDynamics | null;
  /** Shared guitar diagram/capo selection to keep playback aligned with diagrams */
  guitarVoicing?: Partial<GuitarVoicingSelection>;
  /** Enharmonic target key used when resolving capo-transposed shape names */
  targetKey?: string;
  /**
   * Name of the chord that follows this event in the scheduled playback
   * sequence. Guitar note generation uses this to decide whether a short
   * measure can accommodate a syncopated upstrum: transitions that share most
   * anchor fingers keep the upstroke, while bigger reshapes suppress it so
   * the player has time to move.
   */
  nextChordName?: string;
}

/** Active instrument descriptor (matches existing interface in FallingNotesCanvas) */
export interface ActiveInstrument {
  name: string;
  color: string;
}

/** A visual note with timing and coloring information for canvas rendering */
export interface VisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  chordName: string;
}

export interface PositionedVisualNote extends VisualNote {
  pos: { x: number; width: number } | null;
}

export interface SignalDynamicsSource {
  getSignalDynamics(time: number, chordDuration?: number): ChordSignalDynamics | null;
}
