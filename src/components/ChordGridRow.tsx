import React from 'react';
import { ChordGridMeasure } from './ChordGridMeasure';

export interface MeasureData {
  measureNumber: number;
  chords: string[];
  beats: number[];
  isPickupMeasure?: boolean;
}

export interface ChordGridRowProps {
  measures: MeasureData[];
  rowIndex: number;
  timeSignature: number;
  currentBeatIndex?: number;
  isEditMode?: boolean;
  editedChords?: Record<number, string>;
  showRomanNumerals?: boolean;
  romanNumeralData?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;

  // Function props
  getDisplayChord: (originalChord: string, visualIndex?: number) => { chord: string; wasCorrected: boolean };
  shouldShowChordLabel: (index: number) => boolean;
  getSegmentationColorForBeatIndex: (beatIndex: number) => string | undefined;
  handleBeatClick: (globalIndex: number) => void;
  isClickable: (globalIndex: number, chord: string) => boolean;
  getChordStyle: (chord: string, isCurrentBeat: boolean, beatIndex: number, isClickable: boolean) => string;
  getDynamicFontSize: (chordLength: number) => string;
  getGridColumnsClass: () => string;
  formatRomanNumeral: (romanNumeral: string) => React.ReactElement | string;
  buildBeatToChordSequenceMap: (
    chordsLength: number,
    shiftedChords: string[],
    romanNumeralData: { analysis: string[] } | null,
    sequenceCorrections: { correctedSequence: string[] } | null
  ) => Record<number, number>;
  onChordEdit?: (index: number, newChord: string) => void;
  cellSize: number;
  isDarkMode: boolean;
  beatToChordSequenceMap: Record<number, number>;
}

/**
 * Row component for ChordGrid that renders a row of measures
 * Handles measure grouping and coordination between measures
 */
const ChordGridRowComponent: React.FC<ChordGridRowProps> = ({
  measures,
  rowIndex,
  timeSignature,
  currentBeatIndex,
  isEditMode,
  editedChords,
  showRomanNumerals,
  romanNumeralData,
  sequenceCorrections,
  getDisplayChord,
  shouldShowChordLabel,
  getSegmentationColorForBeatIndex,
  handleBeatClick,
  isClickable,
  getChordStyle,
  getDynamicFontSize,
  getGridColumnsClass,
  formatRomanNumeral,
  buildBeatToChordSequenceMap,
  onChordEdit,
  cellSize,
  isDarkMode,
  beatToChordSequenceMap
}) => {
  return (
    <div className="flex gap-0.5 overflow-x-auto min-w-0">
      {measures.map((measure, measureIdx) => (
        <ChordGridMeasure
          key={`measure-${measure.measureNumber}`}
          measure={measure}
          measureIndex={measureIdx}
          rowIndex={rowIndex}
          timeSignature={timeSignature}
          currentBeatIndex={currentBeatIndex}
          isEditMode={isEditMode}
          editedChords={editedChords}
          showRomanNumerals={showRomanNumerals}
          romanNumeralData={romanNumeralData}
          sequenceCorrections={sequenceCorrections}

          getDisplayChord={getDisplayChord}
          shouldShowChordLabel={shouldShowChordLabel}
          getSegmentationColorForBeatIndex={getSegmentationColorForBeatIndex}
          handleBeatClick={handleBeatClick}
          isClickable={isClickable}
          getChordStyle={getChordStyle}
          getDynamicFontSize={getDynamicFontSize}
          getGridColumnsClass={getGridColumnsClass}
          formatRomanNumeral={formatRomanNumeral}
          buildBeatToChordSequenceMap={buildBeatToChordSequenceMap}
          onChordEdit={onChordEdit}
          cellSize={cellSize}
          isDarkMode={isDarkMode}
          beatToChordSequenceMap={beatToChordSequenceMap}
        />
      ))}
    </div>
  );
};

// Memo comparator: ignore function prop identity; compare only visual-affecting props
const areChordGridRowPropsEqual = (prev: ChordGridRowProps, next: ChordGridRowProps): boolean => {
  if (prev.measures !== next.measures) return false;
  if (prev.rowIndex !== next.rowIndex) return false;
  if (prev.timeSignature !== next.timeSignature) return false;
  if (prev.currentBeatIndex !== next.currentBeatIndex) return false;
  if (prev.isEditMode !== next.isEditMode) return false;
  if (prev.editedChords !== next.editedChords) return false;
  if (prev.showRomanNumerals !== next.showRomanNumerals) return false;
  if (prev.romanNumeralData !== next.romanNumeralData) return false;
  if (prev.sequenceCorrections !== next.sequenceCorrections) return false;
  if (prev.cellSize !== next.cellSize) return false;
  if (prev.isDarkMode !== next.isDarkMode) return false;
  if (prev.beatToChordSequenceMap !== next.beatToChordSequenceMap) return false;
  return true;
};

export const ChordGridRow = React.memo(ChordGridRowComponent, areChordGridRowPropsEqual);
export default ChordGridRow;


