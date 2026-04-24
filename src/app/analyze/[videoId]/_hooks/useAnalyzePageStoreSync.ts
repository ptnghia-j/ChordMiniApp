import { useEffect } from 'react';
import { useAnalysisStore } from '@/stores/analysisStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUIStore } from '@/stores/uiStore';
import type { UseAnalyzePageStoreSyncParams } from '../_types/analyzePageViewModel';

export function useAnalyzePageStoreSync({
  analysisResults,
  audioProcessingState,
  cacheAvailable,
  cacheCheckCompleted,
  cacheCheckInProgress,
  keySignature,
  isDetectingKey,
  chordCorrections,
  showCorrectedChords,
  beatDetector,
  chordDetector,
  modelsInitialized,
  lyrics,
  showLyrics,
  hasCachedLyrics,
  isTranscribingLyrics,
  lyricsError,
  videoTitle,
  showSegmentation,
  isChatbotOpen,
  isLyricsPanelOpen,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  youtubePlayer,
  audioRef,
  isVideoMinimized,
  isFollowModeEnabled,
}: UseAnalyzePageStoreSyncParams) {
  useEffect(() => {
    const analysisStore = useAnalysisStore.getState();
    const uiStore = useUIStore.getState();
    const playbackStore = usePlaybackStore.getState();

    analysisStore.setAnalysisResults(analysisResults);
    analysisStore.setIsAnalyzing(audioProcessingState.isAnalyzing);
    analysisStore.setAnalysisError(audioProcessingState.error || null);
    analysisStore.setCacheAvailable(cacheAvailable);
    analysisStore.setCacheCheckCompleted(cacheCheckCompleted);
    analysisStore.setCacheCheckInProgress(cacheCheckInProgress);
    analysisStore.setKeySignature(keySignature);
    analysisStore.setIsDetectingKey(isDetectingKey);
    analysisStore.setChordCorrections(chordCorrections);
    analysisStore.setShowCorrectedChords(showCorrectedChords);
    analysisStore.setBeatDetector(beatDetector);
    analysisStore.setChordDetector(chordDetector);
    analysisStore.setModelsInitialized(modelsInitialized);
    analysisStore.setLyrics(lyrics);
    analysisStore.setShowLyrics(showLyrics);
    analysisStore.setHasCachedLyrics(hasCachedLyrics);
    analysisStore.setIsTranscribingLyrics(isTranscribingLyrics);
    analysisStore.setLyricsError(lyricsError);

    uiStore.setVideoTitle(videoTitle);
    uiStore.setShowSegmentation(showSegmentation);
    uiStore.setIsChatbotOpen(isChatbotOpen);
    uiStore.setIsLyricsPanelOpen(isLyricsPanelOpen);
    const noteName = keySignature ? keySignature.split(' ')[0] : 'C';
    uiStore.initializeOriginalKey(noteName);
    uiStore.initializeFirebaseAudioAvailable(!!audioProcessingState.audioUrl);

    playbackStore.setIsPlaying(isPlaying);
    playbackStore.setCurrentTime(currentTime);
    playbackStore.setDuration(duration);
    playbackStore.setPlaybackRate(playbackRate);
    playbackStore.setYoutubePlayer(youtubePlayer);
    playbackStore.setAudioRef(audioRef as never);
    playbackStore.setIsVideoMinimized(isVideoMinimized);
    playbackStore.setIsFollowModeEnabled(isFollowModeEnabled);
  }, [
    analysisResults,
    audioProcessingState.isAnalyzing,
    audioProcessingState.error,
    audioProcessingState.audioUrl,
    cacheAvailable,
    cacheCheckCompleted,
    cacheCheckInProgress,
    keySignature,
    isDetectingKey,
    chordCorrections,
    showCorrectedChords,
    beatDetector,
    chordDetector,
    modelsInitialized,
    lyrics,
    showLyrics,
    hasCachedLyrics,
    isTranscribingLyrics,
    lyricsError,
    videoTitle,
    showSegmentation,
    isChatbotOpen,
    isLyricsPanelOpen,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    youtubePlayer,
    audioRef,
    isVideoMinimized,
    isFollowModeEnabled,
  ]);
}
