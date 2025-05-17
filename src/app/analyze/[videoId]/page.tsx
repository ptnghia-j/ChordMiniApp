"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { analyzeAudio, ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo } from '@/services/beatDetectionService';
import ChordGrid from '@/components/ChordGrid';
import BeatModelSelector from '@/components/BeatModelSelector';
import ChordModelSelector from '@/components/ChordModelSelector';
import ProcessingStatus from '@/components/ProcessingStatus';
import ExtractionNotification from '@/components/ExtractionNotification';
import { useProcessing } from '@/contexts/ProcessingContext';
import { getTranscription, saveTranscription } from '@/services/firestoreService';
import dynamic from 'next/dynamic';

// Import types from beatDetectionService
import { DownbeatInfo, BeatPosition } from '@/services/beatDetectionService';
//import type { ReactPlayerProps } from 'react-player';

// Dynamically import ReactPlayer to avoid SSR issues
const ReactPlayer = dynamic(() => import('react-player/youtube'), { ssr: false });

export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const videoId = params.videoId as string;
  const {
    stage,
    setStage,
    setProgress,
    setStatusMessage,
    startProcessing,
    completeProcessing,
    failProcessing
  } = useProcessing();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  // Define detector types
  type BeatDetectorType = 'auto' | 'librosa' | 'madmom' | 'beat-transformer' | 'beat-transformer-light';
  type ChordDetectorType = 'chord-cnn-lstm';
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>('beat-transformer-light');
  const [chordDetector, setChordDetector] = useState<ChordDetectorType>('chord-cnn-lstm');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const extractionLockRef = useRef<boolean>(false); // Prevent duplicate extraction

  // Audio processing state
  const [audioProcessingState, setAudioProcessingState] = useState({
    isExtracting: false,
    isExtracted: false,
    isAnalyzing: false,
    isAnalyzed: false,
    error: null as string | null,
    audioBuffer: null as AudioBuffer | null,
    audioUrl: null as string | null,
    videoUrl: null as string | null,
    youtubeEmbedUrl: null as string | null,
    fromCache: false,
    fromFirestoreCache: false, // Flag to indicate if results are from Firestore cache
  });

  // Analysis results state
  const [analysisResults, setAnalysisResults] = useState<{
    chords: ChordDetectionResult[];
    beats: BeatInfo[];
    downbeats?: number[];
    downbeats_with_measures?: DownbeatInfo[];
    beats_with_positions?: BeatPosition[];
    synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[];
    beatModel?: string;
    chordModel?: string;
  } | null>(null);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const [currentDownbeatIndex, setCurrentDownbeatIndex] = useState(-1);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  // YouTube player state
  // Define a more specific type for the YouTube player
  type YouTubePlayer = {
    muted: boolean;
    seekTo: (time: number) => void;
  };
  const [youtubePlayer, setYoutubePlayer] = useState<YouTubePlayer | null>(null);
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [preferredAudioSource, setPreferredAudioSource] = useState<'youtube' | 'extracted'>('extracted');
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  // Extract audio from YouTube on component mount
  useEffect(() => {
    // Only run if not already extracting and no lock is set
    if (!audioProcessingState.isExtracting && !extractionLockRef.current) {
      extractAudioFromYouTube();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); // Only re-run when videoId changes

  // Audio event handlers
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handlePlay = () => {
    // Only update if not already playing to avoid infinite loops
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    // Only update if currently playing to avoid infinite loops
    if (isPlaying) {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  // Function to toggle video minimization
  const toggleVideoMinimization = () => {
    setIsVideoMinimized(prev => !prev);
  };

  // Function to toggle follow mode
  const toggleFollowMode = () => {
    setIsFollowModeEnabled(prev => !prev);
  };

  // Function to toggle preferred audio source
  const toggleAudioSource = () => {
    setPreferredAudioSource(prev => prev === 'youtube' ? 'extracted' : 'youtube');

    // Mute/unmute appropriate audio source
    if (preferredAudioSource === 'youtube' && youtubePlayer) {
      // If switching to extracted, mute YouTube
      youtubePlayer.muted = true;
      if (audioRef.current) {
        audioRef.current.muted = false;
      }
    } else {
      // If switching to YouTube, mute extracted audio
      if (youtubePlayer) {
        youtubePlayer.muted = false;
      }
      if (audioRef.current) {
        audioRef.current.muted = true;
      }
    }
  };

  // Extract audio from YouTube using our API endpoint
  const extractAudioFromYouTube = async (forceRefresh = false) => {
    if (!videoId || extractionLockRef.current) return;

    // Set lock to prevent duplicate extractions
    extractionLockRef.current = true;

    // Update processing state (without starting the timer)
    setStage('downloading');
    setProgress(0);
    setStatusMessage('Downloading YouTube video...');

    setAudioProcessingState(prev => ({
      ...prev,
      isExtracting: true,
      error: null,
    }));

    try {
      // Call our API endpoint to extract audio
      const response = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId, forceRefresh }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error + (errorData.details ? `: ${errorData.details}` : '');
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Check if extraction was successful
      if (data.success && data.audioUrl) {
        // Update processing state
        setStage('extracting');
        setProgress(50);
        setStatusMessage('Extracting audio...');

        setAudioProcessingState(prev => ({
          ...prev,
          isExtracting: false,
          isExtracted: true,
          audioUrl: data.audioUrl,
          videoUrl: data.videoUrl || null,
          youtubeEmbedUrl: data.youtubeEmbedUrl || null,
          fromCache: data.fromCache || false,
        }));

        // Show extraction notification banner
        setShowExtractionNotification(true);

        // Load audio into audio element
        if (audioRef.current) {
          audioRef.current.src = data.audioUrl;
          audioRef.current.load();
        }

        console.log(`${data.fromCache ? 'Retrieved from cache' : 'Extraction successful'}:`, {
          audioUrl: data.audioUrl,
          videoUrl: data.videoUrl || null,
          youtubeEmbedUrl: data.youtubeEmbedUrl || null,
          fromCache: data.fromCache || false
        });

        // Update progress to 100% for extraction phase
        setProgress(100);
      } else {
        throw new Error(data.error || 'Failed to extract audio from YouTube');
      }
    } catch (error) {
      console.error('Error extracting audio:', error);

      // Update processing state
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while extracting audio';
      failProcessing(errorMessage);

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: false,
        error: errorMessage
      }));
    } finally {
      // Release the lock when done, whether successful or not
      extractionLockRef.current = false;
    }
  };

  // Process and analyze the audio
  const processAudio = async () => {
    if (!audioProcessingState.isExtracted || !audioProcessingState.audioUrl) {
      return;
    }

    // Start the timer and update processing state
    startProcessing(); // This resets and starts the timer
    setStage('beat-detection');
    setProgress(0);
    setStatusMessage('Checking for cached transcription...');

    setAudioProcessingState(prev => ({
      ...prev,
      isAnalyzing: true,
      error: null,
    }));

    // Hide extraction notification when analysis begins
    setShowExtractionNotification(false);

    try {
      // Check if we have a cached transcription in Firestore
      const videoId = params.videoId as string;
      const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);

      let results;

      if (cachedTranscription) {
        // Use cached transcription from Firestore
        console.log('Using cached transcription from Firestore');
        setStage('complete');
        setProgress(100);
        setStatusMessage('Loading cached transcription...');

        // Short delay to show loading state
        await new Promise(resolve => setTimeout(resolve, 500));

        results = {
          beats: cachedTranscription.beats,
          chords: cachedTranscription.chords,
          downbeats: cachedTranscription.downbeats,
          downbeats_with_measures: cachedTranscription.downbeats_with_measures,
          synchronizedChords: cachedTranscription.synchronizedChords,
          beatModel: cachedTranscription.beatModel,
          chordModel: cachedTranscription.chordModel
        };

        // Set duration if available
        if (cachedTranscription.audioDuration) {
          setDuration(cachedTranscription.audioDuration);
        }

        // Update audio processing state to indicate cache usage
        setAudioProcessingState(prev => ({
          ...prev,
          fromFirestoreCache: true
        }));
      } else {
        // No cached transcription, proceed with normal analysis
        console.log('No cached transcription found, performing analysis');

        // Fetch the audio as ArrayBuffer
        const audioResponse = await fetch(audioProcessingState.audioUrl);
        const arrayBuffer = await audioResponse.arrayBuffer();

        // Create AudioContext and decode audio
        // Use a type assertion to handle browser compatibility
        const audioContext = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        setAudioProcessingState(prev => ({
          ...prev,
          audioBuffer,
        }));

        // Start chord and beat analysis with selected models
        console.log(`Starting analysis with beat detector: ${beatDetector}, chord detector: ${chordDetector}...`);

        // Update processing state for chord recognition
        setStage('chord-recognition');
        setProgress(50);
        setStatusMessage('Recognizing chords...');

        const startTime = performance.now();
        results = await analyzeAudio(audioBuffer, beatDetector, chordDetector);
        const endTime = performance.now();
        const totalProcessingTime = (endTime - startTime) / 1000; // Convert to seconds

        // Save the transcription to Firestore
        try {
          const saveResult = await saveTranscription({
            videoId,
            beatModel: beatDetector,
            chordModel: chordDetector,
            beats: results.beats,
            chords: results.chords,
            downbeats: results.downbeats,
            downbeats_with_measures: results.downbeats_with_measures,
            synchronizedChords: results.synchronizedChords,
            audioDuration: duration,
            totalProcessingTime
          });

          if (saveResult) {
            console.log('Successfully saved transcription to Firestore');
          } else {
            console.warn('Failed to save transcription to Firestore, but continuing with analysis');
          }
        } catch (saveError) {
          // Log the error but continue with the analysis
          console.error('Error saving to Firestore, but continuing with analysis:', saveError);
        }
      }

      // Store results
      setAnalysisResults(results);

      setAudioProcessingState(prev => ({
        ...prev,
        isAnalyzing: false,
        isAnalyzed: true
      }));

      // Update processing state to complete
      completeProcessing();

      console.log('Analysis complete!', results);
    } catch (error) {
      console.error('Error in audio processing:', error);

      // Format error message more user-friendly
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Update processing state
      failProcessing(errorMessage);

      setAudioProcessingState(prev => ({
        ...prev,
        error: errorMessage,
        isAnalyzing: false
      }));
    }
  };

  // Audio player controls
  const playPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      // No need to directly control YouTube player
      // The isPlaying state will be updated and ReactPlayer will respond
    } else {
      audioRef.current.play();
      // No need to directly control YouTube player
      // The isPlaying state will be updated and ReactPlayer will respond
    }

    // Toggle isPlaying state - this will be picked up by the ReactPlayer component
    setIsPlaying(!isPlaying);
  };

  const changePlaybackRate = (rate: number) => {
    if (!audioRef.current) return;

    // Set audio element playback rate
    audioRef.current.playbackRate = rate;

    // Update state - this will automatically update ReactPlayer's playbackRate prop
    setPlaybackRate(rate);

    // No need to directly call YouTube player methods
    // ReactPlayer will handle the playback rate change through its props
  };

  // YouTube player event handlers
  const handleYouTubeReady = (player: unknown) => {
    console.log('YouTube player ready');

    // ReactPlayer doesn't directly expose the YouTube player instance
    // Instead, it provides a ref to the player object which has its own API
    // Type assertion to our YouTubePlayer interface
    setYoutubePlayer(player as YouTubePlayer);

    // We can't directly call YouTube player methods here
    // ReactPlayer handles playback rate through its props

    // If audio is already playing, sync the YouTube video
    if (isPlaying && audioRef.current) {
      // Use ReactPlayer's seekTo method
      (player as YouTubePlayer).seekTo(audioRef.current.currentTime);
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

  // Update current time and check for current beat
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !analysisResults) return;

    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);

        // Find the current beat based on time
        const currentBeat = analysisResults.beats.findIndex(
          (beat, index) => time >= beat.time &&
          (index === analysisResults.beats.length - 1 || time < analysisResults.beats[index + 1].time)
        );

        if (currentBeat !== -1) {
          setCurrentBeatIndex(currentBeat);
        }

        // Find current downbeat if available
        const downbeats = analysisResults.downbeats || [];
        if (downbeats.length > 0) {
          const currentDownbeat = downbeats.findIndex(
            (beatTime, index) => time >= beatTime &&
            (index === downbeats.length - 1 ||
             (index < downbeats.length - 1 && time < downbeats[index + 1]))
          );

          if (currentDownbeat !== -1) {
            setCurrentDownbeatIndex(currentDownbeat);
          }
        }
      }
    }, 100); // Update at 10Hz

    return () => clearInterval(interval);
  }, [isPlaying, analysisResults]);

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

  // Format time helper function (mm:ss)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get the chord grid data
  const getChordGridData = () => {
    if (!analysisResults) {
      return { chords: [], beats: [] };
    }

    return {
      chords: analysisResults.synchronizedChords.map(item => item.chord),
      beats: analysisResults.synchronizedChords.map(item => item.beatIndex)
    };
  };

  const chordGridData = getChordGridData();

  // Function to handle auto-scrolling to the current beat
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      beatElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes
  useEffect(() => {
    scrollToCurrentBeat();
  }, [currentBeatIndex, scrollToCurrentBeat]);

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
  }, [preferredAudioSource, youtubePlayer]);

  return (
    <>
      {/* Extraction Notification Banner */}
      <ExtractionNotification
        isVisible={showExtractionNotification}
        fromCache={audioProcessingState.fromCache}
        onDismiss={() => setShowExtractionNotification(false)}
        onRefresh={() => extractAudioFromYouTube(true)}
      />

      <div className="container mx-auto px-1 sm:px-2 md:px-3 py-8 min-h-screen bg-white" style={{ maxWidth: "98%" }}>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Search
          </Link>

          {/* Control buttons */}
          <div className="flex space-x-2">
            <button
              onClick={toggleFollowMode}
              className={`px-3 py-1 text-xs rounded-full ${
                isFollowModeEnabled
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title={isFollowModeEnabled ? "Disable auto-scroll" : "Enable auto-scroll"}
            >
              {isFollowModeEnabled ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
            </button>

            <button
              onClick={toggleAudioSource}
              className={`px-3 py-1 text-xs rounded-full ${
                preferredAudioSource === 'extracted'
                  ? 'bg-green-600 text-white'
                  : 'bg-purple-600 text-white'
              }`}
              title="Switch audio source"
            >
              {preferredAudioSource === 'extracted' ? "Audio: Extracted" : "Audio: YouTube"}
            </button>
          </div>
        </div>

        {/* Main content area - now full width */}
        <div className="flex flex-col">
          {/* Content area: Chord and beat visualization */}
          <div className="w-full p-6 overflow-visible">
            {/* Hidden audio player (functional but not visible) */}
            <audio
              ref={audioRef}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
              onTimeUpdate={handleTimeUpdate}
              className="hidden"
            />

            {/* Processing Status and Model Selection in a single row */}
            <div className="mb-6">
              {/* Error message */}
              {audioProcessingState.error && (
                <div className="bg-red-50 p-4 rounded-lg mb-4">
                  <p className="text-red-700">{audioProcessingState.error}</p>
                  <button
                    onClick={() => extractAudioFromYouTube()}
                    className="mt-2 text-red-600 underline hover:text-red-800"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Combined processing status and model selection */}
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Processing Status component - expands to full width when complete */}
                <div className={`${stage === 'complete' ? 'w-full' : (stage === 'beat-detection' || stage === 'chord-recognition') ? 'lg:w-1/3' : 'hidden'}`}>
                  <ProcessingStatus
                    className="h-full"
                    analysisResults={analysisResults}
                    audioDuration={duration}
                    fromCache={audioProcessingState.fromCache}
                    fromFirestoreCache={audioProcessingState.fromFirestoreCache}
                  />
                </div>

                {/* Model Selection - hidden when complete */}
                {audioProcessingState.isExtracted && !audioProcessingState.isAnalyzed && !audioProcessingState.isAnalyzing && !audioProcessingState.error && stage !== 'complete' && (
                  <div className={`${(stage === 'beat-detection' || stage === 'chord-recognition') ? 'lg:w-2/3' : 'w-full'} p-4 rounded-lg bg-gray-50 overflow-visible`}>
                    <div className="flex flex-col h-full">
                      <div className="mb-2">
                        <h3 className="font-medium text-gray-900">
                          Select Models for Analysis
                        </h3>
                        <p className="text-sm text-gray-600">
                          Choose beat and chord detection models to analyze the audio.
                        </p>
                      </div>

                      <div className="flex flex-col md:flex-row gap-4 items-start overflow-visible">
                        <div className="w-full md:w-1/3 relative z-40">
                          <BeatModelSelector
                            onChange={setBeatDetector}
                            defaultValue="beat-transformer-light"
                          />
                        </div>

                        <div className="w-full md:w-1/3 relative z-30">
                          <ChordModelSelector
                            selectedModel={chordDetector}
                            onModelChange={setChordDetector}
                          />
                        </div>

                        <div className="w-full md:w-1/3 flex items-center justify-center mt-4 md:mt-0">
                          <button
                            onClick={processAudio}
                            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                          >
                            Start Audio Analysis
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis results */}
            {analysisResults && audioProcessingState.isAnalyzed && (
            <div className="mt-6 space-y-6">

              {/* Rest of the analysis UI... */}
              <div className="p-4 rounded-lg bg-white border border-gray-200">
                <h3 className="font-medium text-lg mb-3 text-gray-800">Chord Progression</h3>
                <ChordGrid
                  chords={chordGridData.chords}
                  beats={chordGridData.beats}
                  currentBeatIndex={currentBeatIndex}
                  measuresPerRow={4}
                />
              </div>

              {/* Beats visualization */}
              <div className="p-4 rounded-lg bg-white border border-gray-300">
                <h3 className="font-medium text-lg mb-2 text-gray-800">Beat Timeline</h3>
                <div className="relative h-16 bg-gray-100 border border-gray-300 rounded-md overflow-hidden">
                  {/* Beat markers */}
                  {analysisResults.beats.map((beat, index) => {
                    // Get beat number from beat info if available
                    const beatNum = beat.beatNum ||
                                   analysisResults.synchronizedChords[index]?.beatNum ||
                                   (index % 4) + 1;

                    // Make first beat of measure more prominent
                    const isFirstBeat = beatNum === 1;

                    return (
                      <div
                        key={`beat-${index}`}
                        className={`absolute bottom-0 transform -translate-x-1/2 ${
                          index === currentBeatIndex
                            ? 'bg-blue-600'
                            : isFirstBeat
                              ? 'bg-blue-500'
                              : 'bg-gray-500'
                        }`}
                        style={{
                          left: `${(beat.time / duration) * 100}%`,
                          width: isFirstBeat ? '0.5px' : '0.25px',
                          height: index === currentBeatIndex ? '14px' : isFirstBeat ? '10px' : '8px'
                        }}
                      >
                        {/* Show beat number above */}
                        <div className={`absolute -top-4 left-1/2 transform -translate-x-1/2 text-[0.6rem] ${
                          isFirstBeat ? 'text-blue-700 font-medium' : 'text-gray-600'
                        }`}>
                          {beatNum}
                        </div>
                      </div>
                    );
                  })}

                  {/* Downbeat markers (if available) - 3x thicker */}
                  {(analysisResults.downbeats_with_measures || []).map((downbeat, index) => (
                    <div
                      key={`downbeat-measure-${index}`}
                      className={`absolute bottom-0 w-1 h-14 transform -translate-x-1/2 ${
                        index === currentDownbeatIndex ? 'bg-red-800' : 'bg-red-700'
                      }`}
                      style={{ left: `${(downbeat.time / duration) * 100}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-red-800">
                        {downbeat.measureNum}
                      </div>
                    </div>
                  ))}

                  {/* Fallback to original downbeats if downbeats_with_measures is not available - 3x thicker */}
                  {!analysisResults.downbeats_with_measures && (analysisResults.downbeats || []).map((beatTime, index) => (
                    <div
                      key={`downbeat-${index}`}
                      className={`absolute bottom-0 w-1 h-14 transform -translate-x-1/2 ${
                        index === currentDownbeatIndex ? 'bg-red-800' : 'bg-red-700'
                      }`}
                      style={{ left: `${(beatTime / duration) * 100}%` }}
                    >
                      <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs font-medium text-red-800">
                        {index + 1}
                      </div>
                    </div>
                  ))}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-600 z-10"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  ></div>
                </div>

                {/* Beat type legend */}
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-700">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-blue-500"></div>
                    <span>First beat (1)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-gray-500"></div>
                    <span>Regular beats (2,3,4)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-red-500"></div>
                    <span>Measure start (downbeat)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-blue-600"></div>
                    <span>Current beat</span>
                  </div>
                </div>
              </div>

              {/* Beat statistics section removed as requested */}
            </div>
          )}
          </div>

          {/* Playback controls - now in the main content area */}
          <div className="w-full p-4 bg-gray-50 rounded-lg mb-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={playPause}
                className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700"
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <div className="text-gray-700">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              {/* Playback rate selector */}
              <div className="flex flex-wrap gap-2">
                {playbackRates.map(rate => (
                  <button
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
                    className={`px-2 py-1 text-xs rounded ${
                      playbackRate === rate
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Floating video player for all screens - fixed position */}
          {(audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl) && (
            <div
              className={`fixed bottom-4 right-4 z-50 transition-all duration-300 shadow-xl ${
                isVideoMinimized ? 'w-1/4 md:w-1/5' : 'w-2/3 md:w-1/3'
              }`}
              style={{
                maxWidth: isVideoMinimized ? '250px' : '500px',
                pointerEvents: 'auto'
              }}
            >
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

                {/* Video player */}
                <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
                  {(audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl) && (
                    <ReactPlayer
                      url={audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl || ''}
                      width="100%"
                      height="100%"
                      controls={true}
                      playing={isPlaying}
                      playbackRate={playbackRate}
                      onReady={handleYouTubeReady}
                      onPlay={handleYouTubePlay}
                      onPause={handleYouTubePause}
                      onProgress={handleYouTubeProgress}
                      progressInterval={100}
                      muted={preferredAudioSource === 'extracted'}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}