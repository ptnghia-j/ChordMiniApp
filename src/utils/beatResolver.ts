/**
 * Pure beat-resolution cascade extracted from useScrollAndAnimation.
 *
 * This module takes a playback time plus analysis data and returns which
 * beat/downbeat should be highlighted, together with the next hysteresis
 * state. It is a pure function with no React, rAF, Zustand, or DOM
 * dependencies so the logic can be unit-tested in isolation.
 *
 * Behavior is intentionally identical to the previous in-hook cascade — no
 * user-visible changes.
 */

import type { AnalysisResult } from '@/types/audioAnalysis';
import type { ChordGridData } from '@/hooks/scroll/useScrollAndAnimation';

// --- Tunables (moved out of the hook) ---------------------------------------
export const STABILITY_THRESHOLD = 2;      // Frames a new beat must hold
export const HYSTERESIS_BUFFER = 0.05;     // 50ms buffer around boundaries
export const PHASE_SWITCH_BUFFER = 0.03;   // 30ms buffer between pre-beat and model phase
export const OFF_DWELL_SECONDS = 0.08;     // 80ms dwell before turning highlight off
export const TIMING_TOLERANCE = 0.02;      // 20ms tolerance for binary search

// --- Types ------------------------------------------------------------------
export interface HysteresisState {
  lastStableBeat: number;
  beatStabilityCounter: number;
  lastEmittedBeat: number;
  lastEmitTime: number;
  prevTime: number;
}

export const INITIAL_HYSTERESIS_STATE: HysteresisState = {
  lastStableBeat: -1,
  beatStabilityCounter: 0,
  lastEmittedBeat: -1,
  lastEmitTime: 0,
  prevTime: 0,
};

export interface ResolveBeatInput {
  time: number;
  chordGridData: ChordGridData;
  analysisResults: AnalysisResult;
  hysteresisState: HysteresisState;
  globalSpeedAdjustment: number | null;
}

export interface ResolveBeatResult {
  beatIndex: number;         // -1 when nothing should be highlighted
  downbeatIndex: number;     // -1 when unknown
  nextHysteresisState: HysteresisState;
  nextGlobalSpeedAdjustment: number | null;
  shouldSkipEmit: boolean;   // Cascade decided this frame produces no update
}

// --- Internal helpers -------------------------------------------------------

/**
 * Binary search for the current beat with hysteresis smoothing. Returns the
 * updated hysteresis bookkeeping alongside the chosen beat index.
 */
function findCurrentBeatIndexWithHysteresis(
  currentTime: number,
  beats: (number | null)[],
  state: HysteresisState,
): { beatIndex: number; lastStableBeat: number; beatStabilityCounter: number } {
  let lastStableBeat = state.lastStableBeat;
  let beatStabilityCounter = state.beatStabilityCounter;

  if (!beats || beats.length === 0) {
    return { beatIndex: -1, lastStableBeat, beatStabilityCounter };
  }

  const validBeats: { time: number; index: number }[] = [];
  beats.forEach((beat, index) => {
    if (typeof beat === 'number' && beat >= 0) {
      validBeats.push({ time: beat, index });
    }
  });

  if (validBeats.length === 0) {
    return { beatIndex: -1, lastStableBeat, beatStabilityCounter };
  }

  let left = 0;
  let right = validBeats.length - 1;
  let candidateBeatIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const beatTime = validBeats[mid].time;
    const nextBeatTime = mid < validBeats.length - 1
      ? validBeats[mid + 1].time
      : beatTime + 2.0;
    const switchingPoint = beatTime + (nextBeatTime - beatTime) / 2;

    if (currentTime >= beatTime && currentTime < nextBeatTime) {
      const currentStableBeat = lastStableBeat;
      const currentBeatIndex = validBeats[mid].index;

      if (currentStableBeat === currentBeatIndex) {
        candidateBeatIndex = currentBeatIndex;
      } else if (currentTime < switchingPoint - HYSTERESIS_BUFFER) {
        candidateBeatIndex = mid > 0 ? validBeats[mid - 1].index : currentBeatIndex;
      } else if (currentTime > switchingPoint + HYSTERESIS_BUFFER) {
        candidateBeatIndex = currentBeatIndex;
      } else {
        candidateBeatIndex = currentStableBeat !== -1 ? currentStableBeat : currentBeatIndex;
      }
      break;
    } else if (currentTime < beatTime) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // Stability gating
  if (candidateBeatIndex === lastStableBeat) {
    beatStabilityCounter = Math.min(beatStabilityCounter + 1, STABILITY_THRESHOLD);
    return { beatIndex: candidateBeatIndex, lastStableBeat, beatStabilityCounter };
  }

  if (beatStabilityCounter >= STABILITY_THRESHOLD) {
    lastStableBeat = candidateBeatIndex;
    beatStabilityCounter = 1;
    return { beatIndex: candidateBeatIndex, lastStableBeat, beatStabilityCounter };
  }

  beatStabilityCounter += 1;
  return { beatIndex: lastStableBeat, lastStableBeat, beatStabilityCounter };
}

