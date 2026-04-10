export const DIVISIONS_PER_QUARTER = 24;
export const DEFAULT_BPM = 120;
export const MIN_DIVISION = 6;
export const EIGHTH_NOTE_DIVISIONS = DIVISIONS_PER_QUARTER / 2;

export const GENERIC_DIVISIONS_PER_QUARTER = 2520;
export const GENERIC_DIVISION_SCALE = GENERIC_DIVISIONS_PER_QUARTER / DIVISIONS_PER_QUARTER;
export const GENERIC_MIN_NOTE_SECONDS = 0.035;
export const GENERIC_ONSET_GROUPING_SECONDS = 0.045;
export const GENERIC_NOTATION_ONSET_GROUPING_SECONDS = 0.01;
export const GENERIC_HAND_SPLIT_PIVOT_MIDI = 60;
export const GENERIC_MAX_VOICES_PER_STAFF = 2;

export type HandHint = 'left' | 'right';
export type NotationPartId = 'PMelody' | 'PPiano';
export type RenderNoteType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';
