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
 * 6. Macro song contour     (soft intro/outro, fuller middle section)
 */

import { audioContextManager } from './audioContextManager';
import type { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Pre-computed RMS energy contour */
export interface EnergyContour {
  /** Smoothed RMS values sampled at regular intervals */
  values: Float32Array;
  /** Time step between samples (seconds) */
  timeStep: number;
  /** Total duration of the analyzed audio buffer */
  duration: number;
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
  /** Total song duration in seconds (optional but recommended) */
  totalDuration?: number;
  /** Optional song segmentation used for section-aware shaping */
  segmentationData?: SegmentationResult | null;
}

interface SectionContourPoint {
  startTime: number;
  centerTime: number;
  endTime: number;
  target: number;
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
const DOWNBEAT_ACCENT = 1.04;

/** Beat-3 mild accent in 4/4 */
const BEAT3_ACCENT = 1.02;

/** Weak beat softening multiplier */
const WEAK_BEAT_SOFTEN = 0.97;

/** How much influence the energy contour has (0 = none, 1 = full) */
const ENERGY_INFLUENCE = 0.25;

/** Portion of the song reserved for the intro fade-in */
const INTRO_SECTION_PORTION = 0.08;

/** Portion of the song reserved for the outro fade-out */
const OUTRO_SECTION_PORTION = 0.08;

/** Softened edge multiplier used at the start and end of the song */
const MACRO_EDGE_MULTIPLIER = 0.88;

/** Floor/ceiling for section contour targets */
const SECTION_TARGET_FLOOR = 0.82;
const SECTION_TARGET_CEILING = 1.22;

/** How far to extrapolate beyond the first/last section center targets */
const OUTER_SECTION_EXTRAPOLATION = 0.55;

// ─── Harmonic Tension Map ────────────────────────────────────────────────────

/**
 * Chord-quality tension multipliers.
 * Higher tension → slightly louder/more intense playback.
 * Values centered around 1.0  (neutral).
 */
const TENSION_MAP: Record<string, number> = {
  // Stable / consonant
  major: 0.97,
  minor: 0.99,
  sus2: 0.97,
  sus4: 0.98,
  six: 0.97,
  min6: 0.98,
  // Mildly tense
  dom7: 1.02,
  maj7: 0.99,
  min7: 1.00,
  add9: 0.99,
  // More tense
  dim: 1.05,
  aug: 1.04,
  hdim7: 1.04,
  dim7: 1.06,
  // Extended / colorful
  dom9: 1.02,
  dom11: 1.03,
  dom13: 1.03,
  min9: 1.01,
  min11: 1.02,
  min13: 1.02,
  maj9: 1.00,
  maj11: 1.01,
  maj13: 1.01,
  minmaj7: 1.05,
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

function easeInOutSine(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

function interpolateContour(
  time: number,
  startTime: number,
  endTime: number,
  startValue: number,
  endValue: number,
): number {
  const duration = Math.max(endTime - startTime, Number.EPSILON);
  const progress = Math.max(0, Math.min(1, (time - startTime) / duration));
  return startValue + (endValue - startValue) * easeInOutSine(progress);
}

function clampSectionTarget(target: number): number {
  return Math.max(SECTION_TARGET_FLOOR, Math.min(SECTION_TARGET_CEILING, target));
}

function normalizeSectionType(segment: SongSegment): string {
  const raw = (segment.label ?? segment.type ?? '').toLowerCase().trim();
  const normalized = raw
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\s*\d+/g, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

  if (normalized.includes('pre') && normalized.includes('chorus')) return 'pre-chorus';
  if (normalized.includes('post') && normalized.includes('chorus')) return 'chorus';
  if (normalized.includes('intro')) return 'intro';
  if (normalized.includes('verse')) return 'verse';
  if (normalized.includes('chorus') || normalized.includes('refrain') || normalized.includes('hook')) return 'chorus';
  if (normalized.includes('bridge') || normalized.includes('middle-8') || normalized.includes('middle8')) return 'bridge';
  if (normalized.includes('instrumental') || normalized.includes('solo')) return 'instrumental';
  if (normalized.includes('breakdown') || normalized.includes('break')) return 'breakdown';
  if (normalized.includes('outro') || normalized.includes('ending') || normalized.includes('tag')) return 'outro';

  return 'other';
}

function getBaseSectionTarget(sectionType: string): number {
  switch (sectionType) {
    case 'intro':
      return 0.89;
    case 'verse':
      return 0.97;
    case 'pre-chorus':
      return 1.06;
    case 'chorus':
      return 1.13;
    case 'bridge':
      return 0.95;
    case 'instrumental':
      return 1.02;
    case 'breakdown':
      return 0.88;
    case 'outro':
      return 0.86;
    default:
      return 0.99;
  }
}

// ─── DynamicsAnalyzer ────────────────────────────────────────────────────────

export class DynamicsAnalyzer {
  private params: DynamicsParams | null = null;
  private energyContour: EnergyContour | null = null;
  private sectionContour: SectionContourPoint[] = [];
  /** Smoothed velocity to prevent abrupt jumps between consecutive chords */
  private lastVelocity: number | null = null;
  /** Time of the last velocity query for time-aware smoothing */
  private lastVelocityTime: number | null = null;

  /**
   * Set musical parameters for beat-strength shaping.
   */
  setParams(params: DynamicsParams): void {
    this.params = params;
    this.sectionContour = this.buildSectionContour(params);
  }

  private buildSectionContour(params: DynamicsParams): SectionContourPoint[] {
    const segments = params.segmentationData?.segments ?? [];
    const totalDuration = params.totalDuration ?? params.segmentationData?.metadata.totalDuration;
    if (!totalDuration || !isFinite(totalDuration) || totalDuration <= 0 || segments.length === 0) {
      return [];
    }

    const sortedSegments = [...segments]
      .filter(segment => Number.isFinite(segment.startTime) && Number.isFinite(segment.endTime) && segment.endTime > segment.startTime)
      .sort((a, b) => a.startTime - b.startTime);

    if (sortedSegments.length === 0) {
      return [];
    }

    const normalizedTypes = sortedSegments.map(normalizeSectionType);
    const chorusIndices = normalizedTypes
      .map((type, index) => (type === 'chorus' ? index : -1))
      .filter(index => index >= 0);
    const preferredPeakIndex = [...chorusIndices].reverse().find((index) => {
      const segment = sortedSegments[index];
      const center = (segment.startTime + segment.endTime) / 2;
      return center >= totalDuration * 0.5;
    }) ?? chorusIndices[chorusIndices.length - 1];

    return sortedSegments.map((segment, index) => {
      const sectionType = normalizedTypes[index];
      const center = (segment.startTime + segment.endTime) / 2;
      const progress = totalDuration > 0 ? center / totalDuration : 0;

      let target = getBaseSectionTarget(sectionType);

      if (sectionType === 'verse') {
        target += Math.max(0, progress - 0.1) * 0.05;
      } else if (sectionType === 'pre-chorus') {
        target += Math.max(0, progress - 0.18) * 0.075;
      } else if (sectionType === 'chorus') {
        const chorusOrder = chorusIndices.indexOf(index);
        const chorusLift = chorusIndices.length > 1 ? chorusOrder / (chorusIndices.length - 1) : 1;
        target += 0.045 * chorusLift;
        if (progress >= 0.5) {
          target += 0.03;
        }
        if (preferredPeakIndex === index) {
          target += 0.055;
        }
      } else if (sectionType === 'instrumental') {
        target += Math.max(0, progress - 0.45) * 0.03;
      } else if (sectionType === 'bridge' || sectionType === 'breakdown') {
        target -= Math.max(0, progress - 0.35) * 0.025;
      } else if (sectionType === 'outro') {
        target -= Math.max(0, progress - 0.72) * 0.14;
      }

      return {
        startTime: segment.startTime,
        centerTime: center,
        endTime: segment.endTime,
        target: clampSectionTarget(target),
      };
    });
  }

  private getSectionDynamicContour(time: number): number {
    if (this.sectionContour.length === 0) {
      return 1.0;
    }

    const points = this.sectionContour;
    if (points.length === 1) {
      return points[0].target;
    }

    const first = points[0];
    const second = points[1];
    if (time <= first.centerTime) {
      const startTarget = clampSectionTarget(
        first.target + (first.target - second.target) * OUTER_SECTION_EXTRAPOLATION,
      );
      return interpolateContour(time, first.startTime, first.centerTime, startTarget, first.target);
    }

    for (let index = 0; index < points.length - 1; index++) {
      const current = points[index];
      const next = points[index + 1];
      if (time <= next.centerTime) {
        return interpolateContour(
          time,
          current.centerTime,
          next.centerTime,
          current.target,
          next.target,
        );
      }
    }

    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const endTarget = clampSectionTarget(
      last.target + (last.target - previous.target) * OUTER_SECTION_EXTRAPOLATION,
    );
    return interpolateContour(time, last.centerTime, last.endTime, last.target, endTarget);
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
      duration: audioBuffer.duration,
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

  private getMacroDynamicContour(time: number): number {
    // When section-aware contouring is available, it already shapes the full-song
    // arc including soft intros/outros and stronger middle sections. Applying the
    // macro contour on top double-counts those edge fades and can over-flatten
    // segmented songs, so keep the macro layer neutral in that case.
    if (this.sectionContour.length > 0) {
      return 1.0;
    }

    const totalDuration = this.params?.totalDuration ?? this.energyContour?.duration;
    if (!totalDuration || !isFinite(totalDuration) || totalDuration <= 0) {
      return 1.0;
    }

    const clampedTime = Math.max(0, Math.min(time, totalDuration));
    const normalizedTime = clampedTime / totalDuration;
    const introPortion = Math.max(0, Math.min(INTRO_SECTION_PORTION, 0.5));
    const outroPortion = Math.max(0, Math.min(OUTRO_SECTION_PORTION, 0.5));
    const outroStart = Math.max(introPortion, 1 - outroPortion);
    const dynamicRange = 1 - MACRO_EDGE_MULTIPLIER;

    if (introPortion > 0 && normalizedTime <= introPortion) {
      const progress = normalizedTime / introPortion;
      return MACRO_EDGE_MULTIPLIER + dynamicRange * easeInOutSine(progress);
    }

    if (outroPortion > 0 && normalizedTime >= outroStart) {
      const progress = (normalizedTime - outroStart) / Math.max(outroPortion, Number.EPSILON);
      return 1 - dynamicRange * easeInOutSine(progress);
    }

    return 1.0;
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
    // =====================================================================
    // The velocity is built from two component groups:
    //   SMOOTH — phrasing arc + macro contour: inherently continuous curves
    //            that should NOT be dampened by the EMA.
    //   VOLATILE — metric accent + harmonic tension + energy: components
    //             that can jump at chord boundaries and benefit from EMA
    //             smoothing.
    // Final velocity = smoothEnvelope * smoothedVolatile
    // =====================================================================

    // ── Smooth envelope (no EMA) ─────────────────────────────────────────
    let smoothEnvelope = 1.0;

    // 1. Phrasing arc (asymmetric 4-bar crescendo/diminuendo, ±8%)
    //    Crescendo over ~65 % of the phrase, quicker diminuendo over ~35 %.
    if (this.params && beatIndex !== undefined && beatIndex >= 0) {
      const phraseLength = this.params.timeSignature * 4;
      const positionInPhrase = beatIndex % phraseLength;
      const normalizedPosition = positionInPhrase / phraseLength;

      const PEAK_POSITION = 0.65;
      let phraseEnvelope: number;
      if (normalizedPosition <= PEAK_POSITION) {
        // Gradual rise: half-sine from 0 → 1
        phraseEnvelope = Math.sin((normalizedPosition / PEAK_POSITION) * (Math.PI / 2));
      } else {
        // Quicker fall: half-cosine from 1 → 0
        phraseEnvelope = Math.cos(
          ((normalizedPosition - PEAK_POSITION) / (1 - PEAK_POSITION)) * (Math.PI / 2),
        );
      }
      smoothEnvelope *= 0.92 + 0.08 * phraseEnvelope;
    }

    // 2. Section-aware contour (verse/build/chorus/bridge/outro)
    smoothEnvelope *= this.getSectionDynamicContour(time);

    // 3. Macro song contour (soft intro/outro, full middle)
    smoothEnvelope *= this.getMacroDynamicContour(time);

    // ── Volatile component (EMA-smoothed) ────────────────────────────────
    let volatile = 0.75; // Base mid-level velocity

    // 4. Audio energy contour (optional)
    if (this.energyContour) {
      const idx = Math.floor(time / this.energyContour.timeStep);
      const clamped = Math.max(0, Math.min(idx, this.energyContour.values.length - 1));
      const rms = this.energyContour.values[clamped];
      const range = this.energyContour.maxRms - this.energyContour.minRms;
      const normalized = range > 0
        ? (rms - this.energyContour.minRms) / range
        : 0.5;

      const energyVelocity = MIN_VELOCITY + normalized * (MAX_VELOCITY - MIN_VELOCITY);
      volatile = volatile * (1 - ENERGY_INFLUENCE) + energyVelocity * ENERGY_INFLUENCE;
    }

    // 5. Metric accent (beat strength)
    if (this.params && beatIndex !== undefined && beatIndex >= 0) {
      const beatInMeasure = beatIndex % this.params.timeSignature;

      if (beatInMeasure === 0) {
        volatile *= DOWNBEAT_ACCENT;
      } else if (this.params.timeSignature === 4 && beatInMeasure === 2) {
        volatile *= BEAT3_ACCENT;
      } else if (this.params.timeSignature === 6 && beatInMeasure === 3) {
        // 6/8 compound time: secondary accent on beat 4 (start of second group)
        volatile *= BEAT3_ACCENT;
      } else {
        volatile *= WEAK_BEAT_SOFTEN;
      }
    }

    // 6. Harmonic tension
    if (chordName) {
      const quality = getChordQuality(chordName);
      const tension = TENSION_MAP[quality] ?? 1.0;
      volatile *= tension;
    }

    // 7. Tempo-aware dynamic range scaling
    if (this.params) {
      const bpm = this.params.bpm;
      let tempoScale = 1.0;
      if (bpm > 160) {
        tempoScale = 0.85 + 0.15 * (200 - Math.min(bpm, 200)) / 40;
      } else if (bpm < 80) {
        tempoScale = 1.0 + 0.1 * (80 - Math.max(bpm, 40)) / 40;
      }
      volatile = 0.75 + (volatile - 0.75) * tempoScale;
    }

    // EMA smoothing — only applied to the volatile component so intentional
    // phrasing / macro contour curves are preserved in full.
    if (this.lastVelocity !== null && this.lastVelocityTime !== null) {
      const timeSinceLast = Math.abs(time - this.lastVelocityTime);
      if (timeSinceLast < 4.0) {
        const alpha = timeSinceLast < 0.8 ? 0.3 : timeSinceLast < 2.0 ? 0.45 : 0.65;
        volatile = alpha * volatile + (1 - alpha) * this.lastVelocity;
      }
    }
    this.lastVelocity = volatile;
    this.lastVelocityTime = time;

    // Combine: smooth envelope shapes the overall arc, volatile adds texture
    let velocity = smoothEnvelope * volatile;

    // Clamp to valid range
    velocity = Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, velocity));

    return velocity;
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
    this.sectionContour = [];
    this.lastVelocity = null;
    this.lastVelocityTime = null;
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
