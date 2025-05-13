"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { analyzeAudio, ChordDetectionResult, BeatDetectionResult } from '@/services/chordRecognitionService';
import ChordGrid from '@/components/ChordGrid';

export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.videoId as string;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
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
  });

  // Analysis results state
  const [analysisResults, setAnalysisResults] = useState<{
    chords: ChordDetectionResult[];
    beats: BeatDetectionResult[];
    synchronizedChords: {chord: string, beatIndex: number}[];
  } | null>(null);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  // Extract audio from YouTube on component mount
  useEffect(() => {
    // Only run if not already extracting and no lock is set
    if (!audioProcessingState.isExtracting && !extractionLockRef.current) {
      extractAudioFromYouTube();
    }
  }, [videoId]); // Only re-run when videoId changes

  // Extract audio from YouTube using our API endpoint
  const extractAudioFromYouTube = async () => {
    if (!videoId || extractionLockRef.current) return;
    
    // Set lock to prevent duplicate extractions
    extractionLockRef.current = true;
    
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
        body: JSON.stringify({ videoId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error + (errorData.details ? `: ${errorData.details}` : ''));
      }
      
      const data = await response.json();
      
      // Check if extraction was successful
      if (data.success && data.audioUrl) {
        setAudioProcessingState(prev => ({
          ...prev,
          isExtracting: false,
          isExtracted: true,
          audioUrl: data.audioUrl,
        }));
        
        // Load audio into audio element
        if (audioRef.current) {
          audioRef.current.src = data.audioUrl;
          audioRef.current.load();
        }
      } else {
        throw new Error(data.error || 'Failed to extract audio from YouTube');
      }
    } catch (error: any) {
      console.error('Error extracting audio:', error);
      
      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: false,
        error: error.message || 'An error occurred while extracting audio'
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
    
    setAudioProcessingState(prev => ({
      ...prev,
      isAnalyzing: true,
      error: null,
    }));
    
    try {
      // Fetch the audio as ArrayBuffer
      const audioResponse = await fetch(audioProcessingState.audioUrl);
      const arrayBuffer = await audioResponse.arrayBuffer();
      
      // Create AudioContext and decode audio
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      setAudioProcessingState(prev => ({
        ...prev,
        audioBuffer,
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
    if (!audioRef.current) return;
    
    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration);
      }
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    
    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioRef.current.addEventListener('play', handlePlay);
    audioRef.current.addEventListener('pause', handlePause);
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.removeEventListener('play', handlePlay);
        audioRef.current.removeEventListener('pause', handlePause);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [audioRef.current]);

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

  // Helper function to format time
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-2xl font-heading font-bold">Chord Analysis - YouTube Video</h1>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4">
        {/* Back button */}
        <Link href="/" className="inline-flex items-center text-primary-600 mb-4 hover:text-primary-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </Link>
            
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Chord Grid (2/3 width) */}
          <div className="lg:w-2/3">
            <div className="bg-white p-6 rounded-lg shadow-card h-full">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-heading font-bold text-gray-800">
                  YouTube Video: {videoId}
                </h2>
                
                <button 
                  onClick={processAudio}
                  disabled={!audioProcessingState.isExtracted || audioProcessingState.isAnalyzing}
                  className={`bg-primary-600 text-white font-medium py-2 px-4 rounded-md transition-colors ${
                    !audioProcessingState.isExtracted || audioProcessingState.isAnalyzing
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-primary-700'
                  }`}
                >
                  {audioProcessingState.isAnalyzing ? 'Analyzing...' : 'Analyze Audio'}
                </button>
              </div>
              
              {/* Audio Analysis Status Indicator */}
              <div className="flex items-center justify-end text-sm mb-4">
                {audioProcessingState.isExtracting && (
                  <div className="flex items-center text-gray-600">
                    <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full mr-2"></div>
                    <span>Extracting audio from YouTube...</span>
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
                    <button 
                      onClick={extractAudioFromYouTube} 
                      className="ml-3 text-primary-600 hover:text-primary-800 font-medium text-xs"
                    >
                      Retry
                    </button>
                  </div>
                )}
                
                {/* YouTube restriction helper */}
                {audioProcessingState.error && audioProcessingState.error.includes('Sign in to confirm you\'re not a bot') && (
                  <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm">
                    <p className="font-medium">YouTube Detection Issue</p>
                    <p className="mt-1">YouTube is detecting our extraction as automated and requiring authentication.</p>
                    <ul className="mt-2 list-disc list-inside">
                      <li>Make sure you're signed in to YouTube in your Chrome browser</li>
                      <li>Try a different, less popular YouTube video</li>
                      <li>Use videos that are older and less restricted (e.g., creative commons licensed)</li>
                      <li>Try this test video: <Link href="/analyze/jNQXAC9IVRw" className="text-primary-600 hover:underline">jNQXAC9IVRw</Link> (YouTube's first video)</li>
                      <li>You can also try uploading an audio file directly instead</li>
                    </ul>
                    <div className="mt-3">
                      <Link
                        href="/analyze"
                        className="text-primary-600 font-medium hover:text-primary-800"
                      >
                        Try Local Audio Upload Instead
                      </Link>
                    </div>
                  </div>
                )}
                
                {audioProcessingState.isExtracted && !audioProcessingState.isExtracting && !audioProcessingState.error && (
                  <div className="text-green-600 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Audio extracted successfully</span>
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
              />
              
              {/* Analysis Statistics (if available) */}
              {analysisResults && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-lg font-heading font-medium mb-3 text-gray-700">Analysis Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Total Chords</p>
                      <p className="text-xl font-semibold">{analysisResults.chords.length}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Total Beats</p>
                      <p className="text-xl font-semibold">{analysisResults.beats.length}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">BPM (Estimated)</p>
                      <p className="text-xl font-semibold">
                        {analysisResults.beats.length > 1 
                          ? Math.round(60 / (analysisResults.beats[1].time - analysisResults.beats[0].time))
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500">Most Common Chord</p>
                      <p className="text-xl font-semibold">
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

          {/* Right side - Audio player section (1/3 width) */}
          <div className="lg:w-1/3">
            {/* Audio Player */}
            <div className="bg-white p-4 rounded-lg shadow-card mb-6">
              <div className="mb-4 aspect-video relative bg-black flex items-center justify-center">
                <iframe 
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            
              <audio ref={audioRef} className="w-full mb-4" controls={false} />
              
              <div className="flex flex-col space-y-2">
                {/* Play/Pause Button */}
                <button 
                  onClick={playPause}
                  disabled={!audioProcessingState.isExtracted}
                  className={`font-medium py-2 px-4 rounded-full shadow-button transition-colors w-full ${
                    !audioProcessingState.isExtracted 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-primary-600 hover:bg-primary-700 text-white'
                  }`}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                
                {/* Playback Position */}
                <div className="text-gray-700 font-medium text-center text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
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
                        disabled={!audioProcessingState.isExtracted}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          !audioProcessingState.isExtracted 
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