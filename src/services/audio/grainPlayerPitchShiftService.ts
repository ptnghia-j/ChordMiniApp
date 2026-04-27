/**
 * GrainPlayer Pitch Shift Service
 *
 * Provides real-time pitch shifting and time-stretching using Tone.js GrainPlayer.
 * GrainPlayer uses granular synthesis to enable INDEPENDENT pitch and playback speed control.
 *
 * Features:
 * - Independent pitch shifting (±12 semitones) via `detune` property
 * - Independent speed control (0.25x - 2.0x) via `playbackRate` property
 * - No manual compensation needed - both parameters work independently
 * - Audio buffer loading from Firebase Storage URLs
 * - Playback controls (play, pause, seek)
 * - Memory management and proper cleanup
 * - Lazy loading of Tone.js library (~150KB) for better initial bundle size
 */

import { DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME } from '@/config/audioDefaults';
import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';

import { audioContextManager } from './audioContextManager';

// Lazy load Tone.js to reduce initial bundle size
let ToneModule: typeof import('tone') | null = null;

async function getTone() {
  if (!ToneModule) {
    ToneModule = await import('tone');
  }
  return ToneModule;
}

/**
 * Synchronous accessor for the cached Tone module.
 *
 * Returns the module if it has been loaded (via a prior `getTone()` call),
 * else null. Used by `getCurrentTimeLive()` below, which must run in a hot
 * loop (rAF / drift loop) and cannot afford an `await`.
 */
function getToneSync(): typeof import('tone') | null {
  return ToneModule;
}

/**
 * Read the shared AudioContext's `currentTime` (the "heard now" clock).
 *
 * `Tone.now()` returns `audioContext.currentTime + lookAhead` (default 0.1 s)
 * — a FUTURE moment at which scheduled events will fire. For anything that
 * needs to represent "what the user is hearing right now", we must use the
 * raw `currentTime`, not `Tone.now()`. Mixing the two clocks causes the
 * counter to lead the actual audio output by `lookAhead × playbackRate`,
 * which is the root cause of the non-1×-rate drift between the
 * pitch-shifted audio and (beat grid + YouTube iframe).
 */
function _getAudioContextCurrentTime(): number | null {
  const Tone = getToneSync();
  if (Tone) {
    try {
      const ctx = Tone.getContext() as unknown as { currentTime?: number };
      if (typeof ctx?.currentTime === 'number') return ctx.currentTime;
    } catch { /* fall through */ }
  }
  try {
    return audioContextManager.getCurrentTime();
  } catch {
    return null;
  }
}

/**
 * DIAGNOSTIC TAG — kept as a constant for any future structured logging.
 * All prior `console.debug` calls have been removed to reduce console noise;
 * re-add selectively when investigating specific bugs.
 */
const _DIAG_TAG = '[pitch-diag/service]';

/**
 * Read the AudioContext's current run-state (`running` / `suspended` /
 * `closed`). Exposed so the surrounding hooks can cross-reference service
 * state against context state when explaining "animation frozen at current
 * beat" — a suspended context is the #1 candidate for "_isPlaying=true but
 * no audio heard and lastUpdateTime delta stays 0".
 */
export function getAudioContextState(): AudioContextState | 'unknown' {
  const Tone = getToneSync();
  if (Tone) {
    try {
      const ctx = Tone.getContext() as unknown as { state?: AudioContextState };
      if (ctx?.state) return ctx.state;
    } catch { /* fall through */ }
  }
  try {
    const raw = audioContextManager.getContext() as unknown as { state?: AudioContextState };
    if (raw?.state) return raw.state;
  } catch { /* ignore */ }
  return 'unknown';
}

export interface GrainPlayerPitchShiftOptions {
  semitones: number; // -12 to +12
  grainSize?: number; // Default: 0.2 (200ms) - Duration of each grain
  overlap?: number; // Default: 0.1 (100ms) - Crossfade duration between grains
  // Note: 'overlap' in Tone.js is the CROSSFADE DURATION, not the interval!
  // Grain start interval = grainSize - overlap
  // For 50% overlap: overlap = grainSize * 0.5
}

export interface PitchShiftPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