/**
 * Binary search for the latest `originalAudioMapping` entry whose timestamp
 * has already been reached. Returns -1 when nothing matches.
 */
function findCurrentAudioMappingIndex(
  currentTime: number,
  audioMapping: Array<{ timestamp: number; visualIndex: number }>,
): number {
  if (!audioMapping || audioMapping.length === 0) return -1;

  const adjustedTime = currentTime + TIMING_TOLERANCE;

  let left = 0;
  let right = audioMapping.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const item = audioMapping[mid];
    if (adjustedTime >= item.timestamp) {
      result = item.visualIndex;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

/**
 * Binary search for the latest downbeat whose timestamp has already been
 * reached. Returns -1 when nothing matches.
 */
export function findDownbeatIndexAtTime(
  time: number,
  downbeats: number[] | undefined,
): number {
  if (!downbeats || downbeats.length === 0) return -1;

  let left = 0;
  let right = downbeats.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const dbTime = downbeats[mid];
    if (time >= dbTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

// --- Main cascade -----------------------------------------------------------

type ChordGridDataWithMapping = ChordGridData & {
  originalAudioMapping: Array<{
    timestamp: number;
    chord: string;
    visualIndex: number;
  }>;
};

function hasOriginalAudioMapping(data: ChordGridData): data is ChordGridDataWithMapping {
  return 'originalAudioMapping' in data
    && Array.isArray((data as ChordGridDataWithMapping).originalAudioMapping)
    && (data as ChordGridDataWithMapping).originalAudioMapping.length > 0;
}

export function resolveBeatAtTime(input: ResolveBeatInput): ResolveBeatResult {
  const { time, chordGridData, analysisResults, globalSpeedAdjustment } = input;
  const hysteresis = input.hysteresisState;

  // Guard: empty grid => nothing to emit. Preserve prevTime for the rewind
  // guard that lives in the hook.
  if (!chordGridData || chordGridData.chords.length === 0) {
    return {
      beatIndex: -1,
      downbeatIndex: -1,
      nextHysteresisState: hysteresis,
      nextGlobalSpeedAdjustment: globalSpeedAdjustment,
      shouldSkipEmit: true,
    };
  }

  // Compute animationRangeStart (first non-null beat time > 0)
  let firstDetectedBeat = 0.0;
  if (analysisResults.beats && analysisResults.beats.length > 0) {
    for (const beat of analysisResults.beats) {
      if (beat && beat.time !== undefined && beat.time > 0) {
        firstDetectedBeat = beat.time;
        break;
      }
    }
  }

  let animationRangeStart = firstDetectedBeat;
  if (hasOriginalAudioMapping(chordGridData) && chordGridData.originalAudioMapping.length > 0) {
    const firstMappedTime = chordGridData.originalAudioMapping[0].timestamp;
    if (typeof firstMappedTime === 'number' && firstMappedTime >= 0) {
      animationRangeStart = firstDetectedBeat > 0
        ? Math.min(firstDetectedBeat, firstMappedTime)
        : firstMappedTime;
    }
  }

  let currentBeat = -1;
  let nextGlobalSpeedAdjustment: number | null = globalSpeedAdjustment;
  let nextHysteresis: HysteresisState = hysteresis;

  // --- PHASE 1: Pre-model context ------------------------------------------
  if (time < animationRangeStart - PHASE_SWITCH_BUFFER) {
    return {
      beatIndex: -1,
      downbeatIndex: -1,
      nextHysteresisState: {
        ...nextHysteresis,
        lastEmittedBeat: -1,
        lastEmitTime: time,
      },
      nextGlobalSpeedAdjustment,
      shouldSkipEmit: false,
    };
  }

  // --- PHASE 2: Model beats ------------------------------------------------
  if (time > animationRangeStart + PHASE_SWITCH_BUFFER) {
    if (hasOriginalAudioMapping(chordGridData)) {
      const animationBpm = analysisResults.beatDetectionResult?.bpm || 120;
      const originalBeatDuration = Math.round((60 / animationBpm) * 1000) / 1000;

      // Identify chord change segments in chord-model timeline
      const chordChanges: Array<{
        index: number;
        chord: string;
        timestamp: number;
        chordModelTimestamp: number;
      }> = [];

      let lastChord = '';
      chordGridData.originalAudioMapping.forEach((item, index) => {
        if (item.chord !== lastChord) {
          const chordModelTimestamp = item.timestamp - firstDetectedBeat;
          if (chordModelTimestamp >= 0) {
            chordChanges.push({
              index,
              chord: item.chord,
              timestamp: item.timestamp,
              chordModelTimestamp,
            });
            lastChord = item.chord;
          }
        }
      });

      // Compute globalSpeedAdjustment one time from the first segment pair
      if (nextGlobalSpeedAdjustment === null && chordChanges.length >= 2) {
        const firstSegment = chordChanges[0];
        const secondSegment = chordChanges[1];
        const actualDuration = secondSegment.chordModelTimestamp - firstSegment.chordModelTimestamp;
        const expectedDuration = originalBeatDuration;
        if (actualDuration > 0 && expectedDuration > 0) {
          nextGlobalSpeedAdjustment = actualDuration / expectedDuration;
        }
      }

      // Binary-search the audio mapping for the active visualIndex.
      const audioMappingIndex = findCurrentAudioMappingIndex(time, chordGridData.originalAudioMapping);
      if (audioMappingIndex !== -1) {
        currentBeat = audioMappingIndex;
      }

      if (currentBeat === -1) {
        // Fallback to hysteresis-based search over the chord grid beats
        const search = findCurrentBeatIndexWithHysteresis(
          time,
          chordGridData.beats,
          nextHysteresis,
        );
        currentBeat = search.beatIndex;
        nextHysteresis = {
          ...nextHysteresis,
          lastStableBeat: search.lastStableBeat,
          beatStabilityCounter: search.beatStabilityCounter,
        };
      }
    }
    // When originalAudioMapping is missing we fall through with currentBeat === -1.

    // Only mapped audio beats may drive the visual highlighter.
    let finalBeatIndex = currentBeat;
    let currentDownbeat = -1;

    if (currentBeat !== -1) {
      const chord = chordGridData.chords[currentBeat] || '';
      const isEmptyCell = chord === '' || chord === 'undefined';
      const isMappedAudioBeat = hasOriginalAudioMapping(chordGridData) &&
        chordGridData.originalAudioMapping.some(item => item.visualIndex === currentBeat);

      // The audio mapping is authoritative. In particular, a mapped N.C. cell
      // is a real beat even when it occupies a nominal padding position. Empty
      // cells remain layout-only even if an incomplete mapping references them.
      if (!isMappedAudioBeat || isEmptyCell) {
        finalBeatIndex = -1;
      }
    } else {
      finalBeatIndex = -1;
    }

    // Downbeat lookup (linear scan preserved from original for parity)
    if (analysisResults.downbeats && analysisResults.downbeats.length > 0) {
      for (let i = 0; i < analysisResults.downbeats.length; i++) {
        const downbeat = analysisResults.downbeats[i];
        if (downbeat && downbeat <= time) {
          currentDownbeat = i;
        } else {
          break;
        }
      }
    }

    // Stabilize emit
    let stableFinalBeat = finalBeatIndex;
    const lastEmitted = nextHysteresis.lastEmittedBeat;
    const prevTime = nextHysteresis.prevTime;
    const isRewinding = time + 1e-6 < prevTime;

    if (!isRewinding && lastEmitted !== -1 && stableFinalBeat !== -1 && stableFinalBeat < lastEmitted) {
      stableFinalBeat = lastEmitted;
    }

    if (stableFinalBeat === -1 && lastEmitted !== -1) {
      if (time - nextHysteresis.lastEmitTime < OFF_DWELL_SECONDS) {
        stableFinalBeat = lastEmitted;
      }
    }

    return {
      beatIndex: stableFinalBeat,
      downbeatIndex: currentDownbeat,
      nextHysteresisState: {
        ...nextHysteresis,
        lastEmittedBeat: stableFinalBeat,
        lastEmitTime: time,
      },
      nextGlobalSpeedAdjustment,
      shouldSkipEmit: false,
    };
  }

  // In the narrow PHASE_SWITCH_BUFFER window we intentionally emit nothing.
  return {
    beatIndex: -1,
    downbeatIndex: -1,
    nextHysteresisState: nextHysteresis,
    nextGlobalSpeedAdjustment,
    shouldSkipEmit: true,
  };
}
