import type { SegmentationResult } from '@/types/chatbotTypes';
import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import type { InstrumentName } from '@/utils/instrumentNoteGeneration';

export interface SoundfontChordPlaybackOptions {
  pianoVolume: number;
  guitarVolume: number;
  violinVolume: number;
  melodyVolume: number;
  fluteVolume: number;
  saxophoneVolume: number;
  bassVolume: number;
  enabled: boolean;
}

export interface PlaybackTimingContext {
  startTime?: number;
  totalDuration?: number;
  playbackTime?: number;
  beatCount?: number;
  segmentationData?: SegmentationResult | null;
  signalDynamics?: ChordSignalDynamics | null;
  /**
   * Name of the chord scheduled immediately after the one being played.
   * Forwarded to note generators so the guitar strum builder can decide
   * whether short-measure transitions share enough anchor fingers to keep
   * a syncopated upstrum on beat 2&.
   */
  nextChordName?: string;
}

export interface InstrumentRenderConfig {
  soundfontInstrument: string;
  soundfontKit?: string;
  performanceVelocity: number;
  outputGainCompensation?: number;
}

export interface ActiveScheduledNote {
  stopFn: (time?: number) => void;
  scheduledStartTime: number;
  scheduledEndTime: number;
  isLooping: boolean;
  releaseLeadTime: number;
  naturalFinishWindow: number;
}

export interface SoundfontInstrumentInstance {
  hasLoops?: boolean;
  output?: {
    setVolume?: (volume: number) => void;
  };
  start: (options: {
    note: string;
    velocity: number;
    time: number;
    duration: number;
    decayTime: number;
    loop: boolean;
  }) => ((time?: number) => void) | undefined;
  stop?: (sample?: { stopId?: string | number; time?: number } | string | number) => void;
}

export interface LoadableInstrument {
  load?: () => Promise<void>;
  loaded?: () => Promise<void>;
}

export type InstrumentVolumeConfig = Array<{ name: InstrumentName; volume: number }>;
