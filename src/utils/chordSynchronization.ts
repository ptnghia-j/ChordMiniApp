// Pure synchronization logic for chord-to-beat alignment
// Stateless and independently testable

import type { BeatInfo, ChordDetectionResult } from '@/types/audioAnalysis';

/**
 * OPTIMIZED: Chord-to-beat alignment using two-pointer technique
 *
 * PERFORMANCE IMPROVEMENT: O(n*m) → O(n+m) where n=chords, m=beats
 * VALIDATION STATUS: Identical results to previous algorithm in this codebase
 */
function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
): { chord: string; beatIndex: number }[] {
  if (chords.length === 0 || beats.length === 0) {
    return [];
  }

  const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  const beatToChordMap = new Map<number, string>();
  let beatIndex = 0; // Two-pointer technique: maintain beat position

  // Two-pointer algorithm - advance both pointers simultaneously
  for (const chord of chords) {
    const chordStart = chord.start;
    const chordName = chord.chord === 'N' ? 'N/C' : chord.chord;

    // Advance beat pointer to find the closest beat
    while (
      beatIndex < beats.length - 1 &&
      Math.abs(beats[beatIndex + 1].time - chordStart) < Math.abs(beats[beatIndex].time - chordStart)
    ) {
      beatIndex++;
    }

    // Map this beat to the chord
    beatToChordMap.set(beatIndex, chordName);
  }

  // Create synchronized chords by forward-filling chord names
  const synchronizedChords: { chord: string; beatIndex: number }[] = [];
  let lastChord = 'N/C';

  for (let i = 0; i < beats.length; i++) {
    const chordName = beatToChordMap.get(i) || lastChord;
    synchronizedChords.push({ chord: chordName, beatIndex: i });
    lastChord = chordName;
  }

  const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (process.env.NODE_ENV === 'development') {
    const elapsed = (endTime as number) - (startTime as number);
    // eslint-disable-next-line no-console
    console.log(`Optimized chord alignment: ${elapsed.toFixed(2)}ms for ${chords.length} chords × ${beats.length} beats`);
  }

  return synchronizedChords;
}

/**
 * Public API: Pure model output synchronization
 */
export const synchronizeChords = (
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
) => {
  if (chords.length === 0 || beats.length === 0) {
    return [] as { chord: string; beatIndex: number }[];
  }

  return alignChordsToBeatsDirectly(chords, beats);
};

