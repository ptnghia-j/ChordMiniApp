"use client";

// ✅ TEMPORARY: Type compatibility issues with extracted services will be resolved in future iteration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { useParams, useSearchParams } from 'next/navigation';
// Import types are used in type annotations and interfaces
import { getTranscription, saveTranscription } from '@/services/firestoreService';
import Navigation from '@/components/Navigation';
import LyricsToggleButton from '@/components/LyricsToggleButton';

// Dynamic imports for heavy components to improve initial bundle size
const ProcessingStatusBanner = dynamic(() => import('@/components/ProcessingStatusBanner'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: true
});

const AnalysisSummary = dynamic(() => import('@/components/AnalysisSummary'), {
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ExtractionNotification = dynamic(() => import('@/components/ExtractionNotification'), {
  loading: () => <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const DownloadingIndicator = dynamic(() => import('@/components/DownloadingIndicator'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const MetronomeControls = dynamic(() => import('@/components/MetronomeControls'), {
  loading: () => <div className="h-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const LyricsPanel = dynamic(() => import('@/components/LyricsPanel'), {
  loading: () => <div className="fixed right-4 bottom-16 w-96 h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SongContext } from '@/types/chatbotTypes';
import { LyricsData } from '@/types/musicAiTypes';
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
import {
  checkCachedAnalysisAvailability as checkCachedAnalysisAvailabilityService
} from '@/services/cacheManagementService';
import { useAudioInteractions } from '@/hooks/useAudioInteractions';
import { useScrollAndAnimation } from '@/hooks/useScrollAndAnimation';
import { useApiKeys } from '@/hooks/useApiKeys';

// Import skeleton loaders
import {
  AudioPlayerSkeleton,
  AnalysisControlsSkeleton,
  ChordGridSkeleton,
  LyricsSkeleton,
  ChatbotSkeleton
} from '@/components/SkeletonLoaders';

// Optimized dynamic imports with progressive loading strategy
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then(mod => ({ default: mod.AudioPlayer })), {
  loading: () => <AudioPlayerSkeleton />,
  ssr: false
});

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

// Chatbot - load only when user opens the chatbot
const ChatbotSection = dynamic(() => import('@/components/ChatbotSection').then(mod => ({ default: mod.ChatbotSection })), {
  loading: () => <ChatbotSkeleton />,
  ssr: false
});
import { YouTubePlayer } from '@/types/youtube';
import dynamic from 'next/dynamic';
import UserFriendlyErrorDisplay from '@/components/UserFriendlyErrorDisplay';
import BeatTimeline from '@/components/BeatTimeline';


// Import the new collapsible video player
const CollapsibleVideoPlayer = dynamic(() => import('@/components/CollapsibleVideoPlayer'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
      <div className="text-white">Loading player...</div>
    </div>
  )
});

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
    play,
    pause,
    seek,
    setPlaybackRate: setPlayerPlaybackRate,
    setPreferredAudioSource,
    handleTimeUpdate: _handleTimeUpdate, // eslint-disable-line @typescript-eslint/no-unused-vars
    handleLoadedMetadata: _handleLoadedMetadata, // eslint-disable-line @typescript-eslint/no-unused-vars
    handleYouTubePlayerReady,
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

  // Reset cache state when models change (persistence is handled in useModelState hook)
  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
  }, [beatDetector]);

  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
  }, [chordDetector]);

  const extractionLockRef = useRef<boolean>(false); // Prevent duplicate extraction

  // Extract state from audio player hook
  const { isPlaying, currentTime, duration, playbackRate, preferredAudioSource } = audioPlayerState;

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
  } | null>(null);

  // Memoize chord corrections to prevent useMemo dependency changes
  const memoizedChordCorrections = useMemo(() => chordCorrections, [chordCorrections]);
  const memoizedSequenceCorrections = useMemo(() => sequenceCorrections, [sequenceCorrections]);

  // Auto-enable corrections when sequence corrections are available (only once)
  const [hasAutoEnabledCorrections, setHasAutoEnabledCorrections] = useState(false);
  useEffect(() => {
    if (sequenceCorrections && sequenceCorrections.correctedSequence.length > 0 && !showCorrectedChords && !hasAutoEnabledCorrections) {
      setShowCorrectedChords(true);
      setHasAutoEnabledCorrections(true);
    }
  }, [sequenceCorrections, showCorrectedChords, hasAutoEnabledCorrections]);


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
    toggleAudioSource,
  } = useNavigationHelpers({
    setIsVideoMinimized,
    setIsFollowModeEnabled,
    preferredAudioSource,
    setPreferredAudioSource,
    youtubePlayer,
    audioRef,
  });

  // Use extracted audio interactions hook
  const {
    handleBeatClick,
    toggleEnharmonicCorrection,
    handleLoadedMetadata,
    handleTimeUpdate,
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

  // ✅ EXTRACTED: Check for cached analysis availability using service
  useEffect(() => {
    const deps = {
      videoId,
      beatDetector,
      chordDetector,
      audioProcessingState,
      modelsInitialized,
      setCacheAvailable,
      setCacheCheckCompleted,
      lyrics: null, // Not used in this check
      setHasCachedLyrics: () => {} // Not used in this check
    };

    checkCachedAnalysisAvailabilityService(deps as any);
  }, [audioProcessingState, videoId, beatDetector, chordDetector, modelsInitialized]);

  // Lyrics transcription state
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isTranscribingLyrics, setIsTranscribingLyrics] = useState<boolean>(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(16);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [hasCachedLyrics, setHasCachedLyrics] = useState<boolean>(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'guitarChords' | 'lyricsChords'>('beatChordMap');

  // Chatbot state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [translatedLyrics] = useState<{[language: string]: {
    originalLyrics: string;
    translatedLyrics: string;
    sourceLanguage: string;
    targetLanguage: string;
  }}>({});

  // Lyrics panel state
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);

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

  // Key detection effect - only run once when analysis results are available and no enharmonic correction data
  useEffect(() => {
    if (analysisResults?.chords && analysisResults.chords.length > 0 && !isDetectingKey && !chordCorrections && !keyDetectionAttempted) {
      setIsDetectingKey(true);
      setKeyDetectionAttempted(true);

      // Prepare chord data for key detection
      const chordData = analysisResults.chords.map((chord) => ({
        chord: chord.chord,
        time: chord.time
      }));

      // Import and call key detection service with enharmonic correction

      import('@/services/keyDetectionService').then(({ detectKey }) => {
        // Use cache for sequence corrections (no bypass)
        detectKey(chordData, true, false) // Request enharmonic correction, use cache
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
                      chordCorrections: result.corrections || null
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
  }, [analysisResults?.chords, isDetectingKey, chordCorrections, keyDetectionAttempted, videoId]); // Removed beatDetector and chordDetector to prevent unnecessary re-runs

  // Set YouTube URLs immediately for fast frame loading
  useEffect(() => {
    if (videoId) {
      // Set YouTube URLs immediately without waiting for API calls
      setAudioProcessingState(prev => ({
        ...prev,
        youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`
      }));
    }
  }, [videoId, setAudioProcessingState]);

  // Load video info and extract audio on component mount
  useEffect(() => {
    if (videoId && !audioProcessingState.isExtracting && !extractionLockRef.current) {

      // Reset processing context for new video
      setStage('idle');
      setProgress(0);
      setStatusMessage('');

      // Reset key detection flag for new video
      setKeyDetectionAttempted(false);
      setChordCorrections(null); // Reset chord corrections for new video
      setShowCorrectedChords(false); // Reset to show original chords
      setHasAutoEnabledCorrections(false); // Reset auto-enable flag for new video
      setSequenceCorrections(null); // Reset sequence corrections for new video

      // Extract audio (video title will be loaded automatically with extraction)
      // Use local function that properly handles search metadata
      extractAudioFromYouTube(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, titleFromSearch]); // Re-run when videoId or titleFromSearch changes



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
      const timer = setTimeout(autoLoadCachedLyrics, 500);
      return () => clearTimeout(timer);
    }
  }, [videoId, params, lyrics, audioProcessingState.isExtracted, audioProcessingState.audioUrl, setLyrics, setShowLyrics, setHasCachedLyrics, setActiveTab]); // Re-run when audio extraction completes

  // Check for cached analysis availability (but don't auto-load) when audio is extracted AND models are initialized
  useEffect(() => {
    const checkCachedAnalysisAvailability = async () => {
      if (audioProcessingState.isExtracted && audioProcessingState.audioUrl && !audioProcessingState.isAnalyzed && !audioProcessingState.isAnalyzing && modelsInitialized) {
        // console.log('🔍 Checking for cached analysis availability (not auto-loading)...');

        try {
          // Add a small delay to ensure Firebase is ready
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check if cached analysis exists for current models
          // console.log(`🔍 Cache check: Looking for ${beatDetector} + ${chordDetector} combination`);
          const cachedData = await getTranscription(videoId, beatDetector, chordDetector);

          if (cachedData) {
            // console.log(`✅ Found cached analysis for ${beatDetector} + ${chordDetector} models (not auto-loading)`);
            // console.log(`🔍 Cache contains: beatModel="${cachedData.beatModel}", chordModel="${cachedData.chordModel}"`);
            setCacheAvailable(true);
          } else {
            // console.log(`❌ No cached analysis found for ${beatDetector} + ${chordDetector} models`);
            // console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to run new analysis');
            setCacheAvailable(false);
          }

          setCacheCheckCompleted(true);

        } catch (error) {
          console.error('Error checking cached analysis availability:', error);
          // console.log('🎯 USER ACTION REQUIRED: Click "Start Analysis" to run analysis');
        }
      }
    };

    checkCachedAnalysisAvailability();
  }, [audioProcessingState.isExtracted, audioProcessingState.audioUrl, audioProcessingState.isAnalyzed, audioProcessingState.isAnalyzing, videoId, beatDetector, chordDetector, modelsInitialized]);

  // Video title is now handled by the useAudioProcessing hook

  // Function to build song context for chatbot
  const buildSongContext = (): SongContext => {
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
  };

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
  const isChatbotAvailable = () => {
    // For now, always show the chatbot on analyze pages for testing
    // console.log('Chatbot always available for testing on analyze pages');
    return true;
  };

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
  const extractAudioFromYouTube = useCallback(async (forceRefresh = false) => {
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
      progress: 0
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

  // YouTube player event handlers
  const handleYouTubeReady = (player: unknown) => {
    // console.log('YouTube player ready');

    // ReactPlayer doesn't directly expose the YouTube player instance
    // Instead, it provides a ref to the player object which has its own API
    // Type assertion to our YouTubePlayer interface
    setYoutubePlayer(player as YouTubePlayer);

    // We can't directly call YouTube player methods here
    // ReactPlayer handles playback rate through its props

    // If audio is already playing, sync the YouTube video
    if (isPlaying && audioRef.current) {
      // Use ReactPlayer's seekTo method
      (player as YouTubePlayer).seekTo(audioRef.current.currentTime, 'seconds');
    }
  };

  const handleYouTubePlay = () => {
    // If audio is not playing, start it
    if (!isPlaying && audioRef.current) {
      audioRef.current.play();
      // Update state directly without toggling
      setIsPlaying(true);
    }
  };

  const handleYouTubePause = () => {
    // If audio is playing, pause it
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      // Update state directly without toggling
      setIsPlaying(false);
    }
  };

  const handleYouTubeProgress = (state: { played: number; playedSeconds: number }) => {
    // Sync audio with YouTube if they get out of sync by more than 0.5 seconds
    if (audioRef.current && Math.abs(audioRef.current.currentTime - state.playedSeconds) > 0.5) {
      audioRef.current.currentTime = state.playedSeconds;
    }
  };


  const chordGridData = useMemo(() => getChordGridDataService(analysisResults as any) as any, [analysisResults]);

  // Use extracted scroll and animation hook
  useScrollAndAnimation({
    audioRef,
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

  // Mute appropriate audio source based on preference
  useEffect(() => {
    if (youtubePlayer && audioRef.current) {
      if (preferredAudioSource === 'youtube') {
        youtubePlayer.muted = false;
        audioRef.current.muted = true;
      } else {
        youtubePlayer.muted = true;
        audioRef.current.muted = false;
      }
    }
  }, [preferredAudioSource, youtubePlayer, audioRef]);

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Downloading Indicator - shown during initial download */}
      <DownloadingIndicator
        isVisible={audioProcessingState.isDownloading && !audioProcessingState.fromCache}
      />

      {/* Extraction Notification Banner - shown after download completes */}
      <ExtractionNotification
        isVisible={showExtractionNotification}
        fromCache={audioProcessingState.fromCache}
        onDismiss={useCallback(() => setShowExtractionNotification(false), [])}
        onRefresh={useCallback(() => extractAudioFromYouTube(true), [extractAudioFromYouTube])}
      />

      <div className="container py-0 min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300" style={{ maxWidth: "100%" }}>
        <div className="bg-white dark:bg-content-bg transition-colors duration-300">

        {/* Processing Status Banner - positioned in content flow */}
        <ProcessingStatusBanner
          analysisResults={analysisResults}
          audioDuration={duration}
          audioUrl={audioProcessingState.audioUrl || undefined}
          fromCache={audioProcessingState.fromCache}
          fromFirestoreCache={audioProcessingState.fromFirestoreCache}
        />

        {/* Main content area - responsive width based on chatbot and lyrics panel state */}
        <div className={`flex flex-col transition-all duration-300 ${
          isChatbotOpen || isLyricsPanelOpen ? 'mr-[420px]' : ''
        }`}>
          {/* Content area: Chord and beat visualization */}
          <div className="w-full p-0 overflow-visible">
            {/* Audio player is now handled by the AudioPlayer component */}

            {/* Processing Status and Model Selection in a single row */}
            <div className="mb-2 px-4 pt-2 pb-1">
              {/* Error message */}
              {audioProcessingState.error && (
                <UserFriendlyErrorDisplay
                  error={audioProcessingState.error}
                  suggestion={audioProcessingState.suggestion || undefined}
                  onTryAnotherVideo={handleTryAnotherVideo}
                  onRetry={() => extractAudioFromYouTube(true)}
                  className="mb-2"
                />
              )}

              {/* Analysis Controls Component */}
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
            </div>

            {/* Analysis results */}
            {analysisResults && audioProcessingState.isAnalyzed && (
            <div className="mt-0 space-y-2 px-4">

              {/* Tabbed interface for analysis results */}
              <div className="rounded-lg bg-white dark:bg-content-bg mb-2 mt-0 transition-colors duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center mb-2">
                  <div className="mb-2 md:mb-0">
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">Analysis Results</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 mt-1 truncate max-w-md">
                      {videoTitle}
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    
                    {/* Enharmonic correction toggle button - show for both legacy and sequence corrections */}
                    {((memoizedChordCorrections !== null && Object.keys(memoizedChordCorrections).length > 0) ||
                      (memoizedSequenceCorrections !== null && memoizedSequenceCorrections.correctedSequence.length > 0)) && (
                      <button
                        onClick={toggleEnharmonicCorrection}
                        className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors duration-200 ${
                          showCorrectedChords
                            ? 'bg-purple-100 dark:bg-purple-200 border-purple-300 dark:border-purple-400 text-purple-800 dark:text-purple-900 hover:bg-purple-200 dark:hover:bg-purple-300'
                            : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                        }`}
                        title={showCorrectedChords ? 'Show original chord spellings' : 'Show corrected enharmonic spellings'}
                      >
                        {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
                      </button>
                    )}

                    {/* Music.AI Transcription Button */}
                    <button
                      onClick={() => {
                        transcribeLyricsWithAI();
                      }}
                      disabled={
                        isTranscribingLyrics ||
                        !audioProcessingState.audioUrl ||
                        !isServiceAvailable('musicAi')
                      }
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors w-full md:w-auto ${
                        isServiceAvailable('musicAi')
                          ? 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                          : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      }`}
                      title={
                        !isServiceAvailable('musicAi')
                          ? "Add your Music.AI API key in Settings to enable lyrics transcription"
                          : !audioProcessingState.audioUrl
                          ? "Extract audio first to enable lyrics transcription"
                          : isTranscribingLyrics
                          ? "Transcription in progress..."
                          : "AI transcription from audio (word-level sync)"
                      }
                    >
                      {isTranscribingLyrics
                        ? "Transcribing..."
                        : !isServiceAvailable('musicAi')
                        ? "API Key Required"
                        : (hasCachedLyrics ? "Re-transcribe" : "AI Transcribe")
                      }
                    </button>

                    {lyricsError && (
                      <div className={`mt-2 md:col-span-2 ${
                        lyricsError.includes('Transcribing lyrics')
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-red-500'
                      }`}>
                        {lyricsError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-4">
                  <div className="flex -mb-px">
                    <button
                      onClick={() => setActiveTab('beatChordMap')}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === 'beatChordMap'
                          ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      Beat & Chord Map
                    </button>
                    <button
                      onClick={() => setActiveTab('guitarChords')}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === 'guitarChords'
                          ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center space-x-1">
                        <span>Guitar Chords</span>
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
                          beta
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab('lyricsChords')}
                      disabled={!showLyrics && !hasCachedLyrics}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === 'lyricsChords'
                          ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                          : (!showLyrics && !hasCachedLyrics)
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center space-x-1">
                        <span>Lyrics & Chords</span>
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
                          beta
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Tab content */}
                <div className="tab-content">
                  {/* Beat & Chord Map Tab */}
                  {activeTab === 'beatChordMap' && (
                    <div>

                      <ChordGridContainer
                        analysisResults={analysisResults}
                        chordGridData={chordGridData}
                        currentBeatIndex={currentBeatIndex}
                        keySignature={keySignature}
                        isDetectingKey={isDetectingKey}
                        isChatbotOpen={isChatbotOpen}
                        isLyricsPanelOpen={isLyricsPanelOpen}
                        onBeatClick={handleBeatClick}
                        showCorrectedChords={showCorrectedChords}
                        chordCorrections={memoizedChordCorrections}
                        sequenceCorrections={memoizedSequenceCorrections}
                      />

                      {/* Control buttons moved to the component level */}

                      {/* Collapsible Analysis Summary */}
                      <AnalysisSummary
                        analysisResults={analysisResults}
                        audioDuration={duration}
                      />
                    </div>
                  )}

                  {/* Guitar Chords Tab */}
                  {activeTab === 'guitarChords' && (
                    <GuitarChordsTab
                      analysisResults={analysisResults}
                      chordGridData={chordGridData}
                      currentBeatIndex={currentBeatIndex}
                      onBeatClick={handleBeatClick}
                      keySignature={keySignature}
                      isDetectingKey={isDetectingKey}
                      isChatbotOpen={isChatbotOpen}
                      isLyricsPanelOpen={isLyricsPanelOpen}
                      isUploadPage={false}
                      showCorrectedChords={showCorrectedChords}
                      chordCorrections={memoizedChordCorrections}
                      sequenceCorrections={memoizedSequenceCorrections}
                    />
                  )}

                  {/* Lyrics & Chords Tab */}
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
                    />
                  )}
                </div>
              </div>


              {/* Beats visualization - New optimized component */}
              <BeatTimeline
                beats={analysisResults?.beats || []}
                downbeats={analysisResults?.downbeats || []}
                currentBeatIndex={currentBeatIndex}
                currentDownbeatIndex={currentDownbeatIndex}
                duration={duration}
              />
            </div>
          )}
          </div>

          {/* Audio Player Component */}
          <AudioPlayer
            audioUrl={audioProcessingState.audioUrl}
            youtubeVideoId={videoId}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            playbackRate={playbackRate}
            preferredAudioSource={preferredAudioSource}
            onPlay={play}
            onPause={pause}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onSeek={seek}
            onPlaybackRateChange={setPlayerPlaybackRate}
            onPreferredAudioSourceChange={setPreferredAudioSource}
            onYouTubePlayerReady={handleYouTubePlayerReady}
            audioRef={audioRef}
          />

          {/* Floating video player for all screens - fixed position */}
          {(audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl) && (
            <div
              className={`fixed bottom-4 z-50 transition-all duration-300 shadow-xl ${
                isChatbotOpen || isLyricsPanelOpen
                  ? 'right-[420px]' // Move video further right when chatbot or lyrics panel is open to avoid overlap
                  : 'right-4'
              } ${
                isVideoMinimized ? 'w-1/4 md:w-1/5' : 'w-2/3 md:w-1/3'
              }`}
              style={{
                maxWidth: isVideoMinimized ? '250px' : '500px',
                pointerEvents: 'auto',
                zIndex: 55 // Ensure this is below the control buttons (z-60) but above other content
              }}
            >
              {/* Floating control buttons - fixed to top of the YouTube player */}
              <div className="absolute -top-10 left-0 right-0 z-60 flex flex-wrap justify-end gap-1 p-2 bg-white dark:bg-content-bg bg-opacity-80 dark:bg-opacity-90 backdrop-blur-sm rounded-lg shadow-md transition-colors duration-300">
                <button
                  onClick={toggleFollowMode}
                  className={`px-2 py-1 text-xs rounded-full shadow-md whitespace-nowrap ${
                    isFollowModeEnabled
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                  title={isFollowModeEnabled ? "Disable auto-scroll" : "Enable auto-scroll"}
                >
                  <span className={`${isVideoMinimized ? 'hidden' : ''}`}>
                    {isFollowModeEnabled ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
                  </span>
                  <span className={`${isVideoMinimized ? 'inline' : 'hidden'}`}>
                    {isFollowModeEnabled ? "Scroll" : "Scroll"}
                  </span>
                </button>

                <button
                  onClick={toggleAudioSource}
                  className={`px-2 py-1 text-xs rounded-full shadow-md whitespace-nowrap ${
                    preferredAudioSource === 'extracted'
                      ? 'bg-green-600 text-white'
                      : 'bg-purple-600 text-white'
                  }`}
                  title="Switch audio source"
                >
                  <span className={`${isVideoMinimized ? 'hidden' : ''}`}>
                    {preferredAudioSource === 'extracted' ? "Audio: Extracted" : "Audio: YouTube"}
                  </span>
                  <span className={`${isVideoMinimized ? 'inline' : 'hidden'}`}>
                    {preferredAudioSource === 'extracted' ? "Ext" : "YT"}
                  </span>
                </button>

                {/* Metronome controls - only show when analysis results are available */}
                {analysisResults && (
                  <MetronomeControls
                    isVideoMinimized={isVideoMinimized}
                    onToggleWithSync={toggleMetronomeWithSync}
                  />
                )}
              </div>
              <div className="relative">
                {/* Minimize/Maximize button */}
                <button
                  onClick={toggleVideoMinimization}
                  className="absolute -top-8 right-0 bg-gray-800 text-white p-1 rounded-t-md z-10"
                >
                  {isVideoMinimized ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 10a1 1 0 011-1h4a1 1 0 110 2H8.414l2.293 2.293a1 1 0 01-1.414 1.414L7 12.414V14a1 1 0 11-2 0v-4zm9-1a1 1 0 110 2h1.586l-2.293 2.293a1 1 0 001.414 1.414L17 12.414V14a1 1 0 102 0v-4a1 1 0 00-1-1h-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {/* Video player with mobile collapsible functionality */}
                {(audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl) && (
                  <CollapsibleVideoPlayer
                    videoId={videoId}
                    isPlaying={isPlaying}
                    playbackRate={playbackRate}
                    preferredAudioSource={preferredAudioSource}
                    onReady={handleYouTubeReady}
                    onPlay={handleYouTubePlay}
                    onPause={handleYouTubePause}
                    onProgress={handleYouTubeProgress}
                  />
                )}
              </div>
            </div>
          )}

          {/* Chatbot Section */}
          <ChatbotSection
            isAvailable={isChatbotAvailable()}
            isOpen={isChatbotOpen}
            onToggle={toggleChatbot}
            onClose={() => setIsChatbotOpen(false)}
            songContext={buildSongContext()}
          />

          {/* Lyrics Panel Components */}
          <LyricsToggleButton
            isOpen={isLyricsPanelOpen}
            onClick={toggleLyricsPanel}
          />
          <LyricsPanel
            isOpen={isLyricsPanelOpen}
            onClose={() => setIsLyricsPanelOpen(false)}
            videoTitle={videoTitle}
            currentTime={currentTime}
          />
        </div>
      </div>
    </div>
  );
}