export const PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION = 0.92;

/**
 * Velocity reduction applied to individual piano arpeggio notes (both treble
 * and bass single onsets). Single-note onsets get a large `densityCompensation`
 * boost (~sqrt(3) ≈ 1.73×) inside the soundfont service because they have only
 * one simultaneous voice. That made arpeggios sound much louder than the
 * cluster/block-chord onsets. This multiplier rebalances them.
 */
export const PIANO_ARPEGGIATED_NOTE_VOLUME_REDUCTION = 0.72;

/** Bass note velocity boost multiplier */
export const BASS_VELOCITY_BOOST = 1.25;

/** Minimum chord length (in beats) required for the piano repeating rhythm pattern */
export const PIANO_PATTERN_MIN_BEATS = 4;

/** Small epsilon for floating-point comparisons in timing math */
export const TIMING_EPSILON = 1e-6;

// Chromatic scale for note name resolution
export const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const PIANO_ARPEGGIO_PATTERNS_COMMON: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 1],
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 1, 3, 2],
  [0, 2, 3, 1],
];

export const PIANO_ARPEGGIO_PATTERNS_WALTZ: ReadonlyArray<readonly number[]> = [
  [0, 1, 2],
  [0, 2, 1],
  [0, 1, 3],
  [0, 2, 3],
];

export const PIANO_ARPEGGIO_PATTERNS_SPARSE: ReadonlyArray<readonly number[]> = [
  [0, 2],
  [0, 3],
  [0, 2, 1],
];

export const PIANO_INITIAL_FIFTH_BRIDGE_THRESHOLD = 0.55;
export const DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS = 0.18;
export const DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS = 0.12;
