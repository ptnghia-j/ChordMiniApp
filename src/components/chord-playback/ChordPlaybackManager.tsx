/**
 * ChordPlaybackManager Component
 *
 * Manages chord playback with pitch shift transposition support.
 * This component must be inside UIProvider to access pitch shift state.
 * It transposes chords when pitch shift is enabled and passes them to useChordPlayback.
 */

import { useEffect, useMemo } from 'react';
import { useChordPlayback } from '@/hooks/chord-playback/useChordPlayback';
import { useTransposedChordData } from '@/hooks/chord-analysis/useTransposedChordData';

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  hasPickupBeats?: boolean;
  pickupBeatsCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface ChordPlaybackManagerProps {
  currentBeatIndex: number;
  chordGridData: ChordGridData | null;
  isPlaying: boolean;
  currentTime: number;
  bpm?: number; // Beats per minute for dynamic timing (optional, defaults to 120)
  onChordPlaybackChange: (chordPlayback: {
    isEnabled: boolean;
    pianoVolume: number;
    guitarVolume: number;
    violinVolume: number;
    fluteVolume: number;
    isReady: boolean;
    togglePlayback: () => void;
    setPianoVolume: (volume: number) => void;
    setGuitarVolume: (volume: number) => void;
    setViolinVolume: (volume: number) => void;
    setFluteVolume: (volume: number) => void;
  }) => void;
}

export const ChordPlaybackManager: React.FC<ChordPlaybackManagerProps> = ({
  currentBeatIndex,
  chordGridData,
  isPlaying,
  currentTime,
  bpm,
  onChordPlaybackChange
}) => {
  // CRITICAL FIX: Apply transposition to chord playback data
  // This hook uses UIContext, so this component must be inside UIProvider
  const { transposedChordGridData } = useTransposedChordData({
    chordGridData
  });

  // Use transposed chords for playback when pitch shift is enabled
  const chordPlayback = useChordPlayback({
    currentBeatIndex,
    chords: transposedChordGridData?.chords || chordGridData?.chords || [],
    beats: transposedChordGridData?.beats || chordGridData?.beats || [],
    isPlaying,
    currentTime,
    bpm // Pass BPM for dynamic timing
  });

  // CRITICAL FIX: Create a stable object reference to prevent infinite re-renders
  // Only create a new object when the VALUES change (not the functions)
  // Functions are stable (useCallback), so we include them in dependencies
  // but they won't cause re-renders because they're memoized
  const stableChordPlayback = useMemo(() => ({
    isEnabled: chordPlayback.isEnabled,
    pianoVolume: chordPlayback.pianoVolume,
    guitarVolume: chordPlayback.guitarVolume,
    violinVolume: chordPlayback.violinVolume,
    fluteVolume: chordPlayback.fluteVolume,
    isReady: chordPlayback.isReady,
    togglePlayback: chordPlayback.togglePlayback,
    setPianoVolume: chordPlayback.setPianoVolume,
    setGuitarVolume: chordPlayback.setGuitarVolume,
    setViolinVolume: chordPlayback.setViolinVolume,
    setFluteVolume: chordPlayback.setFluteVolume
  }), [
    chordPlayback.isEnabled,
    chordPlayback.pianoVolume,
    chordPlayback.guitarVolume,
    chordPlayback.violinVolume,
    chordPlayback.fluteVolume,
    chordPlayback.isReady,
    chordPlayback.togglePlayback,
    chordPlayback.setPianoVolume,
    chordPlayback.setGuitarVolume,
    chordPlayback.setViolinVolume,
    chordPlayback.setFluteVolume
  ]);

  // Always pass the latest stable object to parent
  useEffect(() => {
    onChordPlaybackChange(stableChordPlayback);
  }, [stableChordPlayback, onChordPlaybackChange]);

  // This component doesn't render anything
  return null;
};

