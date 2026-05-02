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

    if (analysisStore.analysisResults !== analysisResults) {
      analysisStore.setAnalysisResults(analysisResults);
    }
    if (analysisStore.isAnalyzing !== audioProcessingState.isAnalyzing) {
      analysisStore.setIsAnalyzing(audioProcessingState.isAnalyzing);
    }
    if (analysisStore.analysisError !== (audioProcessingState.error || null)) {
      analysisStore.setAnalysisError(audioProcessingState.error || null);
    }
    if (analysisStore.cacheAvailable !== cacheAvailable) {
      analysisStore.setCacheAvailable(cacheAvailable);
    }
    if (analysisStore.cacheCheckCompleted !== cacheCheckCompleted) {
      analysisStore.setCacheCheckCompleted(cacheCheckCompleted);
    }
    if (analysisStore.cacheCheckInProgress !== cacheCheckInProgress) {
      analysisStore.setCacheCheckInProgress(cacheCheckInProgress);
    }
    if (analysisStore.keySignature !== keySignature) {
      analysisStore.setKeySignature(keySignature);
    }
    if (analysisStore.isDetectingKey !== isDetectingKey) {
      analysisStore.setIsDetectingKey(isDetectingKey);
    }
    if (analysisStore.chordCorrections !== chordCorrections) {
      analysisStore.setChordCorrections(chordCorrections);
    }
    if (analysisStore.showCorrectedChords !== showCorrectedChords) {
      analysisStore.setShowCorrectedChords(showCorrectedChords);
    }
    if (analysisStore.beatDetector !== beatDetector) {
      analysisStore.setBeatDetector(beatDetector);
    }
    if (analysisStore.chordDetector !== chordDetector) {
      analysisStore.setChordDetector(chordDetector);
    }
    if (analysisStore.modelsInitialized !== modelsInitialized) {
      analysisStore.setModelsInitialized(modelsInitialized);
    }
    if (analysisStore.lyrics !== lyrics) {
      analysisStore.setLyrics(lyrics);
    }
    if (analysisStore.showLyrics !== showLyrics) {
      analysisStore.setShowLyrics(showLyrics);
    }
    if (analysisStore.hasCachedLyrics !== hasCachedLyrics) {
      analysisStore.setHasCachedLyrics(hasCachedLyrics);
    }
    if (analysisStore.isTranscribingLyrics !== isTranscribingLyrics) {
      analysisStore.setIsTranscribingLyrics(isTranscribingLyrics);
    }
    if (analysisStore.lyricsError !== lyricsError) {
      analysisStore.setLyricsError(lyricsError);
    }
  }, [
    analysisResults,
    audioProcessingState.isAnalyzing,
    audioProcessingState.error,
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
  ]);

  useEffect(() => {
    const uiStore = useUIStore.getState();
    const noteName = keySignature ? keySignature.split(' ')[0] : 'C';
    const isFirebaseAudioAvailable = !!audioProcessingState.audioUrl;

    if (uiStore.videoTitle !== videoTitle) {
      uiStore.setVideoTitle(videoTitle);
    }
    if (uiStore.showSegmentation !== showSegmentation) {
      uiStore.setShowSegmentation(showSegmentation);
    }
    if (uiStore.isChatbotOpen !== isChatbotOpen) {
      uiStore.setIsChatbotOpen(isChatbotOpen);
    }
    if (uiStore.isLyricsPanelOpen !== isLyricsPanelOpen) {
      uiStore.setIsLyricsPanelOpen(isLyricsPanelOpen);
    }
    if (uiStore.originalKey !== noteName) {
      uiStore.initializeOriginalKey(noteName);
    }
    if (uiStore.isFirebaseAudioAvailable !== isFirebaseAudioAvailable) {
      uiStore.initializeFirebaseAudioAvailable(isFirebaseAudioAvailable);
    }
  }, [
    audioProcessingState.audioUrl,
    keySignature,
    videoTitle,
    showSegmentation,
    isChatbotOpen,
    isLyricsPanelOpen,
  ]);

  useEffect(() => {
    const playbackStore = usePlaybackStore.getState();

    if (playbackStore.isPlaying !== isPlaying) {
      playbackStore.setIsPlaying(isPlaying);
    }
    if (playbackStore.currentTime !== currentTime) {
      playbackStore.setCurrentTime(currentTime);
    }
    if (playbackStore.duration !== duration) {
      playbackStore.setDuration(duration);
    }
    if (playbackStore.playbackRate !== playbackRate) {
      playbackStore.setPlaybackRate(playbackRate);
    }
  }, [
    isPlaying,
    currentTime,
    duration,
    playbackRate,
  ]);

  useEffect(() => {
    const playbackStore = usePlaybackStore.getState();

    if (playbackStore.youtubePlayer !== youtubePlayer) {
      playbackStore.setYoutubePlayer(youtubePlayer);
    }
    if (playbackStore.audioRef !== audioRef) {
      playbackStore.setAudioRef(audioRef as never);
    }
    if (playbackStore.isVideoMinimized !== isVideoMinimized) {
      playbackStore.setIsVideoMinimized(isVideoMinimized);
    }
    if (playbackStore.isFollowModeEnabled !== isFollowModeEnabled) {
      playbackStore.setIsFollowModeEnabled(isFollowModeEnabled);
    }
  }, [
    youtubePlayer,
    audioRef,
    isVideoMinimized,
    isFollowModeEnabled,
  ]);
}
