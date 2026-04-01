import { AnalysisResult as ChordRecognitionAnalysisResult } from '@/services/chord-analysis/chordRecognitionService';

export interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number;
}

export interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
  originalAudioMapping?: AudioMappingItem[];
}

export interface VisualCompactionWindow {
  startIndex: number;
  endIndex: number;
  targetModulo?: number;
  mode?: 'shrink_only' | 'expand_only';
  source?: 'gap' | 'silence' | 'tempo' | 'leading_silence';
}

export type GridAnalysisResult = ChordRecognitionAnalysisResult | {
  chords?: Array<{ chord: string; time: number; start?: number; end?: number }>;
  beats: Array<{ time: number; beatNum?: number }> | number[];
  downbeats?: number[];
  downbeats_with_measures?: number[];
  synchronizedChords: Array<{ chord: string; beatIndex: number; beatNum?: number }>;
  beatModel?: string;
  chordModel?: string;
  audioDuration?: number;
  beatDetectionResult?: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
    paddingCount?: number;
    shiftCount?: number;
  };
};
