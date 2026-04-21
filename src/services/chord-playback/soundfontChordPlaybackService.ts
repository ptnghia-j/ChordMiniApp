/**
 * Soundfont Chord Playback Service - Production
 *
 * Real instrument soundfont playback using smplr library
 * Supports Piano, Guitar, Violin, and Flute with lazy loading and error handling
 * Compatible with existing AudioMixerService interface
 * Lazy loads smplr library (~100KB) for better initial bundle size
 */

import { audioContextManager } from '../audio/audioContextManager';
import { parseChordToMidiNotes } from '@/utils/chordToMidi';
import {
  adjustScheduledNotesForPlayback,
  generateNotesForInstrument,
  DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
  type InstrumentName,
  type ScheduledNote,
} from '@/utils/instrumentNoteGeneration';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import {
  DEFAULT_BASS_VOLUME,
  DEFAULT_FLUTE_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_MELODY_VOLUME,
  DEFAULT_PIANO_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
} from '@/config/audioDefaults';
import {
  getInstrumentEnvelopeProfile,
  type InstrumentEnvelopeConfig,
} from './instrumentEnvelopeConfig';
import {
  DEFAULT_BPM,
  DENSITY_REFERENCE_VOICES,
  MAX_BPM,
  MIN_DENSITY_COMPENSATION,
  PIANO_BASS_SUSTAIN_PEDAL_TAIL_SECONDS,
  NATIVE_LOOP_INSTRUMENTS,
  PIANO_BLOCK_CHORD_VELOCITY_BOOST,
  PIANO_LATE_ONSET_GRACE_SECONDS,
  PIANO_SUSTAIN_PEDAL_TAIL_SECONDS,
  RENDER_CONFIG_BY_INSTRUMENT,
  SAMPLE_DURATION,
  SUSTAIN_RETRIGGER_INSTRUMENTS,
} from './soundfont/constants';
import { SoundfontInstrumentRegistry } from './soundfont/instrumentRegistry';
import type {
  ActiveScheduledNote,
  InstrumentRenderConfig,
  InstrumentVolumeConfig,
  PlaybackTimingContext,
  SoundfontChordPlaybackOptions,
} from './soundfont/types';
import {
  buildGuitarStrumClusterSizes,
  buildSustainRetriggerPlan,
  getSwitchAttackMultiplier,
  resolveGuitarClusterDensityCompensation,
  resolvePatternBeatDuration,
} from './soundfont/utils';

export type { PlaybackTimingContext, SoundfontChordPlaybackOptions } from './soundfont/types';

