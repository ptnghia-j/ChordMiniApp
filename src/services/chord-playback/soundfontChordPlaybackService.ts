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
  beatDurationFromBpm,
  DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
  type InstrumentName,
  type ScheduledNote,
} from '@/utils/instrumentNoteGeneration';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import {
  DEFAULT_PIANO_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
  DEFAULT_FLUTE_VOLUME,
  DEFAULT_BASS_VOLUME,
} from '@/config/audioDefaults';
import {
  getInstrumentEnvelopeProfile,
  type InstrumentEnvelopeConfig,
} from './instrumentEnvelopeConfig';

// Lazy load smplr to reduce initial bundle size
let SmplrModule: typeof import('smplr') | null = null;

async function getSmplr() {
  if (!SmplrModule) {
    SmplrModule = await import('smplr');
  }
  return SmplrModule;
}

/**
 * Options interface compatible with AudioMixerService
 */
export interface SoundfontChordPlaybackOptions {
  pianoVolume: number; // 0-100
  guitarVolume: number; // 0-100
  violinVolume: number; // 0-100
  fluteVolume: number; // 0-100
  saxophoneVolume: number; // 0-100
  bassVolume: number; // 0-100 (new)
  enabled: boolean;
}

export interface PlaybackTimingContext {
  startTime?: number;
  totalDuration?: number;
  playbackTime?: number;
  beatCount?: number;
  segmentationData?: SegmentationResult | null;
  signalDynamics?: ChordSignalDynamics | null;
}

function resolvePatternBeatDuration(
  duration: number,
  bpm: number,
  timingContext?: PlaybackTimingContext,
): number {
  const beatCount = timingContext?.beatCount;
  if (typeof beatCount === 'number' && isFinite(beatCount) && beatCount > 0 && duration > 0) {
    return duration / beatCount;
  }
  return beatDurationFromBpm(bpm);
}

interface InstrumentRenderConfig {
  soundfontInstrument: string;
  soundfontKit?: string;
  performanceVelocity: number;
}

interface ActiveScheduledNote {
  stopFn: (time?: number) => void;
  scheduledStartTime: number;
  scheduledEndTime: number;
  isLooping: boolean;
  releaseLeadTime: number;
  naturalFinishWindow: number;
}

