"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Navigation from '@/components/Navigation';
import { analyzeAudioWithRateLimit, AnalysisResult } from '@/services/chordRecognitionService';
import { ProcessingStatusSkeleton } from '@/components/SkeletonLoaders';
import {
  getChordGridData as getChordGridDataService
} from '@/services/chordGridCalculationService';

// Dynamic imports for heavy components with better loading states
const BeatModelSelector = dynamic(() => import('@/components/BeatModelSelector'), {
  loading: () => (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
    </div>
  ),
  ssr: false
});

const ChordModelSelector = dynamic(() => import('@/components/ChordModelSelector'), {
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
// import { useTheme } from '@/contexts/ThemeContext';

export default function LocalAudioAnalyzePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
  type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

  // Initialize model states with localStorage persistence
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_beat_detector');
      if (saved && ['auto', 'madmom', 'beat-transformer'].includes(saved)) {
        return saved as BeatDetectorType;
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

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'guitarChords'>('beatChordMap');

  // Key signature and chord correction states (simplified for upload audio page)
  const keySignature = null;
  const isDetectingKey = false;
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

    // Create a blob URL for the audio element
    if (audioRef.current) {
      audioRef.current.src = URL.createObjectURL(file);
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

      // Use existing object URL from audio element or create new one
      const audioUrl = audioRef.current?.src || URL.createObjectURL(audioFile);

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
        console.log(`🎵 Updated duration from analysis results: ${results.audioDuration.toFixed(1)} seconds`);
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

  const seekToTime = (time: number) => {
    if (!audioRef.current) return;
    const clampedTime = Math.max(0, Math.min(time, duration));
    audioRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    seekToTime(newTime);
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

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
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

  // Beat animation tracking
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !chordGridData.beats.length) {
      return;
    }

    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);

        let currentBeat = -1;

        // Find current beat based on time ranges
        for (let i = 0; i < chordGridData.beats.length; i++) {
          const beatTime = chordGridData.beats[i];
          if (typeof beatTime !== 'number' || beatTime < 0) continue;

          // Get next beat time for range checking
          let nextBeatTime = beatTime + 2.0; // Default 2 second range
          for (let j = i + 1; j < chordGridData.beats.length; j++) {
            const nextBeat = chordGridData.beats[j];
            if (typeof nextBeat === 'number' && nextBeat >= 0) {
              nextBeatTime = nextBeat;
              break;
            }
          }

          // Check if current time falls within this beat's range
          if (time >= beatTime && time < nextBeatTime && currentBeat === -1) {
            currentBeat = i;
            break;
          }
        }

        setCurrentBeatIndex(currentBeat);
      }
    }, 100); // 10Hz update rate

    return () => clearInterval(interval);
  }, [isPlaying, chordGridData.beats]);

  // FIXED: Simplified beat click handler using chord grid data timestamps
  const handleBeatClick = useCallback((beatIndex: number, timestamp: number) => {
    if (!audioRef.current) return;

    // Use the timestamp directly if provided, otherwise get from chord grid data
    let targetTime = timestamp;

    if (!timestamp && beatIndex >= 0 && beatIndex < chordGridData.beats.length) {
      const beatTime = chordGridData.beats[beatIndex];
      if (typeof beatTime === 'number') {
        targetTime = beatTime;
      }
    }

    if (targetTime >= 0) {
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  }, [chordGridData.beats]);

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

                  <button
                    onClick={processAudioFile}
                    disabled={!audioFile || audioProcessingState.isExtracting || audioProcessingState.isAnalyzing}
                    className={`bg-primary-600 text-white font-medium py-2 px-4 rounded-md transition-colors ${
                      !audioFile || audioProcessingState.isExtracting || audioProcessingState.isAnalyzing
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-primary-700'
                    }`}
                  >
                    {audioProcessingState.isExtracting ? 'Processing...' : 'Analyze Audio'}
                  </button>
                </div>
              </div>

              {/* Model Selectors - Hide when analysis is complete */}
              {!analysisResults && (
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <BeatModelSelector
                    onChange={setBeatDetector}
                    defaultValue={beatDetector}
                    className={audioProcessingState.isAnalyzing ? 'opacity-50 pointer-events-none' : ''}
                  />
                  <ChordModelSelector
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
                        currentBeatIndex={currentBeatIndex}
                        keySignature={keySignature}
                        isDetectingKey={isDetectingKey}
                        isChatbotOpen={false}
                        isLyricsPanelOpen={false}
                        onBeatClick={handleBeatClick}
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
                        currentBeatIndex={currentBeatIndex}
                        onBeatClick={handleBeatClick}
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



              {/* Metronome Controls */}
              <MetronomeControls
                className="mt-4"
              />

              {/* Advanced Analysis Summary */}
              {analysisResults && (
                <AnalysisSummary
                  analysisResults={analysisResults}
                  audioDuration={duration}
                />
              )}
            </div>
          </div>

          {/* Right side - Audio player section (20% width) */}
          <div className="lg:w-1/5">
            {/* Audio Player */}
            <div className="bg-white dark:bg-content-bg p-4 rounded-lg shadow-card mb-6 transition-colors duration-300">
              <audio ref={audioRef} className="w-full mb-4" controls={false} />

              <div className="flex flex-col space-y-2">
                {/* Transport Controls */}
                <div className="flex items-center justify-center space-x-2">
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
                <div className="text-gray-700 dark:text-gray-300 font-medium text-center text-sm transition-colors duration-300">
                  {Math.floor(currentTime / 60)}:
                  {String(Math.floor(currentTime % 60)).padStart(2, '0')} /
                  {Math.floor(duration / 60)}:
                  {String(Math.floor(duration % 60)).padStart(2, '0')}
                </div>

                {/* Current Chord Display */}
                {chordGridData.chords.length > 0 && currentBeatIndex >= 0 && currentBeatIndex < chordGridData.chords.length && (
                  <div className="text-center bg-primary-50 dark:bg-primary-900 py-2 px-4 rounded-lg transition-colors duration-300">
                    <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">Current Chord</span>
                    <div className="text-2xl font-bold text-primary-700 dark:text-primary-300 transition-colors duration-300">
                      {chordGridData.chords[currentBeatIndex]}
                    </div>
                  </div>
                )}

                {/* Playback Speed */}
                <div className="flex flex-col items-center">
                  <span className="text-gray-600 dark:text-gray-300 text-sm mb-1 transition-colors duration-300">Speed:</span>
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
              </div>

              {/* Clickable Progress Bar */}
              <div
                className="mt-3 bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden transition-colors duration-300 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-500"
                onClick={handleProgressBarClick}
                title="Click to seek"
              >
                <div
                  className="bg-primary-600 h-full transition-all duration-100 ease-out pointer-events-none"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
              </div>

              {/* Quick Skip Buttons */}
              <div className="flex justify-center space-x-2 mt-2">
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


    </div>
  );
}