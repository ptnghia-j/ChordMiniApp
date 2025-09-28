"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@heroui/react';
import Navigation from '@/components/Navigation';
import { analyzeAudioWithRateLimit, AnalysisResult } from '@/services/chordRecognitionService';
import { ProcessingStatusSkeleton } from '@/components/SkeletonLoaders';
import {
  getChordGridData as getChordGridDataService
} from '@/services/chordGridCalculationService';

// Dynamic imports for heavy components with better loading states
const HeroUIBeatModelSelector = dynamic(() => import('@/components/HeroUIBeatModelSelector'), {
  loading: () => (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
    </div>
  ),
  ssr: false
});

const HeroUIChordModelSelector = dynamic(() => import('@/components/HeroUIChordModelSelector'), {
  loading: () => (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
    </div>
  ),
  ssr: false
});

const ProcessingStatusBanner = dynamic(() => import('@/components/ProcessingStatusBanner'), {
  loading: () => <ProcessingStatusSkeleton />,
  ssr: true
});

const AnalysisSummary = dynamic(() => import('@/components/AnalysisSummary'), {
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const MetronomeControls = dynamic(() => import('@/components/MetronomeControls'), {
  loading: () => <div className="h-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ChordGridContainer = dynamic(() => import('@/components/ChordGridContainer').then(mod => ({ default: mod.ChordGridContainer })), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const GuitarChordsTab = dynamic(() => import('@/components/GuitarChordsTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});
import { useProcessing } from '@/contexts/ProcessingContext';
import { FiSkipBack, FiSkipForward } from 'react-icons/fi';
import { useMetronomeSync } from '@/hooks/useMetronomeSync';
// import { useTheme } from '@/contexts/ThemeContext';

export default function LocalAudioAnalyzePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
    };
  }, []);


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
      // If saved value was 'auto', default to 'beat-transformer'
      if (saved === 'auto') {
        localStorage.setItem('chordmini_beat_detector', 'beat-transformer');
      }
    }
    return 'beat-transformer';
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

  // Analysis results state
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);



  // Current state for playback - FIXED: Add missing state variables for beat animation
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const currentBeatIndexRef = useRef(-1);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'guitarChords'>('beatChordMap');


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
      audioRef.current.play();
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (!audioRef.current) return;

    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  // Advanced audio control functions
  const skipForward = (seconds: number = 10) => {
    if (!audioRef.current) return;
    const newTime = Math.min(audioRef.current.currentTime + seconds, duration);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipBackward = (seconds: number = 10) => {
    if (!audioRef.current) return;
    const newTime = Math.max(audioRef.current.currentTime - seconds, 0);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
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



      // Import and call key detection service with enharmonic correction
      import('@/services/keyDetectionService').then(({ detectKey }) => {
        // Use cache for sequence corrections (no bypass)
        detectKey(chordData, true, false) // Request enharmonic correction, use cache
          .then(result => {
            console.log('🔑 Key detection result:', result.primaryKey);
            setKeySignature(result.primaryKey);
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
  }, [analysisResults?.chords, isDetectingKey, keyDetectionAttempted]);

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



  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Processing Status Banner */}
      <ProcessingStatusBanner
        analysisResults={analysisResults}
        audioDuration={duration}
        audioUrl={audioProcessingState.audioUrl || undefined}
      />

      <main className="flex-grow container mx-auto px-1 sm:px-2 md:px-3" style={{ maxWidth: "98%" }}>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white my-4 transition-colors duration-300">Upload Audio File</h2>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Chord Grid (80% width) */}
          <div className="lg:w-4/5">
            <div className="bg-white dark:bg-content-bg p-6 rounded-lg shadow-card h-full transition-colors duration-300">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-heading font-bold text-gray-800 dark:text-white transition-colors duration-300">Chord Grid</h2>

                {/* File upload and Processing button */}
                <div className="flex flex-col md:flex-row gap-2 items-center">
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

              {/* Analysis Results Tabs */}
              {analysisResults && (
                <div className="mb-6">
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
                    </div>
                  </div>

                  {/* Tab content */}
                  <div className="tab-content">
                    {/* Beat & Chord Map Tab */}
                    {activeTab === 'beatChordMap' && (
                      <ChordGridContainer
                        analysisResults={analysisResults}
                        chordGridData={chordGridData}
                        keySignature={keySignature}
                        isDetectingKey={isDetectingKey}
                        isChatbotOpen={false}
                        isLyricsPanelOpen={false}
                        isUploadPage={true}
                        showCorrectedChords={showCorrectedChords}
                        chordCorrections={chordCorrections}
                        sequenceCorrections={sequenceCorrections}
                      />
                    )}

                    {/* Guitar Chords Tab */}
                    {activeTab === 'guitarChords' && (
                      <GuitarChordsTab
                        analysisResults={analysisResults}
                        chordGridData={chordGridData}
                        keySignature={keySignature}
                        isDetectingKey={isDetectingKey}
                        isChatbotOpen={false}
                        isLyricsPanelOpen={false}
                        isUploadPage={true}
                        showCorrectedChords={showCorrectedChords}
                        chordCorrections={chordCorrections}
                        sequenceCorrections={sequenceCorrections}
                      />
                    )}
                  </div>
                </div>
              )}





              {/* Advanced Analysis Summary */}
              {analysisResults && (
                <AnalysisSummary
                  analysisResults={analysisResults}
                  audioDuration={duration}
                />
              )}
            </div>
          </div>

          {/* Right side - Instructions section (20% width) */}
          <div className="lg:w-1/5">
            {/* Hidden audio element */}
            <audio ref={audioRef} className="hidden" controls={false} />

            {/* Instructions */}
            <div className="bg-white dark:bg-content-bg p-4 rounded-lg shadow-card transition-colors duration-300">
              <h3 className="text-lg font-medium text-gray-700 dark:text-white mb-2 transition-colors duration-300">Instructions</h3>
              <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal pl-4 transition-colors duration-300">
                <li>Upload an audio file (MP3, WAV, etc.)</li>
                <li>Click &quot;Analyze Audio&quot; to process</li>
                <li>Wait for chord detection to complete</li>
                <li>Use playback controls to listen and see chords</li>
              </ol>

              <div className="mt-4 text-xs text-gray-500 dark:text-gray-300 transition-colors duration-300">
                <p>Note: Audio processing happens locally in your browser.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Fixed Bottom-Right Audio Controls */}
      {audioFile && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-content-bg p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 transition-colors duration-300 max-w-sm">
          {/* Transport Controls */}
          <div className="flex items-center justify-center space-x-2 mb-3">
            {/* Skip Backward */}
            <button
              onClick={() => skipBackward(10)}
              disabled={!audioFile}
              className={`p-2 rounded-full transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
              title="Skip back 10 seconds"
            >
              <FiSkipBack className="w-4 h-4" />
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={playPause}
              disabled={!audioFile}
              className={`font-medium py-2 px-6 rounded-full shadow-button transition-colors ${
                !audioFile
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            {/* Skip Forward */}
            <button
              onClick={() => skipForward(10)}
              disabled={!audioFile}
              className={`p-2 rounded-full transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
              title="Skip forward 10 seconds"
            >
              <FiSkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Playback Position */}
          <div className="text-gray-700 dark:text-gray-300 font-medium text-center text-sm mb-3 transition-colors duration-300">
            {Math.floor(currentTime / 60)}:
            {String(Math.floor(currentTime % 60)).padStart(2, '0')} /
            {Math.floor(duration / 60)}:
            {String(Math.floor(duration % 60)).padStart(2, '0')}
          </div>

          {/* Current Chord Display */}
          {chordGridData.chords.length > 0 && currentBeatIndex >= 0 && currentBeatIndex < chordGridData.chords.length && (
            <div className="text-center bg-primary-50 dark:bg-primary-900 py-2 px-4 rounded-lg mb-3 transition-colors duration-300">
              <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">Current Chord</span>
              <div className="text-xl font-bold text-primary-700 dark:text-primary-300 transition-colors duration-300">
                {chordGridData.chords[currentBeatIndex]}
              </div>
            </div>
          )}

          {/* Playback Speed */}
          <div className="flex flex-col items-center mb-3">
            <span className="text-gray-600 dark:text-gray-300 text-xs mb-1 transition-colors duration-300">Speed:</span>
            <div className="flex flex-wrap justify-center gap-1">
              {playbackRates.map(rate => (
                <button
                  key={rate}
                  onClick={() => changePlaybackRate(rate)}
                  disabled={!audioFile}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    !audioFile
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : playbackRate === rate
                        ? 'bg-primary-600 text-white font-medium shadow-button'
                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Auto-scroll Toggle */}
          <div className="flex items-center justify-center space-x-2 mb-3">
            <span className="text-gray-600 dark:text-gray-300 text-xs transition-colors duration-300">Auto-scroll:</span>
            <button
              onClick={() => setIsFollowModeEnabled(!isFollowModeEnabled)}
              disabled={!audioFile}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : isFollowModeEnabled
                    ? 'bg-primary-600 text-white font-medium shadow-button'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
              title={isFollowModeEnabled ? 'Disable auto-scroll to current beat' : 'Enable auto-scroll to current beat'}
            >
              {isFollowModeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Metronome Controls */}
          {analysisResults && (
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
              <MetronomeControls
                onToggleWithSync={toggleMetronomeWithSync}
              />
            </div>
          )}

          {/* Quick Skip Buttons */}
          <div className="flex justify-center space-x-1 mt-3">
            <button
              onClick={() => skipBackward(30)}
              disabled={!audioFile}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
            >
              -30s
            </button>
            <button
              onClick={() => skipBackward(5)}
              disabled={!audioFile}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
            >
              -5s
            </button>
            <button
              onClick={() => skipForward(5)}
              disabled={!audioFile}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
            >
              +5s
            </button>
            <button
              onClick={() => skipForward(30)}
              disabled={!audioFile}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                !audioFile
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
              }`}
            >
              +30s
            </button>
          </div>
        </div>
      )}

    </div>
  );
}