export class SoundfontChordPlaybackService {
  // Constants for chord playback
  private static readonly DEFAULT_BPM = 120; // Default BPM fallback
  private static readonly SAMPLE_DURATION = 3.5; // Estimated soundfont sample duration in seconds
  private static readonly SUSTAIN_RETRIGGER_SEGMENT_SECONDS = 2.75;
  private static readonly SUSTAIN_RETRIGGER_OVERLAP_SECONDS = 0.16;
  private static readonly SUSTAIN_RETRIGGER_VELOCITY_SCALE = 0.94;
  private static readonly DENSITY_REFERENCE_VOICES = 3;
  private static readonly MIN_DENSITY_COMPENSATION = 0.72;
  private static readonly PIANO_BLOCK_CHORD_VELOCITY_BOOST = 1.22;
  private static readonly PIANO_LATE_ONSET_GRACE_SECONDS = 0.18;
  private static readonly PIANO_LATE_ONSET_MIN_AUDIBLE_SECONDS = DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS;
  private static readonly RENDER_CONFIG_BY_INSTRUMENT: Record<InstrumentName, InstrumentRenderConfig> = {
    piano: {
      soundfontInstrument: 'acoustic_grand_piano',
      performanceVelocity: 88,
    },
    guitar: {
      soundfontInstrument: 'acoustic_guitar_steel',
      performanceVelocity: 84,
    },
    violin: {
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

  private audioContext: AudioContext | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private instruments: Map<string, any> = new Map(); // Type will be Soundfont after lazy load
  private loadedInstruments: Set<string> = new Set(); // Track which instruments are loaded
  private loadingInstruments: Set<string> = new Set(); // Track which instruments are currently loading
  private instrumentLoadPromises: Map<string, Promise<void>> = new Map(); // Track in-flight instrument loads
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: Error | null = null;
  private activeNotes: Map<string, ActiveScheduledNote[]> = new Map(); // Track active notes with metadata
  private scheduledTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled timeouts for cleanup
  private loopIntervals: Map<string, NodeJS.Timeout> = new Map(); // Track loop intervals for cleanup
  private instrumentGeneration: Map<string, number> = new Map(); // Per-instrument generation counter to prevent stale async calls
  private unloadTimers: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled instrument unloads
  private readonly UNLOAD_DELAY_MS = 30000; // 30 seconds before unloading unused instrument

  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: DEFAULT_PIANO_VOLUME,
    guitarVolume: DEFAULT_GUITAR_VOLUME,
    violinVolume: DEFAULT_VIOLIN_VOLUME,
    fluteVolume: DEFAULT_FLUTE_VOLUME,
    saxophoneVolume: 0,
    bassVolume: DEFAULT_BASS_VOLUME,
    enabled: false
  };

  constructor() {
    // AudioContext will be acquired lazily via AudioContextManager during initialize()
  }

  private getInstrumentEnvelope(instrumentName: string): InstrumentEnvelopeConfig {
    return getInstrumentEnvelopeProfile(instrumentName as InstrumentName);
  }

  private getInstrumentRenderConfig(instrumentName: string): InstrumentRenderConfig {
    return SoundfontChordPlaybackService.RENDER_CONFIG_BY_INSTRUMENT[instrumentName as InstrumentName]
      ?? {
        soundfontInstrument: instrumentName,
        performanceVelocity: 90,
      };
  }

  private resetInstrumentRuntimeState(): void {
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledTimeouts.clear();

    this.loopIntervals.forEach((intervalId) => {
      clearTimeout(intervalId);
    });
    this.loopIntervals.clear();

    this.unloadTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.unloadTimers.clear();

    this.activeNotes.clear();
    this.instruments.clear();
    this.loadedInstruments.clear();
    this.loadingInstruments.clear();
    this.instrumentLoadPromises.clear();
    this.instrumentGeneration.clear();
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

  private getSwitchAttackMultiplier(
    startOffset: number,
    isChordSwitch: boolean,
    envelope: InstrumentEnvelopeConfig,
  ): number {
    if (!isChordSwitch) {
      return 1;
    }

    if (startOffset <= 0) {
      return envelope.switchAttackFloor;
    }

    if (startOffset >= envelope.switchAttackRampWindow) {
      return 1;
    }

    const rampProgress = startOffset / envelope.switchAttackRampWindow;
    return envelope.switchAttackFloor + ((1 - envelope.switchAttackFloor) * rampProgress);
  }

  private buildSustainRetriggerPlan(note: ScheduledNote): ScheduledNote[] {
    if (note.duration <= SoundfontChordPlaybackService.SAMPLE_DURATION) {
      return [note];
    }

    const overlap = SoundfontChordPlaybackService.SUSTAIN_RETRIGGER_OVERLAP_SECONDS;
    const segment = SoundfontChordPlaybackService.SUSTAIN_RETRIGGER_SEGMENT_SECONDS;
    const stride = Math.max(0.5, segment - overlap);
    const segments: ScheduledNote[] = [];

    for (let segmentStart = note.startOffset; segmentStart < note.startOffset + note.duration - 0.001; segmentStart += stride) {
      const elapsedWithinNote = segmentStart - note.startOffset;
      const remainingWithinNote = note.duration - elapsedWithinNote;
      if (remainingWithinNote <= 0) {
        break;
      }

      const requestedDuration = Math.min(segment + overlap, remainingWithinNote);
      const isFirstSegment = elapsedWithinNote <= 0.0001;
      segments.push({
        ...note,
        startOffset: segmentStart,
        duration: requestedDuration,
        velocityMultiplier: note.velocityMultiplier * (
          isFirstSegment
            ? 1
            : SoundfontChordPlaybackService.SUSTAIN_RETRIGGER_VELOCITY_SCALE
        ),
      });
    }

    return segments.length > 0 ? segments : [note];
  }

  /**
   * Initialize AudioContext only (instruments loaded on-demand)
   * PERFORMANCE FIX #4: Changed from loading all instruments upfront to lazy per-instrument loading
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // Wait for ongoing initialization
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    this.initializationError = null;

    try {
      await this.syncAudioContext();
    } catch (e) {
      this.initializationError = e as Error;
      this.isInitializing = false;
      throw this.initializationError;
    }

    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🎵 AudioContext initialized (instruments will load on-demand)');
      }
      this.isInitialized = true;
    } catch (error) {
      this.initializationError = error as Error;
      console.error('❌ Failed to initialize AudioContext:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Load a single instrument (lazy loads smplr library)
   * PERFORMANCE FIX #4: Now called on-demand when instrument is first needed
   */
  private async loadInstrument(
    name: string,
    instrumentName: string,
    soundfontKit?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (!this.audioContext) throw new Error('AudioContext not available');

    // Lazy load smplr
    const { Soundfont } = await getSmplr();
    const envelope = this.getInstrumentEnvelope(name);

    const startTime = performance.now();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🎵 Loading ${name}...`);
    }
    const instrument = new Soundfont(this.audioContext, {
      instrument: instrumentName,
      ...(soundfontKit ? { kit: soundfontKit } : {}),
      decayTime: envelope.decayTime,
      loadLoopData: envelope.loadLoopData,
    });

    // Use recommended smplr API with safe typing
    type LoadableInstrument = { load?: () => Promise<void>; loaded?: () => Promise<void> };
    const loadable = instrument as unknown as LoadableInstrument;
    if (typeof loadable.load === 'function') {
      await loadable.load();
    } else if (typeof loadable.loaded === 'function') {
      // Backward compatibility fallback
      await loadable.loaded();
    }
    const loadTime = performance.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ ${name} loaded in ${loadTime.toFixed(0)}ms`);
    }

    return instrument;
  }