/**
 * Service for managing pitch-shifted audio playback using Tone.js GrainPlayer
 */
export class GrainPlayerPitchShiftService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private grainPlayer: any | null = null; // Type will be Tone.GrainPlayer after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gainNode: any | null = null; // Type will be Tone.Gain after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lowPassFilter: any | null = null; // Type will be Tone.Filter after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private limiter: any | null = null; // Type will be Tone.Limiter after lazy load
  private isInitialized = false;

  // Playback state
  private _isPlaying = false;
  private _currentTime = 0;
  private _duration = 0;
  private _playbackRate = 1;
  private _volume = DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME; // 0-100 (default for balanced audio with YouTube)

  // CLOCK AUTHORITY (post-unification): this service is a pure SLAVE. The
  // beat grid and the store's currentTime are both driven by
  // `youtubeMasterClock`; the GrainPlayer does not drive any other surface.
  //
  // However, the service still needs to REPORT its own live playback
  // position so the slave re-anchor loop in `usePitchShiftAudio` can compute
  // drift vs. the master. We do this with a PASSIVE wall-clock accumulator
  // (anchor + rate), NOT a setInterval:
  //   • `_playAnchorWallTime` — performance.now()/1000 captured at the last
  //     play / seek / rate-change
  //   • `_playAnchorPosition` — media-time the grain started playing at
  //     that anchor
  //   • live position = anchor + (wallNow − anchorWall) × _playbackRate
  //
  // This eliminates the original freeze bug (no `_currentTime >= _duration`
  // auto-pause branch, no `setInterval`) AND fixes the constant-re-seek
  // storm the drift-loop was producing when the position never advanced.
  // `onTimeUpdateCallback` is still fired once per `seek()` so consumers
  // observe the landing point synchronously.
  private _playAnchorWallTime: number | null = null;
  private _playAnchorPosition = 0;
  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;

  /**
   * Wall-clock now (seconds). Mirrors the master clock's time base so the
   * slave and master use the SAME clock for position extrapolation and
   * drift measurement produces real numbers (not wall-vs-audio skew).
   */
  private _wallNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now() / 1000;
    }
    return Date.now() / 1000;
  }

  /**
   * Compute the live playback position from the anchor + wall-clock × rate.
   * When not playing (or anchor not set), return the frozen `_currentTime`.
   * Clamped to `[0, _duration]` when duration is known, else `[0, ∞)`.
   */
  private _computeLivePosition(): number {
    if (!this._isPlaying || this._playAnchorWallTime === null) {
      return this._currentTime;
    }
    const elapsedWall = this._wallNow() - this._playAnchorWallTime;
    const live = this._playAnchorPosition + elapsedWall * this._playbackRate;
    if (this._duration > 0) {
      return Math.max(0, Math.min(live, this._duration));
    }
    return Math.max(0, live);
  }

  // P0 HARDENING: when seek() is called before the buffer finishes loading we
  // park the target here and drain it from handlePlayerLoad().
  private pendingSeekTime: number | null = null;

  /**
   * Diagnostic log helper — body removed to reduce console noise.
   * Re-add logging selectively when investigating specific bugs.
   */
  private _diag(_tag: string, _extra?: Record<string, unknown>): void {
    // intentionally empty
  }

  /**
   * Initialize Tone.js context (lazy loads Tone.js on first use)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const Tone = await getTone();
      const shared = audioContextManager.getContext();
      // If Tone is not already using the shared AudioContext, set it
      const ctxObj = Tone.getContext() as unknown as { rawContext?: AudioContext };
      const currentRaw: AudioContext | undefined = ctxObj?.rawContext;
      if (!currentRaw || currentRaw !== shared) {
        const ToneWithCtx = Tone as unknown as {
          Context: new (opts: { context: AudioContext }) => unknown;
          setContext: (ctx: unknown) => void;
        };
        const toneCtx = new ToneWithCtx.Context({ context: shared });
        ToneWithCtx.setContext(toneCtx);
      }
      // Ensure context is running
      const toneCtxState = Tone.getContext() as unknown as { state?: AudioContextState };
      if (toneCtxState?.state !== 'running') {
        await (Tone as unknown as { start: () => Promise<void> }).start();
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize GrainPlayer service:', error);
      throw error;
    }
  }

  /**
   * Load audio from Firebase Storage URL and apply pitch shift.
   *
   * @param audioUrl        Firebase Storage URL for the audio file
   * @param semitones       Pitch shift amount in semitones (-12 to +12)
   * @param initialPlaybackRate  Playback speed to construct the GrainPlayer
   *                             with. MUST be passed on re-initialization to
   *                             prevent the player starting at the class default
   *                             (1.0) and then transitioning via setPlaybackRate
   *                             — the Tone.js grain scheduler may ingest buffer
   *                             metadata at the default rate before switching.
   */
  async loadAudio(audioUrl: string, semitones: number = 0, initialPlaybackRate?: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Lazy load Tone.js
      const Tone = await getTone();

      // Clean up existing player if any
      this.disposePlayer();

      // Use proxy to avoid CORS issues (but not for blob URLs which are local)
      const isBlobUrl = audioUrl.startsWith('blob:');
      const finalUrl = isBlobUrl
        ? audioUrl
        : buildAudioProxyUrl(audioUrl, {
            // Tone.js loads this from the browser, so a Firebase redirect would
            // send the request back to storage and reintroduce the CORS issue the
            // proxy route is meant to avoid.
            forceProxy: true,
          });

      // Ensure Tone.js context is started
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }

      // Create gain node for volume control
      this.gainNode = new Tone.Gain(0.9);

      // Create a low-pass filter to remove high-frequency artifacts
      // Use adaptive cutoff based on pitch shift amount to prevent aliasing
      const filterCutoff = this.getAdaptiveFilterCutoff(semitones);
      this.lowPassFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: filterCutoff,
        rolloff: -12
      });

      // Create a limiter to prevent clipping
      this.limiter = new Tone.Limiter(-1);

      // SIGNAL CHAIN: GrainPlayer → LowPass → Gain → Limiter → Destination
      this.lowPassFilter.connect(this.gainNode);
      this.gainNode.connect(this.limiter);
      this.limiter.toDestination();

      // Create GrainPlayer with optimized settings
      //
      // GRAINPLAYER PARAMETERS (from official Tone.js documentation):
      // - grainSize: Duration of each audio grain (chunk)
      // - overlap: CROSSFADE DURATION between successive grains (NOT interval!)
      //   * overlap is the amount of time grains crossfade with each other
      //   * Grain start interval = grainSize - overlap
      // - detune: Pitch adjustment in cents (100 cents = 1 semitone)
      // - playbackRate: Speed multiplier (independent of pitch)
      //
      // CORRECTED IMPLEMENTATION:
      // Using Tone.js recommended defaults for smooth, artifact-free playback
      // - grainSize: 0.2s (200ms) - Standard grain duration
      // - overlap: 0.1s (100ms) - 50% crossfade for smooth transitions
      //
      // Grain timeline visualization:
      // Grain 1: [0ms ==================== 200ms]
      // Grain 2:           [100ms ==================== 300ms]
      // Grain 3:                     [200ms ==================== 400ms]
      //          ^^^^^^^^^^CROSSFADE^^^^^^^^^^CROSSFADE^^^^^^^^^^
      //          (100ms overlap)     (100ms overlap)
      //
      // Grain start interval = grainSize - overlap = 200ms - 100ms = 100ms
      const grainSize = 0.2;  // 200ms grains (Tone.js default)
      const overlap = 0.1;    // 100ms crossfade (50% overlap - industry standard)

      // If an initial playback rate was provided (e.g. during
      // OFF→ON re-init while the slider is at 2.0×), prefer it over the
      // class default so the GrainPlayer never constructs at rate 1.0
      // and then flips to the desired rate via setPlaybackRate — the
      // grain scheduler may have already pre-computed at rate 1.0.
      if (initialPlaybackRate !== undefined) {
        this._playbackRate = initialPlaybackRate;
      }

      this.grainPlayer = new Tone.GrainPlayer({
        url: finalUrl,
        grainSize: grainSize,  // 200ms grains
        overlap: overlap,      // 100ms crossfade duration ✅
        detune: semitones * 100, // Convert semitones to cents
        playbackRate: this._playbackRate,
        loop: false,
        onload: () => {
          this.handlePlayerLoad();
        },
        onerror: (error: Error) => {
          console.error('❌ Tone.js GrainPlayer load error:', error);
          throw new Error('Failed to load audio file');
        }
      });

      // Connect GrainPlayer to signal chain
      this.grainPlayer.connect(this.lowPassFilter);

      // Wait for audio to load.
      //
      // FIRST-TOGGLE FREEZE FIX: Tone.js can flip `grainPlayer.loaded` to true
      // BEFORE the `onload` callback (`handlePlayerLoad`) has run to populate
      // `_duration` from the buffer. If we resolve solely on `loaded=true`,
      // the caller can race in with `seek(initialTime)` while `_duration` is
      // still 0 — `seek()` then clamps `_currentTime = min(initialTime, 0) = 0`,
      // the 50 ms tracking tick clamps every advance against the same 0, and
      // the auto-stop branch (`_currentTime >= _duration`) immediately calls
      // `pause()`, flipping `_isPlaying` back to false. From the rAF loop's
      // perspective, `getCurrentTimeLive()` returns the frozen `_currentTime`
      // (0) forever and the beat grid stays glued to the first cell. Page
      // refresh hides the bug because the browser-cached buffer makes `onload`
      // fire effectively synchronously.
      //
      // We force `_duration` to be populated before resolving by reading the
      // buffer ourselves if `handlePlayerLoad` hasn't run yet, mirroring what
      // the onload callback does.
      await new Promise<void>((resolve, reject) => {
        const checkLoaded = setInterval(() => {
          if (this.grainPlayer && this.grainPlayer.loaded) {
            clearInterval(checkLoaded);
            const onloadAlreadyRan = this._duration > 0;
            if (this._duration === 0 && this.grainPlayer.buffer) {
              const bufferDuration = this.grainPlayer.buffer.duration;
              if (typeof bufferDuration === 'number' && bufferDuration > 0) {
                this._duration = bufferDuration;
              }
            }
            this._diag('loadAudio.resolved', {
              onloadAlreadyRan,
              durationAfterForcedRead: this._duration,
              bufferPresent: !!this.grainPlayer.buffer,
            });
            resolve();
          }
        }, 100);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkLoaded);
          reject(new Error('Audio loading timeout'));
        }, 30000);
      });



    } catch (error) {
      console.error('❌ Failed to load audio:', error);
      throw error;
    }
  }

  /**
   * Calculate adaptive filter cutoff based on pitch shift amount
   *
   * When pitch shifting up, frequencies are multiplied by the pitch factor.
   * To prevent aliasing, we need to lower the filter cutoff accordingly.
   *
   * Example: +12 semitones (octave up) doubles all frequencies
   * - Original 15kHz content becomes 30kHz (above Nyquist)
   * - Filter cutoff should be halved to prevent aliasing
   */
  private getAdaptiveFilterCutoff(semitones: number): number {
    const baseCutoff = 16000; // 16kHz base cutoff

    // For pitch shift up, reduce cutoff to prevent aliasing
    if (semitones > 0) {
      const pitchFactor = Math.pow(2, semitones / 12);
      // Reduce cutoff by pitch factor, with minimum of 8kHz
      return Math.max(8000, Math.min(baseCutoff, baseCutoff / pitchFactor));
    }

    // For pitch shift down or no shift, use base cutoff
    return baseCutoff;
  }

  /**
   * Handle player load event
   */
  private handlePlayerLoad(): void {
    const priorDuration = this._duration;
    if (this.grainPlayer && this.grainPlayer.buffer) {
      this._duration = this.grainPlayer.buffer.duration;
    }
    this._diag('handlePlayerLoad', {
      priorDuration,
      newDuration: this._duration,
      hasPendingSeek: this.pendingSeekTime !== null,
      pendingSeekTime: this.pendingSeekTime,
    });

    // Drain any seek that arrived before the buffer was ready.
    if (this.pendingSeekTime !== null) {
      const target = this.pendingSeekTime;
      this.pendingSeekTime = null;
      // grainPlayer.loaded is now true, so this path will not recurse.
      this.seek(target);
    }
  }

  /**
   * Update pitch shift amount without reloading audio
   *
   * GrainPlayer uses `detune` property (in cents) for pitch control.
   * This is INDEPENDENT of playbackRate - no compensation needed!
   *
   * Also updates the low-pass filter cutoff adaptively to prevent aliasing.
   */
  setPitch(semitones: number): void {
    if (this.grainPlayer) {
      // Convert semitones to cents (100 cents = 1 semitone)
      const cents = semitones * 100;

      // Apply pitch shift via detune (independent of playbackRate)
      this.grainPlayer.detune = cents;

      // Update filter cutoff adaptively based on pitch shift amount
      if (this.lowPassFilter) {
        const filterCutoff = this.getAdaptiveFilterCutoff(semitones);
        // Ramp to new cutoff over 100ms for smooth transition
        this.lowPassFilter.frequency.rampTo(filterCutoff, 0.1);
      }
    }
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));
    if (this.gainNode) {
      // Convert 0-100 to 0-1 gain value
      const gain = this._volume / 100;
      this.gainNode.gain.rampTo(gain, 0.1);
    }
  }

  /**
   * Get current volume (0-100)
   */
  getVolume(): number {
    return this._volume;
  }

  /**
   * Start playback
   */
  play(): void {
    if (!this.grainPlayer || !this.grainPlayer.loaded) {
      return;
    }

    try {
      if (!this._isPlaying) {
        // TONE.JS GRAINPLAYER RATE-SCALED OFFSET COMPENSATION
        // ────────────────────────────────────────────────────
        // GrainPlayer._start() converts the `offset` argument to initial
        // clock ticks via `offset / (grainSize / playbackRate)`, which
        // evaluates to `offset × playbackRate / grainSize`. The very first
        // grain is then scheduled at buffer position `ticks × grainSize`
        // = `offset × playbackRate`. At 1.0× the multiplier is identity so
        // the bug is invisible; at 1.5× asking for buffer position 30 lands
        // at 45, at 2.0× it lands at 60, etc.
        //
        // We compensate by pre-dividing the offset by the current playbackRate
        // so the grain scheduler's internal `× playbackRate` yields the
        // intended buffer position. See GrainPlayer.js _start + _tick in
        // node_modules/tone/build/esm/source/buffer/GrainPlayer.js.
        const compensatedOffset = this._playbackRate > 0
          ? this._currentTime / this._playbackRate
          : this._currentTime;
        this.grainPlayer.start(undefined, compensatedOffset);
        this._isPlaying = true;
        this._playAnchorWallTime = this._wallNow();
        this._playAnchorPosition = this._currentTime;
      }
    } catch (error) {
      console.error('[GrainPlayerPitchShiftService] play() failed:', error);
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.grainPlayer) {
      return;
    }

    try {
      if (this._isPlaying) {
        this._currentTime = this._computeLivePosition();
        this.grainPlayer.stop();
        this._isPlaying = false;
        this._playAnchorWallTime = null;

        if (this._duration > 0 && this._currentTime >= this._duration && this.onEndedCallback) {
          this.onEndedCallback();
        }
      }
    } catch (error) {
      console.error('[GrainPlayerPitchShiftService] pause() failed:', error);
    }
  }

  /**
   * Seek to specific time in seconds.
   *
   * P0 HARDENING:
   *   - If the GrainPlayer buffer is not yet loaded, the seek target is queued
   *     so it is applied as soon as loadAudio() finishes (instead of being
   *     silently dropped, which previously caused "click-seeks-to-middle
   *     during pitch-shift buffer reload" to end up at an unexpected position).
   *   - When the requested time exceeds the buffer duration, we emit a
   *     development-only warning identifying the caller, to help surface
   *     duration-mismatch bugs early.
   */
  seek(time: number): void {
    if (!this.grainPlayer || !this.grainPlayer.loaded) {
      this.pendingSeekTime = time;
      return;
    }

    try {
      const wasPlaying = this._isPlaying;
      this._diag('seek.enter', { target: time, wasPlaying });

      // Stop current playback
      if (this._isPlaying) {
        this.grainPlayer.stop();
        this._isPlaying = false;
      }

      if (process.env.NODE_ENV !== 'production'
        && this._duration > 0
        && time > this._duration
      ) {
        console.warn(
          `[GrainPlayerPitchShiftService] seek(${time.toFixed(3)}s) exceeds buffer duration ${this._duration.toFixed(3)}s; clamping`,
        );
      }

      // Update current time. DEFENSIVE: when `_duration` is still 0 (rare race
      // where seek arrives before the buffer's duration has been read), don't
      // collapse `_currentTime` to 0 — that would freeze the rAF clock at the
      // first beat. Treat unknown duration as unbounded; the
      // pre-loadAudio-resolution guard plus auto-clamp on the next tick will
      // re-anchor once `_duration` is known.
      this._currentTime = this._duration > 0
        ? Math.max(0, Math.min(time, this._duration))
        : Math.max(0, time);

      // Publish the seek target immediately so UI consumers do not sit on the
      // previous service time until the next 50ms tracking tick.
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(this._currentTime);
      }

      // Restart playback from new position if was playing
      if (wasPlaying) {
        // CLOCK AUTHORITY (post-unification): re-anchor the passive
        // accumulator at the new position. The slave re-anchor loop in
        // usePitchShiftAudio will continuously verify this service against
        // the master clock after the restart.
        //
        // RATE-SCALED OFFSET COMPENSATION — see play() for full explanation.
        // Tone.js GrainPlayer._start() multiplies the offset by playbackRate
        // when converting to clock ticks, so we divide here to cancel it.
        const compensatedOffset = this._playbackRate > 0
          ? this._currentTime / this._playbackRate
          : this._currentTime;
        this.grainPlayer.start(undefined, compensatedOffset);
        this._isPlaying = true;
        this._playAnchorWallTime = this._wallNow();
        this._playAnchorPosition = this._currentTime;
      } else {
        // When seeking while paused, still refresh the anchor position so
        // a subsequent play() starts from the right place.
        this._playAnchorPosition = this._currentTime;
        this._playAnchorWallTime = null;
      }
      this._diag('seek.exit', { appliedTime: this._currentTime, resumedPlayback: wasPlaying });
    } catch (error) {
      console.error('❌ Failed to seek:', error);
      this._diag('seek.error', { message: (error as Error)?.message });
    }
  }

  /**
   * Synchronize the passive accumulator anchors to match the master clock
   * WITHOUT seeking (no stop/restart → no audio gap).
   *
   * Called by the master clock's ReAnchorListener every time the master
   * re-anchors to a new position (YouTube progress, user seek, etc.). This
   * eliminates the persistent ~80ms offset that the slave loop would
   * otherwise never correct because both systems advance at the same rate.
   */
  syncAnchor(positionSec: number, wallSec: number): void {
    if (this._isPlaying) {
      this._playAnchorPosition = positionSec;
      this._playAnchorWallTime = wallSec;
      this._currentTime = positionSec;
    } else {
      // When paused, just update the resting position
      this._playAnchorPosition = positionSec;
      this._playAnchorWallTime = null;
      this._currentTime = positionSec;
    }
  }

  /**
   * Set playback rate (speed) for the GrainPlayer.
   *
   * GrainPlayer's `playbackRate` property is INDEPENDENT of pitch — the
   * key advantage of the grain-based architecture. Tone.js schedules grains
   * ahead of time (200 ms grainSize, 100 ms overlap). When the rate changes
   * live (without a stop/restart), pre-scheduled grains play at the OLD
   * rate for up to 200 ms while new grains start at the NEW rate. This
   * produces a brief cross-fade between old and new rates — perceptually
   * smoother than a position jump caused by the AudioContext scheduling
   * lag of a stop→start cycle.
   *
   * IMPORTANT: We deliberately do NOT call stop()/start() here. A stop/start
   * cycle resets the grain scheduler and anchors at synchronous wall-clock,
   * but the AudioContext is ~50 ms ahead of wall-clock (lookAhead), so the
   * passive accumulator says "started at t, position P" while the audio
   * actually starts at `t + lookAhead`. The slave loop then sees drift and
   * nudges the position, producing a cumulative forward jump on successive
   * rate changes. Let Tone.js gracefully transition via live rate changes.
   */
  setPlaybackRate(rate: number): void {
    if (!this.grainPlayer) {
      return;
    }

    const previousRate = this._playbackRate;
    if (Math.abs(previousRate - rate) < 0.001) {
      return; // idempotent — prevents needless stop/start cycles
    }

    try {
      // Counter-snap the passive accumulator at the OLD rate before switching.
      if (this._isPlaying && this._playAnchorWallTime !== null) {
        const nowSec = this._wallNow();
        const elapsedWall = nowSec - this._playAnchorWallTime;
        this._playAnchorPosition = this._playAnchorPosition + elapsedWall * previousRate;
        this._playAnchorWallTime = nowSec;
        this._currentTime = this._playAnchorPosition;
      }

      // Store & apply new rate.
      this._playbackRate = rate;
      this.grainPlayer.playbackRate = rate;
    } catch (error) {
      console.error('[GrainPlayerPitchShiftService] setPlaybackRate failed:', error);
    }
  }

  /**
   * Get current playback state
   *
   * CLOCK AUTHORITY (post-unification): `currentTime` is the LIVE extrapolated
   * position (anchor + wall-clock × rate). Callers that want the frozen
   * "last seek target" can read via `getState()` while `isPlaying=false`;
   * while playing, this returns a moving value so the slave re-anchor loop
   * in `usePitchShiftAudio` measures real drift vs. the master, not just the
   * elapsed wall-clock since the last seek.
   */
  getState(): PitchShiftPlaybackState {
    return {
      isPlaying: this._isPlaying,
      currentTime: this._computeLivePosition(),
      duration: this._duration,
      playbackRate: this._playbackRate
    };
  }

  /**
   * Get the LIVE current time.
   *
   * CLOCK AUTHORITY (post-unification): returns the passive-accumulator
   * position (anchor + wall-clock × rate) while playing, or the frozen
   * `_currentTime` while paused. Preserved for backward compatibility —
   * new code should prefer `youtubeMasterClock.getLivePosition()`.
   */
  getCurrentTimeLive(): number {
    return this._computeLivePosition();
  }

  /**
   * Set callback for time updates
   */
  setOnTimeUpdate(callback: ((time: number) => void) | null): void {
    this.onTimeUpdateCallback = callback;
  }

  /**
   * Set callback for playback ended
   */
  setOnEnded(callback: (() => void) | null): void {
    this.onEndedCallback = callback;
  }

  /**
   * Dispose of the player and clean up resources
   */
  private disposePlayer(): void {
    if (this.grainPlayer) {
      try {
        this.grainPlayer.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing GrainPlayer:', error);
      }
      this.grainPlayer = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing gain node:', error);
      }
      this.gainNode = null;
    }

    if (this.lowPassFilter) {
      try {
        this.lowPassFilter.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing low-pass filter:', error);
      }
      this.lowPassFilter = null;
    }

    if (this.limiter) {
      try {
        this.limiter.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing limiter:', error);
      }
      this.limiter = null;
    }

    this._isPlaying = false;
    this._currentTime = 0;
    this._duration = 0;
    this._playAnchorWallTime = null;
    this._playAnchorPosition = 0;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.disposePlayer();
    this.isInitialized = false;
  }
}

/**
 * Singleton instance for global access
 */
let grainPlayerServiceInstance: GrainPlayerPitchShiftService | null = null;

/**
 * Factory function to create or get the singleton GrainPlayerPitchShiftService instance
 */
export function getGrainPlayerPitchShiftService(): GrainPlayerPitchShiftService {
  if (!grainPlayerServiceInstance) {
    grainPlayerServiceInstance = new GrainPlayerPitchShiftService();
  }
  return grainPlayerServiceInstance;
}

/**
 * Reset singleton instance (useful for cleanup)
 */
export function resetGrainPlayerPitchShiftService(): void {
  if (grainPlayerServiceInstance) {
    grainPlayerServiceInstance.dispose();
    grainPlayerServiceInstance = null;
  }
}
