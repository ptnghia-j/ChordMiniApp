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
  generateNotesForInstrument,
  beatDurationFromBpm,
  type InstrumentName,
  type ScheduledNote,
} from '@/utils/instrumentNoteGeneration';
import {
  DEFAULT_PIANO_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
  DEFAULT_FLUTE_VOLUME,
  DEFAULT_BASS_VOLUME,
} from '@/config/audioDefaults';

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
  bassVolume: number; // 0-100 (new)
  enabled: boolean;
}

export interface PlaybackTimingContext {
  startTime?: number;
  totalDuration?: number;
  playbackTime?: number;
}

export class SoundfontChordPlaybackService {
  // Constants for chord playback
  private static readonly CLUSTER_VOLUME_REDUCTION = 0.75; // Volume reduction for short chord clusters
  private static readonly NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; // Chromatic scale for sorting
  private static readonly DEFAULT_BPM = 120; // Default BPM fallback
  private static readonly SAMPLE_DURATION = 3.5; // Estimated soundfont sample duration in seconds
  private static readonly DENSITY_REFERENCE_VOICES = 3;
  private static readonly MIN_DENSITY_COMPENSATION = 0.72;

  private audioContext: AudioContext | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private instruments: Map<string, any> = new Map(); // Type will be Soundfont after lazy load
  private loadedInstruments: Set<string> = new Set(); // Track which instruments are loaded
  private loadingInstruments: Set<string> = new Set(); // Track which instruments are currently loading
  private instrumentLoadPromises: Map<string, Promise<void>> = new Map(); // Track in-flight instrument loads
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: Error | null = null;
  private activeNotes: Map<string, Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stopFn: any;
    scheduledStartTime: number;
    scheduledEndTime: number;
    isLooping: boolean;
  }>> = new Map(); // Track active notes with metadata
  private scheduledTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled timeouts for cleanup
  private releaseTime = 0.5; // Release/fade-out time in seconds (allows natural decay on chord switch)
  private loopIntervals: Map<string, NodeJS.Timeout> = new Map(); // Track loop intervals for cleanup
  private instrumentGeneration: Map<string, number> = new Map(); // Per-instrument generation counter to prevent stale async calls
  private unloadTimers: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled instrument unloads
  private readonly UNLOAD_DELAY_MS = 30000; // 30 seconds before unloading unused instrument

  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: DEFAULT_PIANO_VOLUME,
    guitarVolume: DEFAULT_GUITAR_VOLUME,
    violinVolume: DEFAULT_VIOLIN_VOLUME,
    fluteVolume: DEFAULT_FLUTE_VOLUME,
    bassVolume: DEFAULT_BASS_VOLUME,
    enabled: false
  };

  constructor() {
    // AudioContext will be acquired lazily via AudioContextManager during initialize()
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

    if (!this.audioContext) {
      try {
        this.audioContext = audioContextManager.getContext();
        await audioContextManager.resume();
      } catch (e) {
        this.initializationError = e as Error;
        this.isInitializing = false;
        throw this.initializationError;
      }
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
    instrumentName: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (!this.audioContext) throw new Error('AudioContext not available');

    // Lazy load smplr
    const { Soundfont } = await getSmplr();

    const startTime = performance.now();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🎵 Loading ${name}...`);
    }
    const instrument = new Soundfont(this.audioContext, {
      instrument: instrumentName
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
        const instrumentMap: Record<string, string> = {
          'piano': 'acoustic_grand_piano',
          'guitar': 'acoustic_guitar_nylon',
          'violin': 'violin',
          'flute': 'flute',
          'bass': 'electric_bass_finger'
        };

        const smplrInstrumentName = instrumentMap[instrumentName];
        if (!smplrInstrumentName) {
          throw new Error(`Unknown instrument: ${instrumentName}`);
        }

        const instrument = await this.loadInstrument(instrumentName, smplrInstrumentName);
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
  ): Promise<void> {
    // Lazy initialization on first playback.
    // Also wait for any initialization already kicked off by updateOptions(...)
    // so the first chord is not dropped during the init window.
    if (!this.isInitialized && this.options.enabled) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('❌ Soundfont initialization failed, skipping playback:', error);
        return;
      }
    }

    if (!this.isInitialized || !this.options.enabled) {
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

    const bd = beatDurationFromBpm(bpm);

    // Instrument volumes → instrument names
    const instrumentConfigs: Array<{ name: InstrumentName; volume: number }> = [];
    if (this.options.pianoVolume > 0) instrumentConfigs.push({ name: 'piano', volume: this.options.pianoVolume });
    if (this.options.guitarVolume > 0) instrumentConfigs.push({ name: 'guitar', volume: this.options.guitarVolume });
    if (this.options.violinVolume > 0) instrumentConfigs.push({ name: 'violin', volume: this.options.violinVolume });
    if (this.options.fluteVolume > 0) instrumentConfigs.push({ name: 'flute', volume: this.options.fluteVolume });
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
        totalDuration: timingContext?.totalDuration,
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

    // Clear any existing scheduled timeout for this instrument
    const existingTimeout = this.scheduledTimeouts.get(instrumentName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.scheduledTimeouts.delete(instrumentName);
    }

    // Stop previous notes on this instrument with crossfade overlap.
    // Schedule the stop slightly in the future so old notes' decay overlaps
    // with new notes' attack, eliminating audible gaps.
    this.crossfadeStopInstrumentNotes(instrumentName);

    // Calculate base velocity (0-127 MIDI scale)
    const baseVelocity = (volume / 100) * 127;

    // Apply dynamic velocity if provided
    const dynamicMultiplier = dynamicVelocity !== undefined ? dynamicVelocity : 1.0;

    // Track active notes for this instrument
    const activeNotesForInstrument: Array<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stopFn: any;
      scheduledStartTime: number;
      scheduledEndTime: number;
      isLooping: boolean;
    }> = [];

    // Determine if we need native looping (sustained instruments exceeding sample duration)
    const isSustainedInstrument = instrumentName === 'violin' || instrumentName === 'flute';

    // Get current audio context time for scheduling
    const baseTime = this.audioContext ? this.audioContext.currentTime : 0;
    const elapsedInChord = timingContext?.playbackTime !== undefined && timingContext?.startTime !== undefined
      ? Math.max(0, timingContext.playbackTime - timingContext.startTime)
      : 0;
    const adjustedNotes = scheduledNotes
      .map((sn) => {
        const originalEndOffset = sn.startOffset + sn.duration;
        if (originalEndOffset <= elapsedInChord) {
          return null;
        }

        const adjustedStartOffset = Math.max(0, sn.startOffset - elapsedInChord);
        const adjustedDuration = originalEndOffset - Math.max(elapsedInChord, sn.startOffset);
        if (adjustedDuration <= 0) {
          return null;
        }

        return {
          ...sn,
          startOffset: adjustedStartOffset,
          duration: adjustedDuration,
        } satisfies ScheduledNote;
      })
      .filter((sn): sn is ScheduledNote => sn !== null);

    if (adjustedNotes.length === 0) {
      return;
    }

    const onsetDensity = new Map<string, number>();
    for (const note of adjustedNotes) {
      const onsetKey = note.startOffset.toFixed(4);
      onsetDensity.set(onsetKey, (onsetDensity.get(onsetKey) ?? 0) + 1);
    }

    // Play each scheduled note
    for (const sn of adjustedNotes) {
      const simultaneousNotes = onsetDensity.get(sn.startOffset.toFixed(4)) ?? 1;
      const densityCompensation = Math.max(
        SoundfontChordPlaybackService.MIN_DENSITY_COMPENSATION,
        Math.sqrt(SoundfontChordPlaybackService.DENSITY_REFERENCE_VOICES / simultaneousNotes),
      );
      const velocity = Math.min(
        baseVelocity * sn.velocityMultiplier * dynamicMultiplier * densityCompensation,
        127,
      );
      const noteStartTime = baseTime + sn.startOffset;
      // Extend note duration slightly so the tail overlaps the next chord's
      // attack, preventing audible silence gaps between chord changes.
      const smplrDuration = sn.duration + 0.6;
      const needsLoop = isSustainedInstrument && sn.duration > SoundfontChordPlaybackService.SAMPLE_DURATION;

      const stopFn = instrument.start({
        note: sn.noteName,
        velocity,
        time: noteStartTime,
        duration: smplrDuration,
        loop: needsLoop, // Native Web Audio looping for long sustained notes
      });

      if (stopFn) {
        activeNotesForInstrument.push({
          stopFn,
          scheduledStartTime: noteStartTime,
          scheduledEndTime: noteStartTime + smplrDuration,
          isLooping: needsLoop,
        });
      }
    }

    // Store active notes for later cleanup
    this.activeNotes.set(instrumentName, activeNotesForInstrument);

    // Schedule safety timeout (fires slightly before smplr's internal timeout)
    const remainingDuration = adjustedNotes.reduce(
      (maxEnd, note) => Math.max(maxEnd, note.startOffset + note.duration),
      0,
    );
    if (remainingDuration > 0) {
      const timeoutDuration = remainingDuration + 0.15;
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
    // Grace period: notes ending within this window are allowed to finish naturally
    const GRACE_PERIOD = 0.5;

    activeNotesForInstrument.forEach((note) => {
      if (note.isLooping) {
        // Looping notes (violin/flute) must always be explicitly stopped
        note.stopFn(this.releaseTime);
      } else {
        const timeUntilEnd = note.scheduledEndTime - now;
        if (timeUntilEnd <= GRACE_PERIOD) {
          // Note is almost done or already finished — let it decay naturally
        } else {
          note.stopFn(this.releaseTime);
        }
      }
    });

    // Clear the active notes for this instrument
    this.activeNotes.set(instrumentName, []);
  }

  /**
   * Crossfade-stop: let old notes decay naturally while new notes start.
   * Distinguishes between currently-sounding notes (started in the past)
   * and future-scheduled notes (not yet audible).
   * Currently-sounding notes with little time left finish naturally;
   * those with more time get a slow fade. Future notes are cancelled silently.
   */
  private crossfadeStopInstrumentNotes(instrumentName: string): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);

    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    // Very long release for smooth crossfade — the exponential decay of the
    // old note blends continuously into the new note's attack.
    const CROSSFADE_RELEASE = 2.0;

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
        note.stopFn(0);
        continue;
      }

      if (!note.isLooping && timeUntilEnd <= 1.5) {
        // Currently sounding and nearly done — let it finish naturally
        continue;
      }

      // Currently sounding with significant time left, or looping — slow fade
      note.stopFn(CROSSFADE_RELEASE);
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
      this.crossfadeStopInstrumentNotes(instrumentName);
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
        activeNotesForInstrument.forEach((note) => {
          note.stopFn(this.releaseTime);
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