  /**
   * Ensure an instrument is loaded before use
   * PERFORMANCE FIX #4: Per-instrument lazy loading
   */
  private async ensureInstrumentLoaded(instrumentName: string): Promise<void> {
    // Already loaded
    if (this.loadedInstruments.has(instrumentName)) {
      // Cancel any pending unload
      const unloadTimer = this.unloadTimers.get(instrumentName);
      if (unloadTimer) {
        clearTimeout(unloadTimer);
        this.unloadTimers.delete(instrumentName);
      }
      return;
    }

    // If a load is already in-flight, await it
    const existingPromise = this.instrumentLoadPromises.get(instrumentName);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    // Begin a new load and store the in-flight promise
    const loadPromise = (async () => {
      this.loadingInstruments.add(instrumentName);
      try {
        const renderConfig = this.getInstrumentRenderConfig(instrumentName);
        if (!renderConfig.soundfontInstrument) {
          throw new Error(`Unknown instrument: ${instrumentName}`);
        }

        const instrument = await this.loadInstrument(
          instrumentName,
          renderConfig.soundfontInstrument,
          renderConfig.soundfontKit,
        );
        this.instruments.set(instrumentName, instrument);
        this.loadedInstruments.add(instrumentName);
      } finally {
        this.loadingInstruments.delete(instrumentName);
        this.instrumentLoadPromises.delete(instrumentName);
      }
    })();

    this.instrumentLoadPromises.set(instrumentName, loadPromise);
    await loadPromise;
  }

