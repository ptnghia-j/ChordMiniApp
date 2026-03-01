/**
 * Dynamics Analyzer Service
 *
 * Produces dynamic velocity shaping for chord playback.
 * Combines purely musical/algorithmic rules with an optional audio energy
 * contour analyzed once from the decoded audio buffer.
 *
 * The audio energy contour is analyzed from the decoded waveform — it does NOT
 * require the original audio to be playing. Chord playback works independently
 * regardless of whether the user is listening to the original audio, has it
 * muted, or is using chord-only mode.
 *
 * Layers (applied multiplicatively):
 * 1. Audio energy contour  (optional – from decoded audio buffer)
 * 2. Metric accent          (downbeat/backbeat emphasis)
 * 3. Phrasing arc           (crescendo/diminuendo within phrases)
 * 4. Harmonic tension       (chord quality → expressiveness)
 * 5. Tempo-aware scaling    (wider dynamics at slow tempos, gentler at fast)
 */

import { audioContextManager } from './audioContextManager';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Pre-computed RMS energy contour */
export interface EnergyContour {
  /** Smoothed RMS values sampled at regular intervals */
  values: Float32Array;
  /** Time step between samples (seconds) */
  timeStep: number;
  /** Min/max for normalization */
  minRms: number;
  maxRms: number;
}

