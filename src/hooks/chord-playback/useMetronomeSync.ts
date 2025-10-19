import { useEffect, useRef, useCallback } from 'react';
import { metronomeService } from '@/services/chord-playback/metronomeService';
import { BeatInfo } from '@/services/audio/beatDetectionService';

interface UseMetronomeSyncProps {
  beats: BeatInfo[];
  downbeats?: number[];
  currentTime: number;
  isPlaying: boolean;
  timeSignature?: number;
  bpm?: number;
  beatTimeRangeStart?: number;
  shiftCount?: number;
  paddingCount?: number;
  chordGridBeats?: (number | null)[];
  audioDuration?: number; // Total duration of the audio for track generation
}

/**
 * PRE-GENERATED TRACK APPROACH: Hook for metronome synchronization using complete audio tracks
 * This approach generates a complete metronome track that plays alongside the main audio
 */
export const useMetronomeSync = ({
  beats: _beats, // eslint-disable-line @typescript-eslint/no-unused-vars
  downbeats: _downbeats = [], // eslint-disable-line @typescript-eslint/no-unused-vars
  currentTime,
  isPlaying,
  timeSignature = 4,
  bpm = 120,
  beatTimeRangeStart: _beatTimeRangeStart = 0, // eslint-disable-line @typescript-eslint/no-unused-vars
  shiftCount: _shiftCount = 0, // eslint-disable-line @typescript-eslint/no-unused-vars
  paddingCount: _paddingCount = 0, // eslint-disable-line @typescript-eslint/no-unused-vars
  chordGridBeats: _chordGridBeats = [], // eslint-disable-line @typescript-eslint/no-unused-vars
  audioDuration = 0
}: UseMetronomeSyncProps) => {
  const isGeneratingTrack = useRef<boolean>(false);
  const lastPlayState = useRef<boolean>(isPlaying);
  const lastCurrentTime = useRef<number>(currentTime);
  const trackGenerationParams = useRef<{ bpm: number; timeSignature: number; duration: number } | null>(null);

  /**
   * PRE-GENERATED TRACK: Generate metronome track when parameters change
   */
  const generateMetronomeTrack = useCallback(async () => {
    if (isGeneratingTrack.current || audioDuration <= 0 || bpm <= 0) {
      return;
    }

    // Check if we need to regenerate the track
    const currentParams = { bpm, timeSignature, duration: audioDuration };
    const lastParams = trackGenerationParams.current;

    if (lastParams &&
        lastParams.bpm === currentParams.bpm &&
        lastParams.timeSignature === currentParams.timeSignature &&
        lastParams.duration === currentParams.duration &&
        metronomeService.hasMetronomeTrack()) {
      return;
    }

    isGeneratingTrack.current = true;

    try {
      const track = await metronomeService.generateMetronomeTrack(audioDuration, bpm, timeSignature);
      if (track) {
        trackGenerationParams.current = currentParams;
      } else {
        console.error('Failed to generate metronome track');
      }
    } catch (error) {
      console.error('Error generating metronome track:', error);
    } finally {
      isGeneratingTrack.current = false;
    }
  }, [audioDuration, bpm, timeSignature]);



  /**
   * PRE-GENERATED TRACK: Handle play/pause state changes
   */
  const handlePlayStateChange = useCallback(() => {
    if (!metronomeService.hasMetronomeTrack()) {
      return;
    }

    if (isPlaying && metronomeService.isMetronomeEnabled()) {
      // Start metronome track playback from current position
      metronomeService.startMetronomeTrack(currentTime);
      // Track started
    } else {
      // Stop metronome track playback
      metronomeService.stopMetronomeTrack();
      // Track stopped
    }
  }, [isPlaying, currentTime]);

  /**
   * PRE-GENERATED TRACK: Handle seeking in the audio
   */
  const handleSeek = useCallback(() => {
    if (!metronomeService.hasMetronomeTrack() || !metronomeService.isMetronomeEnabled()) {
      return;
    }

    // Check if this is a significant seek (more than 1 second difference)
    const timeDiff = Math.abs(currentTime - lastCurrentTime.current);
    if (timeDiff > 1.0) {
      // Seek detected

      if (isPlaying) {
        // Restart playback from new position
        metronomeService.seekMetronomeTrack(currentTime);
      }
    }

    lastCurrentTime.current = currentTime;
  }, [currentTime, isPlaying]);

  // Effect: Generate metronome track when parameters change
  useEffect(() => {
    if (audioDuration > 0 && bpm > 0) {
      generateMetronomeTrack();
    }
  }, [generateMetronomeTrack, audioDuration, bpm]);

  // Effect: Handle play/pause state changes
  useEffect(() => {
    const playStateChanged = isPlaying !== lastPlayState.current;
    if (playStateChanged) {
      lastPlayState.current = isPlaying;
      handlePlayStateChange();
    }
  }, [isPlaying, handlePlayStateChange]);

  // Effect: Handle seeking
  useEffect(() => {
    handleSeek();
  }, [handleSeek]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      metronomeService.stopMetronomeTrack();
    };
  }, []);

  /**
   * ENHANCED: Toggle metronome with current time synchronization
   * This function has access to the current playback time for perfect sync
   */
  const toggleMetronomeWithSync = useCallback(async (): Promise<boolean> => {
    // Ensure track is generated before toggling
    await generateMetronomeTrack();

    return await metronomeService.toggleMetronome(currentTime);
  }, [currentTime, generateMetronomeTrack]);

  return {
    generateMetronomeTrack,
    hasMetronomeTrack: () => metronomeService.hasMetronomeTrack(),
    getTrackDuration: () => metronomeService.getMetronomeTrackDuration(),
    toggleMetronomeWithSync // Expose the synchronized toggle function
  };
};
