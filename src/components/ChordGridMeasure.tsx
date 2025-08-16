import React from 'react';
import { formatRomanNumeral } from '@/utils/chordFormatting';
import { ChordCell } from './ChordCell';

export interface MeasureData {
  measureNumber: number;
  chords: string[];
  beats: number[];
  isPickupMeasure?: boolean;
}

export interface ChordGridMeasureProps {
  measure: MeasureData;
  measureIndex: number;
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
 * Measure component for ChordGrid that renders a single measure with its beat cells
 * Handles measure-level styling and beat cell coordination
 */
export const ChordGridMeasure: React.FC<ChordGridMeasureProps> = ({
  measure,
  measureIndex,
  rowIndex,
  timeSignature,
  currentBeatIndex,
  isEditMode,
  editedChords,
  showRomanNumerals,
  romanNumeralData,
  getDisplayChord,
  shouldShowChordLabel,
  getSegmentationColorForBeatIndex,
  handleBeatClick,
  isClickable,
  getChordStyle,
  getDynamicFontSize,
  getGridColumnsClass,
  onChordEdit,
  cellSize,
  isDarkMode,
  beatToChordSequenceMap
}) => {
  return (
    <div
      className="border-l-[3px] border-gray-600 dark:border-gray-400 min-w-0 flex-shrink-0"
      style={{
        paddingLeft: '2px'
      }}
    >
      {/* Chord cells for this measure - consistent grid based on time signature */}
      <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClass()}`}>
        {measure.chords.map((chord, beatIdx) => {
          // Calculate global index with consistent measure layout
          // Each measure always has exactly timeSignature cells
          let globalIndex = 0;

          // Count beats from all previous rows (each measure has timeSignature beats)
          for (let r = 0; r < rowIndex; r++) {
            // Assuming each row has the same number of measures
            // This calculation needs to be adjusted based on the actual row structure
            globalIndex += timeSignature; // This is a simplified calculation
          }

          // Add beats from previous measures in current row
          globalIndex += measureIndex * timeSignature;
          
          // Add current beat index
          globalIndex += beatIdx;

          const isCurrentBeat = currentBeatIndex === globalIndex;
          const isEmpty = chord === '';

          // Get display chord with corrections
          const { chord: displayChord, wasCorrected } = getDisplayChord(chord, globalIndex);

          // Determine if this beat should show a chord label
          const showChordLabel = shouldShowChordLabel(globalIndex);

          // Use hook function for click logic
          const isClickableCell = isClickable(globalIndex, chord);

          // Get segmentation color for this beat
          const segmentationColor = getSegmentationColorForBeatIndex(globalIndex);

          // Get Roman numeral for this chord using chord sequence mapping
          // Only show Roman numeral when chord label is shown (chord changes)
          const chordSequenceIndex = beatToChordSequenceMap[globalIndex];
          const rawRomanNumeral = showRomanNumerals && showChordLabel && romanNumeralData?.analysis && chordSequenceIndex !== undefined
            ? romanNumeralData.analysis[chordSequenceIndex] || ''
            : '';
          const romanNumeral = rawRomanNumeral ? formatRomanNumeral(rawRomanNumeral) : '';

          return (
            <ChordCell
              key={`chord-${globalIndex}`}
                chord={chord}
                globalIndex={globalIndex}
                isCurrentBeat={isCurrentBeat}
                isClickable={isClickableCell}
                cellSize={cellSize}
                isDarkMode={isDarkMode}
                showChordLabel={showChordLabel}
                isEmpty={isEmpty}
                displayChord={displayChord}
                wasCorrected={wasCorrected}
                segmentationColor={segmentationColor}
                onBeatClick={handleBeatClick}
                getChordStyle={getChordStyle}
                getDynamicFontSize={getDynamicFontSize}
                isEditMode={isEditMode}
                editedChord={editedChords?.[globalIndex]}
                onChordEdit={onChordEdit}
                showRomanNumerals={showRomanNumerals}
                romanNumeral={romanNumeral}
              />
          );
        })}
      </div>
    </div>
  );
};

export default ChordGridMeasure;
