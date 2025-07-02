import { timingSyncService } from './timingSyncService';

// Types for the beat tracking engine
interface AnalysisResult {
  chords: Array<{chord: string, time?: number, start?: number}>;
  beats: Array<{time: number, beatNum?: number} | number>;
  downbeats: number[];
  downbeats_with_measures: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel: string;
  chordModel: string;
  audioDuration: number;
  beatDetectionResult: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
  };
}

interface ChordGridData {
  chords: (string | null)[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface ClickInfo {
  visualIndex: number;
  timestamp: number;
  clickTime: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface BeatTrackingState {
  currentBeatIndex: number;
  currentDownbeatIndex: number;
  globalSpeedAdjustment: number | null;
  lastClickInfo: ClickInfo | null;
}

interface BeatTrackingDependencies {
  // Audio element
  audioRef: React.RefObject<HTMLAudioElement>;
  
  // State
  isPlaying: boolean;
  analysisResults: AnalysisResult;
  chordGridData: ChordGridData | null;
  currentBeatIndexRef: React.MutableRefObject<number>;
  globalSpeedAdjustment: number | null;
  lastClickInfo: ClickInfo | null;
  
  // State setters
  setCurrentTime: (time: number) => void;
  setCurrentBeatIndex: (index: number) => void;
  setCurrentDownbeatIndex: (index: number) => void;
  setGlobalSpeedAdjustment: (adjustment: number | null) => void;
  setLastClickInfo: (info: ClickInfo | null) => void;
}

// Type guard for chord grid data with original audio mapping
interface ChordGridDataWithMapping extends ChordGridData {
  originalAudioMapping: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

/**
 * Check if chord grid data has original audio mapping
 * Lines 2152-2158 from original component
 */
const hasOriginalAudioMapping = (data: unknown): data is ChordGridDataWithMapping => {
  return typeof data === 'object' &&
         data !== null &&
         'originalAudioMapping' in data &&
         Array.isArray((data as ChordGridDataWithMapping).originalAudioMapping) &&
         (data as ChordGridDataWithMapping).originalAudioMapping.length > 0;
};

/**
 * Multi-phase beat tracking algorithm with click handling, pre-beat animation, and model-based tracking
 * Lines 1884-2513 from original component
 */
export const createBeatTrackingInterval = (deps: BeatTrackingDependencies): (() => void) => {
  const {
    audioRef,
    isPlaying,
    analysisResults,
    chordGridData,
    currentBeatIndexRef,
    globalSpeedAdjustment,
    lastClickInfo,
    setCurrentTime,
    setCurrentBeatIndex,
    setCurrentDownbeatIndex,
    setGlobalSpeedAdjustment,
    setLastClickInfo
  } = deps;

  const interval = setInterval(() => {
    if (audioRef.current && isPlaying) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);

      // Find the current beat based on chord grid data (includes pickup beats)
      // This ensures consistency between beat tracking and chord display
      if (chordGridData && chordGridData.chords.length > 0) {

        // SMART CLICK HANDLING: Use click as starting point, then allow natural progression
        if (lastClickInfo) {
          const timeSinceClick = Date.now() - lastClickInfo.clickTime;
          const timeDifference = Math.abs(time - lastClickInfo.timestamp);

          // PHASE 1: Initial positioning (first 200ms after click)
          if (timeSinceClick < 200 && timeDifference < 1.0) {
            currentBeatIndexRef.current = lastClickInfo.visualIndex;
            setCurrentBeatIndex(lastClickInfo.visualIndex);
            return; // Use click position for initial positioning only
          }

          // PHASE 2: Natural progression with click awareness (200ms - 4000ms)
          if (timeSinceClick < 4000) {
            // Allow natural progression but prevent backward jumps from click position
            // Continue with automatic calculation but apply minimum constraint
            // Don't return here - let automatic calculation run with constraint
          } else {
            // Clear old click info after 4 seconds
            setLastClickInfo(null);
          }
        }

        let currentBeat = -1;

        const beatTimeRangeStart = analysisResults?.beatDetectionResult?.beat_time_range_start || 0;
        // Handle both old format (objects with .time) and new format (direct numbers)
        // FIXED: Find first non-null beat instead of just beats[0]
        let firstDetectedBeat = beatTimeRangeStart;
        if (analysisResults.beats.length > 0) {
          for (const beat of analysisResults.beats) {
            const beatTime = typeof beat === 'object' ? beat?.time : beat;
            if (beatTime !== null && beatTime !== undefined) {
              firstDetectedBeat = beatTime;
              break;
            }
          }
        }

        // FIXED: Use first detected beat time for animation timing to align with actual beat model output
        // This accounts for the offset between chord model start (0.0s) and first beat detection (e.g., 0.534s)
        const animationRangeStart = firstDetectedBeat;

        // UNIFIED ANIMATION LOGIC: Use the same logic for all models (BTC and Chord-CNN-LSTM)
        // This ensures consistent behavior across all model types

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

            // Search through padding cells (shift cells + padding cells)
            for (let i = 0; i < paddingCount; i++) {
              const rawBeat = shiftCount + i;
              const cellTimestamp = chordGridData.beats[rawBeat];

              if (cellTimestamp !== null && cellTimestamp !== undefined) {
                const timeDifference = Math.abs(time - cellTimestamp);

                // Find the cell with timestamp closest to current time
                if (timeDifference < bestTimeDifference) {
                  bestTimeDifference = timeDifference;
                  bestPaddingIndex = i;
                }

                // Also check if current time falls within this cell's range
                const nextRawBeat = shiftCount + i + 1;
                let nextCellTime = cellTimestamp + (animationRangeStart / paddingCount); // Default estimate

                if (nextRawBeat < chordGridData.beats.length && chordGridData.beats[nextRawBeat] !== null) {
                  nextCellTime = chordGridData.beats[nextRawBeat];
                }

                // If current time falls within this cell's range, prefer this
                if (time >= cellTimestamp && time < nextCellTime) {
                  bestPaddingIndex = i;
                  bestTimeDifference = timeDifference;
                  break;
                }
              }
            }

            if (bestPaddingIndex !== -1) {
              const rawBeat = shiftCount + bestPaddingIndex;

              // Verify this is a valid padding cell
              if (rawBeat >= shiftCount && rawBeat < (shiftCount + paddingCount)) {
                currentBeat = rawBeat;
              } else {
                currentBeat = -1;
              }
            } else {
              currentBeat = -1;
            }
          } else {
            // ENHANCED: Even without padding, provide visual feedback using estimated tempo
            // This ensures users see progress indication from the very start of playback
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

              if (virtualBeatIndex >= firstValidCellIndex) {
                // Calculate the target cell, but ensure it's not a shift cell
                let targetIndex = virtualBeatIndex;

                // If the calculated index falls in shift cell range, move to first valid cell
                if (targetIndex < firstValidCellIndex) {
                  targetIndex = firstValidCellIndex;
                }

                // Ensure we don't exceed the grid bounds
                const maxIndex = chordGridData.chords.length - 1;
                const clampedIndex = Math.min(targetIndex, maxIndex);

                // Only set currentBeat if the target cell is valid (not a shift cell)
                if (clampedIndex >= firstValidCellIndex) {
                  currentBeat = clampedIndex;
                } else {
                  currentBeat = -1;
                }
              } else {
                currentBeat = -1;
              }
            } else {
              currentBeat = -1;
            }
          }

          // PADDING PHASE: Apply shift cell blocking before setting the beat
          if (currentBeat !== -1) {
            const shiftCount = chordGridData.shiftCount || 0;
            const chord = chordGridData.chords[currentBeat] || '';
            const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

            // CRITICAL: Block shift cells in pre-beat phase too (check shift cells first)
            if (currentBeat < shiftCount) {
              currentBeat = -1;
            }
            // Then check for empty/undefined cells (but NOT N.C. - that's valid musical content)
            else if (isEmptyCell) {
              currentBeat = -1;
            }
          }

          // Apply click-aware minimum constraint for PADDING PHASE too
          let finalBeatIndex = currentBeat;
          if (lastClickInfo && currentBeat !== -1) {
            const timeSinceClick = Date.now() - lastClickInfo.clickTime;
            if (timeSinceClick >= 200 && timeSinceClick < 4000) {
              const minAllowedBeat = lastClickInfo.visualIndex;
              if (currentBeat < minAllowedBeat) {
                finalBeatIndex = minAllowedBeat;
              }
            }
          }

          currentBeatIndexRef.current = finalBeatIndex;
          setCurrentBeatIndex(finalBeatIndex);
        } else {
          // PHASE 2: Model beats (first detected beat onwards)
          // Use ChordGrid's beat array for consistency with click handling

          // FIXED: Use original audio mapping for accurate audio-to-visual sync
          // Instead of searching through shifted visual grid, use the preserved original timestamp mappings

          let bestVisualIndex = -1;
          let bestTimeDifference = Infinity;

          // Check if we have original audio mapping (comprehensive strategy)
          if (hasOriginalAudioMapping(chordGridData)) {
            // SIMPLIFIED ADAPTIVE SYNC: Calculate speed adjustment once for first segment, use globally
            // Use synchronized timing for chord grid
            const syncedTimestamp = timingSyncService.getSyncedTimestamp(time, 'chords');
            const adjustedTime = syncedTimestamp.syncedTime;
            const animationBpm = analysisResults?.beatDetectionResult?.bpm || 120;
            const originalBeatDuration = Math.round((60 / animationBpm) * 1000) / 1000;

            // Find chord changes to identify segments using CHORD MODEL timestamps for calculation
            const chordChanges: { index: number; chord: string; timestamp: number; chordModelTimestamp: number }[] = [];
            let lastChord = '';

            chordGridData.originalAudioMapping.forEach((item, index) => {
              if (item.chord !== lastChord) {
                // Find the original chord model timestamp for this chord
                let chordModelTimestamp = item.timestamp; // Default to current timestamp

                if (analysisResults.chords && analysisResults.chords.length > 0) {
                  const matchingChord = analysisResults.chords.find(chord =>
                    chord.chord === item.chord &&
                    Math.abs((chord.start || chord.time || 0) - item.timestamp) < 2.0 // Within 2 seconds tolerance
                  );

                  if (matchingChord) {
                    chordModelTimestamp = matchingChord.start || matchingChord.time || item.timestamp; // Use chord model start time for calculation
                  }
                }

                chordChanges.push({
                  index,
                  chord: item.chord,
                  timestamp: item.timestamp, // Keep original for animation
                  chordModelTimestamp: chordModelTimestamp // Use for calculation
                });
                lastChord = item.chord;
              }
            });

            // Calculate speed adjustment only for the FIRST segment, then use globally
            if (globalSpeedAdjustment === null && chordChanges.length >= 2) {
              const label1 = chordChanges[0]; // First chord change
              const label2 = chordChanges[1]; // Second chord change

              // Calculate expected vs actual cells using CHORD MODEL timestamps
              const chordModelDuration = label2.chordModelTimestamp - label1.chordModelTimestamp;
              const expectedCells = chordModelDuration / originalBeatDuration;
              const actualCells = label2.index - label1.index;
              const cellDiff = expectedCells - actualCells;

              if (Math.abs(cellDiff) > 0.5 && cellDiff > 0.5) {
                // Calculate new global speed
                const speedupCells = Math.round(cellDiff);
                const adjustedCells = actualCells + speedupCells;
                const newGlobalSpeed = (originalBeatDuration * adjustedCells) / actualCells;

                setGlobalSpeedAdjustment(newGlobalSpeed);
              }
            }

            // IMPROVED: Use forward progression logic instead of closest timestamp
            // This prevents backward jumps when audio time exceeds available timestamps
            let matchedAudioItem = null;

            // STRATEGY 1: Look for range match first (most accurate)
            for (let i = 0; i < chordGridData.originalAudioMapping.length; i++) {
              const audioItem = chordGridData.originalAudioMapping[i];
              const nextAudioItem = chordGridData.originalAudioMapping[i + 1];
              const nextBeatTime = nextAudioItem ? nextAudioItem.timestamp : audioItem.timestamp + 0.5;

              // If adjusted time falls within this beat's range, use this position
              if (adjustedTime >= audioItem.timestamp && adjustedTime < nextBeatTime) {
                matchedAudioItem = audioItem;
                break; // Range match is most accurate
              }
            }

            // STRATEGY 2: If no range match, use forward progression logic
            if (!matchedAudioItem) {
              const currentBeat = currentBeatIndexRef.current;

              // If we have a current position and audio time is moving forward
              if (currentBeat >= 0 && currentBeat < chordGridData.originalAudioMapping.length) {
                const currentTimestamp = chordGridData.originalAudioMapping[currentBeat]?.timestamp || 0;

                // If audio time is ahead of current position, look for next logical position
                if (adjustedTime > currentTimestamp) {
                  // Find the next position that makes sense
                  for (let i = currentBeat; i < chordGridData.originalAudioMapping.length; i++) {
                    const audioItem = chordGridData.originalAudioMapping[i];
                    if (audioItem.timestamp >= currentTimestamp) {
                      matchedAudioItem = audioItem;
                      break;
                    }
                  }
                }
              }

              // STRATEGY 3: Fallback to closest match only if forward progression fails
              if (!matchedAudioItem) {
                for (let i = 0; i < chordGridData.originalAudioMapping.length; i++) {
                  const audioItem = chordGridData.originalAudioMapping[i];
                  const timeDifference = Math.abs(adjustedTime - audioItem.timestamp);

                  if (timeDifference < bestTimeDifference) {
                    bestTimeDifference = timeDifference;
                    matchedAudioItem = audioItem;
                  }
                }
              }
            }

            // FIXED: Now find the visual position where this chord appears
            if (matchedAudioItem) {
              // IMPROVED: Find the visual position that corresponds to this audio mapping entry
              // Use the visualIndex from the audio mapping if available, otherwise search by chord
              if (matchedAudioItem.visualIndex !== undefined && matchedAudioItem.visualIndex >= 0) {
                bestVisualIndex = matchedAudioItem.visualIndex;
              } else {
                // Fallback: Search through the visual grid to find where this chord appears
                for (let visualIndex = 0; visualIndex < chordGridData.chords.length; visualIndex++) {
                  const visualChord = chordGridData.chords[visualIndex];
                  if (visualChord === matchedAudioItem.chord && visualChord !== '' && visualChord !== 'N.C.') {
                    bestVisualIndex = visualIndex;
                    break; // Use first occurrence of this chord in visual grid
                  }
                }
              }
            }

            if (bestVisualIndex === -1) {
              // Fallback to old method only when originalAudioMapping didn't find a match
              console.log(`🎬 ANIMATION MAPPING: Using fallback visual grid path`, {
                time: time.toFixed(3),
                reason: 'originalAudioMapping did not find a match',
                modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM'
              });

              // IMPROVED FALLBACK: Use forward progression logic for visual grid too
              const currentBeat = currentBeatIndexRef.current;

              // STRATEGY 1: Look for range match first
              for (let visualIndex = 0; visualIndex < chordGridData.beats.length; visualIndex++) {
                const visualTimestamp = chordGridData.beats[visualIndex];

                // Skip null timestamps (shift cells)
                if (visualTimestamp === null || visualTimestamp === undefined) {
                  continue;
                }

                // Check if current time falls within this beat's range
                const nextVisualIndex = visualIndex + 1;
                let nextBeatTime = visualTimestamp + 0.5; // Default estimate

                // Find the next valid timestamp for range checking
                for (let j = nextVisualIndex; j < chordGridData.beats.length; j++) {
                  if (chordGridData.beats[j] !== null && chordGridData.beats[j] !== undefined) {
                    nextBeatTime = chordGridData.beats[j] as number; // Safe cast since we checked for null/undefined
                    break;
                  }
                }

                // If current time falls within this beat's range, use this position
                if (time >= visualTimestamp && time < nextBeatTime) {
                  bestVisualIndex = visualIndex;
                  break; // Range match is most accurate
                }
              }

              // STRATEGY 2: If no range match and we have current position, use forward progression
              if (bestVisualIndex === -1 && currentBeat >= 0) {
                const currentTimestamp = chordGridData.beats[currentBeat];

                // If audio time is ahead of current position, look forward
                if (currentTimestamp && time > currentTimestamp) {
                  for (let visualIndex = currentBeat; visualIndex < chordGridData.beats.length; visualIndex++) {
                    const visualTimestamp = chordGridData.beats[visualIndex];
                    if (visualTimestamp !== null && visualTimestamp !== undefined && visualTimestamp >= currentTimestamp) {
                      bestVisualIndex = visualIndex;
                      break;
                    }
                  }
                }
              }

              // STRATEGY 3: Final fallback to closest match only if forward progression fails
              if (bestVisualIndex === -1) {
                for (let visualIndex = 0; visualIndex < chordGridData.beats.length; visualIndex++) {
                  const visualTimestamp = chordGridData.beats[visualIndex];

                  // Skip null timestamps (shift cells)
                  if (visualTimestamp === null || visualTimestamp === undefined) {
                    continue;
                  }

                  // Calculate how close this visual cell's timestamp is to the current audio time
                  const timeDifference = Math.abs(time - visualTimestamp);

                  // Find the visual cell with the closest timestamp to current audio time
                  if (timeDifference < bestTimeDifference) {
                    bestTimeDifference = timeDifference;
                    bestVisualIndex = visualIndex;
                  }
                }
              }
            }

            if (bestVisualIndex !== -1) {
              currentBeat = bestVisualIndex;

              // Add calibration data if we have high confidence and a valid timestamp
              if (syncedTimestamp.confidence > 0.7 && chordGridData.beats[bestVisualIndex]) {
                const expectedTime = chordGridData.beats[bestVisualIndex];
                if (typeof expectedTime === 'number') {
                  timingSyncService.addCalibrationPoint(time, expectedTime, adjustedTime);
                }
              }
            }
          } // Close the originalAudioMapping check
          else {
            console.log(`🎬 ANIMATION MAPPING: No originalAudioMapping available`, {
              time: time.toFixed(3),
              modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM'
            });
          }
        }

        if (currentBeat !== -1) {
          // ENHANCED SAFEGUARD: Never allow empty cell highlighting in any phase
          const shiftCount = chordGridData.shiftCount || 0;
          const isPreBeatPhase = time < animationRangeStart;
          const chord = chordGridData.chords[currentBeat] || '';
          const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

          // CRITICAL FIX: Block shift cells FIRST (most important check)
          // Shift cells should never be animated as they don't represent musical content
          if (currentBeat < shiftCount) {
            currentBeat = -1; // Block all shift cell highlighting
          }
          // FIXED: Never highlight empty cells (greyed-out cells) in any phase
          // Empty cells should never be animated as they don't represent musical content
          // NOTE: N.C. is valid musical content and should be highlighted
          else if (isEmptyCell) {
            currentBeat = -1; // Block all empty cell highlighting
          }
          // Check if this beat has a null timestamp (should not happen for valid cells after shift filtering)
          else if (chordGridData.beats[currentBeat] === null || chordGridData.beats[currentBeat] === undefined) {
            // During pre-beat phase, we might have estimated positions without timestamps
            if (!isPreBeatPhase) {
              currentBeat = -1; // Don't highlight cells with null timestamps during model phase
            }
            // During pre-beat phase, allow highlighting cells with null timestamps if they're valid musical content
          }

          // Apply click-aware minimum constraint if we're in the progression phase
          let finalBeatIndex = currentBeat;
          if (lastClickInfo && currentBeat !== -1) {
            const timeSinceClick = Date.now() - lastClickInfo.clickTime;
            if (timeSinceClick >= 200 && timeSinceClick < 4000) {
              const minAllowedBeat = lastClickInfo.visualIndex;
              if (currentBeat < minAllowedBeat) {
                finalBeatIndex = minAllowedBeat;
              }
            }
          }

          currentBeatIndexRef.current = finalBeatIndex;
          setCurrentBeatIndex(finalBeatIndex);
        } else {
          // MODEL PHASE: No beat found, set to -1
          currentBeatIndexRef.current = -1;
          setCurrentBeatIndex(-1);
        }

        // Find current downbeat if available
        const downbeats = analysisResults.downbeats || [];
        if (downbeats && downbeats.length > 0 && downbeats.findIndex) {
          const currentDownbeat = downbeats.findIndex(
            (beatTime, index) => time >= beatTime &&
            (index === (downbeats && downbeats.length ? downbeats.length - 1 : 0) ||
             (downbeats && index + 1 < downbeats.length && time < downbeats[index + 1]))
          );

          if (currentDownbeat !== -1) {
            setCurrentDownbeatIndex(currentDownbeat);
          }
        }
      }
    }
  }, 50); // Update at 20Hz for smoother beat tracking

  return () => clearInterval(interval);
};
