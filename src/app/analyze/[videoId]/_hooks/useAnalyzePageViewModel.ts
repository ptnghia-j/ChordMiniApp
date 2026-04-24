"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { addToast } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useMetronomeSync } from '@/hooks/chord-playback/useMetronomeSync';
import { useMelodicTranscriptionPlayback } from '@/hooks/chord-playback/useMelodicTranscriptionPlayback';
import { metronomeService } from '@/services/chord-playback/metronomeService';
import { useAudioProcessing } from '@/hooks/audio/useAudioProcessing';
import { useAudioPlayer } from '@/hooks/chord-playback/useAudioPlayer';
import { useModelState } from '@/hooks/chord-analysis/useModelState';
import { useAnalyzePageOrchestrator } from '@/hooks/analyze/useAnalyzePageOrchestrator';
import { useAnalysisUsageTracker } from '@/hooks/analyze/useAnalysisUsageTracker';
import { useNavigationHelpers } from '@/hooks/ui/useNavigationHelpers';
import { transcribeLyricsWithAI as transcribeLyricsWithAIService } from '@/services/audio/audioProcessingExtracted';
import { getChordGridData as getChordGridDataService } from '@/services/chord-analysis/chordGridCalculationService';
import { useAudioInteractions } from '@/hooks/chord-playback/useAudioInteractions';
import { useScrollAndAnimation } from '@/hooks/scroll/useScrollAndAnimation';
import { usePlaybackState } from '@/hooks/chord-playback/usePlaybackState';
import { useLoopPlayback, resolveLoopRange } from '@/hooks/chord-playback/useLoopPlayback';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import { simplifyChordArray, simplifySequenceCorrections } from '@/utils/chordSimplification';
import type { UseChordPlaybackReturn } from '@/hooks/chord-playback/useChordPlayback';
import {
  DEFAULT_PIANO_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
  DEFAULT_FLUTE_VOLUME,
} from '@/config/audioDefaults';
import { buildAnalyzePageUrl, type AnalyzeRouteParams } from '@/utils/analyzeRouteUtils';
import { consumeAnalyzeSessionHandoff } from '@/utils/analyzeSessionHandoff';
import {
  MAX_ANALYSIS_DURATION_MINUTES,
  getAnalysisDurationLimitReason,
  parseAnalysisDurationSeconds,
} from '@/utils/analysisDurationLimit';
import { requestSheetSageTranscription } from '@/services/sheetsage/sheetSageTranscriptionClient';
import { getCachedSheetSageMelody } from '@/services/sheetsage/sheetSageCacheClient';
import { useFirebaseReadiness } from '@/hooks/firebase/useFirebaseReadiness';
import { useYouTubeSetup } from '@/hooks/youtube/useYouTubeSetup';
import { useSegmentationState } from '@/hooks/lyrics/useSegmentationState';
import { useTabsAndEditing } from '@/hooks/ui/useTabsAndEditing';
import { useLyricsState } from '@/hooks/lyrics/useLyricsState';
import { useAnalysisStore } from '@/stores/analysisStore';
import { useUIStore } from '@/stores/uiStore';
import { useIsLoopEnabled, useLoopEndBeat, useLoopStartBeat } from '@/stores/uiStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useSheetSageBackendAvailability } from '@/hooks/sheetsage/useSheetSageBackendAvailability';
import type { AnalyzePageViewModel } from '../_types/analyzePageViewModel';
import { useAnalyzePageStoreSync } from './useAnalyzePageStoreSync';
import { useAnalyzePageLifecycleReset } from './useAnalyzePageLifecycleReset';

interface UseAnalyzePageViewModelParams {
  videoId: string;
  routeParams: Required<AnalyzeRouteParams>;
}