export class SoundfontChordPlaybackService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private activeNotes = new Map<InstrumentName, ActiveScheduledNote[]>();
  private scheduledTimeouts = new Map<InstrumentName, NodeJS.Timeout>();
  private instrumentGeneration = new Map<InstrumentName, number>();
  private readonly instrumentRegistry: SoundfontInstrumentRegistry;

  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: DEFAULT_PIANO_VOLUME,
    guitarVolume: DEFAULT_GUITAR_VOLUME,
    violinVolume: DEFAULT_VIOLIN_VOLUME,
    melodyVolume: DEFAULT_MELODY_VOLUME,
    fluteVolume: DEFAULT_FLUTE_VOLUME,
    saxophoneVolume: 0,
    bassVolume: DEFAULT_BASS_VOLUME,
    enabled: false,
  };

  constructor() {
    this.instrumentRegistry = new SoundfontInstrumentRegistry(
      () => this.audioContext,
      (instrumentName) => this.getInstrumentEnvelope(instrumentName),
      (instrumentName) => this.getInstrumentRenderConfig(instrumentName),
      (instrumentName) => this.stopInstrumentNotes(instrumentName),
    );
  }

  private getInstrumentEnvelope(instrumentName: InstrumentName): InstrumentEnvelopeConfig {
    return getInstrumentEnvelopeProfile(instrumentName);
  }

  private getInstrumentRenderConfig(instrumentName: InstrumentName): InstrumentRenderConfig {
    return RENDER_CONFIG_BY_INSTRUMENT[instrumentName] ?? {
      soundfontInstrument: instrumentName,
      performanceVelocity: 90,
    };
  }

  private resetInstrumentRuntimeState(): void {
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledTimeouts.clear();
    this.activeNotes.clear();
    this.instrumentGeneration.clear();
    this.instrumentRegistry.reset();
  }

  private async syncAudioContext(): Promise<void> {
    const previousContext = this.audioContext;
    const nextContext = audioContextManager.getContext();
    const contextWasRecreated = previousContext !== null && previousContext !== nextContext;

    this.audioContext = nextContext;

    if (contextWasRecreated) {
      this.resetInstrumentRuntimeState();
    }

    await audioContextManager.resume();
  }

  async prepareForPlayback(): Promise<boolean> {
    if (!this.options.enabled) {
      return false;
    }

    if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch {
        return false;
      }
    }

    try {
      await this.syncAudioContext();
    } catch {
      return false;
    }

    return !!this.audioContext && this.audioContext.state === 'running';
  }

  async prepareInstrumentForPlayback(instrumentName: InstrumentName): Promise<boolean> {
    const ready = await this.prepareForPlayback();
    if (!ready) {
      return false;
    }

    try {
      await this.instrumentRegistry.ensureLoaded(instrumentName);
      return true;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;

    try {
      await this.syncAudioContext();
      if (process.env.NODE_ENV !== 'production') {
        console.log('🎵 AudioContext initialized (instruments will load on-demand)');
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize AudioContext:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async playChord(
    chordName: string,
    duration: number = 2.0,
    bpm: number = DEFAULT_BPM,
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
    timeSignature: number = 4,
    guitarVoicing?: Partial<GuitarVoicingSelection>,
    targetKey?: string,
  ): Promise<void> {
    if (!(await this.prepareForPlayback())) {
      return;
    }

    const midiNotes = parseChordToMidiNotes(chordName);
    if (midiNotes.length === 0) {
      console.warn(`⚠️ Could not parse chord: ${chordName}`);
      return;
    }

    const safeBpm = this.validateBpm(bpm);
    const beatDuration = resolvePatternBeatDuration(duration, safeBpm, timingContext);
    const instrumentConfigs = this.getEnabledInstrumentConfigs();

    const promises: Promise<void>[] = [];
    for (const { name, volume } of instrumentConfigs) {
      const scheduledNotes = generateNotesForInstrument(name, {
        chordName,
        chordNotes: midiNotes,
        duration,
        beatDuration,
        startTime: timingContext?.startTime,
        totalDuration: timingContext?.totalDuration,
        timeSignature,
        segmentationData: timingContext?.segmentationData,
        signalDynamics: timingContext?.signalDynamics,
        guitarVoicing,
        targetKey,
        nextChordName: timingContext?.nextChordName,
      });

      if (scheduledNotes.length > 0) {
        promises.push(this.playScheduledNotes(name, scheduledNotes, volume, dynamicVelocity, timingContext));
      }
    }

    await Promise.all(promises);
  }

  async playChordInstrument(
    instrumentName: InstrumentName,
    chordName: string,
    duration: number = 2.0,
    bpm: number = DEFAULT_BPM,
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
    timeSignature: number = 4,
    guitarVoicing?: Partial<GuitarVoicingSelection>,
    targetKey?: string,
  ): Promise<void> {
    if (!(await this.prepareForPlayback())) {
      return;
    }

    const midiNotes = parseChordToMidiNotes(chordName);
    if (midiNotes.length === 0) {
      console.warn(`⚠️ Could not parse chord: ${chordName}`);
      return;
    }

    const volume = this.getVolumeForInstrument(instrumentName);
    if (volume <= 0) {
      return;
    }

    const scheduledNotes = generateNotesForInstrument(instrumentName, {
      chordName,
      chordNotes: midiNotes,
      duration,
      beatDuration: resolvePatternBeatDuration(duration, this.validateBpm(bpm), timingContext),
      startTime: timingContext?.startTime,
      totalDuration: timingContext?.totalDuration,
      timeSignature,
      segmentationData: timingContext?.segmentationData,
      signalDynamics: timingContext?.signalDynamics,
      guitarVoicing,
      targetKey,
      nextChordName: timingContext?.nextChordName,
    });

    if (scheduledNotes.length === 0) {
      return;
    }

    await this.playScheduledNotes(instrumentName, scheduledNotes, volume, dynamicVelocity, timingContext);
  }

  async playScheduledInstrument(
    instrumentName: InstrumentName,
    scheduledNotes: ScheduledNote[],
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
  ): Promise<void> {
    if (!(await this.prepareForPlayback())) {
      return;
    }

    if (scheduledNotes.length === 0) {
      this.stopInstrumentNotes(instrumentName);
      return;
    }

    const volume = this.getVolumeForInstrument(instrumentName);
    if (volume <= 0) {
      return;
    }

    await this.playScheduledNotes(instrumentName, scheduledNotes, volume, dynamicVelocity, timingContext);
  }

  private async playScheduledNotes(
    instrumentName: InstrumentName,
    scheduledNotes: ScheduledNote[],
    volume: number,
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
  ): Promise<void> {
    const previousGeneration = this.instrumentGeneration.get(instrumentName) ?? 0;
    const currentGeneration = previousGeneration + 1;
    this.instrumentGeneration.set(instrumentName, currentGeneration);

    await this.instrumentRegistry.ensureLoaded(instrumentName);

    if (this.instrumentGeneration.get(instrumentName) !== currentGeneration) {
      return;
    }

    const instrument = this.instrumentRegistry.getInstrument(instrumentName);
    if (!instrument) {
      return;
    }

    const renderConfig = this.getInstrumentRenderConfig(instrumentName);
    const outputGainCompensation = Math.max(0.5, renderConfig.outputGainCompensation ?? 1.0);
    const compensatedVolume = Math.max(0, Math.min(100, volume * outputGainCompensation));

    if (typeof instrument.output?.setVolume === 'function') {
      instrument.output.setVolume(Math.round((compensatedVolume / 100) * 127));
    }

    const existingTimeout = this.scheduledTimeouts.get(instrumentName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.scheduledTimeouts.delete(instrumentName);
    }

    const now = this.audioContext?.currentTime ?? 0;
    const priorActiveNotes = this.activeNotes.get(instrumentName) ?? [];
    const isChordSwitch = priorActiveNotes.some((note) => note.scheduledEndTime > now);
    this.cancelPendingInstrumentNotesForChordSwitch(instrumentName);

    const baseVelocity = typeof instrument.output?.setVolume === 'function'
      ? renderConfig.performanceVelocity
      : (compensatedVolume / 100) * 127;
    const dynamicMultiplier = dynamicVelocity ?? 1.0;
    const envelope = this.getInstrumentEnvelope(instrumentName);
    const baseTime = this.audioContext?.currentTime ?? 0;
    const elapsedInChord = timingContext?.playbackTime !== undefined && timingContext?.startTime !== undefined
      ? Math.max(0, timingContext.playbackTime - timingContext.startTime)
      : 0;

    const adjustedNotes = adjustScheduledNotesForPlayback(scheduledNotes, {
      instrumentName,
      elapsedInChord,
      latePianoOnsetGraceSeconds: PIANO_LATE_ONSET_GRACE_SECONDS,
      latePianoMinAudibleSeconds: DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
    });

    if (adjustedNotes.length === 0) {
      return;
    }

    const playbackNotes = SUSTAIN_RETRIGGER_INSTRUMENTS.has(instrumentName)
      ? adjustedNotes.flatMap((note) => buildSustainRetriggerPlan(note))
      : adjustedNotes;

    const onsetDensity = new Map<string, number>();
    playbackNotes.forEach((note) => {
      const onsetKey = note.startOffset.toFixed(4);
      onsetDensity.set(onsetKey, (onsetDensity.get(onsetKey) ?? 0) + 1);
    });

    const guitarClusterSizes = instrumentName === 'guitar'
      ? buildGuitarStrumClusterSizes(playbackNotes)
      : null;

    const activeNotesForInstrument: ActiveScheduledNote[] = [];

    playbackNotes.forEach((note, noteIndex) => {
      const simultaneousNotes = onsetDensity.get(note.startOffset.toFixed(4)) ?? 1;
      const isShortPianoBlockChordOnset = instrumentName === 'piano'
        && note.startOffset <= 0.0001
        && simultaneousNotes >= 3;
      const densityCompensation = instrumentName === 'guitar' && guitarClusterSizes
        ? resolveGuitarClusterDensityCompensation(guitarClusterSizes[noteIndex])
        : Math.max(
          MIN_DENSITY_COMPENSATION,
          Math.sqrt(DENSITY_REFERENCE_VOICES / simultaneousNotes),
        );
      const switchAttackMultiplier = getSwitchAttackMultiplier(
        note.startOffset,
        isChordSwitch,
        envelope,
      );
      const pianoBlockChordBoost = isShortPianoBlockChordOnset
        ? PIANO_BLOCK_CHORD_VELOCITY_BOOST
        : 1.0;
      const velocity = Math.min(
        baseVelocity
          * note.velocityMultiplier
          * dynamicMultiplier
          * densityCompensation
          * switchAttackMultiplier
          * pianoBlockChordBoost,
        127,
      );
      const noteStartTime = baseTime + note.startOffset;
      const pianoPedalTailSeconds = instrumentName === 'piano'
        ? (note.isBass ? PIANO_BASS_SUSTAIN_PEDAL_TAIL_SECONDS : PIANO_SUSTAIN_PEDAL_TAIL_SECONDS)
        : 0;
      const smplrDuration = note.duration + envelope.sustainTailSeconds + pianoPedalTailSeconds;
      const supportsLooping = typeof instrument.hasLoops === 'boolean' ? instrument.hasLoops : true;
      const shouldUseRetriggerSustain = SUSTAIN_RETRIGGER_INSTRUMENTS.has(instrumentName)
        && note.duration > SAMPLE_DURATION;
      const needsLoop = NATIVE_LOOP_INSTRUMENTS.has(instrumentName)
        && supportsLooping
        && !shouldUseRetriggerSustain
        && note.duration > SAMPLE_DURATION;

      const stopFn = instrument.start({
        note: note.noteName,
        velocity,
        time: noteStartTime,
        duration: smplrDuration,
        decayTime: envelope.decayTime,
        loop: needsLoop,
      });

      if (stopFn) {
        activeNotesForInstrument.push({
          stopFn,
          scheduledStartTime: noteStartTime,
          scheduledEndTime: noteStartTime + smplrDuration,
          isLooping: needsLoop,
          releaseLeadTime: envelope.releaseLeadTime,
          naturalFinishWindow: envelope.naturalFinishWindow,
        });
      }
    });

    this.activeNotes.set(instrumentName, activeNotesForInstrument);

    const remainingDuration = playbackNotes.reduce(
      (maxEnd, note) => {
        const pianoPedalTailSeconds = instrumentName === 'piano'
          ? (note.isBass ? PIANO_BASS_SUSTAIN_PEDAL_TAIL_SECONDS : PIANO_SUSTAIN_PEDAL_TAIL_SECONDS)
          : 0;
        return Math.max(
          maxEnd,
          note.startOffset + note.duration + envelope.sustainTailSeconds + pianoPedalTailSeconds + envelope.decayTime,
        );
      },
      0,
    );
    if (remainingDuration > 0) {
      const timeoutDuration = remainingDuration + 0.05;
      const timeoutId = setTimeout(() => {
        this.scheduledTimeouts.delete(instrumentName);
        if (this.instrumentGeneration.get(instrumentName) === currentGeneration) {
          this.stopInstrumentNotes(instrumentName);
        }
      }, timeoutDuration * 1000);

      this.scheduledTimeouts.set(instrumentName, timeoutId);
    }
  }

  private stopInstrumentNotes(instrumentName: InstrumentName): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);
    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    activeNotesForInstrument.forEach((note) => {
      const timeUntilEnd = note.scheduledEndTime - now;
      if (!note.isLooping && timeUntilEnd <= note.naturalFinishWindow) {
        return;
      }

      note.stopFn(now + note.releaseLeadTime);
    });

    this.activeNotes.set(instrumentName, []);
  }

  private cancelPendingInstrumentNotesForChordSwitch(instrumentName: InstrumentName): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);
    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    const notesToStop = [...activeNotesForInstrument];
    this.activeNotes.set(instrumentName, []);

    notesToStop.forEach((note) => {
      const timeUntilEnd = note.scheduledEndTime - now;
      if (timeUntilEnd <= 0) {
        return;
      }

      const noteHasStarted = now >= note.scheduledStartTime - 0.02;
      if (!noteHasStarted) {
        note.stopFn(now);
      }
    });
  }

  private softStopInstrumentNotes(instrumentName: InstrumentName): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);
    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    const envelope = this.getInstrumentEnvelope(instrumentName);
    const notesToStop = [...activeNotesForInstrument];
    this.activeNotes.set(instrumentName, []);

    notesToStop.forEach((note) => {
      const timeUntilEnd = note.scheduledEndTime - now;
      if (timeUntilEnd <= 0) {
        return;
      }

      const noteHasStarted = now >= note.scheduledStartTime - 0.02;
      if (!noteHasStarted) {
        note.stopFn(now);
        return;
      }

      if (!note.isLooping && timeUntilEnd <= note.naturalFinishWindow) {
        return;
      }

      note.stopFn(now + Math.max(note.releaseLeadTime, envelope.crossfadeOverlapSeconds));
    });
  }

  updateOptions(options: Partial<SoundfontChordPlaybackOptions>): void {
    this.options = { ...this.options, ...options };

    if (options.enabled && !this.isInitialized && !this.isInitializing) {
      this.initialize().catch((error) => {
        console.error('❌ Failed to initialize soundfonts:', error);
      });
    }

    this.scheduleUnloadIfMuted('piano', options.pianoVolume);
    this.scheduleUnloadIfMuted('guitar', options.guitarVolume);
    this.scheduleUnloadIfMuted('violin', options.violinVolume);
    this.scheduleUnloadIfMuted('melodyViolin', options.melodyVolume);
    this.scheduleUnloadIfMuted('flute', options.fluteVolume);
    this.scheduleUnloadIfMuted('saxophone', options.saxophoneVolume);
    this.scheduleUnloadIfMuted('bass', options.bassVolume);
  }

  getOptions(): SoundfontChordPlaybackOptions {
    return { ...this.options };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  softStopAll(): void {
    const loadedInstrumentNames: InstrumentName[] = [];
    this.instrumentRegistry.forEachLoadedInstrument((instrumentName) => {
      loadedInstrumentNames.push(instrumentName);
    });
    this.softStopInstruments(loadedInstrumentNames);
  }

  stopAll(): void {
    const loadedInstrumentNames: InstrumentName[] = [];
    this.instrumentRegistry.forEachLoadedInstrument((instrumentName) => {
      loadedInstrumentNames.push(instrumentName);
    });
    this.stopInstruments(loadedInstrumentNames);
  }

  softStopInstruments(instrumentNames: InstrumentName[]): void {
    instrumentNames.forEach((instrumentName) => {
      this.softStopInstrumentNotes(instrumentName);
    });
  }

  stopInstruments(instrumentNames: InstrumentName[]): void {
    instrumentNames.forEach((instrumentName) => {
      const previousGeneration = this.instrumentGeneration.get(instrumentName) ?? 0;
      this.instrumentGeneration.set(instrumentName, previousGeneration + 1);

      const timeoutId = this.scheduledTimeouts.get(instrumentName);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.scheduledTimeouts.delete(instrumentName);
      }
    });

    instrumentNames.forEach((instrumentName) => {
      const instrument = this.instrumentRegistry.getInstrument(instrumentName);
      if (typeof instrument?.stop === 'function') {
        try {
          instrument.stop();
        } catch {
          // Best effort: continue with active note cancellation below.
        }
      }

      const activeNotesForInstrument = this.activeNotes.get(instrumentName);
      if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
        return;
      }

      const now = this.audioContext?.currentTime ?? 0;
      activeNotesForInstrument.forEach((note) => {
        const noteHasStarted = now >= note.scheduledStartTime - 0.005;
        note.stopFn(noteHasStarted ? now + Math.min(note.releaseLeadTime, 0.02) : now);
      });
      this.activeNotes.set(instrumentName, []);
    });
  }

  dispose(): void {
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.stopAll();
    this.activeNotes.clear();
    this.scheduledTimeouts.clear();
    this.instrumentGeneration.clear();
    this.instrumentRegistry.dispose();
    this.audioContext = null;
    this.isInitialized = false;
    this.isInitializing = false;
  }

  private getEnabledInstrumentConfigs(): InstrumentVolumeConfig {
    const configs: InstrumentVolumeConfig = [];

    if (this.options.pianoVolume > 0) {
      configs.push({ name: 'piano', volume: this.options.pianoVolume });
    }
    if (this.options.guitarVolume > 0) {
      configs.push({ name: 'guitar', volume: this.options.guitarVolume });
    }
    if (this.options.violinVolume > 0) {
      configs.push({ name: 'violin', volume: this.options.violinVolume });
    }
    if (this.options.fluteVolume > 0) {
      configs.push({ name: 'flute', volume: this.options.fluteVolume });
    }
    if (this.options.saxophoneVolume > 0) {
      configs.push({ name: 'saxophone', volume: this.options.saxophoneVolume });
    }
    if (this.options.bassVolume > 0) {
      configs.push({ name: 'bass', volume: this.options.bassVolume });
    }

    return configs;
  }

  private getVolumeForInstrument(instrumentName: InstrumentName): number {
    const volumeByInstrument: Record<InstrumentName, number> = {
      piano: this.options.pianoVolume,
      guitar: this.options.guitarVolume,
      violin: this.options.violinVolume,
      melodyViolin: this.options.melodyVolume,
      flute: this.options.fluteVolume,
      saxophone: this.options.saxophoneVolume,
      bass: this.options.bassVolume,
    };

    return volumeByInstrument[instrumentName];
  }

  private scheduleUnloadIfMuted(
    instrumentName: InstrumentName,
    volume: number | undefined,
  ): void {
    if (volume === 0 && this.instrumentRegistry.hasLoadedInstrument(instrumentName)) {
      this.instrumentRegistry.scheduleUnload(instrumentName);
    }
  }

  private validateBpm(bpm: number): number {
    if (bpm <= 0 || !isFinite(bpm) || bpm > MAX_BPM) {
      console.error(`❌ Invalid BPM value: ${bpm}. Using default ${DEFAULT_BPM} BPM.`);
      return DEFAULT_BPM;
    }

    return bpm;
  }
}

let instance: SoundfontChordPlaybackService | null = null;

export const getSoundfontChordPlaybackService = (): SoundfontChordPlaybackService => {
  if (!instance) {
    instance = new SoundfontChordPlaybackService();
  }
  return instance;
};
