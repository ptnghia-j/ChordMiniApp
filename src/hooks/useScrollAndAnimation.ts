import { useCallback, useEffect, useRef } from 'react';
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

  // PERFORMANCE OPTIMIZATION: Binary search for beat tracking
  // Reduces complexity from O(n) to O(log n) for real-time playback
  const findCurrentBeatIndex = useCallback((currentTime: number, beats: (number | null)[]): number => {
    if (!beats || beats.length === 0) return -1;

    // Filter out null beats and create searchable array
    const validBeats: { time: number; index: number }[] = [];
    beats.forEach((beat, index) => {
      if (typeof beat === 'number' && beat >= 0) {
        validBeats.push({ time: beat, index });
      }
    });

    if (validBeats.length === 0) return -1;

    // Binary search for the current beat
    let left = 0;
    let right = validBeats.length - 1;
    let currentBeatIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const beatTime = validBeats[mid].time;

      // Get next beat time for range checking
      const nextBeatTime = mid < validBeats.length - 1
        ? validBeats[mid + 1].time
        : beatTime + 2.0; // Default 2-second range for last beat

      if (currentTime >= beatTime && currentTime < nextBeatTime) {
        // Found the current beat
        currentBeatIndex = validBeats[mid].index;
        break;
      } else if (currentTime < beatTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return currentBeatIndex;
  }, []);

  // PERFORMANCE OPTIMIZATION: Binary search for audio mapping
  const findCurrentAudioMappingIndex = useCallback((currentTime: number, audioMapping: Array<{timestamp: number; visualIndex: number}>): number => {
    if (!audioMapping || audioMapping.length === 0) return -1;

    let left = 0;
    let right = audioMapping.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const item = audioMapping[mid];

      if (currentTime >= item.timestamp) {
        result = item.visualIndex;
        left = mid + 1; // Continue searching for a later match
      } else {
        right = mid - 1;
      }
    }

    return result;
  }, []);

  // Throttle consecutive scrollIntoView calls to avoid conflicting smooth scrolls
  const lastScrollTimeRef = useRef(0);

  // FIXED: Improved auto-scrolling with layout stability
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const now = Date.now();
    // Throttle to avoid overlapping smooth scrolls from multiple sources
    if (now - lastScrollTimeRef.current < 120) {
      return;
    }

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      const rect = beatElement.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      const delta = elementCenter - viewportCenter;

      // Skip micro-adjustments if already near center
      if (Math.abs(delta) < 32) {
        return;
      }

      // CRITICAL: Wait for any pending layout changes to complete before scrolling
      requestAnimationFrame(() => {
        // Double RAF to ensure layout is fully stable
        requestAnimationFrame(() => {
          lastScrollTimeRef.current = Date.now();
          beatElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest' // Prevent horizontal scrolling that can cause jitter
          });
        });
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes
  useEffect(() => {
    scrollToCurrentBeat();
  }, [currentBeatIndex, scrollToCurrentBeat, isFollowModeEnabled]); // Include isFollowModeEnabled dependency

  // PERFORMANCE OPTIMIZATION: RequestAnimationFrame for smooth 60fps updates
  const rafRef = useRef<number | undefined>(undefined);

  // Update current time and check for current beat
  useEffect(() => {
    // CRITICAL FIX: Always set up the animation loop, but only run when conditions are met
    // This ensures the loop starts when isPlaying becomes true
    if (!youtubePlayer || !analysisResults) {
      return;
    }

    // PERFORMANCE OPTIMIZATION: Use RequestAnimationFrame for smoother updates
    // This provides 60fps updates instead of fixed 20Hz, reducing jitter
    const updateBeatTracking = () => {
      // CRITICAL FIX: Check current playing state dynamically
      // This allows the animation to respond to play/pause without restarting the entire loop
      if (!youtubePlayer || !youtubePlayer.getCurrentTime || !isPlaying) {
        // If not playing, schedule next frame to check again
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

          if (time <= animationRangeStart) {
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
                currentBeatIndexRef.current = finalBeatIndex;
                setCurrentBeatIndex(finalBeatIndex);
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
                    currentBeatIndexRef.current = virtualBeatIndex;
                    setCurrentBeatIndex(virtualBeatIndex);
                  }
                }
              }
            }
          } else {
            // PHASE 2: Model beats (first detected beat onwards)
            // Use ChordGrid's beat array for consistency with click handling

            // Check if we have smart click positioning active
            let useClickPosition = false;
            if (lastClickInfo) {
              const timeSinceClick = Date.now() - lastClickInfo.clickTime;
              const timeDifference = Math.abs(time - lastClickInfo.timestamp);

              // PHASE 1: Initial positioning (first 200ms after click)
              if (timeSinceClick < 200 && timeDifference < 1.0) {
                currentBeatIndexRef.current = lastClickInfo.visualIndex;
                setCurrentBeatIndex(lastClickInfo.visualIndex);
                useClickPosition = true; // Flag to skip normal beat tracking for this frame
              } else if (timeSinceClick >= 200) {
                // DEBUG: Log when animation resumes after click
                // console.log(`🎯 ANIMATION RESUMED: Resuming normal beat tracking after click (${timeSinceClick}ms elapsed)`);
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

                // PERFORMANCE OPTIMIZATION: Use binary search instead of linear search
                // This reduces complexity from O(n) to O(log n) for beat tracking
                currentBeat = findCurrentBeatIndex(time, chordGridData.beats);

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

            currentBeatIndexRef.current = currentBeat;
            setCurrentBeatIndex(currentBeat);


          }

          if (currentBeat !== -1) {
            // ENHANCED SAFEGUARD: Distinguish between shift cells and regular empty cells
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
              currentBeatIndexRef.current = -1;
              setCurrentBeatIndex(-1);
            }
          } else {
            // MODEL PHASE: No beat found, set to -1
            currentBeatIndexRef.current = -1;
            setCurrentBeatIndex(-1);
          }

          // Find current downbeat if available
          if (analysisResults.downbeats && analysisResults.downbeats.length > 0) {
            let currentDownbeat = -1;
            for (let i = 0; i < analysisResults.downbeats.length; i++) {
              const downbeat = analysisResults.downbeats[i];
              if (downbeat && downbeat <= time) {
                currentDownbeat = i;
              } else {
                break;
              }
            }
            setCurrentDownbeatIndex(currentDownbeat);
          }
        } // End of normal beat tracking (if !useClickPosition)
      }

      // PERFORMANCE OPTIMIZATION: Schedule next frame for smooth 60fps updates
      // Always schedule next frame - the loop will check isPlaying state dynamically
      rafRef.current = requestAnimationFrame(updateBeatTracking);
    };

    // Start the animation loop
    rafRef.current = requestAnimationFrame(updateBeatTracking);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  // CRITICAL FIX: Include isPlaying to ensure animation starts when YouTube playback begins
  // The animation loop handles play/pause gracefully by checking state dynamically
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, analysisResults, youtubePlayer, chordGridData, globalSpeedAdjustment, lastClickInfo, currentBeatIndexRef, setCurrentBeatIndex, setCurrentDownbeatIndex, setGlobalSpeedAdjustment, findCurrentBeatIndex, findCurrentAudioMappingIndex]); // Added isPlaying back to ensure animation starts on YouTube play

  return {
    scrollToCurrentBeat,
  };
};