export function useAnalyzePageViewModel({
  videoId,
  routeParams,
}: UseAnalyzePageViewModelParams): AnalyzePageViewModel {
  const showSheetSage = true;
  useSheetSageBackendAvailability(showSheetSage);
  const router = useRouter();
  const titleFromSearch = routeParams.title;
  const durationFromSearch = routeParams.duration;
  const channelFromSearch = routeParams.channel;
  const thumbnailFromSearch = routeParams.thumbnail;
  const autoStartRequested = Boolean(routeParams.autoStart);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const durationLimitToastShownRef = useRef(false);
  const [initialAnalyzeHandoff] = useState(() => consumeAnalyzeSessionHandoff(
    videoId,
    routeParams.beatModel,
    routeParams.chordModel
  ));
  const shouldSkipInitialCacheBootstrap = Boolean(initialAnalyzeHandoff?.audioProcessingState?.audioUrl);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewportMode = () => setIsCompactViewport(mediaQuery.matches);
    updateViewportMode();
    mediaQuery.addEventListener('change', updateViewportMode);

    return () => mediaQuery.removeEventListener('change', updateViewportMode);
  }, []);

  const {
    stage,
    progress: _progress,
    setStage,
    setProgress,
    setStatusMessage,
    startProcessing,
    completeProcessing,
    failProcessing,
  } = useProcessing();
  const { theme } = useTheme();
  const { isServiceAvailable, getServiceMessage } = useApiKeys();

  const {
    state: audioProcessingState,
    analysisResults,
    videoTitle,
    analyzeAudio: analyzeAudioFromService,
    setState: setAudioProcessingState,
    setAnalysisResults,
    setVideoTitle,
  } = useAudioProcessing(videoId, {
    initialState: initialAnalyzeHandoff?.audioProcessingState ?? null,
    initialAnalysisResults: initialAnalyzeHandoff?.analysisResults ?? null,
    initialVideoTitle: initialAnalyzeHandoff?.videoTitle ?? titleFromSearch,
  });

  const {
    state: audioPlayerState,
    audioRef,
    youtubePlayer,
    handleTimeUpdate: _handleTimeUpdate,
    handleLoadedMetadata: _handleLoadedMetadata,
    setState: setAudioPlayerState,
    setYoutubePlayer,
    setDuration,
  } = useAudioPlayer();

  useEffect(() => {
    if (titleFromSearch && !videoTitle) {
      setVideoTitle(titleFromSearch);
    }
  }, [titleFromSearch, videoTitle, setVideoTitle]);

  const {
    beatDetector,
    chordDetector,
    modelsInitialized,
    beatDetectorRef,
    chordDetectorRef,
    setBeatDetector,
    setChordDetector,
  } = useModelState({
    initialBeatDetector: routeParams.beatModel,
    initialChordDetector: routeParams.chordModel,
  });

  const { firebaseReady } = useFirebaseReadiness();
  const { isPlaying, currentTime, duration, playbackRate } = audioPlayerState;
  const effectiveAnalysisDuration = duration > 0 ? duration : parseAnalysisDurationSeconds(durationFromSearch);

  const setIsPlaying = useCallback((playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  }, [setAudioPlayerState]);

  const setCurrentTime = useCallback((time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  }, [setAudioPlayerState]);

  const {
    segmentationData,
    showSegmentation,
    isSegmenting,
    segmentationError,
    toggleSegmentation,
    resetSegmentation,
  } = useSegmentationState();

  const simplifyChords = useUIStore((state) => state.simplifyChords);
  const showRomanNumerals = useUIStore((state) => state.showRomanNumerals);
  const updateRomanNumeralData = useUIStore((state) => state.updateRomanNumeralData);
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  const {
    lyrics,
    showLyrics,
    hasCachedLyrics,
    isTranscribingLyrics,
    lyricsError,
    translatedLyrics,
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    setIsTranscribingLyrics,
    setLyricsError,
  } = useLyricsState();

  const {
    cacheAvailable,
    cacheCheckCompleted,
    cacheCheckInProgress,
    hasPersistedActiveTranscription,
    activeTranscriptionUsageCount,
    incrementActiveTranscriptionUsageCount,
    keySignature,
    isDetectingKey,
    chordCorrections,
    showCorrectedChords,
    setShowCorrectedChords,
    sequenceCorrections,
    handleAudioAnalysis,
    extractAudioFromYouTube,
  } = useAnalyzePageOrchestrator({
    videoId,
    titleFromSearch,
    durationFromSearch,
    channelFromSearch,
    thumbnailFromSearch,
    firebaseReady,
    modelsInitialized,
    beatDetector,
    chordDetector,
    beatDetectorRef,
    chordDetectorRef,
    audioRef,
    audioProcessingState,
    analysisResults,
    lyrics,
    showRomanNumerals,
    setShowExtractionNotification,
    setAudioProcessingState,
    setAnalysisResults,
    setDuration,
    setVideoTitle,
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    stage,
    setStage,
    setProgress,
    setStatusMessage,
    startProcessing,
    completeProcessing,
    failProcessing,
    updateRomanNumeralData,
    analyzeAudioFromService,
    skipInitialCacheBootstrap: shouldSkipInitialCacheBootstrap,
  });

  useAnalysisUsageTracker({
    videoId,
    beatDetector,
    chordDetector,
    isAnalyzed: audioProcessingState.isAnalyzed,
    isPlaying,
    duration,
    hasPersistedTranscription: hasPersistedActiveTranscription,
    onUsageCountIncrement: incrementActiveTranscriptionUsageCount,
  });

  const analysisDurationLimitReason = useMemo(
    () => getAnalysisDurationLimitReason(effectiveAnalysisDuration),
    [effectiveAnalysisDuration],
  );
  const analysisActionDisabledReason = !cacheAvailable ? analysisDurationLimitReason : null;

  useEffect(() => {
    if (analysisActionDisabledReason && !durationLimitToastShownRef.current) {
      durationLimitToastShownRef.current = true;
      addToast({
        title: 'Audio is too long for analysis',
        description: `Audio duration should be less than ${MAX_ANALYSIS_DURATION_MINUTES} minutes.`,
        color: 'warning',
        variant: 'flat',
        timeout: 5000,
        shouldShowTimeoutProgress: true,
      });
      return;
    }

    if (!analysisActionDisabledReason) {
      durationLimitToastShownRef.current = false;
    }
  }, [analysisActionDisabledReason]);

  const handleStartAnalysis = useCallback(() => {
    if (analysisActionDisabledReason) {
      setAudioProcessingState(prev => ({
        ...prev,
        error: analysisActionDisabledReason,
      }));
      return;
    }

    void handleAudioAnalysis();
  }, [analysisActionDisabledReason, handleAudioAnalysis, setAudioProcessingState]);

  useEffect(() => {
    if (initialAnalyzeHandoff?.duration) {
      setDuration(initialAnalyzeHandoff.duration);
    }
  }, [initialAnalyzeHandoff, setDuration]);

  const currentBeatModelParam = routeParams.beatModel;
  const currentChordModelParam = routeParams.chordModel;
  const shouldSyncModelParams = useMemo(() => (
    Boolean(videoId)
      && (
        currentBeatModelParam !== beatDetector
        || currentChordModelParam !== chordDetector
      )
  ), [beatDetector, chordDetector, currentBeatModelParam, currentChordModelParam, videoId]);

  const canonicalAnalyzeUrl = useMemo(() => buildAnalyzePageUrl(videoId, {
    ...routeParams,
    beatModel: beatDetector,
    chordModel: chordDetector,
  }), [beatDetector, chordDetector, routeParams, videoId]);

  const autoStartAttemptedRef = useRef(false);
  const initialModelUrlSyncHandledRef = useRef(false);

  const analyzeBackdropUrl = useMemo(() => {
    if (thumbnailFromSearch) {
      return thumbnailFromSearch;
    }

    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  }, [thumbnailFromSearch, videoId]);

  useEffect(() => {
    if (!videoId || !modelsInitialized) {
      return;
    }

    const isMissingModelParams = !currentBeatModelParam || !currentChordModelParam;

    if (!initialModelUrlSyncHandledRef.current) {
      initialModelUrlSyncHandledRef.current = true;

      if (!isMissingModelParams) {
        return;
      }
    }

    if (!shouldSyncModelParams) {
      return;
    }

    router.replace(canonicalAnalyzeUrl, { scroll: false });
  }, [
    canonicalAnalyzeUrl,
    currentBeatModelParam,
    currentChordModelParam,
    modelsInitialized,
    router,
    shouldSyncModelParams,
    videoId,
  ]);

  useEffect(() => {
    if (!autoStartRequested) {
      autoStartAttemptedRef.current = false;
      return;
    }

    if (autoStartAttemptedRef.current) {
      return;
    }

    if (
      !modelsInitialized ||
      !audioProcessingState.isExtracted ||
      !audioProcessingState.audioUrl ||
      audioProcessingState.isAnalyzing ||
      audioProcessingState.isAnalyzed ||
      !!audioProcessingState.error ||
      !!analysisActionDisabledReason
    ) {
      return;
    }

    autoStartAttemptedRef.current = true;
    handleStartAnalysis();
  }, [
    autoStartRequested,
    audioProcessingState.audioUrl,
    audioProcessingState.error,
    audioProcessingState.isAnalyzed,
    audioProcessingState.isAnalyzing,
    audioProcessingState.isExtracted,
    analysisActionDisabledReason,
    handleStartAnalysis,
    modelsInitialized,
  ]);

  const hideInitialAnalysisControls = autoStartRequested
    && !analysisActionDisabledReason
    && !audioProcessingState.error
    && !audioProcessingState.isAnalyzed;

  const memoizedChordCorrections = useMemo(() => chordCorrections, [chordCorrections]);
  const memoizedSequenceCorrections = useMemo(() => sequenceCorrections, [sequenceCorrections]);

  const simplifiedSequenceCorrections = useMemo(() => {
    return simplifyChords
      ? simplifySequenceCorrections(memoizedSequenceCorrections)
      : memoizedSequenceCorrections;
  }, [simplifyChords, memoizedSequenceCorrections]);

  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const {
    handleTryAnotherVideo,
    toggleVideoMinimization,
    toggleFollowMode,
  } = useNavigationHelpers({
    setIsVideoMinimized,
    setIsFollowModeEnabled,
  });

  const {
    currentBeatIndex,
    setCurrentBeatIndex,
    currentBeatIndexRef,
    currentDownbeatIndex,
    setCurrentDownbeatIndex,
    lastClickInfo,
    setLastClickInfo,
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    handleBeatClick,
    handleYouTubeReady,
    handleYouTubeProgress,
  } = usePlaybackState({
    audioRef,
    youtubePlayer,
    setYoutubePlayer,
    audioPlayerState,
    setAudioPlayerState,
    setDuration,
    isFollowModeEnabled,
  });

  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();

  const { toggleEnharmonicCorrection } = useAudioInteractions({
    showCorrectedChords,
    setShowCorrectedChords,
  });

  const [fontSize, setFontSize] = useState<number>(16);
  const {
    activeTab,
    setActiveTab,
    isEditMode,
    editedTitle,
    editedChords,
    handleEditModeToggle,
    handleTitleSave: handleTitleSaveFromHook,
    handleTitleCancel,
    handleTitleChange,
    handleChordEdit,
  } = useTabsAndEditing(videoTitle || '');

  const sheetSageResult = useAnalysisStore((state) => state.sheetSageResult);
  const isComputingSheetSage = useAnalysisStore((state) => state.isComputingSheetSage);
  const sheetSageError = useAnalysisStore((state) => state.sheetSageError);
  const isCheckingSheetSageBackend = useAnalysisStore((state) => state.isCheckingSheetSageBackend);
  const isSheetSageBackendAvailable = useAnalysisStore((state) => state.isSheetSageBackendAvailable);
  const sheetSageBackendError = useAnalysisStore((state) => state.sheetSageBackendError);
  const isMelodicTranscriptionPlaybackEnabled = useUIStore((state) => state.isMelodicTranscriptionPlaybackEnabled);
  const setIsMelodicTranscriptionPlaybackEnabled = useUIStore((state) => state.setIsMelodicTranscriptionPlaybackEnabled);

  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);

  useEffect(() => {
    const shouldMinimize = isChatbotOpen
      || isLyricsPanelOpen
      || activeTab === 'guitarChords'
      || activeTab === 'pianoVisualizer';
    setIsVideoMinimized(shouldMinimize);
  }, [isChatbotOpen, isLyricsPanelOpen, activeTab]);

  const hasSheetSageNotes = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
  const hasSheetSageAudioSource = Boolean(audioProcessingState.audioUrl);
  const hasReadySheetSageBackend = isSheetSageBackendAvailable === true;
  const melodicTranscriptionDisabledReason = isCheckingSheetSageBackend
    ? 'Checking Sheet Sage backend...'
    : !hasReadySheetSageBackend
      ? (sheetSageBackendError || 'Sheet Sage backend unavailable.')
      : !hasSheetSageAudioSource
        ? 'Wait for extracted audio before computing melodic transcription.'
        : undefined;

  const splitLayoutHeight = useMemo(() => {
    if (!isLyricsPanelOpen && !isChatbotOpen) {
      return 'calc(100vh - 180px)';
    }

    if (isCompactViewport) {
      return 'calc(100vh - 180px - var(--mobile-video-dock-height, 0px) - 5.5rem)';
    }

    return 'calc(100vh - 180px - var(--mobile-video-dock-height, 0px))';
  }, [isChatbotOpen, isCompactViewport, isLyricsPanelOpen]);

  const handleTitleSave = useCallback(() => {
    if (editedTitle.trim()) {
      setVideoTitle(editedTitle.trim());
    }
    handleTitleSaveFromHook();
  }, [editedTitle, setVideoTitle, handleTitleSaveFromHook]);

  const handleChordEditWrapper = useCallback((index: number, newChord: string) => {
    const originalChord = `chord_${index}`;
    handleChordEdit(originalChord, newChord);
  }, [handleChordEdit]);

  useYouTubeSetup(videoId, setAudioProcessingState);

  const songContext = useMemo(() => ({
    videoId,
    title: videoTitle,
    duration,
    beats: analysisResults?.beats,
    downbeats: analysisResults?.downbeats,
    downbeats_with_measures: analysisResults?.downbeats_with_measures,
    beats_with_positions: analysisResults?.beats_with_positions,
    bpm: analysisResults?.beatDetectionResult?.bpm,
    time_signature: analysisResults?.beatDetectionResult?.time_signature,
    beatModel: analysisResults?.beatModel,
    chords: analysisResults?.chords,
    synchronizedChords: analysisResults?.synchronizedChords,
    chordModel: analysisResults?.chordModel,
    lyrics: lyrics || undefined,
    translatedLyrics,
    audioUrl: audioProcessingState.audioUrl || undefined,
  }), [videoId, videoTitle, duration, analysisResults, lyrics, translatedLyrics, audioProcessingState.audioUrl]);

  useEffect(() => {
    resetSegmentation();
  }, [videoId, resetSegmentation]);

  useEffect(() => {
    useAnalysisStore.getState().clearSheetSage();
    setIsMelodicTranscriptionPlaybackEnabled(false);
  }, [audioProcessingState.audioUrl, setIsMelodicTranscriptionPlaybackEnabled]);

  useEffect(() => {
    if (
      !showSheetSage
      || !videoId
      || !audioProcessingState.isExtracted
      || !audioProcessingState.audioUrl
    ) {
      return;
    }

    let cancelled = false;
    const analysisActions = useAnalysisStore.getState();

    const loadCachedMelody = async () => {
      try {
        const cachedResult = await getCachedSheetSageMelody(videoId);
        if (cancelled || !cachedResult) {
          return;
        }

        analysisActions.setSheetSageResult(cachedResult);
        analysisActions.setSheetSageError(null);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load cached melody transcription:', error);
        }
      }
    };

    void loadCachedMelody();

    return () => {
      cancelled = true;
    };
  }, [
    audioProcessingState.audioUrl,
    audioProcessingState.isExtracted,
    showSheetSage,
    videoId,
  ]);

  const segmentationDisabledReason = !songContext.audioUrl
    ? 'Song segmentation becomes available after audio extraction finishes.'
    : songContext.audioUrl.startsWith('blob:')
      ? 'Song segmentation requires a backend-accessible extracted audio URL.'
      : !songContext.beats?.length
        ? 'Song segmentation becomes available after beat analysis finishes.'
        : undefined;

  const canAnalyzeSegmentation = !segmentationDisabledReason;

  const handleSegmentationToggle = useCallback(() => {
    void toggleSegmentation(songContext);
  }, [toggleSegmentation, songContext]);

  const toggleChatbot = useCallback(() => {
    if (!isChatbotOpen && isLyricsPanelOpen) {
      setIsLyricsPanelOpen(false);
    }
    setIsChatbotOpen(!isChatbotOpen);
  }, [isChatbotOpen, isLyricsPanelOpen]);

  const toggleLyricsPanel = useCallback(() => {
    if (!isLyricsPanelOpen && isChatbotOpen) {
      setIsChatbotOpen(false);
    }
    setIsLyricsPanelOpen(!isLyricsPanelOpen);
  }, [isChatbotOpen, isLyricsPanelOpen]);

  const transcribeLyricsWithAI = useCallback(async () => {
    if (!isServiceAvailable('musicAi')) {
      setLyricsError(getServiceMessage('musicAi'));
      return;
    }

    const deps = {
      setAudioProcessingState: (updater: (prev: any) => any) => setAudioProcessingState(updater),
      setAnalysisResults: () => {},
      setDuration: () => {},
      setShowExtractionNotification,
      setLyrics,
      setShowLyrics,
      setHasCachedLyrics,
      setActiveTab,
      setIsTranscribingLyrics,
      setLyricsError,
      processingContext: {
        stage: '',
        progress: 0,
        setStage: () => {},
        setProgress: () => {},
        setStatusMessage: () => {},
        startProcessing: () => {},
        completeProcessing: () => {},
        failProcessing: () => {},
      },
      analyzeAudioFromService: () => Promise.resolve({} as any),
      audioRef,
      beatDetectorRef,
      chordDetectorRef,
      videoId,
      titleFromSearch,
      durationFromSearch,
      channelFromSearch,
      thumbnailFromSearch,
      audioProcessingState: {
        ...audioProcessingState,
        audioUrl: audioProcessingState.audioUrl || null,
      },
      beatDetector,
      chordDetector,
      progress: 0,
      lyrics,
    };

    return await transcribeLyricsWithAIService(deps as any);
  }, [
    audioProcessingState,
    audioRef,
    beatDetector,
    beatDetectorRef,
    channelFromSearch,
    chordDetector,
    chordDetectorRef,
    durationFromSearch,
    getServiceMessage,
    isServiceAvailable,
    lyrics,
    setActiveTab,
    setAudioProcessingState,
    setHasCachedLyrics,
    setIsTranscribingLyrics,
    setLyrics,
    setLyricsError,
    setShowLyrics,
    thumbnailFromSearch,
    titleFromSearch,
    videoId,
  ]);

  const chordGridData = useMemo(() => getChordGridDataService(analysisResults as any) as any, [analysisResults]);

  const simplifiedChordGridData = useMemo(() => {
    if (!chordGridData) return chordGridData;

    let processedChords = chordGridData.chords || [];

    if (simplifyChords) {
      processedChords = simplifyChordArray(processedChords);
    }

    return {
      ...chordGridData,
      chords: processedChords,
    };
  }, [chordGridData, simplifyChords]);

  useLoopPlayback({
    youtubePlayer,
    beats: simplifiedChordGridData?.beats || [],
    currentTime,
    duration,
    setLastClickInfo,
  });

  const [chordPlayback, setChordPlayback] = useState<UseChordPlaybackReturn>({
    isEnabled: false,
    pianoVolume: DEFAULT_PIANO_VOLUME,
    guitarVolume: DEFAULT_GUITAR_VOLUME,
    violinVolume: DEFAULT_VIOLIN_VOLUME,
    fluteVolume: DEFAULT_FLUTE_VOLUME,
    isReady: false,
    togglePlayback: () => {},
    setPianoVolume: () => {},
    setGuitarVolume: () => {},
    setViolinVolume: () => {},
    setFluteVolume: () => {},
  });

  const handleChordPlaybackChange = useCallback((newChordPlayback: UseChordPlaybackReturn) => {
    setChordPlayback(newChordPlayback);
  }, []);

  const toggleMelodicTranscriptionPlayback = useCallback(async () => {
    if (!hasSheetSageAudioSource || isComputingSheetSage) {
      return;
    }

    const analysisActions = useAnalysisStore.getState();

    if (isMelodicTranscriptionPlaybackEnabled) {
      setIsMelodicTranscriptionPlaybackEnabled(false);
      return;
    }

    if (!hasSheetSageNotes) {
      if (!hasReadySheetSageBackend) {
        analysisActions.setSheetSageError(sheetSageBackendError || 'Sheet Sage backend unavailable.');
        return;
      }

      analysisActions.setIsComputingSheetSage(true);
      analysisActions.setSheetSageError(null);

      try {
        const cachedResult = await getCachedSheetSageMelody(videoId);
        const result = cachedResult ?? await requestSheetSageTranscription(null, audioProcessingState.audioUrl || null, videoId);
        analysisActions.setSheetSageResult(result);
        analysisActions.setSheetSageError(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown Sheet Sage error';
        analysisActions.setSheetSageError(message);
        analysisActions.setIsComputingSheetSage(false);
        return;
      } finally {
        analysisActions.setIsComputingSheetSage(false);
      }
    }

    setActiveTab('pianoVisualizer');
    setIsMelodicTranscriptionPlaybackEnabled(true);
  }, [
    audioProcessingState.audioUrl,
    hasReadySheetSageBackend,
    hasSheetSageAudioSource,
    hasSheetSageNotes,
    isComputingSheetSage,
    isMelodicTranscriptionPlaybackEnabled,
    setActiveTab,
    setIsMelodicTranscriptionPlaybackEnabled,
    sheetSageBackendError,
    videoId,
  ]);

  useMelodicTranscriptionPlayback({
    sheetSageResult,
    audioUrl: audioProcessingState.audioUrl || null,
    segmentationData,
    audioRef,
    youtubePlayer,
    currentTime,
    isPlaying,
    isEnabled: isMelodicTranscriptionPlaybackEnabled,
  });

  const [isCountdownEnabled, setIsCountdownEnabled] = useState<boolean>(false);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState<boolean>(false);

  const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults?.beatDetectionResult?.bpm || 120;
  const countdownCtrlRef = useRef<{ intervalId: ReturnType<typeof setInterval> | null; aborted: boolean; token: number } | null>(null);
  const countdownStateRef = useRef<{ inProgress: boolean; completed: boolean }>({ inProgress: false, completed: false });

  const cancelCountdown = useCallback(() => {
    const ctrl = countdownCtrlRef.current;
    if (ctrl) {
      ctrl.aborted = true;
      if (ctrl.intervalId) clearInterval(ctrl.intervalId as any);
      countdownCtrlRef.current = null;
    }
    countdownStateRef.current.inProgress = false;
    setIsCountingDown(false);
    setCountdownDisplay('');
  }, []);

  const runCountdown = useCallback(async () => {
    if (!isCountdownEnabled) return true;
    if (countdownStateRef.current.inProgress) return false;

    const beatsPerMeasure = Math.max(2, Math.min(12, timeSignature || 4));
    const beatDurationSec = 60 / Math.max(1, bpm || 120);
    const totalMs = beatsPerMeasure * beatDurationSec * 1000;

    setIsCountingDown(true);
    const start = Date.now();
    const token = Math.random();
    const ctrl = { intervalId: null as ReturnType<typeof setInterval> | null, aborted: false, token };
    countdownCtrlRef.current = ctrl;
    countdownStateRef.current.inProgress = true;
    countdownStateRef.current.completed = false;
    try { (youtubePlayer as any)?.pauseVideo?.(); } catch {}
    setCountdownDisplay(`${beatsPerMeasure}`);

    const ok = await new Promise<boolean>((resolve) => {
      ctrl.intervalId = setInterval(() => {
        if (!countdownCtrlRef.current || countdownCtrlRef.current.token !== token || countdownCtrlRef.current.aborted) {
          if (ctrl.intervalId) clearInterval(ctrl.intervalId as any);
          countdownStateRef.current.inProgress = false;
          setIsCountingDown(false);
          setCountdownDisplay('');
          resolve(false);
          return;
        }

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, totalMs - elapsed);
        const remainingBeats = Math.ceil(remaining / (beatDurationSec * 1000));
        setCountdownDisplay(`${remainingBeats}`);
        if (remaining <= 0) {
          if (ctrl.intervalId) clearInterval(ctrl.intervalId as any);
          countdownCtrlRef.current = null;
          countdownStateRef.current.inProgress = false;
          countdownStateRef.current.completed = true;
          setIsCountingDown(false);
          setCountdownDisplay('');
          resolve(true);
        }
      }, 100);
    });

    return ok;
  }, [isCountdownEnabled, timeSignature, bpm, youtubePlayer]);

  const disableMetronomeService = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    void metronomeService.setEnabled(false, 0);
  }, []);

  useAnalyzePageLifecycleReset({
    videoId,
    resetSegmentation,
    setIsMelodicTranscriptionPlaybackEnabled,
    setIsFollowModeEnabled,
    setIsCountdownEnabled,
    cancelCountdown,
    countdownStateRef,
    chordPlayback,
    setIsMetronomeEnabled,
    disableMetronomeService,
  });

  useEffect(() => {
    if (!isPlaying) {
      cancelCountdown();
      countdownStateRef.current.completed = false;
      countdownStateRef.current.inProgress = false;
    }
  }, [isPlaying, cancelCountdown]);

  useEffect(() => {
    return () => {
      cancelCountdown();
    };
  }, [cancelCountdown]);

  const toggleCountdown = useCallback(() => {
    setIsCountdownEnabled(prev => !prev);
  }, []);

  useScrollAndAnimation({
    youtubePlayer,
    isPlaying,
    currentTime,
    playbackRate,
    analysisResults,
    currentBeatIndex,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setCurrentDownbeatIndex,
    setCurrentTime,
    isFollowModeEnabled,
    chordGridData,
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    lastClickInfo,
  });

  const { toggleMetronomeWithSync } = useMetronomeSync({
    beats: analysisResults?.beats || [],
    downbeats: analysisResults?.downbeats,
    currentTime,
    isPlaying,
    timeSignature: analysisResults?.beatDetectionResult?.time_signature || 4,
    bpm: analysisResults?.beatDetectionResult?.bpm || 120,
    beatTimeRangeStart: analysisResults?.beatDetectionResult?.beat_time_range_start || 0,
    shiftCount: chordGridData.shiftCount || 0,
    paddingCount: chordGridData.paddingCount || 0,
    chordGridBeats: chordGridData.beats || [],
    audioDuration: analysisResults?.audioDuration || 0,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMetronomeEnabled(metronomeService.isMetronomeEnabled());
    }
  }, []);

  const handleMetronomeToggle = useCallback(async (): Promise<boolean> => {
    const newEnabled = await toggleMetronomeWithSync();
    setIsMetronomeEnabled(newEnabled);
    return newEnabled;
  }, [toggleMetronomeWithSync]);

  useEffect(() => {
    if (youtubePlayer) {
      youtubePlayer.muted = false;
    }
    if (audioRef.current) {
      audioRef.current.muted = true;
    }
  }, [youtubePlayer, audioRef]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎵 Synced audio element playback rate to ${playbackRate}x`);
      }
    }
  }, [playbackRate, audioRef]);

  const handleDismissExtraction = useCallback(() => {
    setShowExtractionNotification(false);
  }, []);

  const handleRefreshExtraction = useCallback(() => {
    extractAudioFromYouTube(true);
  }, [extractAudioFromYouTube]);

  useEffect(() => {
    const playbackStore = usePlaybackStore.getState();
    playbackStore.setBeatClickHandler(handleBeatClick);

    return () => {
      usePlaybackStore.getState().setBeatClickHandler(null);
    };
  }, [handleBeatClick]);

  useAnalyzePageStoreSync({
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
  });

  const hasCorrections = Boolean(
    (memoizedChordCorrections !== null && Object.keys(memoizedChordCorrections).length > 0)
    || (memoizedSequenceCorrections !== null && memoizedSequenceCorrections.correctedSequence.length > 0)
  );

  const melodicTranscriptionPlaybackConfig = showSheetSage ? {
    isEnabled: isMelodicTranscriptionPlaybackEnabled,
    hasTranscription: hasSheetSageNotes,
    isLoading: isComputingSheetSage || (isCheckingSheetSageBackend && !hasSheetSageNotes),
    disabled: !hasSheetSageAudioSource,
    disabledReason: melodicTranscriptionDisabledReason,
    errorMessage: sheetSageBackendError || sheetSageError,
    canAdjustVolume: hasSheetSageNotes,
    togglePlayback: toggleMelodicTranscriptionPlayback,
  } : undefined;

  const controlsProps = {
    isExtracted: audioProcessingState.isExtracted,
    isAnalyzed: audioProcessingState.isAnalyzed,
    isAnalyzing: audioProcessingState.isAnalyzing,
    hasError: !!audioProcessingState.error,
    stage,
    beatDetector,
    chordDetector,
    onBeatDetectorChange: setBeatDetector,
    onChordDetectorChange: setChordDetector,
    onStartAnalysis: handleStartAnalysis,
    cacheAvailable,
    cacheCheckCompleted,
    actionDisabledReason: analysisActionDisabledReason,
    hidden: hideInitialAnalysisControls,
  };

  const resultsPaneProps = {
    analysisResults,
    isAnalyzed: audioProcessingState.isAnalyzed,
    videoTitle,
    isEditMode,
    editedTitle,
    onTitleChange: handleTitleChange,
    onEditToggle: handleEditModeToggle,
    onTitleSave: handleTitleSave,
    onTitleCancel: handleTitleCancel,
    showCorrectedChords,
    hasCorrections,
    toggleEnharmonicCorrection,
    isTranscribingLyrics,
    hasCachedLyrics,
    canTranscribe: isServiceAvailable('musicAi') && !!audioProcessingState.audioUrl,
    transcribeLyricsWithAI,
    lyricsError,
    activeTab,
    setActiveTab,
    showLyrics,
    lyrics,
    currentTime,
    fontSize,
    onFontSizeChange: setFontSize,
    theme,
    segmentationData,
    sequenceCorrections: simplifiedSequenceCorrections,
    chordGridData: simplifiedChordGridData,
    isChatbotOpen,
    isLyricsPanelOpen,
    editedChords,
    onChordEdit: handleChordEditWrapper,
    keySignature,
    currentBeatIndex,
    isPlaying,
    isChordPlaybackEnabled: chordPlayback.isEnabled,
    audioUrl: audioProcessingState.audioUrl || null,
    sheetSageResult,
    showMelodicOverlay: isMelodicTranscriptionPlaybackEnabled && hasSheetSageNotes,
    duration,
    activeTranscriptionUsageCount,
    currentDownbeatIndex,
  };

  const sidePanelsProps = {
    isLyricsPanelOpen,
    isChatbotOpen,
    closeLyricsPanel: () => setIsLyricsPanelOpen(false),
    closeChatbot: () => setIsChatbotOpen(false),
    videoTitle,
    currentTime,
    songContext,
  };

  const floatingDockProps = {
    analysisResults,
    isVideoMinimized,
    isChatbotOpen,
    isLyricsPanelOpen,
    videoPlayerProps: {
      isChatbotOpen,
      isLyricsPanelOpen,
      isVideoMinimized,
      isFollowModeEnabled,
      analysisResults: analysisResults as any,
      currentBeatIndex,
      chords: simplifiedChordGridData?.chords || [],
      beats: simplifiedChordGridData?.beats || [],
      segmentationData,
      toggleVideoMinimization,
      toggleFollowMode,
      toggleMetronomeWithSync: async () => false,
      videoId,
      isPlaying,
      playbackRate,
      currentTime,
      duration,
      onReady: handleYouTubeReady,
      onPlay: async () => {
        if (isCountdownEnabled && !isPlaying && !countdownStateRef.current.inProgress && !countdownStateRef.current.completed) {
          try { (youtubePlayer as any)?.pauseVideo?.(); } catch {}
          const ok = await runCountdown();
          if (ok) {
            countdownStateRef.current.completed = false;
            try { (youtubePlayer as any)?.playVideo?.(); } catch {}
            setIsPlaying(true);
          }
          return;
        }
        setIsPlaying(true);
      },
      onPause: () => {
        setIsPlaying(false);
      },
      onProgress: handleYouTubeProgress,
      onSeek: (time: number) => {
        setCurrentTime(time);
        if (youtubePlayer && youtubePlayer.seekTo) {
          youtubePlayer.seekTo(time, 'seconds');
        }
      },
      onEnded: () => {
        if (!isLoopEnabled) {
          setIsPlaying(false);
          return;
        }
        const beats = simplifiedChordGridData?.beats || [];
        const resolvedLoopRange = resolveLoopRange(beats, loopStartBeat, loopEndBeat, duration);
        if (!resolvedLoopRange) return;
        const startTimestamp = resolvedLoopRange.startTimestamp;
        try { (youtubePlayer as any)?.seekTo?.(startTimestamp, 'seconds'); } catch {}
        setLastClickInfo({ visualIndex: resolvedLoopRange.resolvedStartBeat, timestamp: startTimestamp, clickTime: Date.now() });
        try { (youtubePlayer as any)?.playVideo?.(); } catch {}
        setIsPlaying(true);
      },
      youtubeEmbedUrl: audioProcessingState.youtubeEmbedUrl,
      videoUrl: audioProcessingState.videoUrl,
      youtubePlayer,
      melodicTranscriptionPlayback: melodicTranscriptionPlaybackConfig,
      showTopToggles: true as const,
      positionMode: 'relative' as const,
      timeSignature,
      isCountdownEnabled,
      isCountingDown,
      countdownDisplay,
      onRequestCountdown: async () => await runCountdown(),
    },
  };

  const utilityBarProps = {
    isFollowModeEnabled,
    chordPlayback,
    melodicTranscriptionPlayback: melodicTranscriptionPlaybackConfig,
    youtubePlayer,
    playbackRate,
    setPlaybackRate: (rate: number) => {
      setAudioPlayerState(prev => ({ ...prev, playbackRate: rate }));
    },
    toggleFollowMode,
    isCountdownEnabled,
    isCountingDown,
    countdownDisplay,
    toggleCountdown,
    isChatbotOpen,
    isLyricsPanelOpen,
    toggleChatbot,
    toggleLyricsPanel,
    segmentation: {
      isVisible: showSegmentation && !!segmentationData,
      hasData: !!segmentationData,
      isLoading: isSegmenting,
      disabled: !canAnalyzeSegmentation && !segmentationData,
      disabledReason: !segmentationData ? segmentationDisabledReason : undefined,
      errorMessage: segmentationError,
      onToggle: handleSegmentationToggle,
    },
    metronome: {
      isEnabled: isMetronomeEnabled,
      toggleMetronomeWithSync: handleMetronomeToggle,
    },
    totalBeats: simplifiedChordGridData?.beats?.length || 0,
  };

  const chromeProps = {
    analyzeBackdropUrl,
    showFooterTransition: Boolean(analysisResults),
    processingBannersProps: {
      isDownloading: audioProcessingState.isDownloading,
      fromCache: audioProcessingState.fromCache,
      showExtractionNotification,
      onDismissExtraction: handleDismissExtraction,
      onRefreshExtraction: handleRefreshExtraction,
      analysisResults,
      audioDuration: duration,
      audioUrl: audioProcessingState.audioUrl || undefined,
      fromFirestoreCache: audioProcessingState.fromFirestoreCache,
      videoId,
      beatDetector,
      error: audioProcessingState.error || null,
      suggestion: audioProcessingState.suggestion || undefined,
      onTryAnotherVideo: handleTryAnotherVideo,
      onRetry: () => extractAudioFromYouTube(true),
    },
    melodyToastProps: {
      isComputing: isComputingSheetSage,
      durationSeconds: duration || (durationFromSearch ? Number(durationFromSearch) : 0),
      hasResult: hasSheetSageNotes,
      errorMessage: sheetSageError,
    },
  };

  return {
    audioRef,
    audioPlayerState,
    setAudioPlayerState,
    setIsPlaying,
    setCurrentTime,
    youtubePlayer,
    analysisResults,
    keySignature,
    currentBeatIndex,
    chordGridData,
    segmentationData,
    audioUrl: audioProcessingState.audioUrl || null,
    bpm,
    timeSignature,
    chordPlayback,
    handleChordPlaybackChange,
    splitLayoutHeight,
    chromeProps,
    controlsProps,
    resultsPaneProps,
    sidePanelsProps,
    floatingDockProps,
    utilityBarProps,
  };
}
