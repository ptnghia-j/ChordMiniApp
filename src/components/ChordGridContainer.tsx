'use client';

import React from 'react';
import ChordGrid from '@/components/ChordGrid';
// import { AnalysisSummary } from '@/components/AnalysisSummary';
import { AnalysisResult } from '@/services/chordRecognitionService';

interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
}

interface ChordGridData {
  chords: string[];
  beats: number[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  hasPickupBeats?: boolean;
  pickupBeatsCount?: number;
  originalAudioMapping?: AudioMappingItem[]; // NEW: Original timestamp-to-chord mapping for audio sync
}

interface ChordGridContainerProps {
  analysisResults: AnalysisResult | null;
  chordGridData: ChordGridData; // Accept comprehensive chord grid data as prop
  currentBeatIndex: number;
  keySignature: string | null;
  isDetectingKey: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  onBeatClick: (beatIndex: number, timestamp: number) => void;
  // Visual indicator for corrected chords
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  // NEW: Enhanced sequence-based corrections
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
}

export const ChordGridContainer: React.FC<ChordGridContainerProps> = ({
  analysisResults,
  chordGridData, // Use the comprehensive chord grid data passed as prop
  currentBeatIndex,
  keySignature,
  isDetectingKey,
  isChatbotOpen,
  isLyricsPanelOpen,
  onBeatClick,
  showCorrectedChords = false,
  chordCorrections = null,
  sequenceCorrections = null
}) => {


  // Use the comprehensive chord grid data passed as prop - no need to generate our own

  return (
    <div>
      {(() => {
        // Debug time signature passing
        const timeSignature = analysisResults?.beatDetectionResult?.time_signature;
        // console.log('=== CHORD GRID CONTAINER TIME SIGNATURE DEBUG ===');
        // console.log('analysisResults?.beatDetectionResult:', analysisResults?.beatDetectionResult);
        // console.log('time_signature value:', timeSignature);
        // console.log('time_signature type:', typeof timeSignature);
        // console.log('=== END CHORD GRID CONTAINER DEBUG ===');

        return (
          <ChordGrid
            chords={chordGridData.chords}
            beats={chordGridData.beats}
            currentBeatIndex={currentBeatIndex}
            timeSignature={timeSignature}
            keySignature={keySignature || undefined}
            isDetectingKey={isDetectingKey}
            isChatbotOpen={isChatbotOpen}
            isLyricsPanelOpen={isLyricsPanelOpen}
            hasPickupBeats={chordGridData.hasPickupBeats}
            pickupBeatsCount={chordGridData.pickupBeatsCount}
            hasPadding={chordGridData.hasPadding}
            paddingCount={chordGridData.paddingCount}
            shiftCount={chordGridData.shiftCount}
            beatTimeRangeStart={analysisResults?.beatDetectionResult?.beat_time_range_start || 0}
            originalAudioMapping={chordGridData.originalAudioMapping}
            onBeatClick={onBeatClick}
            showCorrectedChords={showCorrectedChords}
            chordCorrections={chordCorrections}
            sequenceCorrections={sequenceCorrections}
          />
        );
      })()}
    </div>
  );
};
