"use client";

// TEMPORARY: Type compatibility issues with extracted services will be resolved in future iteration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { useParams, useSearchParams } from 'next/navigation';
// Import types are used in type annotations and interfaces
import { getTranscription, saveTranscription } from '@/services/firestoreService';
import Navigation from '@/components/Navigation';

// Dynamic imports for heavy components to improve initial bundle size
const AnalysisSummary = dynamic(() => import('@/components/AnalysisSummary'), {
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ResponsiveVideoUtilityLayout = dynamic(() => import('@/components/ResponsiveVideoUtilityLayout'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});


const LyricsPanel = dynamic(() => import('@/components/LyricsPanel'), {
  loading: () => <div className="fixed right-4 bottom-16 w-96 h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SongContext } from '@/types/chatbotTypes';

import { useMetronomeSync } from '@/hooks/useMetronomeSync';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useModelState } from '@/hooks/useModelState';
import { useNavigationHelpers } from '@/hooks/useNavigationHelpers';
import {
  handleAudioAnalysis as handleAudioAnalysisService,
  transcribeLyricsWithAI as transcribeLyricsWithAIService,
  extractAudioFromYouTube as extractAudioFromYouTubeService
} from '@/services/audioProcessingExtracted';
import {
  getChordGridData as getChordGridDataService
} from '@/services/chordGridCalculationService';
import { useAudioInteractions } from '@/hooks/useAudioInteractions';
import { useScrollAndAnimation } from '@/hooks/useScrollAndAnimation';
import { usePlaybackState } from '@/hooks/usePlaybackState';
import { useLoopPlayback } from '@/hooks/useLoopPlayback';
import { useApiKeys } from '@/hooks/useApiKeys';



// Import skeleton loaders
import {
  AnalysisControlsSkeleton,
  ChordGridSkeleton,
  LyricsSkeleton,
  ChatbotSkeleton
} from '@/components/SkeletonLoaders';

// Load analysis controls immediately as they're needed for user interaction
const AnalysisControls = dynamic(() => import('@/components/AnalysisControls').then(mod => ({ default: mod.AnalysisControls })), {


  loading: () => <AnalysisControlsSkeleton />,
  ssr: false
});

// Heavy analysis components - load only when analysis results are available
const ChordGridContainer = dynamic(() => import('@/components/ChordGridContainer').then(mod => ({ default: mod.ChordGridContainer })), {
  loading: () => <ChordGridSkeleton />,
  ssr: false
});

// Lyrics section - load only when tab is active or lyrics are requested
const LyricsSection = dynamic(() => import('@/components/LyricsSection').then(mod => ({ default: mod.LyricsSection })), {
  loading: () => <LyricsSkeleton />,
  ssr: false
});

// Guitar chords tab - load only when tab is active
const GuitarChordsTab = dynamic(() => import('@/components/GuitarChordsTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

// Chatbot interface - load only when user opens the chatbot
const ChatbotInterfaceDyn = dynamic(() => import('@/components/ChatbotInterface'), {
  loading: () => <ChatbotSkeleton />, ssr: false
});

import dynamic from 'next/dynamic';
import BeatTimeline from '@/components/BeatTimeline';
import {
  simplifyChordArray,
  simplifySequenceCorrections
} from '@/utils/chordSimplification';

// Import new sub-components
import FloatingVideoDock from '@/components/FloatingVideoDock';
import AnalysisHeader from '@/components/AnalysisHeader';
import ResultsTabs from '@/components/ResultsTabs';
import ProcessingBanners from '@/components/ProcessingBanners';

import AnalysisSplitLayout from '@/components/layout/AnalysisSplitLayout';

import UtilityBar from '@/components/UtilityBar';
import type { UseChordPlaybackReturn } from '@/hooks/useChordPlayback';
import { ChordPlaybackManager } from '@/components/ChordPlaybackManager';
// Import new hooks and contexts
import { useFirebaseReadiness } from '@/hooks/useFirebaseReadiness';
import { useYouTubeSetup } from '@/hooks/useYouTubeSetup';
import { useSegmentationState } from '@/hooks/useSegmentationState';
import { useTabsAndEditing } from '@/hooks/useTabsAndEditing';
import { useLyricsState } from '@/hooks/useLyricsState';
import PitchShiftAudioManager from '@/components/PitchShiftAudioManager';
import KeySignatureSync from '@/components/KeySignatureSync';
import ConditionalPlaybackControls from '@/components/ConditionalPlaybackControls';
// Import Zustand stores for direct initialization
import { useAnalysisStore } from '@/stores/analysisStore';
import { useUIStore } from '@/stores/uiStore';
import { usePlaybackStore } from '@/stores/playbackStore';



export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const videoId = params?.videoId as string;
  const titleFromSearch = searchParams?.get('title') ? decodeURIComponent(searchParams.get('title')!) : null;

  // Extract additional metadata from URL parameters
  const durationFromSearch = searchParams?.get('duration') || null;
  const channelFromSearch = searchParams?.get('channel') ? decodeURIComponent(searchParams.get('channel')!) : null;
  const thumbnailFromSearch = searchParams?.get('thumbnail') ? decodeURIComponent(searchParams.get('thumbnail')!) : null;

  const {
    stage,
    progress: _progress, // eslint-disable-line @typescript-eslint/no-unused-vars
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
  } = useAudioProcessing(videoId);

  const {
    state: audioPlayerState,
    audioRef,
    youtubePlayer,
    handleTimeUpdate: _handleTimeUpdate, // eslint-disable-line @typescript-eslint/no-unused-vars
    handleLoadedMetadata: _handleLoadedMetadata, // eslint-disable-line @typescript-eslint/no-unused-vars
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
  } = useModelState();

  // Cache availability state
  const [cacheAvailable, setCacheAvailable] = useState<boolean>(false);
  const [cacheCheckCompleted, setCacheCheckCompleted] = useState<boolean>(false);
  const [cacheCheckInProgress, setCacheCheckInProgress] = useState<boolean>(false);

  // Firebase initialization tracking to prevent race conditions
  const { firebaseReady } = useFirebaseReadiness();
  const [initialCacheCheckDone, setInitialCacheCheckDone] = useState<boolean>(false);

  // Reset cache state when models change (persistence is handled in useModelState hook)
  // Combined into single useEffect to prevent multiple state updates
  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
    setCacheCheckInProgress(false);
    setInitialCacheCheckDone(false);
  }, [beatDetector, chordDetector]);

  // REGRESSION FIX: Reset initialCacheCheckDone when videoId changes
  // This ensures cache is checked for each new video in "Recently Transcribed"
  useEffect(() => {
    setInitialCacheCheckDone(false);
  }, [videoId]);

  const extractionLockRef = useRef<boolean>(false); // Prevent duplicate extraction
  const latestRequestIdRef = useRef<string | null>(null);
  const audioExtractionAbortControllerRef = useRef<AbortController | null>(null);

  // Cancel in-flight audio extraction when video changes or component unmounts
  useEffect(() => {
    return () => {
      audioExtractionAbortControllerRef.current?.abort();
    };
  }, [videoId]);


  // STREAMLINED: Check cache before extraction with connection management
  const checkCacheBeforeExtraction = useCallback(async (extractionFunction: (forceRefresh?: boolean) => Promise<{ title?: string; audioUrl?: string; fromCache?: boolean; duration?: number } | void>) => {
    if (!firebaseReady || initialCacheCheckDone) {
      return;
    }

    try {
      setInitialCacheCheckDone(true);

      // CRITICAL FIX: Ensure Firebase is initialized before cache check
      // The lazy initialization in firebase.ts means storage/db are null until initialized
      const { ensureFirebaseInitialized } = await import('@/config/firebase');
      await ensureFirebaseInitialized();
      console.log('✅ Firebase initialized before cache check');

      // PERFORMANCE FIX: Use connection manager for reliable cache access
      const { withFirebaseConnectionCheck } = await import('@/utils/firebaseConnectionManager');

      const cachedAudio = await withFirebaseConnectionCheck(async () => {
        const { getCachedAudioFile } = await import('@/services/firebaseStorageService');
        return await getCachedAudioFile(videoId);
      }, 'cached audio check');

      if (cachedAudio) {
        console.log(`✅ Found cached audio for ${videoId}, loading from cache`);

        // BANNER FIX: Ensure processing stage is properly reset to idle
        setStage('idle');
        setProgress(0);
        setStatusMessage('');

        // Set audio state directly from cache
        setAudioProcessingState(prev => ({
          ...prev,
          isExtracting: false,
          isDownloading: false,
          isExtracted: true,
          audioUrl: cachedAudio.audioUrl,
          fromCache: true,
          error: null,
          suggestion: null
        }));

        // Update duration if available
        if (cachedAudio.duration && cachedAudio.duration > 0) {
          setDuration(cachedAudio.duration);
        }

        // FIXED: Set video title from URL parameters when cached audio is found
        // This ensures "recently transcribed" videos show proper titles
        if (titleFromSearch) {
          setVideoTitle(titleFromSearch);
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Set video title from URL parameters: "${titleFromSearch}"`);
          }
        } else if (cachedAudio.title && cachedAudio.title !== `YouTube Video ${videoId}`) {
          setVideoTitle(cachedAudio.title);
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Set video title from cached audio: "${cachedAudio.title}"`);
          }
        }

        return; // Skip extraction since we have cached audio
      }

      // No cached audio found, proceed with extraction
      const extractionResult = await extractionFunction(false);

      // FIXED: Set video title from extraction result
      if (extractionResult && extractionResult.title) {
        setVideoTitle(extractionResult.title);
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Set video title from extraction: "${extractionResult.title}"`);
        }
      }

    } catch (error) {
      console.error('Error checking cached audio:', error);
      // If cache check fails, proceed with extraction anyway
      const extractionResult = await extractionFunction(false);

      // FIXED: Set video title from extraction result even when cache check fails
      if (extractionResult && extractionResult.title) {
        setVideoTitle(extractionResult.title);
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Set video title from extraction (cache check failed): "${extractionResult.title}"`);
        }
      }
    }
  }, [videoId, firebaseReady, initialCacheCheckDone, setAudioProcessingState, setDuration, setStage, setProgress, setStatusMessage, setVideoTitle, titleFromSearch]);

  // Extract state from audio player hook
  const { isPlaying, currentTime, duration, playbackRate } = audioPlayerState;

  // Create setters for individual state properties
  const setIsPlaying = useCallback((playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  }, [setAudioPlayerState]);

  const setCurrentTime = useCallback((time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  }, [setAudioPlayerState]);

  // Key signature state
  const [keySignature, setKeySignature] = useState<string | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);

  // Use segmentation state hook
  const {
    segmentationData,
    showSegmentation,
    handleSegmentationResult,
  } = useSegmentationState();

  // Get chord processing state from Zustand stores
  const simplifyChords = useUIStore((state) => state.simplifyChords);
  const showRomanNumerals = useUIStore((state) => state.showRomanNumerals);
  const updateRomanNumeralData = useUIStore((state) => state.updateRomanNumeralData);

  // Track Roman numerals request state locally (not in Zustand since it's page-specific)
  const [romanNumeralsRequested, setRomanNumeralsRequested] = useState(false);



  // Enharmonic correction state
  const [chordCorrections, setChordCorrections] = useState<Record<string, string> | null>(null);
  const [showCorrectedChords, setShowCorrectedChords] = useState(false);
  // NEW: Enhanced sequence-based corrections
  const [sequenceCorrections, setSequenceCorrections] = useState<{
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
    romanNumerals?: {
      analysis: string[];
      keyContext: string;
      temporalShifts?: Array<{
        chordIndex: number;
        targetKey: string;
        romanNumeral: string;
      }>;
    } | null;
  } | null>(null);

  // Memoize chord corrections to prevent useMemo dependency changes
  const memoizedChordCorrections = useMemo(() => chordCorrections, [chordCorrections]);
  const memoizedSequenceCorrections = useMemo(() => sequenceCorrections, [sequenceCorrections]);

  // (Removed) simplifiedChordCorrections: now provided via AnalysisDataContext when needed

  const simplifiedSequenceCorrections = useMemo(() => {
    return simplifyChords ? simplifySequenceCorrections(memoizedSequenceCorrections) : memoizedSequenceCorrections;
  }, [simplifyChords, memoizedSequenceCorrections]);

  // Auto-enable corrections when sequence corrections are available (only once)
  const [hasAutoEnabledCorrections, setHasAutoEnabledCorrections] = useState(false);
  useEffect(() => {
    if (sequenceCorrections && sequenceCorrections.correctedSequence.length > 0 && !showCorrectedChords && !hasAutoEnabledCorrections) {
      setShowCorrectedChords(true);
      setHasAutoEnabledCorrections(true);
    }
  }, [sequenceCorrections, showCorrectedChords, hasAutoEnabledCorrections]);

  // REMOVED: Separate Roman numeral useEffect to prevent duplicate API calls
  // Roman numeral logic is now integrated into the main key detection useEffect below

  // Reset Roman numerals requested flag when toggled off
  useEffect(() => {
    if (!showRomanNumerals) {
      setRomanNumeralsRequested(false);
    }
  }, [showRomanNumerals, setRomanNumeralsRequested]);

  const [keyDetectionAttempted, setKeyDetectionAttempted] = useState(false);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const currentBeatIndexRef = useRef(-1);
  const [currentDownbeatIndex, setCurrentDownbeatIndex] = useState(-1);
  // Track recent user clicks for smart animation positioning
  const [lastClickInfo, setLastClickInfo] = useState<{
    visualIndex: number;
    timestamp: number;
    clickTime: number;
  } | null>(null);
  const [globalSpeedAdjustment, setGlobalSpeedAdjustment] = useState<number | null>(null); // Store calculated speed adjustment

  // YouTube player state
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  // Use extracted navigation helpers hook
  const {
    handleTryAnotherVideo,
    toggleVideoMinimization,
    toggleFollowMode,
  } = useNavigationHelpers({
    setIsVideoMinimized,
    setIsFollowModeEnabled,
  });

  // Use extracted audio interactions hook
  const {
    toggleEnharmonicCorrection,
  } = useAudioInteractions({
    audioRef,
    youtubePlayer,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setLastClickInfo,
    showCorrectedChords,
    setShowCorrectedChords,
  });

  // Use playback state hook for YouTube event handlers
  const {
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

  // Enhanced audio analysis function that integrates with processing context
  const handleAudioAnalysis = useCallback(async () => {
    // Create dependency object for extracted service with type-compatible wrappers
    const deps = {
      // State setters with type compatibility wrappers
      setAudioProcessingState: (updater: (prev: any) => any) => setAudioProcessingState(updater),
      setAnalysisResults,
      setDuration,
      setShowExtractionNotification, // Used for banner display
      setLyrics: () => {}, // Not used in analysis
      setShowLyrics: () => {}, // Not used in analysis
      setHasCachedLyrics: () => {}, // Not used in analysis
      setActiveTab: () => {}, // Not used in analysis
      setIsTranscribingLyrics: () => {}, // Not used in analysis
      setLyricsError: () => {}, // Not used in analysis

      // Processing context
      processingContext: {
        stage: '',
        progress: 0,
        setStage,
        setProgress,
        setStatusMessage,
        startProcessing,
        completeProcessing,
        failProcessing
      },

      // Audio processing service
      analyzeAudioFromService,

      // Refs and state
      audioRef,
      extractionLockRef,
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
      progress: 0
    };

    // Call the extracted service function
    return await handleAudioAnalysisService(deps as any); // Type compatibility handled by wrapper
  }, [
    audioProcessingState,
    analyzeAudioFromService,
    beatDetector,
    chordDetector,
    beatDetectorRef,
    chordDetectorRef,
    completeProcessing,
    failProcessing,
    setAnalysisResults,
    setAudioProcessingState,
    setDuration,
    setProgress,
    setStage,
    setStatusMessage,
    startProcessing,
    videoId,
    titleFromSearch,
    durationFromSearch,
    channelFromSearch,
    thumbnailFromSearch,
    audioRef,
    extractionLockRef
  ]); // Complete dependency array

  // PERFORMANCE OPTIMIZATION: Split massive useEffect into focused effects

  // Audio state changes only - check cache when audio is extracted
  useEffect(() => {
    const checkAnalysisCache = async () => {
      // Only check if audio is extracted and models are ready
      if (
        audioProcessingState.isExtracted &&
        audioProcessingState.audioUrl &&
        !audioProcessingState.isAnalyzed &&
        !audioProcessingState.isAnalyzing &&
        modelsInitialized &&
        !cacheCheckCompleted &&
        !cacheCheckInProgress
      ) {
        try {
          setCacheCheckInProgress(true);

          // BANNER FIX: Use connection manager for reliable cache access after inactivity
          const { withFirebaseConnectionCheck } = await import('@/utils/firebaseConnectionManager');

          const cachedData = await withFirebaseConnectionCheck(async () => {
            return await getTranscription(videoId, beatDetector, chordDetector);
          }, 'analysis cache check');

          if (cachedData) {
            setCacheAvailable(true);
          } else {
            setCacheAvailable(false);
          }

          setCacheCheckCompleted(true);
        } catch (error) {
          console.error('Error checking cached analysis:', error);
          setCacheAvailable(false);
          setCacheCheckCompleted(true);
        } finally {
          setCacheCheckInProgress(false);
        }
      }
    };

    checkAnalysisCache();
  }, [
    audioProcessingState.isExtracted,
    audioProcessingState.audioUrl,
    audioProcessingState.isAnalyzed,
    audioProcessingState.isAnalyzing,
    modelsInitialized,
    cacheCheckCompleted,
    cacheCheckInProgress,
    videoId,
    beatDetector,
    chordDetector
  ]);

  // Stage management - handle banner dismissal when stage changes
  useEffect(() => {
    // BANNER FIX (scoped): After cache check, only reset to idle for pre-analysis stages
    if (!cacheCheckCompleted) return;

    // Do NOT interfere with analysis stages (beat-detection, chord-recognition) or completion
    if (stage === 'downloading' || stage === 'extracting') {
      setStage('idle');
      setProgress(0);
      setStatusMessage('');
    }
  }, [cacheCheckCompleted, stage, setStage, setProgress, setStatusMessage]);

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

  // Auto-minimize video when panels are open
  useEffect(() => {
    const shouldMinimize = isChatbotOpen || isLyricsPanelOpen;
    setIsVideoMinimized(shouldMinimize);
  }, [isChatbotOpen, isLyricsPanelOpen]);

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

  // Check for cached enharmonic correction data when analysis results are loaded
  useEffect(() => {
    const checkCachedEnharmonicData = async () => {
      if (analysisResults?.chords && analysisResults.chords.length > 0 && !chordCorrections) {
        try {
          // Get current model values at execution time
          const currentBeatDetector = beatDetector;
          const currentChordDetector = chordDetector;
          const cachedTranscription = await getTranscription(videoId, currentBeatDetector, currentChordDetector);
          // Check cached transcription data for chord corrections

          if (cachedTranscription && cachedTranscription.chordCorrections) {
            // Loading cached chord corrections (new format)
            setChordCorrections(cachedTranscription.chordCorrections);
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
            // Load cached Roman numeral data
            if (cachedTranscription.romanNumerals) {
              updateRomanNumeralData(cachedTranscription.romanNumerals);

            }
          } else if (cachedTranscription && cachedTranscription.originalChords && cachedTranscription.correctedChords) {
            // Backward compatibility: convert old format to new format
            const corrections: Record<string, string> = {};
            for (let i = 0; i < cachedTranscription.originalChords.length && i < cachedTranscription.correctedChords.length; i++) {
              const original = cachedTranscription.originalChords[i];
              const corrected = cachedTranscription.correctedChords[i];
              if (original !== corrected) {
                corrections[original] = corrected;
              }
            }
            if (Object.keys(corrections).length > 0) {
              setChordCorrections(corrections);
            }
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
            // Load cached Roman numeral data (backward compatibility)
            if (cachedTranscription.romanNumerals) {
              updateRomanNumeralData(cachedTranscription.romanNumerals);

            }
          } else {
            // No cached chord corrections found
          }
        } catch (error) {
          console.error('Failed to load cached enharmonic correction data:', error);
        }
      }
    };

    checkCachedEnharmonicData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisResults?.chords, videoId, chordCorrections]); // Removed beatDetector and chordDetector to prevent unnecessary re-runs

  // Unified key detection effect - handles both initial detection and Roman numeral requests
  useEffect(() => {
    // Determine if we need to make an API call
    const needsInitialDetection = analysisResults?.chords && analysisResults.chords.length > 0 && !isDetectingKey && !keyDetectionAttempted;
    const needsRomanNumerals = showRomanNumerals && analysisResults && !romanNumeralsRequested && (sequenceCorrections?.romanNumerals?.analysis?.length || 0) === 0;

    if (needsInitialDetection || needsRomanNumerals) {
      setIsDetectingKey(true);
      if (needsInitialDetection) {
        setKeyDetectionAttempted(true);
      }
      if (needsRomanNumerals) {
        setRomanNumeralsRequested(true);
      }

      // Prepare chord data for key detection
      // CRITICAL FIX: Deduplicate consecutive identical chords to avoid beat-level analysis
      const rawChordData = analysisResults.chords.map((chord) => ({
        chord: chord.chord,
        time: chord.time
      }));

      // Remove consecutive duplicate chords to get only chord changes
      const chordData = rawChordData.filter((chord, index) => {
        if (index === 0) return true; // Always include first chord
        return chord.chord !== rawChordData[index - 1].chord; // Include only if different from previous
      });



      // Import and call key detection service with enharmonic correction

      import('@/services/keyDetectionService').then(({ detectKey }) => {
        // Use cache for sequence corrections (no bypass)
        detectKey(chordData, true, false, showRomanNumerals) // Request enharmonic correction, use cache, include Roman numerals if enabled
          .then(result => {

            setKeySignature(result.primaryKey);

            // Handle sequence-based corrections (preferred)
            if (result.sequenceCorrections && result.sequenceCorrections.correctedSequence) {
              setSequenceCorrections(result.sequenceCorrections);

              // Also set legacy corrections for backward compatibility
              if (result.corrections && Object.keys(result.corrections).length > 0) {
                setChordCorrections(result.corrections);
              }
            } else if (result.corrections && Object.keys(result.corrections).length > 0) {
              // FALLBACK: Use legacy chord corrections
              setChordCorrections(result.corrections);
            }

            // Handle Roman numeral analysis (separate from sequence corrections)
            if (result.romanNumerals) {
              updateRomanNumeralData(result.romanNumerals);
            } else {
              updateRomanNumeralData(null);
            }

            // Update the transcription cache with key signature and enharmonic correction data
            if (result.primaryKey && result.primaryKey !== 'Unknown') {
              const updateTranscriptionWithKey = async () => {
                try {
                  // Get current model values at execution time
                  const currentBeatDetector = beatDetector;
                  const currentChordDetector = chordDetector;
                  const cachedTranscription = await getTranscription(videoId, currentBeatDetector, currentChordDetector);
                  if (cachedTranscription) {
                    await saveTranscription({
                      ...cachedTranscription,
                      keySignature: result.primaryKey,
                      keyModulation: result.modulation,
                      chordCorrections: result.corrections || null,
                      romanNumerals: result.romanNumerals || null
                    });
                    // console.log('Updated transcription cache with key signature and enharmonic correction data:', result.primaryKey);
                  }
                } catch (error) {
                  console.error('Failed to update transcription cache with key signature and enharmonic correction data:', error);
                }
              };
              updateTranscriptionWithKey();
            }
          })
          .catch(error => {
            console.error('Failed to detect key:', error);
            setKeySignature(null);
          })
          .finally(() => {
            setIsDetectingKey(false);
          });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisResults?.chords, isDetectingKey, keyDetectionAttempted, videoId, showRomanNumerals, romanNumeralsRequested]); // FIXED: Removed sequenceCorrections?.romanNumerals to prevent infinite loop

  // Use YouTube setup hook
  useYouTubeSetup(videoId, setAudioProcessingState);

  // RACE CONDITION FIX: Load video info and extract audio AFTER Firebase is ready
  useEffect(() => {
    if (videoId && firebaseReady && !audioProcessingState.isExtracting && !extractionLockRef.current && !initialCacheCheckDone) {

      // BANNER FIX: Reset processing context for new video
      setStage('idle');
      setProgress(0);
      setStatusMessage('');

      // Reset key detection flag for new video
      setKeyDetectionAttempted(false);
      setRomanNumeralsRequested(false); // Reset Roman numerals flag for new video
      setChordCorrections(null); // Reset chord corrections for new video
      setShowCorrectedChords(false); // Reset to show original chords
      setHasAutoEnabledCorrections(false); // Reset auto-enable flag for new video
      setSequenceCorrections(null); // Reset sequence corrections for new video

      // RACE CONDITION FIX: Check cache BEFORE starting extraction
      // BANNER FIX: Ensure this operation completes properly
      const performCacheCheck = async () => {
        try {
          await checkCacheBeforeExtraction(extractAudioFromYouTube);
        } catch (error) {
          console.error('Cache check failed during initial load:', error);
          // BANNER FIX: Ensure banner is dismissed even if cache check fails
          setStage('idle');
          setProgress(0);
          setStatusMessage('');
        }
      };

      performCacheCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, titleFromSearch, firebaseReady, initialCacheCheckDone]); // Re-run when videoId, titleFromSearch, or Firebase readiness changes



  useEffect(() => {
    // Auto-load cached lyrics AFTER audio extraction is complete
    // This replaces the old checkCachedLyricsService with auto-loading logic from LyricsManager
    const autoLoadCachedLyrics = async () => {
      // Only check for cached lyrics if we have an audio URL and no existing lyrics
      if ((!lyrics || !lyrics.lines || lyrics.lines.length === 0) && audioProcessingState.audioUrl) {
        try {
          const response = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params?.videoId || videoId,
              audioPath: audioProcessingState.audioUrl,
              forceRefresh: false,
              checkCacheOnly: true // Only check cache without processing
            }),
          });

          const data = await response.json();

          if (response.ok && data.success && data.lyrics) {
            if (data.lyrics.lines && Array.isArray(data.lyrics.lines) && data.lyrics.lines.length > 0) {
              // Auto-load cached lyrics for Music.AI transcription (no user choices needed)
              setLyrics(data.lyrics);
              setShowLyrics(true);
              setHasCachedLyrics(false); // Don't show "Cached Lyrics Available" when lyrics are auto-loaded
              // Don't auto-switch to lyrics tab, let user choose

            }
          } else {
            // No cached lyrics found, set hasCachedLyrics to false
            setHasCachedLyrics(false);
          }
        } catch (error) {
          // Silently handle cache check errors
          console.log('Cache check failed:', error);
          setHasCachedLyrics(false);
        }
      }
    };

    if (audioProcessingState.isExtracted && audioProcessingState.audioUrl) {
      // PERFORMANCE FIX: Load lyrics immediately without delay
      autoLoadCachedLyrics();
    }
  }, [videoId, params, lyrics, audioProcessingState.isExtracted, audioProcessingState.audioUrl, setLyrics, setShowLyrics, setHasCachedLyrics, setActiveTab]); // Re-run when audio extraction completes

  // REMOVED: Duplicate cache checking useEffect - now handled by the single useEffect above

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
      translatedLyrics: translatedLyrics
    };
  }, [videoId, videoTitle, duration, analysisResults, lyrics, translatedLyrics]);

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
      extractionLockRef,
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

  // Extract audio from YouTube using our API endpoint
  const extractAudioFromYouTube = useCallback(async (forceRefresh = false): Promise<{ title?: string; audioUrl?: string; fromCache?: boolean; duration?: number } | void> => {
    // Cancel any in-flight extraction tied to the previous request
    if (audioExtractionAbortControllerRef.current) {
      try { audioExtractionAbortControllerRef.current.abort(); } catch {}
    }
    // Unlock extraction (previous request was cancelled)
    extractionLockRef.current = false;

    // Create a new controller and request ID for this invocation
    const controller = new AbortController();
    audioExtractionAbortControllerRef.current = controller;

    const requestId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

    // Mark this request as the latest
    latestRequestIdRef.current = requestId;

    // Create dependency object for extracted service
    const deps = {
      // State setters
      setAudioProcessingState: (updater: (prev: any) => any) => setAudioProcessingState(updater),
      setAnalysisResults: () => {}, // Not used in audio extraction
      setDuration: () => {}, // Not used in audio extraction
      setShowExtractionNotification,
      setLyrics: () => {}, // Not used in audio extraction
      setShowLyrics: () => {}, // Not used in audio extraction
      setHasCachedLyrics: () => {}, // Not used in audio extraction
      setActiveTab: () => {}, // Not used in audio extraction
      setIsTranscribingLyrics: () => {}, // Not used in audio extraction
      setLyricsError: () => {}, // Not used in audio extraction

      // Processing context (not used in audio extraction)
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

      // Audio processing service (not used in audio extraction)
      analyzeAudioFromService: () => Promise.resolve({} as any), // Not used in audio extraction

      // Refs and state
      audioRef,
      extractionLockRef,
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

      // Request cancellation & staleness control
      requestId,
      abortSignal: controller.signal,
      isRequestStillCurrent: (id: string) => latestRequestIdRef.current === id,
    };

    // Call the extracted service function
    return await extractAudioFromYouTubeService(deps as any, forceRefresh); // Type compatibility handled by wrapper
  }, [
    videoId,
    setShowExtractionNotification,
    audioProcessingState,
    audioRef,
    beatDetector,
    beatDetectorRef,
    channelFromSearch,
    chordDetector,
    chordDetectorRef,
    durationFromSearch,
    setAudioProcessingState,
    thumbnailFromSearch,
    titleFromSearch,
    extractionLockRef
  ]);

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
    isPlaying,
    setLastClickInfo
  });

  // CRITICAL FIX: Chord playback state managed by ChordPlaybackManager component
  // ChordPlaybackManager is inside UIProvider and handles transposition
  const [chordPlayback, setChordPlayback] = useState<UseChordPlaybackReturn>({
    isEnabled: false,
    pianoVolume: 50,
    guitarVolume: 30,
    violinVolume: 60,
    fluteVolume: 50,
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

  const toggleCountdown = useCallback(() => {
    setIsCountdownEnabled(prev => !prev);
  }, []);


  // Use extracted scroll and animation hook
  useScrollAndAnimation({
    youtubePlayer,
    isPlaying,
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
        const { metronomeService } = await import('@/services/metronomeService');
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
  }, [playbackRate]);

  // Callbacks for ProcessingBanners
  const handleDismissExtraction = useCallback(() => {
    setShowExtractionNotification(false);
  }, []);

  const handleRefreshExtraction = useCallback(() => {
    extractAudioFromYouTube(true);
  }, [extractAudioFromYouTube]);

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
    if (audioProcessingState.isAnalyzing) {
      analysisStore.startAnalysis();
    }
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
    if (isTranscribingLyrics) {
      analysisStore.startLyricsTranscription();
    }
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
    playbackStore.setCurrentBeatIndex(currentBeatIndex);
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
    isPlaying, currentTime, duration, playbackRate, youtubePlayer, currentBeatIndex,
    isVideoMinimized, isFollowModeEnabled
  ]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
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
              bpm={bpm}
              onChordPlaybackChange={handleChordPlaybackChange}
            />

    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300 overflow-hidden">
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
          />
        </div>

        {/* Resizable split layout */}
        {/* Split layout switches to single-pane when both side panels are closed */}
        <div className="h-[calc(100vh-180px)] min-h-0 px-4 pb-1">
          <AnalysisSplitLayout
            isSplit={isLyricsPanelOpen || isChatbotOpen}
            storageKey="analysis-split-layout-v1"
            defaultDesktopLayout={[60, 40]}
            defaultMobileLayout={[60, 40]}
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
                      hasSegmentationData={!!segmentationData}
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
                            sequenceCorrections={simplifiedSequenceCorrections}
                          />

                          <AnalysisSummary
                            analysisResults={analysisResults}
                            audioDuration={duration}
                          />
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
	                      />
	                    )}


                    {activeTab === 'beatChordMap' && (
                      <BeatTimeline
                        beats={analysisResults?.beats || []}
                        downbeats={analysisResults?.downbeats || []}
                        currentBeatIndex={currentBeatIndex}
                        currentDownbeatIndex={currentDownbeatIndex}
                        duration={duration}
                      />
                    )}
                  </div>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400 p-4">Run analysis to see results</div>
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
                          onSegmentationResult={handleSegmentationResult}
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
                if (youtubePlayer && youtubePlayer.seekTo) {
                  youtubePlayer.seekTo(time, 'seconds');
                }
              }}
              youtubeEmbedUrl={audioProcessingState.youtubeEmbedUrl}
              videoUrl={audioProcessingState.videoUrl}
              youtubePlayer={youtubePlayer}
              showTopToggles={false} // Hide top toggles since they're in utility bar
              positionMode="relative" // Use relative positioning for responsive layout
              isCountdownEnabled={isCountdownEnabled}
              isCountingDown={isCountingDown}
              countdownDisplay={countdownDisplay}
              onRequestCountdown={async () => await runCountdown()}
            />
          }
          utilityBar={
            <UtilityBar
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
          </>
        )}
      </ConditionalPlaybackControls>
    </div>
  );
}



