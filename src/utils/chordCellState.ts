/**
 * Derives the final interaction/visual state for each chord-grid cell.
 *
 * `originalAudioMapping` is the source of truth whenever it exists: a mapped
 * visual index represents a real audio beat, even when its chord is `N.C.`.
 * Layout padding is only a fallback for legacy grids that do not have that
 * mapping yet.
 */
export interface ChordCellAudioMapping {
  visualIndex: number;
  chord?: string;
}

export interface ChordCellStates {
  disabledCellIndices: ReadonlySet<number>;
  disabledCellCount: number;
}

export function buildChordCellStates(
  cellCount: number,
  originalAudioMapping?: readonly ChordCellAudioMapping[],
  fallbackLeadingDisabledCellCount: number = 0,
): ChordCellStates {
  const mappedCellIndices = new Set<number>();

  originalAudioMapping?.forEach(({ visualIndex, chord }) => {
    const isExplicitlyEmpty = typeof chord === 'string' && (!chord.trim() || chord === 'undefined');
    if (!isExplicitlyEmpty && Number.isInteger(visualIndex) && visualIndex >= 0 && visualIndex < cellCount) {
      mappedCellIndices.add(visualIndex);
    }
  });

  const useAudioMapping = mappedCellIndices.size > 0;
  const disabledCellIndices = new Set<number>();

  for (let index = 0; index < cellCount; index += 1) {
    const isDisabled = useAudioMapping
      ? !mappedCellIndices.has(index)
      : index < fallbackLeadingDisabledCellCount;

    if (isDisabled) {
      disabledCellIndices.add(index);
    }
  }

  return {
    disabledCellIndices,
    disabledCellCount: disabledCellIndices.size,
  };
}
