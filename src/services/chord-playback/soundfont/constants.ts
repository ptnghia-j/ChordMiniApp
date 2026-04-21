import type { InstrumentName } from '@/utils/instrumentNoteGeneration';
import type { InstrumentRenderConfig } from './types';

export const DEFAULT_BPM = 120;
export const MAX_BPM = 400;
export const SAMPLE_DURATION = 3.5;
export const SUSTAIN_RETRIGGER_SEGMENT_SECONDS = 2.75;
export const SUSTAIN_RETRIGGER_OVERLAP_SECONDS = 0.16;
export const SUSTAIN_RETRIGGER_VELOCITY_SCALE = 0.94;
export const DENSITY_REFERENCE_VOICES = 3;
export const MIN_DENSITY_COMPENSATION = 0.72;
/** Notes within this onset window count as one strum / pick burst for level compensation. */
export const GUITAR_STRUM_CLUSTER_SECONDS = 0.095;
/**
 * Strum loudness curve: per-note gain ≈ √(DENSITY_REFERENCE_VOICES) × n^(γ−1).
 * γ=1 matches the old “full stack” feel; γ<1 tapers large strums slightly without
 * collapsing them toward a single-note level.
 */
export const GUITAR_STRUM_CLUSTER_LEVEL_GAMMA = 0.97;
// Cluster-chord compensation: offsets densityCompensation so simultaneous
// (block/cluster) piano onsets balance against single-voice arpeggios.
export const PIANO_BLOCK_CHORD_VELOCITY_BOOST = 1.51;
export const PIANO_LATE_ONSET_GRACE_SECONDS = 0.18;
export const PIANO_SUSTAIN_PEDAL_TAIL_SECONDS = 0.65;
export const PIANO_BASS_SUSTAIN_PEDAL_TAIL_SECONDS = 0.27;
export const UNLOAD_DELAY_MS = 30000;
export const SUSTAIN_RETRIGGER_INSTRUMENTS = new Set<InstrumentName>(['violin', 'melodyViolin', 'flute']);
export const NATIVE_LOOP_INSTRUMENTS = new Set<InstrumentName>(['violin', 'melodyViolin', 'flute', 'saxophone']);

export const RENDER_CONFIG_BY_INSTRUMENT: Record<InstrumentName, InstrumentRenderConfig> = {
  piano: {
    soundfontInstrument: 'acoustic_grand_piano',
    performanceVelocity: 88,
    outputGainCompensation: 1.45,
  },
  guitar: {
    soundfontInstrument: 'acoustic_guitar_steel',
    performanceVelocity: 84,
  },
  violin: {
    soundfontInstrument: 'violin',
    performanceVelocity: 92,
  },
  melodyViolin: {
    soundfontInstrument: 'violin',
    performanceVelocity: 92,
  },
  flute: {
    soundfontInstrument: 'flute',
    performanceVelocity: 90,
  },
  saxophone: {
    soundfontInstrument: 'tenor_sax',
    soundfontKit: 'MusyngKite',
    performanceVelocity: 98,
  },
  bass: {
    soundfontInstrument: 'electric_bass_finger',
    performanceVelocity: 86,
  },
};
