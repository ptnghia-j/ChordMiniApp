import { useCallback, useEffect, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { YouTubePlayer } from '@/types/youtube';
import { timingSyncService } from '@/services/timingSyncService';

// Define ChordGridData type based on the analyze page implementation
export interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
  originalAudioMapping?: Array<{
    timestamp: number;
    chord: string;
    visualIndex: number;
  }>;
  animationMapping?: Array<{
    timestamp: number;
    visualIndex: number;
    chord: string;
  }>;
}

export interface ScrollAndAnimationDependencies {
  // Audio and playback state
  youtubePlayer: YouTubePlayer | null; // YouTube player for timing
  isPlaying: boolean;
  analysisResults: AnalysisResult | null;

  // Beat tracking state
  currentBeatIndex: number;
  currentBeatIndexRef: React.MutableRefObject<number>;
  setCurrentBeatIndex: (index: number) => void;
  setCurrentDownbeatIndex: (index: number) => void;
  setCurrentTime: (time: number) => void;

  // UI state
  isFollowModeEnabled: boolean;

  // Animation data
  chordGridData: ChordGridData | null;
  globalSpeedAdjustment: number | null;
  setGlobalSpeedAdjustment: (adjustment: number | null) => void;
  lastClickInfo: {
    visualIndex: number;
    timestamp: number;
    clickTime: number;
  } | null;
}

export interface ScrollAndAnimationHelpers {
  scrollToCurrentBeat: () => void;
}

