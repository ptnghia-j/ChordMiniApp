import { useCallback, useEffect } from 'react';
import { AnalysisResult } from '@/services/chordRecognitionService';
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
  audioRef: React.RefObject<HTMLAudioElement | null>;
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
    audioRef,
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

  // Function to handle auto-scrolling to the current beat
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      beatElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes
  useEffect(() => {
    scrollToCurrentBeat();
  }, [currentBeatIndex, scrollToCurrentBeat]);

  // Update current time and check for current beat
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !analysisResults) {
      // console.log(`🔄 ANIMATION BLOCKED: audioRef=${!!audioRef.current}, isPlaying=${isPlaying}, analysisResults=${!!analysisResults}`);
      return;
    }

    // Smooth animation for beat alignment (50ms = 20Hz update rate)
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
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

              // FIXED: Only use valid musical content cells for early animation, never shift cells
              if (chordGridData && chordGridData.chords.length > 0) {
                // Skip shift cells entirely - they should never be highlighted
                // Only consider cells that contain actual musical content (padding or regular chords)
                const firstValidCellIndex = chordGridData.shiftCount || 0; // First cell after shift cells

                if (virtualBeatIndex >= firstValidCellIndex && virtualBeatIndex < chordGridData.chords.length) {
                  const chord = chordGridData.chords[virtualBeatIndex] || '';
                  const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

                  if (!isEmptyCell) {
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
            if (lastClickInfo) {
              const timeSinceClick = Date.now() - lastClickInfo.clickTime;
              const timeDifference = Math.abs(time - lastClickInfo.timestamp);

              // PHASE 1: Initial positioning (first 200ms after click)
              if (timeSinceClick < 200 && timeDifference < 1.0) {
                currentBeatIndexRef.current = lastClickInfo.visualIndex;
                setCurrentBeatIndex(lastClickInfo.visualIndex);

                return; // Use click position for initial positioning only
              }
            }

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

              // STRATEGY 1: Look for range match first
              let matchedAudioItem = null;
              for (let i = 0; i < chordGridData.originalAudioMapping.length - 1; i++) {
                const currentItem = chordGridData.originalAudioMapping[i];
                const nextItem = chordGridData.originalAudioMapping[i + 1];

                if (time >= currentItem.timestamp && time < nextItem.timestamp) {
                  matchedAudioItem = currentItem;
                  break;
                }
              }

              // Handle last item
              if (!matchedAudioItem && chordGridData.originalAudioMapping.length > 0) {
                const lastItem = chordGridData.originalAudioMapping[chordGridData.originalAudioMapping.length - 1];
                if (time >= lastItem.timestamp) {
                  matchedAudioItem = lastItem;
                }
              }

              if (matchedAudioItem) {
                currentBeat = matchedAudioItem.visualIndex;
              }

              // STRATEGY 2: If no range match, use forward progression logic
              if (!matchedAudioItem) {
                const currentBeatRef = currentBeatIndexRef.current;

                // If we have a current position and audio time is moving forward
                if (currentBeatRef >= 0 && currentBeatRef < chordGridData.originalAudioMapping.length) {
                  const currentTimestamp = chordGridData.originalAudioMapping[currentBeatRef]?.timestamp || 0; // eslint-disable-line @typescript-eslint/no-unused-vars

                  // Look for the next beat that should be active
                  for (let i = currentBeatRef; i < chordGridData.originalAudioMapping.length; i++) {
                    const item = chordGridData.originalAudioMapping[i];
                    if (time >= item.timestamp) {
                      matchedAudioItem = item;
                    } else {
                      break;
                    }
                  }

                  if (matchedAudioItem) {
                    currentBeat = matchedAudioItem.visualIndex;
                  }
                }
              }

              if (currentBeat === -1) {
                // Fallback to old method only when originalAudioMapping didn't find a match
                console.log(`🎬 ANIMATION MAPPING: Using fallback visual grid path`, {
                  time: time.toFixed(3),
                  reason: 'originalAudioMapping did not find a match',
                  modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                });

                // IMPROVED FALLBACK: Use forward progression logic for visual grid too
                const currentBeatFallback = currentBeatIndexRef.current;

                // STRATEGY 1: Look for range match first
                for (let visualIndex = 0; visualIndex < chordGridData.beats.length; visualIndex++) {
                  const visualTimestamp = chordGridData.beats[visualIndex];

                  // Skip null timestamps
                  if (visualTimestamp === null) continue;

                  const nextVisualTimestamp = visualIndex + 1 < chordGridData.beats.length
                    ? chordGridData.beats[visualIndex + 1]
                    : visualTimestamp + 1; // Default 1-second range for last beat

                  const nextTime = nextVisualTimestamp !== null ? nextVisualTimestamp : visualTimestamp + 1;
                  if (time >= visualTimestamp && time < nextTime) {
                    currentBeat = visualIndex;
                    break;
                  }
                }

                // STRATEGY 2: Forward progression fallback
                if (currentBeat === -1 && currentBeatFallback >= 0 && currentBeatFallback < chordGridData.beats.length) {
                  const currentTimestamp = chordGridData.beats[currentBeatFallback] || 0; // eslint-disable-line @typescript-eslint/no-unused-vars

                  // Look ahead for the next beat that should be active
                  for (let i = currentBeatFallback; i < chordGridData.beats.length; i++) {
                    const beatTimestamp = chordGridData.beats[i];
                    if (beatTimestamp !== null && time >= beatTimestamp) {
                      currentBeat = i;
                    } else {
                      break;
                    }
                  }
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
            // ENHANCED SAFEGUARD: Never allow empty cell highlighting in any phase
            const shiftCount = chordGridData.shiftCount || 0;
            const isPreBeatPhase = time < animationRangeStart;
            const chord = chordGridData.chords[currentBeat] || '';
            const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

            if (isEmptyCell && !isPreBeatPhase && currentBeat >= shiftCount) {
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
        }
      }
    }, 50); // Update at 20Hz for smoother beat tracking

    return () => clearInterval(interval);
  }, [isPlaying, analysisResults, setCurrentTime, audioRef, chordGridData, globalSpeedAdjustment, lastClickInfo, currentBeatIndexRef, setCurrentBeatIndex, setCurrentDownbeatIndex, setGlobalSpeedAdjustment]);

  return {
    scrollToCurrentBeat,
  };
};
