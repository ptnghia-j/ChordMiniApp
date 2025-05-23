"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { analyzeAudio, ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo } from '@/services/beatDetectionService';
import ChordGrid from '@/components/ChordGrid';

export default function LocalAudioAnalyzePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  const [analysisResults, setAnalysisResults] = useState<{
    chords: ChordDetectionResult[];
    beats: BeatInfo[];
    synchronizedChords: {chord: string, beatIndex: number}[];
  } | null>(null);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

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

    setAudioProcessingState(prev => ({
      ...prev,
      isExtracting: true,
      error: null,
    }));

    try {
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

      // Start chord and beat analysis
      console.log('Starting chord and beat analysis...');
      const results = await analyzeAudio(audioBuffer);

      // Store results
      setAnalysisResults(results);

      setAudioProcessingState(prev => ({
        ...prev,
        isAnalyzing: false,
        isAnalyzed: true
      }));

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

      setAudioProcessingState(prev => ({
        ...prev,
        error: errorMessage,
        isExtracting: false,
        isAnalyzing: false
      }));
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

  // Update current time and check for current beat
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !analysisResults) return;

    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);

        // Find the current beat based on time
        const currentBeat = analysisResults.beats.findIndex(
          (beat, index, beats) => {
            const nextBeatTime = index < beats.length - 1
              ? beats[index + 1].time
              : beat.time + 0.5; // Estimate for last beat

            return time >= beat.time && time < nextBeatTime;
          }
        );

        if (currentBeat !== -1) {
          setCurrentBeatIndex(currentBeat);
        }
      }
    }, 100);

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

  // Get the chord and beat data for the grid
  const getChordGridData = () => {
    if (!analysisResults) {
      // Return mock data if analysis not complete
      return {
        chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'C', 'C', 'F', 'G', 'Em', 'Am'],
        beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      };
    }

    // Return actual analysis data
    return {
      chords: analysisResults.synchronizedChords.map(item => item.chord),
      beats: analysisResults.synchronizedChords.map(item => item.beatIndex)
    };
  };

  const chordGridData = getChordGridData();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Navigation Bar - Sticky */}
      <div className="sticky top-0 bg-white text-gray-800 p-3 shadow-md block z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="/chordMiniLogo.png"
              alt="ChordMini Logo"
              width={48}
              height={48}
              className="mr-2"
            />
            <h1 className="text-xl font-bold text-primary-700">Chord Mini</h1>
          </div>
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link href="/" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Features
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <main className="flex-grow container mx-auto px-1 sm:px-2 md:px-3" style={{ maxWidth: "98%" }}>
        <h2 className="text-2xl font-bold text-gray-800 my-4">Upload Audio File</h2>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Chord Grid (80% width) */}
          <div className="lg:w-4/5">
            <div className="bg-white p-6 rounded-lg shadow-card h-full">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-heading font-bold text-gray-800">Chord Grid</h2>

                {/* File upload and Processing button */}
                <div className="flex flex-col md:flex-row gap-2 items-center">
                  <div className="relative inline-block">
                    <label className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-md cursor-pointer transition-colors">
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

              {/* Audio Analysis Status Indicator */}
              <div className="flex items-center justify-end text-sm mb-4">
                {audioProcessingState.isExtracting && (
                  <div className="flex items-center text-gray-600">
                    <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></div>
                    <span>Extracting audio...</span>
                  </div>
                )}

                {audioProcessingState.isAnalyzing && (
                  <div className="flex items-center text-gray-600">
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

              <ChordGrid
                chords={chordGridData.chords}
                beats={chordGridData.beats}
                currentBeatIndex={currentBeatIndex}
                measuresPerRow={4}
              />

              {/* Analysis Statistics (if available) */}
              {analysisResults && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-lg font-medium mb-3 text-gray-800">Analysis Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-700">
                      <p className="text-sm text-gray-600 font-medium">Total Chords</p>
                      <p className="text-xl font-semibold text-blue-800">{analysisResults.chords.length}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg border-2 border-blue-700">
                      <p className="text-sm text-gray-600 font-medium">Total Beats</p>
                      <p className="text-xl font-semibold text-green-800">{analysisResults.beats.length}</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg border-2 border-blue-700">
                      <p className="text-sm text-gray-600 font-medium">BPM (Estimated)</p>
                      <p className="text-xl font-semibold text-purple-800">
                        {analysisResults.beats.length > 1
                          ? Math.round(60 / (analysisResults.beats[1].time - analysisResults.beats[0].time))
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg border-2 border-blue-700">
                      <p className="text-sm text-gray-600 font-medium">Most Common Chord</p>
                      <p className="text-xl font-semibold text-amber-800">
                        {(() => {
                          const counts: Record<string, number> = {};
                          analysisResults.synchronizedChords.forEach(item => {
                            counts[item.chord] = (counts[item.chord] || 0) + 1;
                          });
                          const mostCommon = Object.entries(counts)
                            .sort((a, b) => b[1] - a[1])[0];
                          return mostCommon ? mostCommon[0] : 'N/A';
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right side - Audio player section (20% width) */}
          <div className="lg:w-1/5">
            {/* Audio Player */}
            <div className="bg-white p-4 rounded-lg shadow-card mb-6">
              <audio ref={audioRef} className="w-full mb-4" controls={false} />

              <div className="flex flex-col space-y-2">
                {/* Play/Pause Button */}
                <button
                  onClick={playPause}
                  disabled={!audioFile}
                  className={`font-medium py-2 px-4 rounded-full shadow-button transition-colors w-full ${
                    !audioFile
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 text-white'
                  }`}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>

                {/* Playback Position */}
                <div className="text-gray-700 font-medium text-center text-sm">
                  {Math.floor(currentTime / 60)}:
                  {String(Math.floor(currentTime % 60)).padStart(2, '0')} /
                  {Math.floor(duration / 60)}:
                  {String(Math.floor(duration % 60)).padStart(2, '0')}
                </div>

                {/* Current Chord Display */}
                {analysisResults && currentBeatIndex >= 0 && currentBeatIndex < analysisResults.synchronizedChords.length && (
                  <div className="text-center bg-primary-50 py-2 px-4 rounded-lg">
                    <span className="text-xs text-gray-500">Current Chord</span>
                    <div className="text-2xl font-bold text-primary-700">
                      {analysisResults.synchronizedChords[currentBeatIndex].chord}
                    </div>
                  </div>
                )}

                {/* Playback Speed */}
                <div className="flex flex-col items-center">
                  <span className="text-gray-600 text-sm mb-1">Speed:</span>
                  <div className="flex flex-wrap justify-center gap-1">
                    {playbackRates.map(rate => (
                      <button
                        key={rate}
                        onClick={() => changePlaybackRate(rate)}
                        disabled={!audioFile}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          !audioFile
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : playbackRate === rate
                              ? 'bg-primary-600 text-white font-medium shadow-button'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary-600 h-full transition-all duration-100 ease-out"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-white p-4 rounded-lg shadow-card">
              <h3 className="text-lg font-medium text-gray-700 mb-2">Instructions</h3>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-4">
                <li>Upload an audio file (MP3, WAV, etc.)</li>
                <li>Click &quot;Analyze Audio&quot; to process</li>
                <li>Wait for chord detection to complete</li>
                <li>Use playback controls to listen and see chords</li>
              </ol>

              <div className="mt-4 text-xs text-gray-500">
                <p>Note: Audio processing happens locally in your browser.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white p-4 mt-auto">
        <div className="container mx-auto text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Chord Recognition App. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}