export {
  PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION,
  BASS_VELOCITY_BOOST,
  PIANO_PATTERN_MIN_BEATS,
  DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS,
  DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
} from './constants';

export {
  adjustScheduledNotesForPlayback,
  mergeConsecutiveChordEvents,
  estimateBeatDuration,
  beatDurationFromBpm,
} from './playback';

export { generateNotesForInstrument } from './dispatch';
export { generateAllInstrumentVisualNotes, attachVisualNotePositions } from './visualNotes';

export type {
  InstrumentName,
  ScheduledNote,
  InstrumentChordNotes,
  PlaybackAdjustmentOptions,
  NoteGenerationParams,
  ActiveInstrument,
  VisualNote,
  PositionedVisualNote,
  SignalDynamicsSource,
} from './types';