/**
 * Custom hook for scroll and animation functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useScrollAndAnimation = (deps: ScrollAndAnimationDependencies): ScrollAndAnimationHelpers => {
  const {
    youtubePlayer,
    isPlaying,
    analysisResults,
    currentBeatIndex,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setCurrentDownbeatIndex,
    setCurrentTime,
    isFollowModeEnabled,
    chordGridData,
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    lastClickInfo,
  } = deps;

  // ANTI-JITTER: Hysteresis-based beat tracking to prevent oscillation
  // Adds stability buffer zones around beat boundaries to eliminate double-blinking
  const lastStableBeatRef = useRef(-1);
  const beatStabilityCounterRef = useRef(0);
  const STABILITY_THRESHOLD = 2; // Require 2 consecutive frames with same beat
  const HYSTERESIS_BUFFER = 0.05; // 50ms buffer zone around beat boundaries

  const findCurrentBeatIndexWithHysteresis = useCallback((currentTime: number, beats: (number | null)[]): number => {
    if (!beats || beats.length === 0) return -1;

    // Filter out null beats and create searchable array
    const validBeats: { time: number; index: number }[] = [];
    beats.forEach((beat, index) => {
      if (typeof beat === 'number' && beat >= 0) {
        validBeats.push({ time: beat, index });
      }
    });

    if (validBeats.length === 0) return -1;

    // Binary search for the current beat with hysteresis
    let left = 0;
    let right = validBeats.length - 1;
    let candidateBeatIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const beatTime = validBeats[mid].time;

      // Get next beat time for range checking
      const nextBeatTime = mid < validBeats.length - 1
        ? validBeats[mid + 1].time
        : beatTime + 2.0; // Default 2-second range for last beat

      // ANTI-JITTER: Use midpoint between beats as switching threshold
      // This creates more stable switching behavior
      const switchingPoint = beatTime + (nextBeatTime - beatTime) / 2;

      if (currentTime >= beatTime && currentTime < nextBeatTime) {
        // ANTI-JITTER: Apply hysteresis based on current stable beat
        const currentStableBeat = lastStableBeatRef.current;
        const currentBeatIndex = validBeats[mid].index;

        if (currentStableBeat === currentBeatIndex) {
          // Already on this beat, use wider tolerance to prevent switching
          candidateBeatIndex = currentBeatIndex;
        } else if (currentTime < switchingPoint - HYSTERESIS_BUFFER) {
          // Clearly in previous beat territory
          candidateBeatIndex = mid > 0 ? validBeats[mid - 1].index : currentBeatIndex;
        } else if (currentTime > switchingPoint + HYSTERESIS_BUFFER) {
          // Clearly in current beat territory
          candidateBeatIndex = currentBeatIndex;
        } else {
          // In buffer zone - stick with current stable beat if possible
          candidateBeatIndex = currentStableBeat !== -1 ? currentStableBeat : currentBeatIndex;
        }
        break;
      } else if (currentTime < beatTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // ANTI-JITTER: Require stability before changing beat index
    if (candidateBeatIndex === lastStableBeatRef.current) {
      // Same beat as before - increment stability counter
      beatStabilityCounterRef.current = Math.min(beatStabilityCounterRef.current + 1, STABILITY_THRESHOLD);
      return candidateBeatIndex;
    } else {
      // Different beat candidate - check if we have enough stability
      if (beatStabilityCounterRef.current >= STABILITY_THRESHOLD) {
        // We've been stable long enough, allow the change
        lastStableBeatRef.current = candidateBeatIndex;
        beatStabilityCounterRef.current = 1; // Reset counter for new beat
        return candidateBeatIndex;
      } else {
        // Not stable enough yet - increment counter but return previous stable beat
        beatStabilityCounterRef.current += 1;
        return lastStableBeatRef.current;
      }
    }
  }, []);

  // PERFORMANCE OPTIMIZATION: Binary search for audio mapping with timing precision
  const findCurrentAudioMappingIndex = useCallback((currentTime: number, audioMapping: Array<{timestamp: number; visualIndex: number}>): number => {
    if (!audioMapping || audioMapping.length === 0) return -1;

    // ANTI-JITTER: Add small timing tolerance to prevent oscillation
    const TIMING_TOLERANCE = 0.02; // 20ms tolerance for timing precision
    const adjustedTime = currentTime + TIMING_TOLERANCE;

    let left = 0;
    let right = audioMapping.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const item = audioMapping[mid];

      if (adjustedTime >= item.timestamp) {
        result = item.visualIndex;
        left = mid + 1; // Continue searching for a later match
      } else {
        right = mid - 1;
      }
    }

    return result;
  }, []);

  // PERFORMANCE FIX #3: Auto-scroll optimization
  // Track last scroll time and beat index to reduce scroll frequency
  const lastScrollTimeRef = useRef(0);
  const lastScrolledBeatIndexRef = useRef(-1);

  // JITTER GUARDS: Track last emitted beat and timing to apply dwell/hysteresis
  const lastEmittedBeatRef = useRef(-1);
  const lastEmitTimeRef = useRef(0);
  const prevTimeRef = useRef(0);

  // Guard constants
  const PHASE_SWITCH_BUFFER = 0.03; // 30ms buffer between pre-beat and model phase
  const OFF_DWELL_SECONDS = 0.08; // require 80ms before turning highlight off (-1)
  const CLICK_OVERRIDE_WINDOW_MS = 800; // extended window to cover seek latency

  // ANTI-JITTER: Centralized state update function to prevent multiple conflicting updates
  const updateBeatIndexSafely = useCallback((newBeatIndex: number) => {
    // Only update if the beat index actually changed
    if (currentBeatIndexRef.current !== newBeatIndex) {
      unstable_batchedUpdates(() => {
        currentBeatIndexRef.current = newBeatIndex;
        setCurrentBeatIndex(newBeatIndex);
        // Track emission for dwell/monotonic guards
        lastEmittedBeatRef.current = newBeatIndex;
        // lastEmitTimeRef is updated by the rAF loop when time is known
      });
    }
  }, [setCurrentBeatIndex, currentBeatIndexRef]);

  // PERFORMANCE FIX #3: Optimized auto-scrolling with reduced frequency
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const now = Date.now();

    // OPTIMIZATION 1: Increased throttle from 120ms to 200ms (max 5 scrolls/second)
    // This reduces scroll frequency while maintaining smooth experience
    if (now - lastScrollTimeRef.current < 200) {
      return;
    }

    // OPTIMIZATION 2: Position-based debouncing - only scroll if beat changed significantly
    // Skip scrolling if we're still on the same beat or just moved 1 beat
    // This prevents excessive scrolling for consecutive beats that are visually close
    const beatIndexDelta = Math.abs(currentBeatIndex - lastScrolledBeatIndexRef.current);
    if (beatIndexDelta === 0) {
      return; // Same beat, no need to scroll
    }

    // For small beat changes (1-2 beats), only scroll if enough time has passed
    // This reduces scroll frequency for fast-tempo songs
    if (beatIndexDelta <= 2 && now - lastScrollTimeRef.current < 400) {
      return;
    }

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      const rect = beatElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportCenter = viewportHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      const delta = elementCenter - viewportCenter;

      // OPTIMIZATION 3: Viewport boundary check - only scroll if element is outside comfortable zone
      // Expanded from 32px to 80px to reduce unnecessary micro-scrolls
      // Also check if element is completely outside viewport (more urgent)
      const isOutsideViewport = rect.bottom < 0 || rect.top > viewportHeight;
      const isOutsideComfortZone = Math.abs(delta) > 80;

      if (!isOutsideViewport && !isOutsideComfortZone) {
        return; // Element is visible and reasonably centered, skip scroll
      }

      // OPTIMIZATION 4: Single RAF instead of double RAF
      // The double RAF was for layout stability but adds latency
      // Single RAF is sufficient for smooth scrolling
      requestAnimationFrame(() => {
        lastScrollTimeRef.current = Date.now();
        lastScrolledBeatIndexRef.current = currentBeatIndex;
        beatElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest' // Prevent horizontal scrolling that can cause jitter
        });
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes
  useEffect(() => {
    scrollToCurrentBeat();
  }, [currentBeatIndex, scrollToCurrentBeat, isFollowModeEnabled]); // Include isFollowModeEnabled dependency

  // PERFORMANCE OPTIMIZATION: RequestAnimationFrame with frame skipping
  const rafRef = useRef<number | undefined>(undefined);
  const frameCounterRef = useRef<number>(0);
  const FRAME_SKIP = 2; // Run every 3rd frame (60fps / 3 = 20fps)
  // PERFORMANCE OPTIMIZATION: Debounce state updates to reduce re-renders
  const lastStateUpdateTimeRef = useRef<number>(0);
  const STATE_UPDATE_INTERVAL = 50; // Update at most every 50ms (20fps) instead of 60fps

  // Update current time and check for current beat
  useEffect(() => {
    // CRITICAL FIX: Only set up animation loop when playing
    // This prevents unnecessary CPU usage when paused
    if (!youtubePlayer || !analysisResults || !isPlaying) {
      return;
    }

    // PERFORMANCE OPTIMIZATION: Use RequestAnimationFrame with frame skipping
    // This provides 20fps updates (every 3rd frame) to match state update throttle
    const updateBeatTracking = () => {
      // CRITICAL FIX: Check current playing state dynamically
      // If paused, stop the loop immediately (don't schedule next frame)
      if (!youtubePlayer || !youtubePlayer.getCurrentTime || !isPlaying) {
        return; // Stop the loop when paused
      }

      // PERFORMANCE FIX #1: Frame skipping to reduce CPU usage
      // Increment frame counter and skip frames that don't match our target rate
      frameCounterRef.current++;
      if (frameCounterRef.current % (FRAME_SKIP + 1) !== 0) {
        // Skip this frame, but schedule next one to maintain loop
        rafRef.current = requestAnimationFrame(updateBeatTracking);
        return;
      }

      const time = youtubePlayer.getCurrentTime();
      setCurrentTime(time);

        // DEBUG: Log animation interval execution every 5 seconds
        // if (Math.floor(time) % 5 === 0 && Math.floor(time * 10) % 10 === 0) {
        //   console.log(`🔄 ANIMATION INTERVAL: time=${time.toFixed(3)}s, isPlaying=${isPlaying}, chordGridData exists=${!!chordGridData}, currentBeatIndex=${currentBeatIndexRef.current}, manualOverride=${manualBeatIndexOverride}`);
        // }

        // Find the current beat based on chord grid data (includes pickup beats)
        // This ensures consistency between beat tracking and chord display
        if (chordGridData && chordGridData.chords.length > 0) {


          // FIXED: Use first detected beat time for animation timing to align with actual beat model output
          // This accounts for the offset between chord model start (0.0s) and first beat detection (e.g., 0.534s)
          let firstDetectedBeat = 0.0;

          // Find the first non-null beat time from the analysis results
          if (analysisResults.beats && analysisResults.beats.length > 0) {
            for (const beat of analysisResults.beats) {
              if (beat && beat.time !== undefined && beat.time > 0) {
                firstDetectedBeat = beat.time;
                break;
              }
            }
          }

          // FIXED: Use first detected beat time for animation timing to align with actual beat model output
          // This accounts for the offset between chord model start (0.0s) and first beat detection (e.g., 0.534s)
          const animationRangeStart = firstDetectedBeat;

          // console.log(`🎬 BEAT DETECTION: time=${time.toFixed(3)}s, animationRangeStart=${animationRangeStart.toFixed(3)}s, beatsLength=${analysisResults.beats.length}`);

          // UNIFIED ANIMATION LOGIC: Use the same logic for all models (BTC and Chord-CNN-LSTM)
          // This ensures consistent behavior across all model types

          let currentBeat = -1;

          if (time < animationRangeStart - PHASE_SWITCH_BUFFER) {
            // PHASE 1: Pre-model context (0.0s to first detected beat)
            // Only animate if there are actual padding cells to animate through
            const paddingCount = chordGridData.paddingCount || 0;
            const shiftCount = chordGridData.shiftCount || 0;

            if (paddingCount > 0) {
              // FIXED: Use actual timestamps from the chord grid instead of recalculating
              // Find the padding cell that should be highlighted based on current time
              let bestPaddingIndex = -1;
              let bestTimeDifference = Infinity;

              for (let i = 0; i < paddingCount; i++) {
                const rawBeatIndex = shiftCount + i;
                if (rawBeatIndex < chordGridData.beats.length && chordGridData.beats[rawBeatIndex] !== null) {
                  const cellTimestamp = chordGridData.beats[rawBeatIndex];

                  if (time >= cellTimestamp) {
                    bestPaddingIndex = i;
                  }

                  // Also check if current time falls within this cell's range
                  const nextRawBeat = shiftCount + i + 1;
                  let nextCellTime = cellTimestamp + (animationRangeStart / paddingCount); // Default estimate

                  if (nextRawBeat < chordGridData.beats.length && chordGridData.beats[nextRawBeat] !== null) {
                    nextCellTime = chordGridData.beats[nextRawBeat];
                  }

                  if (time >= cellTimestamp && time < nextCellTime) {
                    const timeDifference = Math.abs(time - cellTimestamp);
                    if (timeDifference < bestTimeDifference) {
                      bestPaddingIndex = i;
                      bestTimeDifference = timeDifference;
                    }
                  }
                }
              }

              if (bestPaddingIndex !== -1) {
                const finalBeatIndex = shiftCount + bestPaddingIndex;
                updateBeatIndexSafely(finalBeatIndex);
                lastEmitTimeRef.current = time;
              }
            } else {
              // No padding cells, use virtual beat estimation for early animation
              const estimatedBPM = analysisResults?.beatDetectionResult?.bpm || 120;
              const estimatedBeatDuration = 60 / estimatedBPM; // seconds per beat

              // Calculate which virtual beat we should be on
              const rawVirtualBeatIndex = Math.floor(time / estimatedBeatDuration);

              // FIXED: Add shift count to ensure animation starts at first valid musical content
              const shiftCount = chordGridData.shiftCount || 0;
              const virtualBeatIndex = rawVirtualBeatIndex + shiftCount;

              // FIXED: Allow shift cells to be highlighted during virtual beat estimation
              if (chordGridData && chordGridData.chords.length > 0) {
                // Include shift cells in virtual beat animation - they represent valid timing positions
                // All cells (shift, padding, and regular) should be considered for animation

                if (virtualBeatIndex >= 0 && virtualBeatIndex < chordGridData.chords.length) {
                  const chord = chordGridData.chords[virtualBeatIndex] || '';
                  const shiftCount = chordGridData.shiftCount || 0;
                  const paddingCount = chordGridData.paddingCount || 0;

                  // Allow highlighting of shift cells, padding cells, and non-empty regular cells
                  const isShiftCell = virtualBeatIndex < shiftCount;
                  const isPaddingCell = virtualBeatIndex >= shiftCount && virtualBeatIndex < (shiftCount + paddingCount);
                  const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

                  if (isShiftCell || isPaddingCell || !isEmptyCell) {
                    updateBeatIndexSafely(virtualBeatIndex);
                    lastEmitTimeRef.current = time;
                  }
                }
              }
            }
          } else if (time > animationRangeStart + PHASE_SWITCH_BUFFER) {
            // PHASE 2: Model beats (first detected beat onwards)
            // Use ChordGrid's beat array for consistency with click handling

            // Check if we have smart click positioning active
            let useClickPosition = false;
            if (lastClickInfo) {
              const timeSinceClick = Date.now() - lastClickInfo.clickTime;
              const timeDifference = Math.abs(time - lastClickInfo.timestamp);
              const prevTime = prevTimeRef.current;
              const isRewinding = time + 1e-6 < prevTime;

              // Immediate snap for first 200ms to ensure visual reset
              // Extended window to cover seek latency until player time reflects target or rewind is detected
              const withinInitialSnap = timeSinceClick < 200;
              const withinExtendedWindow = timeSinceClick < CLICK_OVERRIDE_WINDOW_MS;
              const playerNotAtTargetYet = timeDifference > 0.25; // YT seek can lag; keep override until close

              if (withinInitialSnap || (withinExtendedWindow && (isRewinding || playerNotAtTargetYet))) {
                updateBeatIndexSafely(lastClickInfo.visualIndex);
                lastEmitTimeRef.current = time;
                useClickPosition = true; // skip normal tracking this frame
              }
            }

            // Only proceed with normal beat tracking if not using click position
            if (!useClickPosition) {

            // ENHANCED STRATEGY: Use originalAudioMapping for precise timing when available
            type ChordGridDataWithMapping = ChordGridData & {
              originalAudioMapping: Array<{
                timestamp: number;
                chord: string;
                visualIndex: number;
              }>;
            };

            const hasOriginalAudioMapping = (data: ChordGridData): data is ChordGridDataWithMapping => {
              return 'originalAudioMapping' in data &&
                     Array.isArray((data as ChordGridDataWithMapping).originalAudioMapping) &&
                     (data as ChordGridDataWithMapping).originalAudioMapping.length > 0;
            };

            if (hasOriginalAudioMapping(chordGridData)) {
              // Use synchronized timing for chord grid
              const syncedTimestamp = timingSyncService.getSyncedTimestamp(time, 'chords');
              const adjustedTime = syncedTimestamp.syncedTime; // eslint-disable-line @typescript-eslint/no-unused-vars
              const animationBpm = analysisResults?.beatDetectionResult?.bpm || 120;
              const originalBeatDuration = Math.round((60 / animationBpm) * 1000) / 1000;

              // Find chord changes to identify segments using CHORD MODEL timestamps for calculation
              const chordChanges: Array<{
                index: number;
                chord: string;
                timestamp: number;
                chordModelTimestamp: number;
              }> = [];

              let lastChord = '';
              chordGridData.originalAudioMapping.forEach((item, index) => {
                if (item.chord !== lastChord) {
                  // Calculate chord model timestamp (starts from 0.0s)
                  const chordModelTimestamp = item.timestamp - firstDetectedBeat;

                  if (chordModelTimestamp >= 0) {
                    chordChanges.push({
                      index,
                      chord: item.chord,
                      timestamp: item.timestamp, // Keep original for animation
                      chordModelTimestamp: chordModelTimestamp // Use for calculation
                    });
                    lastChord = item.chord;
                  }
                }
              });

              // Calculate global speed adjustment using first segment only (once)
              if (globalSpeedAdjustment === null && chordChanges.length >= 2) {
                const firstSegment = chordChanges[0];
                const secondSegment = chordChanges[1];

                const actualDuration = secondSegment.chordModelTimestamp - firstSegment.chordModelTimestamp;
                const expectedDuration = originalBeatDuration;

                if (actualDuration > 0 && expectedDuration > 0) {
                  const newGlobalSpeed = actualDuration / expectedDuration;
                  setGlobalSpeedAdjustment(newGlobalSpeed);
                }
              }

              // Check if current time falls within a segment for animation
              for (let i = 0; i < chordChanges.length - 1; i++) {
                const label1 = chordChanges[i];
                const label2 = chordChanges[i + 1];

                if (time >= label1.timestamp && time <= label2.timestamp) {
                  // Simple animation timing - no per-segment calculation needed
                  // Global speed adjustment is already applied to beatDuration above
                  break;
                }
              }

              // PERFORMANCE OPTIMIZATION: Use binary search for audio mapping
              // This replaces the linear search with O(log n) complexity
              const audioMappingIndex = findCurrentAudioMappingIndex(time, chordGridData.originalAudioMapping);

              if (audioMappingIndex !== -1) {
                currentBeat = audioMappingIndex ;
              }

              if (currentBeat === -1) {
                // Fallback to old method only when originalAudioMapping didn't find a match
                console.log(`🎬 ANIMATION MAPPING: Using fallback visual grid path`, {
                  time: time.toFixed(3),
                  reason: 'originalAudioMapping did not find a match',
                  modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                });

                // ANTI-JITTER: Use hysteresis-based beat tracking to prevent oscillation
                // This eliminates double-blinking by adding stability to beat detection
                currentBeat = findCurrentBeatIndexWithHysteresis(time, chordGridData.beats);

                if (currentBeat === -1) {
                  console.log(`🎬 ANIMATION MAPPING: Binary search fallback - no beat found`, {
                    time: time.toFixed(3),
                    beatsLength: chordGridData.beats.length,
                    modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                  });
                }
              }
            } else {
              console.log(`🎬 ANIMATION MAPPING: No originalAudioMapping available`, {
                time: time.toFixed(3),
                modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
              });
            }

            // ANTI-JITTER: Consolidate ALL state updates into single batch
            // This eliminates multiple renders that can cause visual flickering
            let finalBeatIndex = currentBeat;
            let currentDownbeat = -1;

            // Apply empty cell filtering logic
            if (currentBeat !== -1) {
              const shiftCount = chordGridData.shiftCount || 0;
              const paddingCount = chordGridData.paddingCount || 0;
              const isPreBeatPhase = time < animationRangeStart;
              const chord = chordGridData.chords[currentBeat] || '';
              const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

              // FIXED: Allow shift cells (indices 0 to shiftCount-1) to be highlighted
              // Only prevent highlighting of empty cells that are NOT shift cells
              const isShiftCell = currentBeat < shiftCount;
              const isPaddingCell = currentBeat >= shiftCount && currentBeat < (shiftCount + paddingCount);

              if (isEmptyCell && !isPreBeatPhase && !isShiftCell && !isPaddingCell) {
                // Only block empty cells that are beyond shift and padding ranges
                finalBeatIndex = -1;
              }
            } else {
              // MODEL PHASE: No beat found, set to -1
              finalBeatIndex = -1;
            }

            // Calculate current downbeat
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

            // Stabilize candidate index before emitting
            let stableFinalBeat = finalBeatIndex;
            const lastEmitted = lastEmittedBeatRef.current;
            const prevTime = prevTimeRef.current;
            const isRewinding = time + 1e-6 < prevTime;

            if (!isRewinding && lastEmitted !== -1 && stableFinalBeat !== -1 && stableFinalBeat < lastEmitted) {
              // Enforce non-decreasing progression during forward playback
              stableFinalBeat = lastEmitted;
            }

            if (stableFinalBeat === -1 && lastEmitted !== -1) {
              // Require brief dwell time before turning highlight off to avoid flicker
              if (time - lastEmitTimeRef.current < OFF_DWELL_SECONDS) {
                stableFinalBeat = lastEmitted;
              }
            }

            // PERFORMANCE OPTIMIZATION: Debounce state updates to reduce re-renders
            // Only update state if enough time has passed OR if beat index changed
            const now = Date.now();
            const shouldUpdate =
              (now - lastStateUpdateTimeRef.current >= STATE_UPDATE_INTERVAL) ||
              (currentBeatIndexRef.current !== stableFinalBeat);

            if (shouldUpdate) {
              // ANTI-JITTER: Single consolidated state update with downbeat
              unstable_batchedUpdates(() => {
                if (currentBeatIndexRef.current !== stableFinalBeat) {
                  currentBeatIndexRef.current = stableFinalBeat;
                  setCurrentBeatIndex(stableFinalBeat);
                  lastEmittedBeatRef.current = stableFinalBeat;
                  lastEmitTimeRef.current = time;
                }
                setCurrentDownbeatIndex(currentDownbeat);
              });
              lastStateUpdateTimeRef.current = now;
            }


          }
        } // End of normal beat tracking (if !useClickPosition)
      }

      // PERFORMANCE OPTIMIZATION: Schedule next frame for smooth 60fps updates
      // Only schedule if still playing (checked at start of next frame)
      prevTimeRef.current = time;
      rafRef.current = requestAnimationFrame(updateBeatTracking);
    };

    // Start the animation loop only when playing
    rafRef.current = requestAnimationFrame(updateBeatTracking);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      // Reset frame counter when effect cleanup runs
      frameCounterRef.current = 0;
    };
  // CRITICAL FIX: Include isPlaying to ensure animation starts/stops when playback changes
  // The effect will restart the loop when isPlaying becomes true
  // and cleanup will stop it when isPlaying becomes false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, analysisResults, youtubePlayer, chordGridData, globalSpeedAdjustment, lastClickInfo, currentBeatIndexRef, setCurrentBeatIndex, setCurrentDownbeatIndex, setGlobalSpeedAdjustment, findCurrentBeatIndexWithHysteresis, findCurrentAudioMappingIndex, updateBeatIndexSafely]); // Updated to use centralized beat updates

  return {
    scrollToCurrentBeat,
  };
};
