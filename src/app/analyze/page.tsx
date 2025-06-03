"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Navigation from '@/components/Navigation';
import { analyzeAudio, AnalysisResult } from '@/services/chordRecognitionService';
import BeatModelSelector from '@/components/BeatModelSelector';
import ChordModelSelector from '@/components/ChordModelSelector';
import ProcessingStatusBanner from '@/components/ProcessingStatusBanner';
import AnalysisSummary from '@/components/AnalysisSummary';
import MetronomeControls from '@/components/MetronomeControls';
import { ChordGridContainer } from '@/components/ChordGridContainer';
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function LocalAudioAnalyzePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Use processing context
  const {
    stage,
    progress,
    setStage,
    setProgress,
    setStatusMessage,
    startProcessing,
    completeProcessing,
    failProcessing
  } = useProcessing();
  const { theme } = useTheme();

  // Define detector types
  type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
  type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>('beat-transformer');
  const [chordDetector, setChordDetector] = useState<ChordDetectorType>('chord-cnn-lstm');

  // Audio processing state
  const [audioProcessingState, setAudioProcessingState] = useState({
    isExtracting: false,
    isExtracted: false,
    isAnalyzing: false,
    isAnalyzed: false,
    error: null as string | null,
    audioBuffer: null as AudioBuffer | null,
  });

  // Analysis results state
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  // Key signature and chord correction states (simplified for upload audio page)
  const keySignature = null;
  const isDetectingKey = false;
  const showCorrectedChords = false;
  const chordCorrections: Record<string, string> = {};
  const sequenceCorrections: Array<{
    originalChord: string;
    correctedChord: string;
    position: number;
    confidence: number;
  }> = [];

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

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: true,
        error: null,
      }));

      // Update to chord recognition stage after a brief delay
      stageTimeout = setTimeout(() => {
        setStage('chord-recognition');
        setProgress(50);
        setStatusMessage('Recognizing chords and synchronizing with beats...');
      }, 1000);

      // Read the file as ArrayBuffer
      const arrayBuffer = await audioFile.arrayBuffer();

      // Create AudioContext
      const audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracted: true,
        audioBuffer,
        isAnalyzing: true
      }));

      // Start chord and beat analysis with selected detectors
      const results = await analyzeAudio(audioBuffer, beatDetector, chordDetector);

      // FIXED: Clear the stage timeout to prevent it from overriding completion
      if (stageTimeout) {
        clearTimeout(stageTimeout);
        stageTimeout = null;
      }

      // Store results
      setAnalysisResults(results);

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

      console.log('Analysis complete!', results);
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

  // Advanced chord grid data processing matching YouTube video page
  const chordGridData = useMemo(() => {
    if (!analysisResults?.synchronizedChords) {
      return {
        chords: [],
        beats: [],
        beatNumbers: [],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        hasPickupBeats: false,
        pickupBeatsCount: 0,
        originalAudioMapping: []
      };
    }

    // DEBUG: Essential structure info (once only)
    console.log(`🔬 Analysis Structure:`, {
      topLevelKeys: Object.keys(analysisResults),
      beatsLocation: (analysisResults as any).beats ? 'top-level' : 'beatDetectionResult',
      beatsCount: (analysisResults as any).beats?.length || analysisResults.beatDetectionResult?.beats?.length || 0,
      firstBeat: (analysisResults as any).beats?.[0] || analysisResults.beatDetectionResult?.beats?.[0],
      bpm: analysisResults.beatDetectionResult?.bpm || (analysisResults as any).bpm
    });

    // Calculate padding for audio uploads
    const rawBeats = (analysisResults as any).beats || [];

    // Extract first beat time correctly (handle both number and object formats)
    let firstBeatTime = 0;
    if (rawBeats.length > 0) {
      const firstBeat = rawBeats[0];
      if (typeof firstBeat === 'number') {
        firstBeatTime = firstBeat;
      } else if (typeof firstBeat === 'object' && firstBeat?.time) {
        firstBeatTime = firstBeat.time;
      } else {
        console.warn('⚠️ Unexpected first beat format:', firstBeat);
      }
    }

    const bpm = analysisResults.beatDetectionResult?.bpm || (analysisResults as any).bpm || 120;
    const beatDuration = 60 / bpm; // seconds per beat

    // Calculate how many padding beats we need to start from 0.0s
    const calculatedPaddingCount = firstBeatTime > 0 ? Math.floor(firstBeatTime / beatDuration) : 0;

    const paddingCount = analysisResults.beatDetectionResult?.paddingCount || calculatedPaddingCount;
    const shiftCount = analysisResults.beatDetectionResult?.shiftCount || 0;

    console.log(`🔢 Padding: firstBeat=${firstBeatTime}s, bpm=${bpm.toFixed(1)}, padding=${paddingCount} beats`);

    // FIXED: Use YouTube approach - only include chords that actually have timestamps within audio duration
    const filteredSynchronizedChords = analysisResults.synchronizedChords.filter(item => {
      if (!analysisResults.beatDetectionResult?.beats) return true;

      const beatIndex = item.beatIndex;
      if (beatIndex < 0 || beatIndex >= analysisResults.beatDetectionResult.beats.length) {
        return false; // Invalid beat index
      }

      const beatTime = analysisResults.beatDetectionResult.beats[beatIndex].time;
      const animationRangeStart = analysisResults.beatDetectionResult.animationRangeStart || 0;
      const actualBeatTime = animationRangeStart + beatTime;

      // Only include beats that are actually within the audio duration (no buffer)
      return actualBeatTime < duration;
    });

    // CRITICAL: Much more aggressive cell limiting to prevent excessive trailing cells
    const estimatedBPM = analysisResults.beatDetectionResult?.bpm || 120;
    const expectedBeats = Math.ceil((duration / 60) * estimatedBPM);

    // Very conservative approach: limit to expected beats with minimal buffer
    const maxReasonableCells = Math.min(
      expectedBeats + 10, // Only 10 beat buffer
      Math.ceil(duration * 1.5), // Max 1.5 cells per second
      filteredSynchronizedChords.length
    );

    const limitedSynchronizedChords = filteredSynchronizedChords.slice(0, maxReasonableCells);

    console.log(`📊 Cell Limiting: duration=${duration.toFixed(1)}s, estimatedBPM=${estimatedBPM}, expectedBeats=${expectedBeats}, maxCells=${maxReasonableCells}, actualCells=${limitedSynchronizedChords.length}`);

    // Process limited synchronized chords with proper formatting
    const processedChords = limitedSynchronizedChords.map(item => {
      let chord = item.chord;

      // Apply chord corrections if available
      if (showCorrectedChords && chordCorrections[chord]) {
        chord = chordCorrections[chord];
      }

      // Apply sequence corrections if available
      if (showCorrectedChords && sequenceCorrections.length > 0) {
        const sequenceCorrection = sequenceCorrections.find(sc => sc.position === item.beatIndex);
        if (sequenceCorrection) {
          chord = sequenceCorrection.correctedChord;
        }
      }

      // Return raw chord name - formatting will be handled by ChordGrid component
      return chord;
    });

    // Create beats array using actual timestamps instead of beat indices
    const processedBeats = limitedSynchronizedChords.map((item, index) => {
      const beatIndex = item.beatIndex;

      // Access beats from the correct location (log once)
      let beatsArray = (analysisResults as any).beats;
      if (!beatsArray || beatsArray.length === 0) {
        beatsArray = analysisResults.beatDetectionResult?.beats;
      }
      const beatsLength = beatsArray?.length || 0;

      if (beatIndex >= 0 && beatIndex < beatsLength && beatsArray) {
        const beatData = beatsArray[beatIndex];

        // Handle both data structures: YouTube (objects) vs Audio Upload (numbers)
        let beatTime: number;
        if (typeof beatData === 'number') {
          // Audio upload: beats is array of numbers
          beatTime = beatData;
        } else if (typeof beatData === 'object' && beatData?.time) {
          // YouTube: beats is array of objects with .time property
          beatTime = beatData.time;
        } else {
          console.warn(`❌ Beat[${index}] has unexpected beatData structure:`, beatData);
          return 0;
        }

        if (typeof beatTime === 'number') {
          return beatTime; // Use beat time directly (already absolute timestamps)
        } else {
          console.warn(`❌ Beat[${index}] has invalid beatTime:`, beatTime);
        }
      } else {
        // Handle padding beats (before first detected beat)
        if (beatIndex < 0) {
          // This is a padding beat - calculate its time based on beat duration
          const paddingBeatTime = (beatIndex + paddingCount) * beatDuration;
          return paddingBeatTime;
        }
      }

      // FALLBACK: Use item.timestamp if available
      if (item.timestamp && typeof item.timestamp === 'number') {
        return item.timestamp;
      }

      return 0; // Fallback for invalid indices
    });

    // Create original audio mapping for timestamp-based seeking
    const originalAudioMapping = limitedSynchronizedChords.map((item, index) => ({
      chord: item.chord,
      timestamp: processedBeats[index],
      visualIndex: index
    }));

    // Add actual padding beats to the beginning of the arrays
    let finalChords = processedChords;
    let finalBeats = processedBeats;

    if (paddingCount > 0) {
      // Create padding beats with calculated timestamps
      const paddingBeats = Array.from({ length: paddingCount }, (_, i) => i * beatDuration);
      const paddingChords = Array.from({ length: paddingCount }, () => ''); // Empty chords for padding

      // Prepend padding to the arrays
      finalChords = [...paddingChords, ...processedChords];
      finalBeats = [...paddingBeats, ...processedBeats];

      console.log(`🎵 Added ${paddingCount} padding beats: ${paddingBeats.map(b => b.toFixed(2)).join(', ')}s`);
    }

    const result = {
      chords: finalChords,
      beats: finalBeats,
      beatNumbers: [
        ...Array.from({ length: paddingCount }, () => 1), // Padding beats are beat 1
        ...limitedSynchronizedChords.map(item => item.beatNum || 1)
      ],
      hasPadding: paddingCount > 0,
      paddingCount,
      shiftCount,
      hasPickupBeats: paddingCount > 0,
      pickupBeatsCount: paddingCount,
      originalAudioMapping
    };

    // DEBUG: Final chord grid summary
    console.log(`🎼 Grid: ${result.chords.length} chords, ${result.beats.length} beats, padding=${result.paddingCount}, first beats:`, result.beats.slice(0, 3));

    return result;
  }, [analysisResults, showCorrectedChords, chordCorrections, sequenceCorrections, duration]);

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
            if (typeof chordGridData.beats[j] === 'number' && chordGridData.beats[j] >= 0) {
              nextBeatTime = chordGridData.beats[j];
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
      targetTime = chordGridData.beats[beatIndex];
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
      />

      <main className="flex-grow container mx-auto px-1 sm:px-2 md:px-3" style={{ maxWidth: "98%" }}>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white my-4 transition-colors duration-300">Upload Audio File</h2>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Chord Grid (80% width) */}
          <div className="lg:w-4/5">
            <div className="bg-white dark:bg-content-bg p-6 rounded-lg shadow-card h-full transition-colors duration-300 border border-gray-200 dark:border-gray-700">
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

              {/* Advanced Chord Grid Container */}
              <ChordGridContainer
                analysisResults={analysisResults}
                chordGridData={chordGridData}
                currentBeatIndex={currentBeatIndex}
                keySignature={keySignature}
                isDetectingKey={isDetectingKey}
                isChatbotOpen={false}
                isLyricsPanelOpen={false}
                onBeatClick={handleBeatClick}
                showCorrectedChords={showCorrectedChords}
                chordCorrections={chordCorrections}
                sequenceCorrections={sequenceCorrections}
              />

              {/* DEBUG: Current Beat Index Display */}
              {analysisResults && (
                <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900 rounded text-xs">
                  <strong>DEBUG:</strong> currentBeatIndex = {currentBeatIndex},
                  beats.length = {chordGridData.beats.length},
                  isPlaying = {isPlaying.toString()}
                  {currentBeatIndex >= 0 && currentBeatIndex < chordGridData.beats.length && (
                    <span>, beatTime = {chordGridData.beats[currentBeatIndex]?.toFixed(2)}s</span>
                  )}
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
            <div className="bg-white dark:bg-content-bg p-4 rounded-lg shadow-card mb-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
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
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 9H17a1 1 0 110 2h-5.586l4.293 4.293a1 1 0 010 1.414zM9 2a1 1 0 00-1 1v.586L3.707 8.879a1 1 0 000 1.414L8 14.586V15a1 1 0 002 0V3a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
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
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L8.586 11H3a1 1 0 110-2h5.586L4.293 5.707a1 1 0 010-1.414zM11 2a1 1 0 011 1v.586l4.293-4.293a1 1 0 111.414 1.414L12 6.414V15a1 1 0 11-2 0V3a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
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
            <div className="bg-white dark:bg-content-bg p-4 rounded-lg shadow-card transition-colors duration-300 border border-gray-200 dark:border-gray-700">
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