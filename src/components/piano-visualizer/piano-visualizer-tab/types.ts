import type { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { SheetSageResult } from '@/types/sheetSage';

export interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

export interface SequenceCorrectionKeySection {
  startIndex: number;
  endIndex: number;
  key: string;
  chords: string[];
}

export interface SequenceCorrectionModulation {
  fromKey: string;
  toKey: string;
  atIndex: number;
  atTime?: number;
}

export interface SequenceCorrections {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: SequenceCorrectionKeySection[];
    modulations?: SequenceCorrectionModulation[];
  };
}

export interface PianoVisualizerTabProps {
  analysisResults?: AnalysisResult | null;
  chordGridData: ChordGridData;
  className?: string;
  keySignature?: string | null;
  isDetectingKey?: boolean;
  isChatbotOpen?: boolean;
  isLyricsPanelOpen?: boolean;
  isUploadPage?: boolean;
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrections | null;
  segmentationData?: SegmentationResult | null;
  currentTime?: number;
  isPlaying?: boolean;
  isChordPlaybackEnabled?: boolean;
  currentBeatIndex?: number;
  audioUrl?: string | null;
  sheetSageResult?: SheetSageResult | null;
  showMelodicOverlay?: boolean;
}

export type VisualizerDisplayMode = 'piano-roll' | 'sheet-music';
