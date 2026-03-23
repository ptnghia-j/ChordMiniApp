// Pure synchronization logic for chord-to-beat alignment
// Stateless and independently testable

import type { BeatInfo, ChordDetectionResult } from '@/types/audioAnalysis';

export const CHORD_SYNCHRONIZATION_VERSION = 2;

const NO_CHORD_VALUES = new Set(['N', 'N/C', 'N.C.', 'NC', '']);

function normalizeChordName(chordName: string | undefined | null): string {
  const trimmed = (chordName || '').trim();
  return NO_CHORD_VALUES.has(trimmed) ? 'N/C' : trimmed;
}

function estimateMedianBeatDuration(beats: BeatInfo[]): number {
  if (beats.length < 2) {
    return 0.5;
  }

  const deltas: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const delta = beats[i].time - beats[i - 1].time;
    if (delta > 0 && Number.isFinite(delta)) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return 0.5;
  }

  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] || 0.5;
}

/**
 * Align beats to the active chord interval instead of forward-filling forever.
 * This preserves explicit silence gaps so a previous chord does not leak across
 * dialogue breaks or cinematic cutaways.
 *
 * PERFORMANCE: O(n + m) via a monotonic chord pointer.
 */
function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
): { chord: string; beatIndex: number }[] {
  if (chords.length === 0 || beats.length === 0) {
    return [];
  }

  const synchronizedChords: { chord: string; beatIndex: number }[] = [];
  const orderedChords = [...chords]
    .filter((chord) => Number.isFinite(chord.start) && Number.isFinite(chord.end) && chord.end > chord.start)
    .sort((a, b) => a.start - b.start);

  if (orderedChords.length === 0) {
    return beats.map((_, beatIndex) => ({ chord: 'N/C', beatIndex }));
  }

  const medianBeatDuration = estimateMedianBeatDuration(beats);
  const onsetLeadIn = medianBeatDuration * 0.35;
  const releaseTail = Math.min(medianBeatDuration * 0.1, 0.08);

  let chordIndex = 0;

  for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
    const beatTime = beats[beatIndex].time;

    while (
      chordIndex < orderedChords.length - 1 &&
      orderedChords[chordIndex + 1].start - onsetLeadIn <= beatTime
    ) {
      chordIndex++;
    }

    const activeChord = orderedChords[chordIndex];
    const chordName =
      activeChord &&
      beatTime >= activeChord.start - onsetLeadIn &&
      beatTime < activeChord.end + releaseTail
        ? normalizeChordName(activeChord.chord)
        : 'N/C';

    synchronizedChords.push({ chord: chordName, beatIndex });
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
