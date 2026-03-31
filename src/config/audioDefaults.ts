/**
 * Default Audio Volume Constants
 *
 * Single source of truth for all default volume levels across the application.
 * Import from here instead of hard-coding volume values in services, hooks, or components.
 *
 * All values are on a 0–100 scale.
 */

// ─── Master / Source Volumes ─────────────────────────────────────────────────

/** Overall master volume (multiplicative) */
export const DEFAULT_MASTER_VOLUME = 80;

/** YouTube video audio volume */
export const DEFAULT_YOUTUBE_VOLUME = 70;

/** Pitch-shifted audio volume (kept low for balance with YouTube audio) */
export const DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME = 20;

// ─── Chord Playback Volumes ─────────────────────────────────────────────────

/** Overall chord-playback bus volume */
export const DEFAULT_CHORD_PLAYBACK_VOLUME = 70;

/** Piano instrument volume */
export const DEFAULT_PIANO_VOLUME = 45;

/** Guitar instrument volume */
export const DEFAULT_GUITAR_VOLUME = 45;

/** Violin instrument volume */
export const DEFAULT_VIOLIN_VOLUME = 50;

/** Flute instrument volume */
export const DEFAULT_FLUTE_VOLUME = 50;

/** Saxophone slider default (manual user-controlled volume) */
export const DEFAULT_SAXOPHONE_VOLUME = 0;

/** Automatic saxophone volume used during instrumental sections */
export const DEFAULT_AUTO_SAXOPHONE_VOLUME = 55;

/** Bass instrument volume */
export const DEFAULT_BASS_VOLUME = 50;

/** Metronome click volume */
export const DEFAULT_METRONOME_VOLUME = 70;

// ─── Convenience Aggregate ───────────────────────────────────────────────────

/**
 * Full default AudioMixerSettings object.
 * Useful for fallback / SSR scenarios where the mixer service is unavailable.
 */
export const DEFAULT_AUDIO_MIXER_SETTINGS = {
  masterVolume: DEFAULT_MASTER_VOLUME,
  youtubeVolume: DEFAULT_YOUTUBE_VOLUME,
  pitchShiftedAudioVolume: DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME,
  chordPlaybackVolume: DEFAULT_CHORD_PLAYBACK_VOLUME,
  pianoVolume: DEFAULT_PIANO_VOLUME,
  guitarVolume: DEFAULT_GUITAR_VOLUME,
  violinVolume: DEFAULT_VIOLIN_VOLUME,
  fluteVolume: DEFAULT_FLUTE_VOLUME,
  saxophoneVolume: DEFAULT_SAXOPHONE_VOLUME,
  bassVolume: DEFAULT_BASS_VOLUME,
  metronomeVolume: DEFAULT_METRONOME_VOLUME,
} as const;
