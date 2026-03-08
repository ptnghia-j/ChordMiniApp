// Pure synchronization logic for chord-to-beat alignment
// Stateless and independently testable

import type { BeatInfo, ChordDetectionResult } from '@/types/audioAnalysis';

export const DEFAULT_CHORD_ONSET_COMPENSATION_RATIO = 0.25;

export interface ChordSynchronizationOptions {
  onsetCompensationRatio?: number;
}

/**
 * OPTIMIZED: Chord-to-beat alignment using two-pointer technique
 *
 * PERFORMANCE IMPROVEMENT: O(n*m) → O(n+m) where n=chords, m=beats
 * VALIDATION STATUS: Uses quarter-beat compensation for delayed chord onsets
 */
function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  onsetCompensationRatio: number = DEFAULT_CHORD_ONSET_COMPENSATION_RATIO
): { chord: string; beatIndex: number }[] {
  if (chords.length === 0 || beats.length === 0) {
    return [];
  }

  const beatToChordMap = new Map<number, string>();
  let beatIndex = 0; // Two-pointer technique: maintain beat position

  // Two-pointer algorithm - advance both pointers simultaneously
  for (const chord of chords) {
    const chordStart = chord.start;
    const chordName = chord.chord === 'N' ? 'N/C' : chord.chord;

    // Advance to the beat interval that contains the raw chord onset.
    while (
      beatIndex < beats.length - 1 &&
      beats[beatIndex + 1].time <= chordStart
    ) {
      beatIndex++;
    }

    // Apply configurable beat-fraction compensation to account for delayed
    // chord onsets. For example, 0.25 means "pull back by a quarter beat".
    const beatDuration = beatIndex < beats.length - 1
      ? beats[beatIndex + 1].time - beats[beatIndex].time
      : beatIndex > 0
        ? beats[beatIndex].time - beats[beatIndex - 1].time
        : 0;

    const compensatedBeatIndex = (
      beatIndex > 0 &&
      beatDuration > 0 &&
      chordStart - beatDuration * onsetCompensationRatio < beats[beatIndex].time
    )
      ? beatIndex - 1
      : beatIndex;


    // Map this beat to the chord
    beatToChordMap.set(compensatedBeatIndex, chordName);
  }

  // Create synchronized chords by forward-filling chord names
  const synchronizedChords: { chord: string; beatIndex: number }[] = [];
  let lastChord = 'N/C';

  for (let i = 0; i < beats.length; i++) {
    const chordName = beatToChordMap.get(i) || lastChord;
    synchronizedChords.push({ chord: chordName, beatIndex: i });
    lastChord = chordName;
  }

  return synchronizedChords;
}

/**
 * Public API: Pure model output synchronization
 */
export const synchronizeChords = (
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  options: ChordSynchronizationOptions = {}
) => {
  if (chords.length === 0 || beats.length === 0) {
    return [] as { chord: string; beatIndex: number }[];
  }

  return alignChordsToBeatsDirectly(
    chords,
    beats,
    options.onsetCompensationRatio ?? DEFAULT_CHORD_ONSET_COMPENSATION_RATIO
  );
};

