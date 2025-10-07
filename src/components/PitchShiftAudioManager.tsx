/**
 * Pitch Shift Audio Manager Component
 * 
 * Wrapper component that manages pitch shift audio initialization.
 * Must be rendered INSIDE UIProvider to access UIContext.
 */

'use client';

import React from 'react';
import { usePitchShiftAudio } from '@/hooks/usePitchShiftAudio';
import { YouTubePlayer } from '@/types/youtube';

interface PitchShiftAudioManagerProps {
  youtubePlayer: YouTubePlayer | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  firebaseAudioUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
}

/**
 * Component that initializes pitch shift audio management.
 * This component MUST be rendered inside UIProvider.
 */
export const PitchShiftAudioManager: React.FC<PitchShiftAudioManagerProps> = (props) => {
  // Call the hook inside the component (which is inside UIProvider)
  usePitchShiftAudio(props);
  
  // This component doesn't render anything
  return null;
};

export default PitchShiftAudioManager;