/** Parameters for dynamics shaping */
export interface DynamicsParams {
  /** BPM of the song */
  bpm: number;
  /** Time signature (beats per measure, e.g. 4 for 4/4) */
  timeSignature: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** RMS analysis window size in seconds */
const RMS_WINDOW_SIZE = 0.1; // 100 ms

/** Exponential smoothing factor (higher → smoother) */
const SMOOTHING_ALPHA = 0.85;

/** Velocity floor (prevents inaudible notes) */
const MIN_VELOCITY = 0.4;

/** Velocity ceiling */
const MAX_VELOCITY = 1.0;

/** Downbeat accent multiplier */
const DOWNBEAT_ACCENT = 1.15;

/** Beat-3 mild accent in 4/4 */
const BEAT3_ACCENT = 1.05;

/** Weak beat softening multiplier */
const WEAK_BEAT_SOFTEN = 0.90;

/** How much influence the energy contour has (0 = none, 1 = full) */
const ENERGY_INFLUENCE = 0.35;

// ─── Harmonic Tension Map ────────────────────────────────────────────────────

/**
 * Chord-quality tension multipliers.
 * Higher tension → slightly louder/more intense playback.
 * Values centered around 1.0  (neutral).
 */
const TENSION_MAP: Record<string, number> = {
  // Stable / consonant
  major: 0.95,
  minor: 0.98,
  sus2: 0.96,
  sus4: 0.97,
  six: 0.96,
  min6: 0.97,
  // Mildly tense
  dom7: 1.03,
  maj7: 0.98,
  min7: 1.00,
  add9: 0.98,
  // More tense
  dim: 1.08,
  aug: 1.07,
  hdim7: 1.06,
  dim7: 1.10,
  // Extended / colorful
  dom9: 1.04,
  dom11: 1.05,
  dom13: 1.06,
  min9: 1.02,
  min11: 1.03,
  min13: 1.04,
  maj9: 1.00,
  maj11: 1.01,
  maj13: 1.02,
  minmaj7: 1.08,
};

// ─── Chord quality extraction ────────────────────────────────────────────────

/** Extract chord quality key from a chord name (e.g., "Am7" → "min7") */
const QUALITY_ALIASES: Record<string, string> = {
  '': 'major', 'maj': 'major', 'M': 'major',
  'm': 'minor', 'min': 'minor',
  '7': 'dom7',
  'M7': 'maj7', 'maj7': 'maj7', 'Maj7': 'maj7',
  'm7': 'min7', 'min7': 'min7',
  'sus2': 'sus2', 'sus4': 'sus4',
  'dim': 'dim', '°': 'dim',
  'aug': 'aug', '+': 'aug',
  '°7': 'dim7', 'dim7': 'dim7',
  'ø7': 'hdim7', 'hdim7': 'hdim7', 'm7b5': 'hdim7',
  '9': 'dom9', '11': 'dom11', '13': 'dom13',
  'm9': 'min9', 'm11': 'min11', 'm13': 'min13',
  'M9': 'maj9', 'maj9': 'maj9',
  'maj11': 'maj11', 'maj13': 'maj13',
  'add9': 'add9',
  '6': 'six', 'm6': 'min6',
  'mmaj7': 'minmaj7', 'mMaj7': 'minmaj7', 'mM7': 'minmaj7',
};

function getChordQuality(chordName: string): string {
  if (!chordName) return 'major';
  // Strip bass note (slash chord)
  const base = chordName.split('/')[0];
  // Remove root note (A-G with optional #/b)
  const match = base.match(/^[A-G][#b]?(.*)/);
  const suffix = match ? match[1].replace(/^[^A-Za-z0-9#b°ø+]+/, '').trim() : '';
  return QUALITY_ALIASES[suffix] ?? QUALITY_ALIASES[suffix.toLowerCase()] ?? 'major';
}

// ─── DynamicsAnalyzer ────────────────────────────────────────────────────────

export class DynamicsAnalyzer {
  private params: DynamicsParams | null = null;
  private energyContour: EnergyContour | null = null;

  /**
   * Set musical parameters for beat-strength shaping.
   */
  setParams(params: DynamicsParams): void {
    this.params = params;
  }

  // ─── Optional Audio Energy Analysis ──────────────────────────────────────

  /**
   * Analyze the decoded audio buffer to build an RMS energy contour.
   * This enables audio-aware dynamics shaping but does NOT create
   * any dependency on the audio being actively played — the contour
   * is computed once and stored.
   *
   * Call this once when an audio file is loaded/decoded.
   */
  async analyzeAudioUrl(audioUrl: string): Promise<void> {
    try {
      const ctx = audioContextManager.getContext();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.analyzeBuffer(audioBuffer);
    } catch (err) {
      // Non-critical — dynamics will fall back to algorithmic-only mode
      console.warn('⚠️ Could not analyze audio for dynamics contour:', err);
    }
  }

  /**
   * Analyze an already-decoded AudioBuffer.
   */
  analyzeBuffer(audioBuffer: AudioBuffer): void {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);

    const windowSamples = Math.floor(RMS_WINDOW_SIZE * sampleRate);
    const numWindows = Math.floor(channelData.length / windowSamples);
    if (numWindows === 0) return;

    // Compute RMS per window
    const rms = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      const start = w * windowSamples;
      const end = Math.min(start + windowSamples, channelData.length);
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += channelData[i] * channelData[i];
      }
      rms[w] = Math.sqrt(sum / (end - start));
    }

    // Exponential smoothing
    const smoothed = new Float32Array(numWindows);
    smoothed[0] = rms[0];
    for (let i = 1; i < numWindows; i++) {
      smoothed[i] = SMOOTHING_ALPHA * smoothed[i - 1] + (1 - SMOOTHING_ALPHA) * rms[i];
    }

    // Find min/max
    let minRms = Infinity, maxRms = -Infinity;
    for (let i = 0; i < numWindows; i++) {
      if (smoothed[i] < minRms) minRms = smoothed[i];
      if (smoothed[i] > maxRms) maxRms = smoothed[i];
    }
    if (maxRms <= 0) { maxRms = 1; minRms = 0; }

    this.energyContour = {
      values: smoothed,
      timeStep: RMS_WINDOW_SIZE,
      minRms,
      maxRms,
    };
  }

  /**
   * Whether an energy contour is available.
   */
  hasEnergyContour(): boolean {
    return this.energyContour !== null;
  }

  // ─── Velocity Calculation ────────────────────────────────────────────────

  /**
   * Get the dynamic velocity multiplier for a given position.
   *
   * @param time       - Current time in seconds
   * @param beatIndex  - Current beat index (for metric accent)
   * @param chordName  - Current chord symbol (for harmonic tension)
   * @returns Velocity multiplier in [MIN_VELOCITY, MAX_VELOCITY]
   */
  getVelocityMultiplier(
    time: number,
    beatIndex?: number,
    chordName?: string,
  ): number {
    let velocity = 0.75; // Base mid-level velocity

    // ── 1. Audio energy contour (optional) ───────────────────────────────
    // Blended with ENERGY_INFLUENCE so algorithmic dynamics remain dominant.
    if (this.energyContour) {
      const idx = Math.floor(time / this.energyContour.timeStep);
      const clamped = Math.max(0, Math.min(idx, this.energyContour.values.length - 1));
      const rms = this.energyContour.values[clamped];
      const range = this.energyContour.maxRms - this.energyContour.minRms;
      const normalized = range > 0
        ? (rms - this.energyContour.minRms) / range
        : 0.5;

      // Map to velocity range, then blend
      const energyVelocity = MIN_VELOCITY + normalized * (MAX_VELOCITY - MIN_VELOCITY);
      velocity = velocity * (1 - ENERGY_INFLUENCE) + energyVelocity * ENERGY_INFLUENCE;
    }

    // ── 2. Metric accent (beat strength) ─────────────────────────────────
    if (this.params && beatIndex !== undefined && beatIndex >= 0) {
      const beatInMeasure = beatIndex % this.params.timeSignature;

      if (beatInMeasure === 0) {
        velocity *= DOWNBEAT_ACCENT;
      } else if (this.params.timeSignature === 4 && beatInMeasure === 2) {
        velocity *= BEAT3_ACCENT;
      } else {
        velocity *= WEAK_BEAT_SOFTEN;
      }
    }

    // ── 3. Phrasing arc (4-bar phrase crescendo/diminuendo) ──────────────
    if (this.params && beatIndex !== undefined && beatIndex >= 0) {
      const phraseLength = this.params.timeSignature * 4;
      const positionInPhrase = beatIndex % phraseLength;
      const normalizedPosition = positionInPhrase / phraseLength;

      // Sine arc: swell to midpoint then taper (±5%)
      const phraseShape = 0.95 + 0.05 * Math.sin(normalizedPosition * Math.PI);
      velocity *= phraseShape;
    }

    // ── 4. Harmonic tension ──────────────────────────────────────────────
    if (chordName) {
      const quality = getChordQuality(chordName);
      const tension = TENSION_MAP[quality] ?? 1.0;
      velocity *= tension;
    }

    // ── 5. Tempo-aware dynamic range scaling ─────────────────────────────
    // Fast tempos (>160 BPM): compress dynamics → gentler variation
    // Slow tempos (<80 BPM): expand dynamics → wider expression
    if (this.params) {
      const bpm = this.params.bpm;
      let tempoScale = 1.0;
      if (bpm > 160) {
        // Compress toward 0.75 center
        tempoScale = 0.85 + 0.15 * (200 - Math.min(bpm, 200)) / 40;
      } else if (bpm < 80) {
        // Expand from 0.75 center
        tempoScale = 1.0 + 0.1 * (80 - Math.max(bpm, 40)) / 40;
      }
      velocity = 0.75 + (velocity - 0.75) * tempoScale;
    }

    // Clamp to valid range
    return Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, velocity));
  }

  /**
   * Compute velocity for a MIDI export context (no real-time audio needed).
   * Accepts a chord name for harmonic tension shaping.
   */
  getExportVelocity(
    time: number,
    beatIndex: number,
    chordName: string,
  ): number {
    return this.getVelocityMultiplier(time, beatIndex, chordName);
  }

  /**
   * Reset the analyzer state.
   */
  reset(): void {
    this.params = null;
    this.energyContour = null;
  }
}

// Singleton instance
let instance: DynamicsAnalyzer | null = null;

export function getDynamicsAnalyzer(): DynamicsAnalyzer {
  if (!instance) {
    instance = new DynamicsAnalyzer();
  }
  return instance;
}
