import { SegmentationResult } from '@/types/chatbotTypes';

export interface SegmentationLayoutMeasure {
  measureNumber: number;
  chords: string[];
  beats: number[];
  visualStartIndex: number;
}

export interface SegmentedBeatCell {
  globalIndex: number;
  chord: string;
  beatTime: number | null;
  measureNumber: number;
  beatInMeasure: number;
  segmentLabel: string;
}

export interface SegmentedSectionRow {
  slots: Array<{ slotIndex: number; cells: Array<SegmentedBeatCell | null> }>;
}

export interface SegmentedSectionBlockLayout {
  label: string;
  rows: SegmentedSectionRow[];
}

export interface SegmentedSlotRenderCell {
  cell: SegmentedBeatCell;
  gridColumnStart?: number;
}

export function getSegmentLabelForTimestamp(
  timestamp: number | null,
  segmentationData?: SegmentationResult | null,
): string | null {
  if (timestamp === null || !segmentationData?.segments?.length) {
    return null;
  }

  const segment = segmentationData.segments.find((entry) => (
    timestamp >= entry.startTime && timestamp <= entry.endTime
  ));

  return segment ? (segment.label || segment.type || null) : null;
}

export function buildSegmentedSectionBlocks(
  measures: SegmentationLayoutMeasure[],
  measuresPerRow: number,
  beatsPerMeasure: number,
  segmentationData?: SegmentationResult | null,
): SegmentedSectionBlockLayout[] {
  if (!measures.length || measuresPerRow <= 0 || beatsPerMeasure <= 0 || !segmentationData?.segments?.length) {
    return [];
  }

  const rowWidth = measuresPerRow * beatsPerMeasure;
  const flattenedCells: Array<Omit<SegmentedBeatCell, 'segmentLabel'> & { rawSegmentLabel: string | null }> = [];

  measures.forEach((measure) => {
    measure.chords.forEach((chord, beatInMeasure) => {
      const rawBeatTime = measure.beats[beatInMeasure];
      const beatTime = Number.isFinite(rawBeatTime) && rawBeatTime >= 0 ? rawBeatTime : null;

      flattenedCells.push({
        globalIndex: measure.visualStartIndex + beatInMeasure,
        chord,
        beatTime,
        measureNumber: measure.measureNumber,
        beatInMeasure,
        rawSegmentLabel: getSegmentLabelForTimestamp(beatTime, segmentationData),
      });
    });
  });

  const nextAvailableLabels = Array<string | null>(flattenedCells.length).fill(null);
  let upcomingLabel: string | null = null;
  for (let index = flattenedCells.length - 1; index >= 0; index -= 1) {
    if (flattenedCells[index].rawSegmentLabel) {
      upcomingLabel = flattenedCells[index].rawSegmentLabel;
    }
    nextAvailableLabels[index] = upcomingLabel;
  }

  const resolvedCells: SegmentedBeatCell[] = [];
  let previousLabel: string | null = null;
  flattenedCells.forEach((cell, index) => {
    const segmentLabel = cell.rawSegmentLabel
      || previousLabel
      || nextAvailableLabels[index]
      || 'Section';

    resolvedCells.push({
      globalIndex: cell.globalIndex,
      chord: cell.chord,
      beatTime: cell.beatTime,
      measureNumber: cell.measureNumber,
      beatInMeasure: cell.beatInMeasure,
      segmentLabel,
    });

    previousLabel = segmentLabel;
  });

  const contiguousBlocks: Array<{ label: string; cells: SegmentedBeatCell[] }> = [];
  resolvedCells.forEach((cell) => {
    const current = contiguousBlocks[contiguousBlocks.length - 1];
    if (current && current.label === cell.segmentLabel) {
      current.cells.push(cell);
    } else {
      contiguousBlocks.push({ label: cell.segmentLabel, cells: [cell] });
    }
  });

  return contiguousBlocks.map((block) => {
    const firstColumn = block.cells[0]?.globalIndex % rowWidth;
    const flatRows: Array<Array<SegmentedBeatCell | null>> = [];
    let currentRow = Array<SegmentedBeatCell | null>(rowWidth).fill(null);
    let currentColumn = firstColumn;

    block.cells.forEach((cell) => {
      if (currentColumn >= rowWidth) {
        flatRows.push(currentRow);
        currentRow = Array<SegmentedBeatCell | null>(rowWidth).fill(null);
        currentColumn = 0;
      }

      currentRow[currentColumn] = cell;
      currentColumn += 1;
    });

    if (currentRow.some(Boolean)) {
      flatRows.push(currentRow);
    }

    return {
      label: block.label,
      rows: flatRows.map((row) => ({
        slots: Array.from({ length: measuresPerRow }, (_, slotIndex) => ({
          slotIndex,
          cells: row.slice(slotIndex * beatsPerMeasure, (slotIndex + 1) * beatsPerMeasure),
        })),
      })),
    };
  });
}

export function getVisibleCellsForSegmentedSlot(
  cells: Array<SegmentedBeatCell | null>,
): SegmentedSlotRenderCell[] {
  const firstActualIndex = cells.findIndex((cell) => cell !== null);
  if (firstActualIndex === -1) {
    return [];
  }

  return cells.reduce<SegmentedSlotRenderCell[]>((visibleCells, cell, index) => {
    if (!cell) {
      return visibleCells;
    }

    visibleCells.push({
      cell,
      gridColumnStart: index === firstActualIndex ? firstActualIndex + 1 : undefined,
    });
    return visibleCells;
  }, []);
}

export function shouldRenderSegmentedSlotMeasureBar(
  cells: Array<SegmentedBeatCell | null>,
): boolean {
  const visibleCells = getVisibleCellsForSegmentedSlot(cells);
  if (visibleCells.length === 0) {
    return false;
  }

  return visibleCells[0].gridColumnStart === undefined || visibleCells[0].gridColumnStart === 1;
}