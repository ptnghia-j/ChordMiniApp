"use client";

// TEMPORARY: Type compatibility issues with extracted services will be resolved in future iteration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/common/Navigation';

// Dynamic imports for heavy components to improve initial bundle size
const AnalysisSummary = dynamic(() => import('@/components/analysis/AnalysisSummary'), {
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ResponsiveVideoUtilityLayout = dynamic(() => import('@/components/layout/ResponsiveVideoUtilityLayout'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});


const LyricsPanel = dynamic(() => import('@/components/lyrics/LyricsPanel'), {
  loading: () => <div className="fixed right-4 bottom-16 w-96 h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SongContext } from '@/types/chatbotTypes';

import { useMetronomeSync } from '@/hooks/chord-playback/useMetronomeSync';
import { useAudioProcessing } from '@/hooks/audio/useAudioProcessing';
import { useAudioPlayer } from '@/hooks/chord-playback/useAudioPlayer';
import { useModelState } from '@/hooks/chord-analysis/useModelState';
import { useAnalyzePageOrchestrator } from '@/hooks/analyze/useAnalyzePageOrchestrator';
import { useAnalysisUsageTracker } from '@/hooks/analyze/useAnalysisUsageTracker';
import { useNavigationHelpers } from '@/hooks/ui/useNavigationHelpers';
import { transcribeLyricsWithAI as transcribeLyricsWithAIService } from '@/services/audio/audioProcessingExtracted';
import {
  getChordGridData as getChordGridDataService
} from '@/services/chord-analysis/chordGridCalculationService';
import { useAudioInteractions } from '@/hooks/chord-playback/useAudioInteractions';
import { useScrollAndAnimation } from '@/hooks/scroll/useScrollAndAnimation';
import { usePlaybackState } from '@/hooks/chord-playback/usePlaybackState';
import { useLoopPlayback, resolveLoopRange } from '@/hooks/chord-playback/useLoopPlayback';
import { useApiKeys } from '@/hooks/settings/useApiKeys';



// Import skeleton loaders
import {
  AnalysisControlsSkeleton,
  ChordGridSkeleton,
  LyricsSkeleton,
  ChatbotSkeleton
} from '@/components/common/SkeletonLoaders';

// Load analysis controls immediately as they're needed for user interaction
const AnalysisControls = dynamic(() => import('@/components/analysis/AnalysisControls').then(mod => ({ default: mod.AnalysisControls })), {


  loading: () => <AnalysisControlsSkeleton />,
  ssr: false
});

// Heavy analysis components - load only when analysis results are available
const ChordGridContainer = dynamic(() => import('@/components/chord-analysis/ChordGridContainer').then(mod => ({ default: mod.ChordGridContainer })), {
  loading: () => <ChordGridSkeleton />,
  ssr: false
});

// Lyrics section - load only when tab is active or lyrics are requested
const LyricsSection = dynamic(() => import('@/components/lyrics/LyricsSection').then(mod => ({ default: mod.LyricsSection })), {
  loading: () => <LyricsSkeleton />,
  ssr: false
});

// Guitar chords tab - load only when tab is active
const GuitarChordsTab = dynamic(() => import('@/components/chord-analysis/GuitarChordsTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

// Piano visualizer tab - load only when tab is active
const PianoVisualizerTab = dynamic(() => import('@/components/piano-visualizer/PianoVisualizerTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

// Chatbot interface - load only when user opens the chatbot
const ChatbotInterfaceDyn = dynamic(() => import('@/components/chatbot/ChatbotInterface'), {
  loading: () => <ChatbotSkeleton />, ssr: false
});

import dynamic from 'next/dynamic';
import BeatTimeline from '@/components/analysis/BeatTimeline';
import {
  simplifyChordArray,
  simplifySequenceCorrections
} from '@/utils/chordSimplification';

// Import new sub-components
import AnalyzePageBackdrop from '@/components/analysis/AnalyzePageBackdrop';
import FloatingVideoDock from '@/components/analysis/FloatingVideoDock';
import AnalysisHeader from '@/components/analysis/AnalysisHeader';
import ResultsTabs from '@/components/homepage/ResultsTabs';
import ProcessingBanners from '@/components/analysis/ProcessingBanners';

import AnalysisSplitLayout from '@/components/layout/AnalysisSplitLayout';

import UtilityBar from '@/components/analysis/UtilityBar';
import type { UseChordPlaybackReturn } from '@/hooks/chord-playback/useChordPlayback';
import { DEFAULT_PIANO_VOLUME, DEFAULT_GUITAR_VOLUME, DEFAULT_VIOLIN_VOLUME, DEFAULT_FLUTE_VOLUME } from '@/config/audioDefaults';
import { ChordPlaybackManager } from '@/components/chord-playback/ChordPlaybackManager';
import { buildAnalyzePageUrl, readAnalyzeRouteParams } from '@/utils/analyzeRouteUtils';
import { consumeAnalyzeSessionHandoff } from '@/utils/analyzeSessionHandoff';
// Import new hooks and contexts
import { useFirebaseReadiness } from '@/hooks/firebase/useFirebaseReadiness';
import { useYouTubeSetup } from '@/hooks/youtube/useYouTubeSetup';
import { useSegmentationState } from '@/hooks/lyrics/useSegmentationState';
import { useTabsAndEditing } from '@/hooks/ui/useTabsAndEditing';
import { useLyricsState } from '@/hooks/lyrics/useLyricsState';
import PitchShiftAudioManager from '@/components/chord-playback/PitchShiftAudioManager';
import KeySignatureSync from '@/components/analysis/KeySignatureSync';
import ConditionalPlaybackControls from '@/components/chord-playback/ConditionalPlaybackControls';
// Import Zustand stores for direct initialization
import { useAnalysisStore } from '@/stores/analysisStore';
import { useUIStore } from '@/stores/uiStore';
import { useIsLoopEnabled, useLoopStartBeat, useLoopEndBeat } from '@/stores/uiStore';

import { usePlaybackStore } from '@/stores/playbackStore';



export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = params?.videoId as string;
  const routeParams = readAnalyzeRouteParams(searchParams);
  const titleFromSearch = routeParams.title;
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const durationFromSearch = routeParams.duration;
  const channelFromSearch = routeParams.channel;
  const thumbnailFromSearch = routeParams.thumbnail;
  const autoStartRequested = Boolean(routeParams.autoStart);
  const [initialAnalyzeHandoff] = useState(() => consumeAnalyzeSessionHandoff(
    videoId,
    routeParams.beatModel,
    routeParams.chordModel
  ));

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
    failProcessing
  } = useProcessing();
  const { theme } = useTheme();
  const { isServiceAvailable, getServiceMessage } = useApiKeys();

  // Use custom hooks for audio processing and player
  const {
    state: audioProcessingState,
    analysisResults,
    videoTitle,
    analyzeAudio: analyzeAudioFromService,
    setState: setAudioProcessingState,
    setAnalysisResults,
    setVideoTitle
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
    setDuration
  } = useAudioPlayer();

  // Set video title from search parameters if available
  useEffect(() => {
    if (titleFromSearch && !videoTitle) {
      setVideoTitle(titleFromSearch);
    }
  }, [titleFromSearch, videoTitle, setVideoTitle]);

  // Use extracted model state management hook
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

  // Extract state from audio player hook
  const { isPlaying, currentTime, duration, playbackRate } = audioPlayerState;

  // Create setters for individual state properties
  const setIsPlaying = useCallback((playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  }, [setAudioPlayerState]);

  const setCurrentTime = useCallback((time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  }, [setAudioPlayerState]);

  // Use segmentation state hook
  const {
    segmentationData,
    showSegmentation,
    isSegmenting,
    segmentationError,
    toggleSegmentation,
    resetSegmentation,
  } = useSegmentationState();

  // Get chord processing state from Zustand stores
  const simplifyChords = useUIStore((state) => state.simplifyChords);
  const showRomanNumerals = useUIStore((state) => state.showRomanNumerals);
  const updateRomanNumeralData = useUIStore((state) => state.updateRomanNumeralData);
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  // Use lyrics state hook
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
    skipInitialCacheBootstrap: Boolean(initialAnalyzeHandoff),
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

    // Avoid forcing a client-side route rewrite on first paint when the page
    // already has explicit model params. That rewrite was causing a visible
    // remount/flash while the analyze shell was still hydrating.
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
      !!audioProcessingState.error
    ) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void handleAudioAnalysis();
  }, [
    autoStartRequested,
    audioProcessingState.audioUrl,
    audioProcessingState.error,
    audioProcessingState.isAnalyzed,
    audioProcessingState.isAnalyzing,
    audioProcessingState.isExtracted,
    handleAudioAnalysis,
    modelsInitialized,
  ]);

  const hideInitialAnalysisControls = autoStartRequested
    && !audioProcessingState.error
    && !audioProcessingState.isAnalyzed;

  // Memoize chord corrections to prevent useMemo dependency changes
  const memoizedChordCorrections = useMemo(() => chordCorrections, [chordCorrections]);
  const memoizedSequenceCorrections = useMemo(() => sequenceCorrections, [sequenceCorrections]);

  // (Removed) simplifiedChordCorrections: now provided via AnalysisDataContext when needed

  const simplifiedSequenceCorrections = useMemo(() => {
    return simplifyChords ? simplifySequenceCorrections(memoizedSequenceCorrections) : memoizedSequenceCorrections;
  }, [simplifyChords, memoizedSequenceCorrections]);

  // YouTube player state
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);

  // Use extracted navigation helpers hook
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
    isFollowModeEnabled
  });

  // Loop controls from UI store
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();

  // Use extracted audio interactions hook
  const {
    toggleEnharmonicCorrection,
  } = useAudioInteractions({
    showCorrectedChords,
    setShowCorrectedChords,
  });

  // Font size state (not part of lyrics hook)
  const [fontSize, setFontSize] = useState<number>(16);

  // Use tabs and editing hook (excluding videoTitle which comes from useAudioProcessing)
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

  // Chatbot state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);


  // Lyrics panel state
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);

  // Auto-minimize video when panels are open or when Guitar Chords / Piano Visualizer tab is active
  useEffect(() => {
    const shouldMinimize = isChatbotOpen || isLyricsPanelOpen || activeTab === 'guitarChords' || activeTab === 'pianoVisualizer';
    setIsVideoMinimized(shouldMinimize);
  }, [isChatbotOpen, isLyricsPanelOpen, activeTab]);

  const splitLayoutHeight = useMemo(() => {
    if (!isLyricsPanelOpen && !isChatbotOpen) {
      return 'calc(100vh - 180px)';
    }

    if (isCompactViewport) {
      return 'calc(100vh - 180px - var(--mobile-video-dock-height, 0px) - 5.5rem)';
    }

    return 'calc(100vh - 180px - var(--mobile-video-dock-height, 0px))';
  }, [isChatbotOpen, isCompactViewport, isLyricsPanelOpen]);

  // Create a wrapper for handleTitleSave that uses setVideoTitle from useAudioProcessing
  const handleTitleSave = useCallback(() => {
    if (editedTitle.trim()) {
      setVideoTitle(editedTitle.trim());
    }
    handleTitleSaveFromHook();
  }, [editedTitle, setVideoTitle, handleTitleSaveFromHook]);

  // Create a wrapper for handleChordEdit to match the expected signature (index-based)
  const handleChordEditWrapper = useCallback((index: number, newChord: string) => {
    // Convert index to chord string for the hook's signature
    const originalChord = `chord_${index}`;
    handleChordEdit(originalChord, newChord);
  }, [handleChordEdit]);

  // Use YouTube setup hook
  useYouTubeSetup(videoId, setAudioProcessingState);

  // Video title is now handled by the useAudioProcessing hook

  // PERFORMANCE OPTIMIZATION: Memoized song context for chatbot
  // Prevents object recreation on every render, reducing ChatbotSection re-renders
  const buildSongContext = useMemo((): SongContext => {
    return {
      videoId,
      title: videoTitle, // Use the fetched video title
      duration,

      // Beat detection results
      beats: analysisResults?.beats,
      downbeats: analysisResults?.downbeats,
      downbeats_with_measures: analysisResults?.downbeats_with_measures,
      beats_with_positions: analysisResults?.beats_with_positions,
      bpm: analysisResults?.beatDetectionResult?.bpm,
      time_signature: analysisResults?.beatDetectionResult?.time_signature,
      beatModel: analysisResults?.beatModel,

      // Chord detection results
      chords: analysisResults?.chords,
      synchronizedChords: analysisResults?.synchronizedChords,
      chordModel: analysisResults?.chordModel,

      // Lyrics data
      lyrics: lyrics || undefined,
      translatedLyrics: translatedLyrics,
      audioUrl: audioProcessingState.audioUrl || undefined,
    };
  }, [videoId, videoTitle, duration, analysisResults, lyrics, translatedLyrics, audioProcessingState.audioUrl]);

  useEffect(() => {
    resetSegmentation();
  }, [videoId, resetSegmentation]);

  const segmentationDisabledReason = !buildSongContext.audioUrl
    ? 'Song segmentation becomes available after audio extraction finishes.'
    : buildSongContext.audioUrl.startsWith('blob:')
      ? 'Song segmentation requires a backend-accessible extracted audio URL.'
      : !buildSongContext.beats?.length
        ? 'Song segmentation becomes available after beat analysis finishes.'
        : undefined;

  const canAnalyzeSegmentation = !segmentationDisabledReason;

  const handleSegmentationToggle = useCallback(() => {
    void toggleSegmentation(buildSongContext);
  }, [toggleSegmentation, buildSongContext]);

  // Function to handle chatbot toggle
  const toggleChatbot = () => {
    if (!isChatbotOpen && isLyricsPanelOpen) {
      // Close lyrics panel when opening chatbot
      setIsLyricsPanelOpen(false);
    }
    setIsChatbotOpen(!isChatbotOpen);
  };

  // Function to handle lyrics panel toggle
  const toggleLyricsPanel = () => {
    if (!isLyricsPanelOpen && isChatbotOpen) {
      // Close chatbot when opening lyrics panel
      setIsChatbotOpen(false);
    }
    setIsLyricsPanelOpen(!isLyricsPanelOpen);
  };

  // Function to check if chatbot should be available


  // Function to transcribe lyrics using Music.AI (word-level transcription)
  const transcribeLyricsWithAI = async () => {
    // Check if Music.AI service is available (user has valid API key)
    if (!isServiceAvailable('musicAi')) {
      setLyricsError(getServiceMessage('musicAi'));
      return;
    }
    // Create dependency object for extracted service
    const deps = {
      // State setters
      setAudioProcessingState: (updater: (prev: any) => any) => setAudioProcessingState(updater),
      setAnalysisResults: () => {}, // Not used in lyrics transcription
      setDuration: () => {}, // Not used in lyrics transcription
      setShowExtractionNotification, // Used for banner display
      setLyrics,
      setShowLyrics,
      setHasCachedLyrics,
      setActiveTab,
      setIsTranscribingLyrics,
      setLyricsError,

      // Processing context (not used in lyrics transcription)
      processingContext: {
        stage: '',
        progress: 0,
        setStage: () => {},
        setProgress: () => {},
        setStatusMessage: () => {},
        startProcessing: () => {},
        completeProcessing: () => {},
        failProcessing: () => {}
      },

      // Audio processing service (not used in lyrics transcription)
      analyzeAudioFromService: () => Promise.resolve({} as any), // Not used in lyrics transcription

      // Refs and state
      audioRef,
      beatDetectorRef,
      chordDetectorRef,

      // URL parameters
      videoId,
      titleFromSearch,
      durationFromSearch,
      channelFromSearch,
      thumbnailFromSearch,

      // Current state values
      audioProcessingState: {
        ...audioProcessingState,
        audioUrl: audioProcessingState.audioUrl || null // Convert undefined to null for compatibility
      },
      beatDetector,
      chordDetector,
      progress: 0,
      lyrics
    };

    // Call the extracted service function
    return await transcribeLyricsWithAIService(deps as any); // Type compatibility handled by wrapper
  };

  // Use YouTube handlers from usePlaybackState hook instead of duplicating logic


  const chordGridData = useMemo(() => getChordGridDataService(analysisResults as any) as any, [analysisResults]);

  // Create simplified and/or transposed chord grid data
  const simplifiedChordGridData = useMemo(() => {
    if (!chordGridData) return chordGridData;

    let processedChords = chordGridData.chords || [];

    // Apply simplification if enabled
    if (simplifyChords) {
      processedChords = simplifyChordArray(processedChords);
    }

    // Apply pitch shift transposition if enabled (will be accessed via context in child components)
    // Note: Transposition is applied in the ChordGrid component to access UIContext

    return {
      ...chordGridData,
      chords: processedChords
    };
  }, [chordGridData, simplifyChords]);

  // Use loop playback hook for automatic looping
  useLoopPlayback({
    youtubePlayer,
    beats: simplifiedChordGridData?.beats || [],
    currentTime,
    duration,
    setLastClickInfo
  });

  // CRITICAL FIX: Chord playback state managed by ChordPlaybackManager component
  // ChordPlaybackManager is inside UIProvider and handles transposition
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
    setFluteVolume: () => {}
  });

  // CRITICAL FIX: Memoize the callback to prevent infinite re-renders
  const handleChordPlaybackChange = useCallback((newChordPlayback: UseChordPlaybackReturn) => {
    setChordPlayback(newChordPlayback);
  }, []);

  // Countdown state
  const [isCountdownEnabled, setIsCountdownEnabled] = useState<boolean>(false);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');

  // Metronome state
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState<boolean>(false);

  const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults?.beatDetectionResult?.bpm || 120;

  // Countdown controller to prevent races/cancellation
  const countdownCtrlRef = useRef<{ intervalId: ReturnType<typeof setInterval> | null; aborted: boolean; token: number } | null>(null);

  // Guard refs to prevent countdown loop on programmatic play
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

    // Prevent starting a new countdown if one is already in progress
    if (countdownStateRef.current.inProgress) return false;

    const beatsPerMeasure = Math.max(2, Math.min(12, timeSignature || 4));
    const beatDurationSec = 60 / Math.max(1, bpm || 120);
    const totalMs = beatsPerMeasure * beatDurationSec * 1000;

    setIsCountingDown(true);
    const start = Date.now();
    const token = Math.random();
    const ctrl = { intervalId: null as ReturnType<typeof setInterval> | null, aborted: false, token };
    countdownCtrlRef.current = ctrl;

    // Mark countdown in progress and ensure player is paused
    countdownStateRef.current.inProgress = true;
    countdownStateRef.current.completed = false;
    try { (youtubePlayer as any)?.pauseVideo?.(); } catch {}
    setCountdownDisplay(`${beatsPerMeasure}`);

    // Drive countdown
    const ok = await new Promise<boolean>((resolve) => {
      ctrl.intervalId = setInterval(() => {
        // Abort guard
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
          // Completion (not aborted)
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

  // Reset countdown flags when playback is paused
  useEffect(() => {
    if (!isPlaying) {
      cancelCountdown();
      countdownStateRef.current.completed = false;
      countdownStateRef.current.inProgress = false;
    }
  }, [isPlaying, cancelCountdown]);

  // Cleanup countdown timer on unmount
  useEffect(() => {
    return () => {
      cancelCountdown();
    };
  }, [cancelCountdown]);


  const toggleCountdown = useCallback(() => {
    setIsCountdownEnabled(prev => !prev);
  }, []);


  // Use extracted scroll and animation hook
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

  // Metronome synchronization hook - PRE-GENERATED TRACK APPROACH
  const { toggleMetronomeWithSync } = useMetronomeSync({
    beats: analysisResults?.beats || [],
    downbeats: analysisResults?.downbeats,
    currentTime,
    isPlaying,
    timeSignature: analysisResults?.beatDetectionResult?.time_signature || 4,
    bpm: analysisResults?.beatDetectionResult?.bpm || 120, // Use detected BPM for metronome track generation
    beatTimeRangeStart: analysisResults?.beatDetectionResult?.beat_time_range_start || 0,
    shiftCount: chordGridData.shiftCount || 0,
    paddingCount: chordGridData.paddingCount || 0,
    chordGridBeats: chordGridData.beats || [], // Use same processed beats as chord grid
    audioDuration: analysisResults?.audioDuration || 0 // Total audio duration for track generation
  });

  // Sync metronome state with metronome service
  useEffect(() => {
    const syncMetronomeState = async () => {
      if (typeof window !== 'undefined') {
        const { metronomeService } = await import('@/services/chord-playback/metronomeService');
        setIsMetronomeEnabled(metronomeService.isMetronomeEnabled());
      }
    };
    syncMetronomeState();
  }, []);

  // Wrapper function to handle metronome toggle and state update
  const handleMetronomeToggle = useCallback(async (): Promise<boolean> => {
    const newEnabled = await toggleMetronomeWithSync();
    setIsMetronomeEnabled(newEnabled);
    return newEnabled;
  }, [toggleMetronomeWithSync]);

  // Ensure YouTube player is unmuted for playback
  useEffect(() => {
    if (youtubePlayer) {
      youtubePlayer.muted = false;
    }
    // Mute extracted audio element since we only use YouTube for playback
    if (audioRef.current) {
      audioRef.current.muted = true;
    }
  }, [youtubePlayer, audioRef]);

  // CRITICAL FIX: Sync playback rate with audio element
  // The audioRef is used for time tracking and must match the YouTube player's playback rate
  // Without this, the audio element continues at 1.0x speed while YouTube plays at the selected rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎵 Synced audio element playback rate to ${playbackRate}x`);
      }
    }
  }, [playbackRate, audioRef]);

  // Callbacks for ProcessingBanners
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

  // Initialize Zustand stores with page state
  // CRITICAL FIX: This useEffect should only run on initial mount or when non-Zustand state changes
  // Do NOT include Zustand-managed state (showRomanNumerals, simplifyChords, romanNumeralData) in dependencies
  // as that creates a circular loop causing race conditions during playback
  useEffect(() => {
    const analysisStore = useAnalysisStore.getState();
    const uiStore = useUIStore.getState();
    const playbackStore = usePlaybackStore.getState();

    // Initialize AnalysisStore
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

    // Initialize UIStore
    uiStore.setVideoTitle(videoTitle);
    // NOTE: Do NOT set showRomanNumerals, simplifyChords, or romanNumeralData here
    // These are managed by Zustand and user toggles - setting them here creates race conditions
    uiStore.setShowSegmentation(showSegmentation);
    uiStore.setIsChatbotOpen(isChatbotOpen);
    uiStore.setIsLyricsPanelOpen(isLyricsPanelOpen);
    // CRITICAL FIX: Extract just the note name from key signature (e.g., "E♭ major" -> "E♭")
    // to prevent duplicate "major/minor" text when pitch shift is enabled
    const noteName = keySignature ? keySignature.split(' ')[0] : 'C';
    uiStore.initializeOriginalKey(noteName);
    uiStore.initializeFirebaseAudioAvailable(!!audioProcessingState.audioUrl);

    // Initialize PlaybackStore
    playbackStore.setIsPlaying(isPlaying);
    playbackStore.setCurrentTime(currentTime);
    playbackStore.setDuration(duration);
    playbackStore.setPlaybackRate(playbackRate);
    playbackStore.setYoutubePlayer(youtubePlayer);
    playbackStore.setAudioRef(audioRef as any);
    playbackStore.setIsVideoMinimized(isVideoMinimized);
    playbackStore.setIsFollowModeEnabled(isFollowModeEnabled);
  }, [
    // CRITICAL: Do NOT include showRomanNumerals, simplifyChords, or romanNumeralData
    // These are Zustand-managed and including them causes circular updates during playback
    analysisResults, audioProcessingState.isAnalyzing, audioProcessingState.error, audioProcessingState.audioUrl,
    cacheAvailable, cacheCheckCompleted, cacheCheckInProgress,
    keySignature, isDetectingKey, chordCorrections, showCorrectedChords,
    beatDetector, chordDetector, modelsInitialized,
    lyrics, showLyrics, hasCachedLyrics, isTranscribingLyrics, lyricsError,
    videoTitle, showSegmentation,
    isChatbotOpen, isLyricsPanelOpen,
    isPlaying, currentTime, duration, playbackRate, youtubePlayer,
    isVideoMinimized, isFollowModeEnabled, audioRef
  ]);

  return (
    <div className="relative min-h-screen bg-background dark:bg-slate-900">
      {/* Conditional Playback Controls */}
      <ConditionalPlaybackControls
        youtubePlayer={youtubePlayer}
        setIsPlaying={setIsPlaying}
        setCurrentTime={setCurrentTime}
        setAudioPlayerState={setAudioPlayerState}
      >
        {() => (
          <>
            {/* Pitch Shift Audio Manager */}
            <PitchShiftAudioManager
              youtubePlayer={youtubePlayer}
              audioRef={audioRef}
              firebaseAudioUrl={audioProcessingState.audioUrl || null}
              isPlaying={isPlaying}
              currentTime={currentTime}
              playbackRate={playbackRate}
              setIsPlaying={setIsPlaying}
              setCurrentTime={setCurrentTime}
            />

            {/* Key Signature Sync - syncs detected key with Zustand store */}
            <KeySignatureSync keySignature={keySignature} />

            {/* Chord Playback Manager - handles transposition for chord playback */}
            {/* IMPORTANT: Use original chordGridData (not simplified) to preserve chord details for accurate playback */}
            <ChordPlaybackManager
              currentBeatIndex={currentBeatIndex}
              chordGridData={chordGridData}
              isPlaying={isPlaying}
              currentTime={currentTime}
              segmentationData={segmentationData}
              audioUrl={audioProcessingState.audioUrl || null}
              bpm={bpm}
              timeSignature={timeSignature}
              onChordPlaybackChange={handleChordPlaybackChange}
            />

    <div className="relative z-30 isolate flex min-h-screen flex-col overflow-hidden bg-background dark:bg-slate-900 transition-colors duration-300">
      <AnalyzePageBackdrop
        thumbnailUrl={analyzeBackdropUrl}
        showFooterTransition={Boolean(analysisResults)}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-white/45 to-transparent dark:from-white/5" />

      <div className="relative z-10 flex min-h-screen flex-col">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Processing Banners Component */}
      <ProcessingBanners
        isDownloading={audioProcessingState.isDownloading}
        fromCache={audioProcessingState.fromCache}
        showExtractionNotification={showExtractionNotification}
        onDismissExtraction={handleDismissExtraction}
        onRefreshExtraction={handleRefreshExtraction}
        analysisResults={analysisResults}
        audioDuration={duration}
        audioUrl={audioProcessingState.audioUrl || undefined}
        fromFirestoreCache={audioProcessingState.fromFirestoreCache}
        videoId={videoId}
        beatDetector={beatDetector}
        error={audioProcessingState.error || null}
        suggestion={audioProcessingState.suggestion || undefined}
        onTryAnotherVideo={handleTryAnotherVideo}
        onRetry={() => extractAudioFromYouTube(true)}
      />

      {/* Main viewport area - no page-level scrolling; panes will scroll independently */}
      <div className="flex-1 min-h-0">
        {/* Top controls (non-scrolling header in the split layout) */}
        <div className="px-4 pt-2 pb-1">
          <AnalysisControls
            isExtracted={audioProcessingState.isExtracted}
            isAnalyzed={audioProcessingState.isAnalyzed}
            isAnalyzing={audioProcessingState.isAnalyzing}
            hasError={!!audioProcessingState.error}
            stage={stage}
            beatDetector={beatDetector}
            chordDetector={chordDetector}
            onBeatDetectorChange={setBeatDetector}
            onChordDetectorChange={setChordDetector}
            onStartAnalysis={handleAudioAnalysis}
            cacheAvailable={cacheAvailable}
            cacheCheckCompleted={cacheCheckCompleted}
            hidden={hideInitialAnalysisControls}
          />
        </div>

        {/* Resizable split layout */}
        {/* Split layout switches to single-pane when both side panels are closed */}
        <div
          className="min-h-0 px-4 pb-1 transition-[height] duration-300"
          style={{
            height: splitLayoutHeight
          }}
        >
          <AnalysisSplitLayout
            isSplit={isLyricsPanelOpen || isChatbotOpen}
            storageKey="analysis-split-layout-sidepanels-v3"
            defaultDesktopLayout={[60, 40]}
            defaultMobileLayout={[66, 34]}
            left={(
              <div className="pr-2">
                {analysisResults && audioProcessingState.isAnalyzed ? (
                  <div className="space-y-2">
                    <AnalysisHeader
                      videoTitle={videoTitle}
                      isEditMode={isEditMode}
                      editedTitle={editedTitle}
                      onTitleChange={handleTitleChange}
                      onEditToggle={handleEditModeToggle}
                      onTitleSave={handleTitleSave}
                      onTitleCancel={handleTitleCancel}
                      showCorrectedChords={showCorrectedChords}
                      hasCorrections={((memoizedChordCorrections !== null && Object.keys(memoizedChordCorrections).length > 0) ||
                        (memoizedSequenceCorrections !== null && memoizedSequenceCorrections.correctedSequence.length > 0))}
                      toggleEnharmonicCorrection={toggleEnharmonicCorrection}
                      isTranscribingLyrics={isTranscribingLyrics}
                      hasCachedLyrics={hasCachedLyrics}
                      canTranscribe={isServiceAvailable('musicAi') && !!audioProcessingState.audioUrl}
                      transcribeLyricsWithAI={transcribeLyricsWithAI}
                      lyricsError={lyricsError}
                    />

                    <ResultsTabs
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      showLyrics={showLyrics}
                      hasCachedLyrics={hasCachedLyrics}
                    />

                    <div className="tab-content">
                      {activeTab === 'beatChordMap' && (
                        <div>
                          <ChordGridContainer
                            chordGridData={simplifiedChordGridData}
                            isChatbotOpen={isChatbotOpen}
                            isLyricsPanelOpen={isLyricsPanelOpen}
                            segmentationData={segmentationData}
                            isEditMode={isEditMode}
                            editedChords={editedChords}
                            onChordEdit={handleChordEditWrapper}
                            showCorrectedChords={showCorrectedChords}
                            sequenceCorrections={simplifiedSequenceCorrections}
                          />

                          <AnalysisSummary
                            analysisResults={analysisResults}
                            audioDuration={duration}
                            videoTitle={videoTitle}
                            usageCount={activeTranscriptionUsageCount}
                          >
                            <BeatTimeline
                              beats={analysisResults?.beats || []}
                              downbeats={analysisResults?.downbeats || []}
                              currentBeatIndex={currentBeatIndex}
                              currentDownbeatIndex={currentDownbeatIndex}
                              duration={duration}
                              embedded
                            />
                          </AnalysisSummary>
                        </div>
                      )}

                      {activeTab === 'guitarChords' && (
                        <GuitarChordsTab
                          chordGridData={simplifiedChordGridData}
                          isChatbotOpen={isChatbotOpen}
                          isLyricsPanelOpen={isLyricsPanelOpen}
                          isUploadPage={false}
                          sequenceCorrections={simplifiedSequenceCorrections}
                          segmentationData={segmentationData}
                        />
                      )}

                      {activeTab === 'pianoVisualizer' && (
                        <PianoVisualizerTab
                          chordGridData={simplifiedChordGridData}
                          sequenceCorrections={simplifiedSequenceCorrections}
                          segmentationData={segmentationData}
                          currentTime={currentTime}
                          currentBeatIndex={currentBeatIndex}
                          isPlaying={isPlaying}
                          isChordPlaybackEnabled={chordPlayback.isEnabled}
                          audioUrl={audioProcessingState.audioUrl || null}
                        />
                      )}
                    </div>

	                    {activeTab === 'lyricsChords' && (
	                      <LyricsSection
	                        lyrics={lyrics}
	                        showLyrics={showLyrics}
	                        hasCachedLyrics={hasCachedLyrics}
	                        currentTime={currentTime}
	                        fontSize={fontSize}
	                        onFontSizeChange={setFontSize}
	                        theme={theme}
	                        analysisResults={analysisResults}
	                        segmentationData={segmentationData}
	                        sequenceCorrections={simplifiedSequenceCorrections}
	                      />
	                    )}
                  </div>
                ) : (
	                  <div className="rounded-xl border border-dashed border-default-300/70 dark:border-default-700/70 bg-default-50/60 dark:bg-default-900/20 p-6 text-center">
	                    <p className="text-sm font-medium text-foreground">No analysis loaded yet</p>
	                    <p className="mt-1 text-sm text-default-500 dark:text-default-400">
	                      Choose your models above, then open cached results or run a fresh analysis.
	                    </p>
	                  </div>
                )}
              </div>
            )}
            right={(
              <div className="pl-2 h-full flex flex-col gap-4">
                {/* Render embedded panels stacked when open; components keep their logic, we override layout via className */}
                <div className="flex-1 relative">
                  <div className="absolute inset-0">
                    <div className="w-full h-full relative">
                      <div className={`absolute inset-0 transition-all duration-300 ${isLyricsPanelOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        <LyricsPanel
                          isOpen={isLyricsPanelOpen}
                          onClose={() => setIsLyricsPanelOpen(false)}
                          videoTitle={videoTitle}
                          currentTime={currentTime}
                          className="static inset-auto w-full h-full max-h-none max-w-none rounded-lg shadow-sm"
                          embedded
                        />
                      </div>
                      <div className={`absolute inset-0 transition-all duration-300 ${isChatbotOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        <ChatbotInterfaceDyn
                          isOpen={isChatbotOpen}
                          onClose={() => setIsChatbotOpen(false)}
                          songContext={buildSongContext}
                          className="static inset-auto w-full h-full max-h-none max-w-none rounded-lg shadow-sm"
                          embedded
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* FIXED: Responsive layout for utility bar and video player */}
      {analysisResults && (
        <ResponsiveVideoUtilityLayout
          isVideoMinimized={isVideoMinimized}
          isChatbotOpen={isChatbotOpen}
          isLyricsPanelOpen={isLyricsPanelOpen}
          videoPlayer={
            <FloatingVideoDock
              isChatbotOpen={isChatbotOpen}
              isLyricsPanelOpen={isLyricsPanelOpen}
              isVideoMinimized={isVideoMinimized}
              isFollowModeEnabled={isFollowModeEnabled}
              analysisResults={analysisResults}
              currentBeatIndex={currentBeatIndex}
              chords={simplifiedChordGridData?.chords || []}
              beats={simplifiedChordGridData?.beats || []}
              segmentationData={segmentationData}
              toggleVideoMinimization={toggleVideoMinimization}
              toggleFollowMode={toggleFollowMode}
              toggleMetronomeWithSync={async () => false}
              videoId={videoId}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              currentTime={currentTime}
              duration={duration}
              onReady={handleYouTubeReady}
              onPlay={async () => {
                if (isCountdownEnabled && !isPlaying && !countdownStateRef.current.inProgress && !countdownStateRef.current.completed) {
                  // Gate the first play with countdown
                  try { (youtubePlayer as any)?.pauseVideo?.(); } catch {}
                  const ok = await runCountdown();
                  if (ok) {
                    countdownStateRef.current.completed = false; // consume
                    try { (youtubePlayer as any)?.playVideo?.(); } catch {}
                    setIsPlaying(true);
                  }
                  return;
                }
                setIsPlaying(true);
              }}
              onPause={() => {
                // CRITICAL FIX: Always update isPlaying state, even when pitch shift is enabled
                // This ensures pitch-shifted audio pauses when YouTube player is paused
                // The pitch shift sync effect in usePitchShiftAudio will handle pausing the audio
                setIsPlaying(false);
              }}
              onProgress={handleYouTubeProgress}
              onSeek={(time: number) => {
                setCurrentTime(time);
                if (youtubePlayer && youtubePlayer.seekTo) {
                  youtubePlayer.seekTo(time, 'seconds');
                }
              }}
              onEnded={() => {
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
              }}

              youtubeEmbedUrl={audioProcessingState.youtubeEmbedUrl}
              videoUrl={audioProcessingState.videoUrl}
              youtubePlayer={youtubePlayer}
              showTopToggles={true} // Mobile-only via md:hidden inside FloatingVideoDock; desktop uses UtilityBar
              positionMode="relative" // Use relative positioning for responsive layout
              timeSignature={timeSignature}
              isCountdownEnabled={isCountdownEnabled}
              isCountingDown={isCountingDown}
              countdownDisplay={countdownDisplay}
              onRequestCountdown={async () => await runCountdown()}
            />
          }
          utilityBar={
            <UtilityBar className="hidden md:block"
              isFollowModeEnabled={isFollowModeEnabled}
              chordPlayback={chordPlayback}
              youtubePlayer={youtubePlayer}
              playbackRate={playbackRate}
              setPlaybackRate={(rate: number) => {
                setAudioPlayerState(prev => ({ ...prev, playbackRate: rate }));
              }}
              toggleFollowMode={toggleFollowMode}
              isCountdownEnabled={isCountdownEnabled}
              isCountingDown={isCountingDown}
              countdownDisplay={countdownDisplay}
              toggleCountdown={toggleCountdown}
              isChatbotOpen={isChatbotOpen}
              isLyricsPanelOpen={isLyricsPanelOpen}
              toggleChatbot={toggleChatbot}
              toggleLyricsPanel={toggleLyricsPanel}
              segmentation={{
                isVisible: showSegmentation && !!segmentationData,
                hasData: !!segmentationData,
                isLoading: isSegmenting,
                disabled: !canAnalyzeSegmentation && !segmentationData,
                disabledReason: !segmentationData ? segmentationDisabledReason : undefined,
                errorMessage: segmentationError,
                onToggle: handleSegmentationToggle,
              }}
              metronome={{
                isEnabled: isMetronomeEnabled,
                toggleMetronomeWithSync: handleMetronomeToggle
              }}
              totalBeats={simplifiedChordGridData?.beats?.length || 0}
            />
          }
        />
      )}

          </div>
          </div>
          {analysisResults ? (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-24 z-0 h-28 overflow-hidden">
              {analyzeBackdropUrl ? (
                <div
                  className="absolute inset-[-18%] scale-110 bg-cover bg-center opacity-24 blur-3xl saturate-150 dark:opacity-28"
                  style={{ backgroundImage: `url("${analyzeBackdropUrl}")` }}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/36 to-white/82 dark:via-slate-950/30 dark:to-slate-950/84" />
              <div className="absolute left-1/2 top-0 h-20 w-[92vw] max-w-[1180px] -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-300/8" />
            </div>
          ) : null}
          </>
        )}
      </ConditionalPlaybackControls>
    </div>
  );
}