  /**
   * Unload an instrument to free memory
   * PERFORMANCE FIX #4: Unload unused instruments after delay
   */
  private unloadInstrument(instrumentName: string): void {
    if (!this.loadedInstruments.has(instrumentName)) return;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🗑️ Unloading ${instrumentName} to free memory`);
    }

    // Stop any active notes
    this.stopInstrumentNotes(instrumentName);

    // Remove from maps
    this.instruments.delete(instrumentName);
    this.loadedInstruments.delete(instrumentName);
    this.activeNotes.delete(instrumentName);
  }

  /**
   * Schedule instrument unload after delay if volume is 0
   * PERFORMANCE FIX #4: Automatic memory management
   */
  private scheduleInstrumentUnload(instrumentName: string): void {
    // Cancel any existing unload timer
    const existingTimer = this.unloadTimers.get(instrumentName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new unload
    const timer = setTimeout(() => {
      this.unloadInstrument(instrumentName);
      this.unloadTimers.delete(instrumentName);
    }, this.UNLOAD_DELAY_MS);

    this.unloadTimers.set(instrumentName, timer);
  }

  /**
   * Play a chord with all enabled instruments.
   * Uses shared instrumentNoteGeneration module for note patterns —
   * single source of truth matching the piano visualizer exactly.
   *
   * @param chordName - Chord symbol (e.g., "C", "Am", "G7", "C/E")
   * @param duration - Duration in seconds (default: 2.0)
   * @param bpm - Beats per minute for timing calculations (default: 120)
   * @param dynamicVelocity - Optional dynamic velocity multiplier (0-1) from dynamics analyzer
   */
  async playChord(
    chordName: string,
    duration: number = 2.0,
    bpm: number = 120,
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
    timeSignature: number = 4,
    guitarVoicing?: Partial<GuitarVoicingSelection>,
    targetKey?: string,
  ): Promise<void> {
    if (!(await this.prepareForPlayback())) {
      return;
    }

    // Parse chord using the shared chordToMidi utility (same as visualizer)
    const midiNotes = parseChordToMidiNotes(chordName);
    if (midiNotes.length === 0) {
      console.warn(`⚠️ Could not parse chord: ${chordName}`);
      return;
    }

    // Validate BPM
    const MAX_BPM = 400;
    if (bpm <= 0 || !isFinite(bpm) || bpm > MAX_BPM) {
      console.error(`❌ Invalid BPM value: ${bpm}. Using default ${SoundfontChordPlaybackService.DEFAULT_BPM} BPM.`);
      bpm = SoundfontChordPlaybackService.DEFAULT_BPM;
    }

    const bd = resolvePatternBeatDuration(duration, bpm, timingContext);

    // Instrument volumes → instrument names
    const instrumentConfigs: Array<{ name: InstrumentName; volume: number }> = [];
    if (this.options.pianoVolume > 0) instrumentConfigs.push({ name: 'piano', volume: this.options.pianoVolume });
    if (this.options.guitarVolume > 0) instrumentConfigs.push({ name: 'guitar', volume: this.options.guitarVolume });
    if (this.options.violinVolume > 0) instrumentConfigs.push({ name: 'violin', volume: this.options.violinVolume });
    if (this.options.fluteVolume > 0) instrumentConfigs.push({ name: 'flute', volume: this.options.fluteVolume });
    if (this.options.saxophoneVolume > 0) instrumentConfigs.push({ name: 'saxophone', volume: this.options.saxophoneVolume });
    if (this.options.bassVolume > 0) instrumentConfigs.push({ name: 'bass', volume: this.options.bassVolume });

    // Generate notes using the SHARED module (single source of truth)
    const promises: Promise<void>[] = [];
    for (const { name, volume } of instrumentConfigs) {
      const scheduledNotes = generateNotesForInstrument(name, {
        chordName,
        chordNotes: midiNotes,
        duration,
        beatDuration: bd,
        startTime: timingContext?.startTime,
        timeSignature,
        segmentationData: timingContext?.segmentationData,
        signalDynamics: timingContext?.signalDynamics,
        guitarVoicing,
        targetKey,
      });
      if (scheduledNotes.length > 0) {
        promises.push(
          this.playScheduledNotes(
            name,
            scheduledNotes,
            volume,
            dynamicVelocity,
            timingContext,
          ),
        );
      }
    }

    await Promise.all(promises);
  }

  async playChordInstrument(
    instrumentName: InstrumentName,
    chordName: string,
    duration: number = 2.0,
    bpm: number = 120,
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

    const MAX_BPM = 400;
    if (bpm <= 0 || !isFinite(bpm) || bpm > MAX_BPM) {
      console.error(`❌ Invalid BPM value: ${bpm}. Using default ${SoundfontChordPlaybackService.DEFAULT_BPM} BPM.`);
      bpm = SoundfontChordPlaybackService.DEFAULT_BPM;
    }

    const volumeByInstrument: Record<InstrumentName, number> = {
      piano: this.options.pianoVolume,
      guitar: this.options.guitarVolume,
      violin: this.options.violinVolume,
      flute: this.options.fluteVolume,
      saxophone: this.options.saxophoneVolume,
      bass: this.options.bassVolume,
    };

    const volume = volumeByInstrument[instrumentName];
    if (volume <= 0) {
      return;
    }

    const scheduledNotes = generateNotesForInstrument(instrumentName, {
      chordName,
      chordNotes: midiNotes,
      duration,
      beatDuration: resolvePatternBeatDuration(duration, bpm, timingContext),
      startTime: timingContext?.startTime,
      timeSignature,
      segmentationData: timingContext?.segmentationData,
      signalDynamics: timingContext?.signalDynamics,
      guitarVoicing,
      targetKey,
    });

    if (scheduledNotes.length === 0) {
      return;
    }

    await this.playScheduledNotes(
      instrumentName,
      scheduledNotes,
      volume,
      dynamicVelocity,
      timingContext,
    );
  }

  /**
   * Play pre-computed scheduled notes on a specific instrument.
   * Notes come from the shared instrumentNoteGeneration module.
   *
   * For sustained instruments (violin, flute) with durations exceeding
   * SAMPLE_DURATION, uses Web Audio API native `loop: true` for seamless
   * gapless playback — works correctly in background tabs (unlike setTimeout).
   */
  private async playScheduledNotes(
    instrumentName: string,
    scheduledNotes: ScheduledNote[],
    volume: number,
    dynamicVelocity?: number,
    timingContext?: PlaybackTimingContext,
  ): Promise<void> {
    // Increment generation counter BEFORE awaiting so we can detect stale calls
    const prevGen = this.instrumentGeneration.get(instrumentName) ?? 0;
    const thisGen = prevGen + 1;
    this.instrumentGeneration.set(instrumentName, thisGen);

    // Ensure instrument is loaded on-demand
    await this.ensureInstrumentLoaded(instrumentName);

    // If a newer playScheduledNotes call was made while we were loading,
    // bail out — the newer call will handle everything.
    if (this.instrumentGeneration.get(instrumentName) !== thisGen) return;

    const instrument = this.instruments.get(instrumentName);
    if (!instrument) return;

    if (typeof instrument.output?.setVolume === 'function') {
      instrument.output.setVolume(Math.round((Math.max(0, Math.min(100, volume)) / 100) * 127));
    }

    // Clear any existing scheduled timeout for this instrument
    const existingTimeout = this.scheduledTimeouts.get(instrumentName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.scheduledTimeouts.delete(instrumentName);
    }

    const now = this.audioContext?.currentTime ?? 0;
    const priorActiveNotes = this.activeNotes.get(instrumentName) ?? [];
    const isChordSwitch = priorActiveNotes.some((note) => note.scheduledEndTime > now);

    // On chord switches, let already-started notes complete on their own
    // scheduled duration. Only cancel future queued notes from the previous
    // chord so we do not smear extra overlap into the new chord.
    this.cancelPendingInstrumentNotesForChordSwitch(instrumentName);

    // Calculate base velocity (0-127 MIDI scale)
    const baseVelocity = typeof instrument.output?.setVolume === 'function'
      ? this.getInstrumentRenderConfig(instrumentName).performanceVelocity
      : (volume / 100) * 127;

    // Apply dynamic velocity if provided
    const dynamicMultiplier = dynamicVelocity !== undefined ? dynamicVelocity : 1.0;
    const envelope = this.getInstrumentEnvelope(instrumentName);

    // Track active notes for this instrument
    const activeNotesForInstrument: ActiveScheduledNote[] = [];

    // Determine if we need native looping (sustained instruments exceeding sample duration)
    const isSustainedInstrument = instrumentName === 'violin' || instrumentName === 'flute' || instrumentName === 'saxophone';

    // Get current audio context time for scheduling
    const baseTime = this.audioContext ? this.audioContext.currentTime : 0;
    const elapsedInChord = timingContext?.playbackTime !== undefined && timingContext?.startTime !== undefined
      ? Math.max(0, timingContext.playbackTime - timingContext.startTime)
      : 0;
    const adjustedNotes = adjustScheduledNotesForPlayback(scheduledNotes, {
      instrumentName: instrumentName as InstrumentName,
      elapsedInChord,
      latePianoOnsetGraceSeconds: SoundfontChordPlaybackService.PIANO_LATE_ONSET_GRACE_SECONDS,
      latePianoMinAudibleSeconds: SoundfontChordPlaybackService.PIANO_LATE_ONSET_MIN_AUDIBLE_SECONDS,
    });

    if (adjustedNotes.length === 0) {
      return;
    }

    const sustainedRetriggerInstruments = new Set<InstrumentName>(['violin', 'flute']);
    const playbackNotes = instrumentName && sustainedRetriggerInstruments.has(instrumentName as InstrumentName)
      ? adjustedNotes.flatMap((note) => this.buildSustainRetriggerPlan(note))
      : adjustedNotes;

    const onsetDensity = new Map<string, number>();
    for (const note of playbackNotes) {
      const onsetKey = note.startOffset.toFixed(4);
      onsetDensity.set(onsetKey, (onsetDensity.get(onsetKey) ?? 0) + 1);
    }

    // Play each scheduled note
    for (const sn of playbackNotes) {
      const simultaneousNotes = onsetDensity.get(sn.startOffset.toFixed(4)) ?? 1;
      const isShortPianoBlockChordOnset = instrumentName === 'piano'
        && sn.startOffset <= 0.0001
        && simultaneousNotes >= 3;
      const densityCompensation = Math.max(
        SoundfontChordPlaybackService.MIN_DENSITY_COMPENSATION,
        Math.sqrt(SoundfontChordPlaybackService.DENSITY_REFERENCE_VOICES / simultaneousNotes),
      );
      const switchAttackMultiplier = this.getSwitchAttackMultiplier(
        sn.startOffset,
        isChordSwitch,
        envelope,
      );
      const pianoBlockChordBoost = isShortPianoBlockChordOnset
        ? SoundfontChordPlaybackService.PIANO_BLOCK_CHORD_VELOCITY_BOOST
        : 1.0;
      const velocity = Math.min(
        baseVelocity
          * sn.velocityMultiplier
          * dynamicMultiplier
          * densityCompensation
          * switchAttackMultiplier
          * pianoBlockChordBoost,
        127,
      );
      const noteStartTime = baseTime + sn.startOffset;
      // Let smplr shape the release via decayTime and keep only a tiny sustain tail.
      const smplrDuration = sn.duration + envelope.sustainTailSeconds;
      const supportsLooping = typeof instrument.hasLoops === 'boolean' ? instrument.hasLoops : true;
      const shouldUseRetriggerSustain = sustainedRetriggerInstruments.has(instrumentName as InstrumentName)
        && sn.duration > SoundfontChordPlaybackService.SAMPLE_DURATION;
      const needsLoop = isSustainedInstrument
        && supportsLooping
        && !shouldUseRetriggerSustain
        && sn.duration > SoundfontChordPlaybackService.SAMPLE_DURATION;

      const stopFn = instrument.start({
        note: sn.noteName,
        velocity,
        time: noteStartTime,
        duration: smplrDuration,
        decayTime: envelope.decayTime,
        loop: needsLoop, // Native Web Audio looping for long sustained notes
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
    }

    // Store active notes for later cleanup
    this.activeNotes.set(instrumentName, activeNotesForInstrument);

    // Schedule safety timeout (fires slightly before smplr's internal timeout)
    const remainingDuration = playbackNotes.reduce(
      (maxEnd, note) => Math.max(maxEnd, note.startOffset + note.duration + envelope.sustainTailSeconds + envelope.decayTime),
      0,
    );
    if (remainingDuration > 0) {
      const timeoutDuration = remainingDuration + 0.05;
      const savedGen = thisGen;
      const timeoutId = setTimeout(() => {
        this.scheduledTimeouts.delete(instrumentName);
        // Only stop if this generation is still current
        if (this.instrumentGeneration.get(instrumentName) === savedGen) {
          this.stopInstrumentNotes(instrumentName);
        }
      }, timeoutDuration * 1000);

      this.scheduledTimeouts.set(instrumentName, timeoutId);
    }
  }

  /**
   * Stop notes on a specific instrument.
   * Notes that have already started and will complete soon (within ~0.5s)
   * are allowed to decay naturally instead of being abruptly cancelled.
   * This prevents race conditions where future-scheduled short notes
   * (e.g., a bass pickup at beat 2.5) are cancelled before they sound.
   */
  private stopInstrumentNotes(instrumentName: string): void {
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

    // Clear the active notes for this instrument
    this.activeNotes.set(instrumentName, []);
  }

  /**
   * On a chord switch, preserve notes that have already started so they can
   * end exactly on their scheduled duration. Only future-scheduled notes from
   * the old chord are cancelled to avoid stale late hits bleeding into the new
   * chord.
   */
  private cancelPendingInstrumentNotesForChordSwitch(instrumentName: string): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);

    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;

    // Detach old notes from tracking immediately
    const notesToStop = [...activeNotesForInstrument];
    this.activeNotes.set(instrumentName, []);

    for (const note of notesToStop) {
      const timeUntilEnd = note.scheduledEndTime - now;
      if (timeUntilEnd <= 0) {
        // Already finished — nothing to do
        continue;
      }

      const noteHasStarted = now >= note.scheduledStartTime - 0.02;

      if (!noteHasStarted) {
        // Future-scheduled note that hasn't started playing — cancel silently
        note.stopFn(now);
      }
    }
  }

  /**
   * Soft-stop currently tracked notes when playback loses its active chord.
   * Unlike chord switches, this intentionally releases sounding notes.
   */
  private softStopInstrumentNotes(instrumentName: string): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);

    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    const envelope = this.getInstrumentEnvelope(instrumentName);

    const notesToStop = [...activeNotesForInstrument];
    this.activeNotes.set(instrumentName, []);

    for (const note of notesToStop) {
      const timeUntilEnd = note.scheduledEndTime - now;
      if (timeUntilEnd <= 0) {
        continue;
      }

      const noteHasStarted = now >= note.scheduledStartTime - 0.02;

      if (!noteHasStarted) {
        note.stopFn(now);
        continue;
      }

      if (!note.isLooping && timeUntilEnd <= note.naturalFinishWindow) {
        continue;
      }

      note.stopFn(now + Math.max(note.releaseLeadTime, envelope.crossfadeOverlapSeconds));
    }
  }

  /**
   * Update options (compatible with AudioMixerService interface)
   * PERFORMANCE FIX #4: Schedule instrument unload when volume is set to 0
   */
  updateOptions(options: Partial<SoundfontChordPlaybackOptions>): void {
    this.options = { ...this.options, ...options };

    // Lazy initialization when enabled
    if (options.enabled && !this.isInitialized && !this.isInitializing) {
      this.initialize().catch(error => {
        console.error('❌ Failed to initialize soundfonts:', error);
      });
    }

    // PERFORMANCE FIX #4: Schedule unload for instruments with volume = 0
    if (options.pianoVolume === 0 && this.loadedInstruments.has('piano')) {
      this.scheduleInstrumentUnload('piano');
    }
    if (options.guitarVolume === 0 && this.loadedInstruments.has('guitar')) {
      this.scheduleInstrumentUnload('guitar');
    }
    if (options.violinVolume === 0 && this.loadedInstruments.has('violin')) {
      this.scheduleInstrumentUnload('violin');
    }
    if (options.fluteVolume === 0 && this.loadedInstruments.has('flute')) {
      this.scheduleInstrumentUnload('flute');
    }
    if (options.saxophoneVolume === 0 && this.loadedInstruments.has('saxophone')) {
      this.scheduleInstrumentUnload('saxophone');
    }
    if (options.bassVolume === 0 && this.loadedInstruments.has('bass')) {
      this.scheduleInstrumentUnload('bass');
    }
  }

  /**
   * Get current options
   */
  getOptions(): SoundfontChordPlaybackOptions {
    return { ...this.options };
  }

  /**
   * Check if ready to play
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Soft-stop all instruments using crossfade instead of hard stop.
   * Used when currentTime briefly falls between chord boundaries so
   * notes fade out gracefully rather than being cut abruptly.
   */
  softStopAll(): void {
    this.instruments.forEach((_instrument, instrumentName) => {
      this.softStopInstrumentNotes(instrumentName);
    });
  }

  /**
   * Stop all playing notes with fade-out (force-stops everything, including short notes)
   */
  stopAll(): void {
    // Clear all scheduled timeouts
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledTimeouts.clear();

    // Clear all loop intervals
    this.loopIntervals.forEach((intervalId) => {
      clearTimeout(intervalId);
    });
    this.loopIntervals.clear();

    // Force-stop notes on each instrument (no grace period)
    this.instruments.forEach((_instrument, instrumentName) => {
      const activeNotesForInstrument = this.activeNotes.get(instrumentName);
      if (activeNotesForInstrument && activeNotesForInstrument.length > 0) {
        const now = this.audioContext?.currentTime ?? 0;
        activeNotesForInstrument.forEach((note) => {
          note.stopFn(now + Math.min(note.releaseLeadTime, 0.02));
        });
        this.activeNotes.set(instrumentName, []);
      }
    });
  }

  /**
   * Cleanup resources
   * PERFORMANCE FIX #4: Also clear unload timers and tracking sets
   */
  dispose(): void {
    this.stopAll();

    // PERFORMANCE FIX #4: Clear unload timers
    this.unloadTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.unloadTimers.clear();

    this.activeNotes.clear();
    this.scheduledTimeouts.clear();
    this.instruments.clear();
    this.loadedInstruments.clear();
    this.loadingInstruments.clear();
    this.instrumentLoadPromises.clear();

    // Do not close the shared AudioContext; just release local reference
    this.audioContext = null;
    this.isInitialized = false;
    this.isInitializing = false;
  }
}

// Singleton instance
let instance: SoundfontChordPlaybackService | null = null;

export const getSoundfontChordPlaybackService = (): SoundfontChordPlaybackService => {
  if (!instance) {
    instance = new SoundfontChordPlaybackService();
  }
  return instance;
};
