"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@heroui/react';
import Navigation from '@/components/common/Navigation';
import { analyzeAudioWithRateLimit, AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { ProcessingStatusSkeleton } from '@/components/common/SkeletonLoaders';
import {
  getChordGridData as getChordGridDataService
} from '@/services/chord-analysis/chordGridCalculationService';

// Dynamic imports for heavy components with better loading states
const HeroUIBeatModelSelector = dynamic(() => import('@/components/analysis/HeroUIBeatModelSelector'), {
  loading: () => (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
    </div>
  ),
  ssr: false
});

const HeroUIChordModelSelector = dynamic(() => import('@/components/analysis/HeroUIChordModelSelector'), {
  loading: () => (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
    </div>
  ),
  ssr: false
});


// Lyrics section (dynamic)
const LyricsSectionDyn = dynamic(() => import('@/components/lyrics/LyricsSection').then(mod => ({ default: mod.LyricsSection })), {
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ProcessingStatusBanner = dynamic(() => import('@/components/analysis/ProcessingStatusBanner'), {
  loading: () => <ProcessingStatusSkeleton />,
  ssr: true
});

// Chatbot interface (dynamic)
const ChatbotInterfaceDyn = dynamic(() => import('@/components/chatbot/ChatbotInterface'), {
  loading: () => <div className="w-full h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});





const ChordGridContainer = dynamic(() => import('@/components/chord-analysis/ChordGridContainer').then(mod => ({ default: mod.ChordGridContainer })), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const GuitarChordsTab = dynamic(() => import('@/components/chord-analysis/GuitarChordsTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});
import { useProcessing } from '@/contexts/ProcessingContext';
import BeatTimeline from '@/components/analysis/BeatTimeline';
import { simplifyChordArray } from '@/utils/chordSimplification';
import { useUIStore, useIsLoopEnabled, useLoopStartBeat, useLoopEndBeat } from '@/stores/uiStore';

import { useMetronomeSync } from '@/hooks/chord-playback/useMetronomeSync';
import { useLyricsState } from '@/hooks/lyrics/useLyricsState';
import { useAnalysisStore } from '@/stores/analysisStore';
import UtilityBar from '@/components/analysis/UtilityBar';
import ScrollableTabContainer from '@/components/chord-analysis/ScrollableTabContainer';
import AudioPlaybackDock from '@/components/analysis/AudioPlaybackDock';
import type { UseChordPlaybackReturn } from '@/hooks/chord-playback/useChordPlayback';
import { ChordPlaybackManager } from '@/components/chord-playback/ChordPlaybackManager';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePitchShiftAudio } from '@/hooks/chord-playback/usePitchShiftAudio';
import ResultsTabs from '@/components/homepage/ResultsTabs';
import { searchLyricsWithFallback } from '@/services/lyrics/lyricsService';
import type { LyricsData } from '@/types/musicAiTypes';

export default function LocalAudioAnalyzePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [lyricSearchTitle, setLyricSearchTitle] = useState('');
  const [lyricSearchArtist, setLyricSearchArtist] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const { lyrics, completeLyricsTranscription } = useLyricsState();

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
    };
  }, []);

  type LyricsAPIResp = {
    success?: boolean;
    synchronized_lyrics?: Array<{ time: number; text: string }>;
    plain_lyrics?: string;
  };

  const normalizeLyricsResponse = useCallback((resp: unknown): LyricsData | null => {
    const r = resp as LyricsAPIResp | null | undefined;
    if (!r || r.success === false) return null;
    if (Array.isArray(r.synchronized_lyrics) && r.synchronized_lyrics.length) {
      const lines = r.synchronized_lyrics.map((l: { time: number; text: string }, idx: number, arr: Array<{ time: number; text: string }>) => {
        const start = typeof l.time === 'number' ? l.time : 0;
        const next = arr[idx + 1]?.time;
        const end = typeof next === 'number' && next > start ? next : start + 2;
        return { startTime: start, endTime: end, text: l.text };
      });
      return { lines };
    }
    if (typeof r.plain_lyrics === 'string' && r.plain_lyrics.trim().length) {
      const parts = r.plain_lyrics.split(/\r?\n/).filter((t: string) => t.trim().length);
      const lines = parts.map((text: string, idx: number) => ({
        startTime: idx * 2,
        endTime: idx * 2 + 2,
        text,
      }));
      return { lines };
    }
    return null;
  }, []);

  const handleManualLyricsSearch = useCallback(async () => {
    try {
      const resp = await searchLyricsWithFallback({ artist: lyricSearchArtist.trim(), title: lyricSearchTitle.trim(), prefer_synchronized: true });
      const normalized = normalizeLyricsResponse(resp);
      if (normalized) {
        completeLyricsTranscription(normalized);
      }
    } catch (e) {
      console.error('Manual lyrics search failed', e);
    }
  }, [lyricSearchArtist, lyricSearchTitle, normalizeLyricsResponse, completeLyricsTranscription]);


  // Use processing context
  const {
    // stage,
    // progress,
    setStage,
    setProgress,
    setStatusMessage,
    startProcessing,
    completeProcessing,
    failProcessing
  } = useProcessing();
  // const { theme } = useTheme();

  // Define detector types
  type BeatDetectorType = 'madmom' | 'beat-transformer';
  type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

  // Initialize model states with localStorage persistence
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_beat_detector');
      if (saved && ['madmom', 'beat-transformer'].includes(saved)) {
        return saved as BeatDetectorType;
      }
      // If saved value was 'auto', default to 'madmom'
      if (saved === 'auto') {
        localStorage.setItem('chordmini_beat_detector', 'madmom');
      }
    }
    return 'madmom';
  });

  const [chordDetector, setChordDetector] = useState<ChordDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_chord_detector');
      if (saved && ['chord-cnn-lstm', 'btc-sl', 'btc-pl'].includes(saved)) {
        return saved as ChordDetectorType;
      }
    }
    return 'chord-cnn-lstm';
  });

  // Audio processing state
  const [audioProcessingState, setAudioProcessingState] = useState({
    isExtracting: false,
    isExtracted: false,
    isAnalyzing: false,
    isAnalyzed: false,
    error: null as string | null,
    audioBuffer: null as AudioBuffer | null,
    audioUrl: null as string | null,
  });
  // Analysis results state (must be declared before dependent memos)
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);

  // Lyrics state (before memos that depend on it)
  const [fontSize, setFontSize] = useState<number>(16);
  const theme = 'light';

  // Stable upload session id for chatbot context
  const uploadSessionId = useMemo(() => `upload_${Date.now().toString(36)}`, []);

  // Build SongContext for Chatbot (upload source)
  const uploadSongContext = useMemo(() => {
    if (!analysisResults) return undefined;
    return {
      uploadId: uploadSessionId,
      title: audioFile?.name || 'Uploaded Audio',
      duration,
      beats: analysisResults?.beats,
      downbeats: analysisResults?.downbeats,
      downbeats_with_measures: analysisResults?.downbeats_with_measures,
      beats_with_positions: analysisResults?.beats_with_positions,
      bpm: analysisResults?.beatDetectionResult?.bpm,
      time_signature: analysisResults?.beatDetectionResult?.time_signature,
      beatModel: analysisResults?.beatModel || beatDetector,
      chords: analysisResults?.chords,
      synchronizedChords: analysisResults?.synchronizedChords,
      chordModel: analysisResults?.chordModel || chordDetector,
      lyrics: lyrics || undefined,
    } as const;
  }, [analysisResults, uploadSessionId, audioFile?.name, duration, lyrics, beatDetector, chordDetector]);



  // Chord playback state (will be managed by ChordPlaybackManager)
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

  const handleChordPlaybackChange = useCallback((next: UseChordPlaybackReturn) => {
    setChordPlayback(next);
  }, []);

  // Panels and countdown
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState<boolean>(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState<boolean>(false);
  const [isCountdownEnabled, setIsCountdownEnabled] = useState<boolean>(false);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');

  // Tempo context
  const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults?.beatDetectionResult?.bpm || 120;

  // Countdown controller state (HTML audio)
  const countdownCtrlRef = useRef<{ intervalId: ReturnType<typeof setInterval> | null; aborted: boolean; token: number } | null>(null);
  const countdownStateRef = useRef<{ inProgress: boolean; completed: boolean }>({ inProgress: false, completed: false });

  const cancelCountdown = useCallback(() => {
    const ctrl = countdownCtrlRef.current;
    if (ctrl) {
      ctrl.aborted = true;
      if (ctrl.intervalId) clearInterval(ctrl.intervalId as unknown as number);
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

    const start = Date.now();
    const token = Math.random();
    const ctrl = { intervalId: null as ReturnType<typeof setInterval> | null, aborted: false, token };
    countdownCtrlRef.current = ctrl;

    // Prepare state and ensure audio paused
    countdownStateRef.current.inProgress = true;
    countdownStateRef.current.completed = false;
    try { audioRef.current?.pause(); } catch {}
    setIsCountingDown(true);
    setCountdownDisplay(`${beatsPerMeasure}`);

    const ok = await new Promise<boolean>((resolve) => {
      ctrl.intervalId = setInterval(() => {
        if (!countdownCtrlRef.current || countdownCtrlRef.current.token !== token || countdownCtrlRef.current.aborted) {
          if (ctrl.intervalId) clearInterval(ctrl.intervalId as unknown as number);
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
          if (ctrl.intervalId) clearInterval(ctrl.intervalId as unknown as number);
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
  }, [isCountdownEnabled, timeSignature, bpm]);


  // Metronome state
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState<boolean>(false);

  const toggleFollowMode = () => setIsFollowModeEnabled(prev => !prev);
  const toggleLyricsPanel = () => setIsLyricsPanelOpen(prev => !prev);
  const toggleChatbot = () => setIsChatbotOpen(prev => !prev);


  // Current state for playback - FIXED: Add missing state variables for beat animation
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const currentBeatIndexRef = useRef(-1);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'guitarChords' | 'lyricsChords'>('beatChordMap');


  // Key signature and chord correction states - now with proper key detection
  const [keySignature, setKeySignature] = useState<string | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);
  const [keyDetectionAttempted, setKeyDetectionAttempted] = useState(false);
  const showCorrectedChords = false;
  const chordCorrections = useMemo(() => ({} as Record<string, string>), []);
  const sequenceCorrections = useMemo(() => (null as {
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
  } | null), []);

  // Get state from Zustand stores (only what's actually used in this page)
  // Note: simplifyChords, showRomanNumerals, showSegmentation are managed by Zustand
  // and accessed directly by child components via their own selectors

  // Use pitch shift audio hook
  usePitchShiftAudio({
    youtubePlayer: null, // No YouTube player in upload page
    audioRef,
    firebaseAudioUrl: audioProcessingState.audioUrl,
    isPlaying,
    currentTime,
    playbackRate,
    setIsPlaying,
    setCurrentTime,
  });

  // Persist model preferences to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_beat_detector', beatDetector);
    }
  }, [beatDetector]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_chord_detector', chordDetector);
    }
  }, [chordDetector]);

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setAudioFile(file);

    // Reset states
    setAudioProcessingState({
      isExtracting: false,
      isExtracted: false,
      isAnalyzing: false,
      isAnalyzed: false,
      error: null,
      audioBuffer: null,
      audioUrl: null,
    });
    setAnalysisResults(null);

    // Create a blob URL for the audio element (Safari-safe) and track it for cleanup
    if (audioRef.current) {
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
      const u = URL.createObjectURL(file);
      objectUrlRef.current = u;
      audioRef.current.src = u;
      audioRef.current.load();
    }
  };

  // Process and analyze the audio file
  const processAudioFile = async () => {
    if (!audioFile) return;

    let stageTimeout: NodeJS.Timeout | null = null;

    try {
      // Start processing context
      startProcessing();
      setStage('beat-detection');
      setProgress(0);
      setStatusMessage('Starting beat detection...');

      // Use existing object URL from audio element or create new one (track and cleanup)
      let audioUrl = audioRef.current?.src;
      if (!audioUrl) {
        if (objectUrlRef.current) {
          try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
          objectUrlRef.current = null;
        }
        const u = URL.createObjectURL(audioFile);
        objectUrlRef.current = u;
        audioUrl = u;
      }

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: true,
        error: null,
        audioUrl,
      }));

      // Get duration from audio element for progress calculation
      if (audioRef.current && audioRef.current.duration && duration === 0) {
        setDuration(audioRef.current.duration);
      }

      // Update to chord recognition stage after duration is available
      stageTimeout = setTimeout(() => {
        setStage('chord-recognition');
        // Don't set progress here - let ProcessingStatusBanner calculate it
        setStatusMessage('Recognizing chords and synchronizing with beats...');
      }, 500); // Reduced delay since we now have duration

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracted: true,
        isExtracting: false,
        audioBuffer: null, // No longer using AudioBuffer
        isAnalyzing: true
      }));

      // Start chord and beat analysis with selected detectors using original File object
      // This avoids the 10x size bloat from AudioBuffer conversion (3.6MB → 41.7MB)
      const results = await analyzeAudioWithRateLimit(audioFile, beatDetector, chordDetector);

      // FIXED: Clear the stage timeout to prevent it from overriding completion
      if (stageTimeout) {
        clearTimeout(stageTimeout);
        stageTimeout = null;
      }

      // Store results
      setAnalysisResults(results);

      // Update duration from analysis results if available
      if (results.audioDuration && results.audioDuration > 0) {
        setDuration(results.audioDuration);
      }

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: false,
        isAnalyzing: false,
        isAnalyzed: true
      }));

      // Complete processing
      setStage('complete');
      setProgress(100);
      setStatusMessage('Analysis complete!');
      completeProcessing();

      // Analysis completed successfully
    } catch (error) {
      console.error('Error in audio processing:', error);

      // Clear timeout on error
      if (stageTimeout) {
        clearTimeout(stageTimeout);
        stageTimeout = null;
      }

      // Format error message more user-friendly
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      setAudioProcessingState(prev => ({
        ...prev,
        error: errorMessage,
        isExtracting: false,
        isAnalyzing: false
      }));

      // Fail processing
      failProcessing(errorMessage);
    }
  };

  // Audio player controls
  const playPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Gate first play with optional 1-measure countdown
      if (isCountdownEnabled && !countdownStateRef.current.inProgress && !countdownStateRef.current.completed) {
        try { audioRef.current.pause(); } catch {}
        // Run countdown asynchronously, then start playback if not aborted
        void (async () => {
          const ok = await runCountdown();
          if (ok) {
            countdownStateRef.current.completed = false; // consume
            try { await audioRef.current?.play(); } catch {}
          }
        })();
        return;
      }
      audioRef.current.play();
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (!audioRef.current) return;

    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };


  // Set up audio element event listeners
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleLoadedMetadata = () => {
      if (audioElement) {
        setDuration(audioElement.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
    };
    const handleTimeUpdate = () => {
      if (audioElement) {
        setCurrentTime(audioElement.currentTime);
      }
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, []);

  // Use standardized chord grid data processing from service
  // This ensures perfect consistency with the YouTube workflow
  const chordGridData = useMemo(() => {
    if (!analysisResults) {
      return {
        chords: [],
        beats: [],
        hasPadding: false,


        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: []

      };
    }
    return getChordGridDataService(analysisResults);
  }, [analysisResults]);

  // Key detection effect - automatically detect key after chord analysis
  useEffect(() => {
    if (analysisResults?.chords && analysisResults.chords.length > 0 && !isDetectingKey && !keyDetectionAttempted) {
      setIsDetectingKey(true);
      setKeyDetectionAttempted(true);

      // Prepare chord data for key detection


      // CRITICAL FIX: Deduplicate consecutive identical chords to avoid beat-level analysis
      const rawChordData = analysisResults.chords


        .filter((chord) => chord.time !== undefined && chord.time !== null)
        .map((chord) => ({
          chord: chord.chord,
          time: chord.time as number // Safe to cast since we filtered out undefined/null
        }));

      // Remove consecutive duplicate chords to get only chord changes
      const chordData = rawChordData.filter((chord, index) => {
        if (index === 0) return true; // Always include first chord
        return chord.chord !== rawChordData[index - 1].chord; // Include only if different from previous
      });



      // Import and call key detection service with enharmonic correction and Roman numerals
      import('@/services/audio/keyDetectionService').then(({ detectKey }) => {
        // Use cache for sequence corrections (no bypass); request Roman numerals
        detectKey(chordData, true, false, true)
          .then(result => {
            setKeySignature(result.primaryKey);
            // Update Roman numeral data in UI store for display
            try {
              useUIStore.getState().updateRomanNumeralData(result.romanNumerals ?? null);
            } catch {}
          })
          .catch(error => {
            console.error('Failed to detect key:', error);
            setKeySignature(null);
            try { useUIStore.getState().updateRomanNumeralData(null); } catch {}
          })
          .finally(() => {
            setIsDetectingKey(false);
          });
      });
    }
  }, [analysisResults?.chords, isDetectingKey, keyDetectionAttempted]);

// Apply optional chord simplification (UI toggle)
const simplifyChords = useUIStore((state) => state.simplifyChords);
const simplifiedChordGridData = useMemo(() => {
  if (!chordGridData) return chordGridData;
  let processedChords = chordGridData.chords || [];
  if (simplifyChords) {
    processedChords = simplifyChordArray(processedChords);
  }
  return { ...chordGridData, chords: processedChords } as typeof chordGridData;
}, [chordGridData, simplifyChords]);

  // Beat animation tracking for HTML audio elements
  useEffect(() => {
    if (!analysisResults || !chordGridData || chordGridData.chords.length === 0) {
      return;
    }

    const rafRef = { current: undefined as number | undefined };

    const updateBeatTracking = () => {
      // Continue animation loop even when not playing to maintain state


      if (!audioRef.current) {
        rafRef.current = requestAnimationFrame(updateBeatTracking);
        return;
      }

      // Use audio element's currentTime directly for most accurate timing
      const time = audioRef.current.currentTime;

      // Only update beat index when playing
      if (isPlaying) {
        // Find current beat index based on time
        let newBeatIndex = -1;

        if (chordGridData.beats && chordGridData.beats.length > 0) {
          // FIXED: Handle (number | null)[] format correctly
          for (let i = 0; i < chordGridData.beats.length; i++) {
            const beatTime = chordGridData.beats[i];

            // Skip null entries (padding/shift beats)
            if (beatTime === null) {
              continue;
            }

            if (typeof beatTime === 'number' && time >= beatTime) {
              newBeatIndex = i;
            } else if (typeof beatTime === 'number') {
              // Stop when we find a beat time that's greater than current time
              break;
            }
          }


        }

        // Update beat index if it changed
        if (newBeatIndex !== currentBeatIndexRef.current && newBeatIndex >= 0) {
          currentBeatIndexRef.current = newBeatIndex;
          setCurrentBeatIndex(newBeatIndex);
        }
      }

      rafRef.current = requestAnimationFrame(updateBeatTracking);
    };

    // Start the animation loop
    rafRef.current = requestAnimationFrame(updateBeatTracking);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, analysisResults]); // CRITICAL FIX: Intentionally limited dependencies to prevent animation loop restarts

  // FIXED: Auto-scroll with layout stability for superscript rendering

  // UtilityBar metronome toggle handler
  const handleMetronomeToggle = async (): Promise<boolean> => {
    const newEnabled = await toggleMetronomeWithSync();
    setIsMetronomeEnabled(newEnabled);
    return newEnabled;
  };

  useEffect(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      // Wait for layout stability before scrolling to prevent jitter
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          beatElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        });
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);



  // Metronome synchronization hook - use duration from audio element
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
    audioDuration: duration // Use duration from audio element instead of analysisResults
  });

  // Note: Beat click handling is managed internally by ChordGrid component via Zustand
  // No need for explicit handleBeatClick prop in upload page


  // Loop playback selectors (UI store)
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();

  // HTML Audio loop playback for upload page
  useEffect(() => {
    if (!isLoopEnabled || !audioRef.current) return;
    const beats = (simplifiedChordGridData?.beats || []) as Array<number | null>;
    if (!beats.length) return;
    if (loopStartBeat < 0 || loopEndBeat < 0 || loopStartBeat >= beats.length) return;

    const startTs = beats[loopStartBeat] ?? 0;
    const endBeatTs = beats[loopEndBeat] ?? null;
    const nextBeatTs = loopEndBeat + 1 < beats.length ? beats[loopEndBeat + 1] : null;
    const boundary = nextBeatTs ?? (typeof duration === 'number' && duration > 0 ? Math.max(duration - 0.25, endBeatTs ?? 0) : (endBeatTs ?? 0) + 1);

    if (typeof currentTime === 'number' && typeof boundary === 'number' && currentTime >= boundary) {
      try {
        audioRef.current.currentTime = startTs ?? 0;
        // Maintain play state for seamless looping
        if (isPlaying) audioRef.current.play?.();
      } catch {}
    }
  }, [isLoopEnabled, loopStartBeat, loopEndBeat, currentTime, duration, simplifiedChordGridData?.beats, isPlaying]);

  // Inform UI store about original audio availability (enables pitch shift/UI)
  useEffect(() => {
    try {
      useUIStore.getState().initializeFirebaseAudioAvailable(Boolean(audioRef.current || audioProcessingState.audioUrl));
    } catch {}
  }, [audioProcessingState.audioUrl]);


  // Reset countdown flags when playback is paused
  useEffect(() => {
    if (!isPlaying) {
      cancelCountdown();
      countdownStateRef.current.completed = false;
      countdownStateRef.current.inProgress = false;
    }
  }, [isPlaying, cancelCountdown]);

  // Initialize Zustand stores with page state
  // CRITICAL: Do NOT include Zustand-managed state (showRomanNumerals, simplifyChords) in dependencies
  // as that creates a circular loop causing race conditions during playback
  useEffect(() => {
    const analysisStore = useAnalysisStore.getState();
    const playbackStore = usePlaybackStore.getState();

    // Initialize AnalysisStore with local audio upload state
    analysisStore.setAnalysisResults(analysisResults);
    if (audioProcessingState.isAnalyzing) {
      analysisStore.startAnalysis();
    }
    analysisStore.setAnalysisError(audioProcessingState.error || null);

    // Set stub values for upload page (not used but required for consistency)
    analysisStore.setCacheAvailable(false);
    analysisStore.setCacheCheckCompleted(true);
    analysisStore.setCacheCheckInProgress(false);
    analysisStore.setModelsInitialized(true);
    analysisStore.setLyrics(null);
    analysisStore.setShowLyrics(false);
    analysisStore.setHasCachedLyrics(false);
    analysisStore.setLyricsError(null);

    // Initialize PlaybackStore
    playbackStore.setIsPlaying(isPlaying);
    playbackStore.setCurrentTime(currentTime);
    playbackStore.setDuration(duration);
    playbackStore.setPlaybackRate(playbackRate);
    playbackStore.setYoutubePlayer(null); // No YouTube player in upload page
    playbackStore.setAudioRef(audioRef as React.RefObject<HTMLAudioElement>);
    playbackStore.setCurrentBeatIndex(currentBeatIndex);
  }, [
    // CRITICAL: Do NOT include showRomanNumerals, simplifyChords, or other Zustand-managed state
    // Only include local state that needs to be synced to Zustand
    analysisResults, audioProcessingState.isAnalyzing, audioProcessingState.error,
    isPlaying, currentTime, duration, playbackRate, currentBeatIndex
  ]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Processing Status Banner */}
      <ProcessingStatusBanner
        analysisResults={analysisResults}
        audioDuration={duration}
        audioUrl={audioProcessingState.audioUrl || undefined}
        beatDetector={beatDetector}
      />

      <main className="flex-grow container mx-auto px-1 sm:px-2 md:px-3" style={{ maxWidth: "98%" }}>
        {/* Removed heading to reclaim vertical space */}

        <div className="flex flex-col gap-6">
          {/* Main content - Chord Grid (full width) */}
          <div className="w-full">
            <div className="p-6 h-full transition-colors duration-300">
              {/* Hidden audio element */}
              <audio ref={audioRef} className="hidden" controls={false} />
              <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-4">
                {/* LEFT: Tabs inline (wraps on small screens) */}
                {analysisResults && (
                  <div className="flex-1 min-w-[260px] md:min-w-[420px]">
                    <ResultsTabs
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      showLyrics={false}
                      hasCachedLyrics={false}
                    />
                  </div>
                )}

                {/* RIGHT: File upload and Analyze controls */}
                <div className="flex flex-row gap-2 items-center ml-auto pl-2 md:pl-6">
                  <div className="relative inline-block">
                    <label className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-md cursor-pointer transition-colors">
                      {audioFile ? audioFile.name : 'Choose Audio File'}
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <Button
                    onClick={processAudioFile}
                    disabled={!audioFile || audioProcessingState.isExtracting || audioProcessingState.isAnalyzing}
                    color="primary"
                    variant="solid"
                    size="md"
                    className="font-medium bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700 disabled:bg-gray-400 disabled:border-gray-400 disabled:text-gray-200"
                  >
                    {audioProcessingState.isExtracting ? 'Processing...' : 'Analyze Audio'}
                  </Button>
                </div>
              </div>

              {/* Model Selectors - Hide when analysis is complete */}
              {!analysisResults && (
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <HeroUIBeatModelSelector
                    onChange={setBeatDetector}
                    defaultValue={beatDetector}
                    className={audioProcessingState.isAnalyzing ? 'opacity-50 pointer-events-none' : ''}
                  />
                  <HeroUIChordModelSelector
                    selectedModel={chordDetector}
                    onModelChange={setChordDetector}
                    disabled={audioProcessingState.isAnalyzing}
                    className=""
                  />
                </div>
              )}

              {/* Audio Analysis Status Indicator - Hide when analysis is complete */}
              {!analysisResults && (
                <div className="flex items-center justify-end text-sm mb-4">
                  {audioProcessingState.isExtracting && (
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                      <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></div>
                      <span>Extracting audio...</span>
                    </div>
                  )}

                  {audioProcessingState.isAnalyzing && (
                    <div className="flex items-center text-gray-600 dark:text-gray-300">
                      <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></div>
                      <span>Analyzing chords & beats...</span>
                    </div>
                  )}

                  {audioProcessingState.error && (
                    <div className="text-red-500 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{audioProcessingState.error}</span>
                    </div>
                  )}

                  {audioProcessingState.isAnalyzed && !audioProcessingState.isAnalyzing && (
                    <div className="text-green-600 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>Analysis complete</span>
                    </div>
                  )}
                </div>
              )}

              {/* UtilityBar will be rendered inline below tabs together with the AudioPlaybackDock */}


              {/* Analysis Results Tabs moved inline above with controls */}
              {analysisResults && (
                <div className="mb-4">

                  {/* Tab content */}
                  <div className="tab-content">
                    {/* Beat & Chord Map Tab */}
                    {activeTab === 'beatChordMap' && (
                      <ScrollableTabContainer variant="plain" heightClass="h-[60vh] md:h-[66vh]">
                        <div className={`flex flex-col md:flex-row gap-4`}>
                          {/* Grid area */}
                          <div className={`w-full transition-all duration-200`}>
                            <ChordGridContainer
                              analysisResults={analysisResults}
                              chordGridData={simplifiedChordGridData}
                              keySignature={keySignature}
                              isDetectingKey={isDetectingKey}
                              isChatbotOpen={isChatbotOpen}
                              isLyricsPanelOpen={isLyricsPanelOpen}
                              isUploadPage={true}
                              showCorrectedChords={showCorrectedChords}
                              chordCorrections={chordCorrections}
                              sequenceCorrections={sequenceCorrections}
                            />
                            <div className="mt-3">
                              <BeatTimeline
                                beats={analysisResults?.beats || []}
                                downbeats={analysisResults?.downbeats || []}
                                currentBeatIndex={currentBeatIndex}
                                currentDownbeatIndex={-1}
                                duration={duration}
                              />
                            </div>
                          </div>

                          {/* Side panel area (md+) - disabled on upload page */}
                          {false && (
                            <div className="hidden md:block md:w-2/5">
                              {/* Lyrics Panel with manual search */}
                              {isLyricsPanelOpen && (
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Song title"
                                      value={lyricSearchTitle}
                                      onChange={(e) => setLyricSearchTitle(e.target.value)}
                                      className="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Artist"
                                      value={lyricSearchArtist}
                                      onChange={(e) => setLyricSearchArtist(e.target.value)}
                                      className="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                    <Button color="primary" variant="solid" onPress={handleManualLyricsSearch}>Search</Button>
                                  </div>
                                  <LyricsSectionDyn
                                    showLyrics={isLyricsPanelOpen}
                                    lyrics={lyrics}
                                    hasCachedLyrics={false}
                                    currentTime={currentTime}
                                    fontSize={fontSize}
                                    theme={theme}
                                    analysisResults={analysisResults}
                                    onFontSizeChange={setFontSize}
                                    segmentationData={null}
                                  />
                                </div>
                              )}

                              {/* Chatbot Panel */}
                              {isChatbotOpen && (
                                <div className="mt-4">
                                  <ChatbotInterfaceDyn
                                    isOpen={isChatbotOpen}
                                    onClose={() => setIsChatbotOpen(false)}
                                    songContext={uploadSongContext}
                                    className=""
                                    embedded={false}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </ScrollableTabContainer>
                    )}

                    {/* Guitar Chords Tab */}
                    {activeTab === 'guitarChords' && (
                      <GuitarChordsTab
                        analysisResults={analysisResults}
                        chordGridData={simplifiedChordGridData}
                        keySignature={keySignature}
                        isDetectingKey={isDetectingKey}
                        isChatbotOpen={isChatbotOpen}
                        isLyricsPanelOpen={isLyricsPanelOpen}
                        isUploadPage={true}
                        showCorrectedChords={showCorrectedChords}
                        chordCorrections={chordCorrections}
                        sequenceCorrections={sequenceCorrections}
                      />
                    )}
                  </div>

                </div>
              )}

              {/* Inline UtilityBar + AudioPlaybackDock (side-by-side, inline flow) */}
              {analysisResults && (
                <div className="mt-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-[280px] overflow-x-auto">
                      <div className="inline-flex w-max min-w-full">
                        <UtilityBar
                          isFollowModeEnabled={isFollowModeEnabled}
                          chordPlayback={chordPlayback}
                          youtubePlayer={undefined}
                          playbackRate={playbackRate}
                          setPlaybackRate={(rate: number) => changePlaybackRate(rate)}
                          toggleFollowMode={toggleFollowMode}
                          isCountdownEnabled={isCountdownEnabled}
                          isCountingDown={isCountingDown}
                          countdownDisplay={countdownDisplay}
                          toggleCountdown={() => setIsCountdownEnabled(prev => !prev)}
                          isChatbotOpen={isChatbotOpen}
                          isLyricsPanelOpen={isLyricsPanelOpen}
                          toggleChatbot={toggleChatbot}
                          toggleLyricsPanel={toggleLyricsPanel}
                          metronome={{
                            isEnabled: isMetronomeEnabled,
                            toggleMetronomeWithSync: handleMetronomeToggle,
                          }}
                          totalBeats={simplifiedChordGridData?.beats?.length || 0}
                          isUploadPage={true}
                        />
                      </div>
                    </div>

                    <AudioPlaybackDock
                      isPlaying={isPlaying}
                      onTogglePlayPause={playPause}
                      playbackRate={playbackRate}
                      onChangePlaybackRate={changePlaybackRate}
                      currentTime={currentTime}
                      duration={duration}
                      onSeek={(t: number) => {
                        if (audioRef.current) {
                          try { audioRef.current.currentTime = t; } catch {}
                        }
                      }}
                      disabled={!audioFile}
                      bpm={analysisResults?.beatDetectionResult?.bpm}
                    />
                  </div>

                  {/* Chord Playback Manager: manages state for UtilityBar mixer */}
                  <div className="mt-3">
                    <ChordPlaybackManager
                      currentBeatIndex={currentBeatIndex}
                      chordGridData={simplifiedChordGridData}
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      bpm={analysisResults?.beatDetectionResult?.bpm || 120}
                      onChordPlaybackChange={handleChordPlaybackChange}
                    />
                  </div>

                </div>
              )}






            </div>
          </div>


        </div>
      </main>


      </div>
    </div>
  );
}