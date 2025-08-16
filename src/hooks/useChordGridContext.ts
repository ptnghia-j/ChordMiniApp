import { useMemo } from 'react';
import { ChordGridState, ChordGridActions } from '@/contexts/ChordGridContext';
import { SegmentationResult } from '@/types/chatbotTypes';

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPickupBeats: boolean;
  pickupBeatsCount: number;
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface UseChordGridContextProps {
  // Core data
  chordGridData: ChordGridData;
  currentBeatIndex: number;
  
  // Optional overrides
  timeSignature?: number;
  isUploadPage?: boolean;
  
  // Event handlers
  onBeatClick?: (beatIndex: number, timestamp: number) => void;
  onChordEdit?: (originalChord: string, newChord: string) => void;
  
  // State setters
  setCurrentBeatIndex?: (index: number) => void;
  setShowCorrectedChords?: (show: boolean) => void;
  setShowRomanNumerals?: (show: boolean) => void;
  setShowSegmentation?: (show: boolean) => void;
  setIsEditMode?: (edit: boolean) => void;
  
  // Data updaters
  updateChordCorrections?: (corrections: Record<string, string> | null) => void;
  updateSequenceCorrections?: (corrections: ChordGridState['sequenceCorrections']) => void;
  updateRomanNumeralData?: (data: ChordGridState['romanNumeralData']) => void;
  updateSegmentationData?: (data: SegmentationResult | null) => void;
}

/**
 * Custom hook that integrates ChordGrid state with existing contexts
 * Provides a unified interface for ChordGrid components while maintaining
 * backward compatibility with existing prop-based interfaces
 */
export const useChordGridContext = ({
  chordGridData,
  currentBeatIndex,
  timeSignature = 4,
  isUploadPage = false,
  onBeatClick,
  onChordEdit,
  setCurrentBeatIndex,
  setShowCorrectedChords,
  setShowRomanNumerals,
  setShowSegmentation,
  setIsEditMode,
  updateChordCorrections,
  updateSequenceCorrections,
  updateRomanNumeralData,
  updateSegmentationData,
}: UseChordGridContextProps) => {
  // For now, we'll use props-based state instead of contexts
  // This ensures compatibility without requiring all contexts to be set up

  // Memoized ChordGrid state using props-based approach
  const chordGridState = useMemo((): ChordGridState => ({
    // Beat and playback state
    currentBeatIndex,
    isPlaying: false, // Will be provided via props when needed

    // Chord correction settings
    showCorrectedChords: false, // Will be provided via props
    chordCorrections: null, // Will be provided via props
    sequenceCorrections: null, // Will be provided via props

    // Grid display preferences
    showRomanNumerals: false, // Will be provided via props
    romanNumeralData: null, // Will be provided via props

    // Segmentation data
    segmentationData: null, // Will be provided via props
    showSegmentation: false, // Will be provided via props

    // Edit mode state
    isEditMode: false, // Will be provided via props
    editedChords: {}, // Will be provided via props

    // Grid layout state
    timeSignature,
    keySignature: null, // Will be provided via props
    isDetectingKey: false, // Will be provided via props

    // Panel state
    isChatbotOpen: false, // Will be provided via props
    isLyricsPanelOpen: false, // Will be provided via props

    // Page context
    isUploadPage,

    // Grid data
    chords: chordGridData.chords,
    beats: chordGridData.beats,
    hasPickupBeats: chordGridData.hasPickupBeats,
    pickupBeatsCount: chordGridData.pickupBeatsCount,
    hasPadding: chordGridData.hasPadding,
    paddingCount: chordGridData.paddingCount,
    shiftCount: chordGridData.shiftCount,
    originalAudioMapping: chordGridData.originalAudioMapping,
  }), [
    currentBeatIndex,
    timeSignature,
    isUploadPage,
    chordGridData,
  ]);

  // Memoized ChordGrid actions
  const chordGridActions = useMemo((): ChordGridActions => ({
    // Beat navigation and interaction
    onBeatClick: onBeatClick || (() => {}),

    // Chord editing
    onChordEdit: onChordEdit || (() => {}),

    // State updates
    setCurrentBeatIndex: setCurrentBeatIndex || (() => {}),
    setShowCorrectedChords: setShowCorrectedChords || (() => {}),
    setShowRomanNumerals: setShowRomanNumerals || (() => {}),
    setShowSegmentation: setShowSegmentation || (() => {}),
    setIsEditMode: setIsEditMode || (() => {}),

    // Correction updates
    updateChordCorrections: updateChordCorrections || (() => {}),
    updateSequenceCorrections: updateSequenceCorrections || (() => {}),
    updateRomanNumeralData: updateRomanNumeralData || (() => {}),
    updateSegmentationData: updateSegmentationData || (() => {}),
  }), [
    onBeatClick,
    onChordEdit,
    setCurrentBeatIndex,
    setShowCorrectedChords,
    setShowRomanNumerals,
    setShowSegmentation,
    setIsEditMode,
    updateChordCorrections,
    updateSequenceCorrections,
    updateRomanNumeralData,
    updateSegmentationData,
  ]);

  return {
    chordGridState,
    chordGridActions,
  };
};
