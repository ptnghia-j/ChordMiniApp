"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { analyzeAudio, ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo, BeatPosition, DownbeatInfo } from '@/services/beatDetectionService';
import ChordGrid from '@/components/ChordGrid';
import BeatModelSelector from '@/components/BeatModelSelector';
import ChordModelSelector from '@/components/ChordModelSelector';
import ProcessingStatus from '@/components/ProcessingStatus';
import ExtractionNotification from '@/components/ExtractionNotification';
import DownloadingIndicator from '@/components/DownloadingIndicator';
import LeadSheetDisplay from '@/components/LeadSheetDisplay';
import TabbedInterface from '@/components/TabbedInterface';
import { useProcessing } from '@/contexts/ProcessingContext';
import { getTranscription, saveTranscription } from '@/services/firestoreService';
import dynamic from 'next/dynamic';
import { convertToPrivacyEnhancedUrl } from '@/utils/youtubeUtils';
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
    isDownloading: false, // New flag to track the downloading phase specifically
    isExtracted: false,
    isAnalyzing: false,
    isAnalyzed: false,
    error: null as string | null,
    suggestion: null as string | null, // New field for error suggestion
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
    beatDetectionResult?: {
      time_signature?: number;
      bpm?: number;
    };
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

  // Lyrics transcription state
  const [lyrics, setLyrics] = useState<any>(null);
  const [isTranscribingLyrics, setIsTranscribingLyrics] = useState<boolean>(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(16);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'lyricsChords'>('beatChordMap');

  // Debug log for lyrics state changes
  useEffect(() => {
    console.log('Lyrics state changed:', {
      lyricsAvailable: !!lyrics,
      showLyrics,
      isTranscribingLyrics,
      lyricsError,
      lyricsLines: lyrics?.lines?.length || 0
    });
  }, [lyrics, showLyrics, isTranscribingLyrics, lyricsError]);

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

  // Function to transcribe lyrics
  const transcribeLyrics = async () => {
    if (!audioProcessingState.audioUrl) {
      setLyricsError('Audio must be extracted first');
      return;
    }

    setIsTranscribingLyrics(true);
    setLyricsError(null);

    try {
      console.log('Starting lyrics transcription request...');
      const response = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: params.videoId,
          audioUrl: audioProcessingState.audioUrl,
          forceRefresh: false
        }),
      });

      const data = await response.json();
      console.log('Lyrics transcription response:', data);

      if (!response.ok) {
        // Handle HTTP error
        throw new Error(data.error || `HTTP error ${response.status}: Failed to transcribe lyrics`);
      }

      // Even if the API call was successful (HTTP 200), the transcription might have failed
      if (data.success) {
        console.log('Lyrics transcription successful');

        // Check if we have lyrics data from the response
        if (data.lyrics) {
          console.log('Setting lyrics data:', data.lyrics);
          console.log('Lyrics data type:', typeof data.lyrics);
          console.log('Is lyrics data an array?', Array.isArray(data.lyrics));

          // Handle the case where data.lyrics is a string URL (from cache)
          if (typeof data.lyrics === 'string' && data.lyrics.startsWith('http')) {
            console.warn('Received a URL instead of lyrics data:', data.lyrics);

            // Try to fetch the URL directly from the client side
            try {
              console.log('Attempting to fetch lyrics from URL directly...');
              const lyricsResponse = await fetch(data.lyrics);
              if (!lyricsResponse.ok) {
                throw new Error(`Failed to fetch lyrics from URL: ${lyricsResponse.status}`);
              }

              const lyricsData = await lyricsResponse.json();
              console.log('Successfully fetched lyrics data from URL:', lyricsData);

              // Process the lyrics data based on its format
              if (Array.isArray(lyricsData)) {
                // Convert array format to expected format with lines
                const processedLines = lyricsData.map(item => ({
                  startTime: parseFloat(item.start || item.startTime || 0),
                  endTime: parseFloat(item.end || item.endTime || 0),
                  text: item.text || '',
                  chords: []
                }));

                setLyrics({ lines: processedLines });
              } else if (lyricsData.lines && Array.isArray(lyricsData.lines)) {
                // Already in expected format
                setLyrics(lyricsData);
              } else {
                // Unknown format
                throw new Error('Lyrics data is in an unknown format');
              }
            } catch (fetchError) {
              console.error('Error fetching lyrics from URL:', fetchError);
              setLyrics({
                lines: [],
                error: `Failed to load lyrics: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
              });
            }
          }
          // Check if the lyrics have an error message
          else if (data.lyrics.error) {
            console.warn('Lyrics transcription returned an error:', data.lyrics.error);
            setLyrics(data.lyrics); // Still set the lyrics object to display the error properly
          }
          // Check if the lyrics have lines property and it's not empty
          else if (data.lyrics.lines && data.lyrics.lines.length > 0) {
            console.log(`Received ${data.lyrics.lines.length} lines of lyrics`);
            setLyrics(data.lyrics);
          }
          // Handle the case where data.lyrics is an array (direct format from Music.ai)
          else if (Array.isArray(data.lyrics) && data.lyrics.length > 0) {
            console.log(`Received ${data.lyrics.length} lines of lyrics in array format`);
            // Convert to the expected format
            setLyrics({
              lines: data.lyrics.map(item => ({
                startTime: item.start || item.startTime,
                endTime: item.end || item.endTime,
                text: item.text,
                chords: [] // Initialize empty chords array
              }))
            });
          }
          else {
            console.warn('No lyrics lines in the response');
            setLyrics({
              lines: [],
              error: 'No lyrics detected in this audio. This may be an instrumental track or the vocals are too quiet for accurate transcription.'
            });
          }

          setShowLyrics(true);
          setActiveTab('lyricsChords'); // Switch to lyrics tab when lyrics are available
        } else {
          console.warn('No lyrics data in successful response');
          setLyrics({
            lines: [],
            error: 'No lyrics data returned from the transcription service.'
          });
          setShowLyrics(true);
          setActiveTab('lyricsChords'); // Still switch to lyrics tab to show the error
          setLyricsError('No lyrics data returned');
        }
      } else {
        // The API call succeeded but the transcription failed
        console.warn('Lyrics transcription failed but API call succeeded');

        // Try with the "Chords and Beat Mapping" workflow
        console.log('Trying with "Chords and Beat Mapping" workflow...');

        try {
          const retryResponse = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params.videoId,
              audioUrl: audioProcessingState.audioUrl,
              forceRefresh: true,
              workflow: 'untitled-workflow-a743cc' // Use the "Chords and Beat Mapping" workflow
            }),
          });

          const retryData = await retryResponse.json();
          console.log('Lyrics transcription retry response:', retryData);

          if (!retryResponse.ok) {
            throw new Error(retryData.error || `HTTP error ${retryResponse.status}: Failed to transcribe lyrics with alternative workflow`);
          }

          if (retryData.success && retryData.lyrics) {
            console.log('Retry lyrics transcription successful');

            console.log('Retry lyrics data type:', typeof retryData.lyrics);
            console.log('Is retry lyrics data an array?', Array.isArray(retryData.lyrics));

            // Handle the case where retryData.lyrics is a string URL (from cache)
            if (typeof retryData.lyrics === 'string' && retryData.lyrics.startsWith('http')) {
              console.warn('Received a URL instead of lyrics data in retry:', retryData.lyrics);

              // Try to fetch the URL directly from the client side
              try {
                console.log('Attempting to fetch lyrics from URL directly...');
                const lyricsResponse = await fetch(retryData.lyrics);
                if (!lyricsResponse.ok) {
                  throw new Error(`Failed to fetch lyrics from URL: ${lyricsResponse.status}`);
                }

                const lyricsData = await lyricsResponse.json();
                console.log('Successfully fetched lyrics data from URL:', lyricsData);

                // Process the lyrics data based on its format
                if (Array.isArray(lyricsData)) {
                  // Convert array format to expected format with lines
                  const processedLines = lyricsData.map(item => ({
                    startTime: parseFloat(item.start || item.startTime || 0),
                    endTime: parseFloat(item.end || item.endTime || 0),
                    text: item.text || '',
                    chords: []
                  }));

                  setLyrics({ lines: processedLines });
                } else if (lyricsData.lines && Array.isArray(lyricsData.lines)) {
                  // Already in expected format
                  setLyrics(lyricsData);
                } else {
                  // Unknown format
                  throw new Error('Lyrics data is in an unknown format');
                }
              } catch (fetchError) {
                console.error('Error fetching lyrics from URL:', fetchError);
                setLyrics({
                  lines: [],
                  error: `Failed to load lyrics: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
                });
              }
            }
            // Check if the lyrics have an error message
            else if (retryData.lyrics.error) {
              console.warn('Retry lyrics transcription returned an error:', retryData.lyrics.error);
              setLyrics(retryData.lyrics); // Still set the lyrics object to display the error properly
            }
            // Check if the lyrics have lines property and it's not empty
            else if (retryData.lyrics.lines && retryData.lyrics.lines.length > 0) {
              console.log(`Received ${retryData.lyrics.lines.length} lines of lyrics from retry`);
              setLyrics(retryData.lyrics);
            }
            // Handle the case where retryData.lyrics is an array (direct format from Music.ai)
            else if (Array.isArray(retryData.lyrics) && retryData.lyrics.length > 0) {
              console.log(`Received ${retryData.lyrics.length} lines of lyrics in array format from retry`);
              // Convert to the expected format
              setLyrics({
                lines: retryData.lyrics.map(item => ({
                  startTime: parseFloat(item.start || item.startTime || 0),
                  endTime: parseFloat(item.end || item.endTime || 0),
                  text: item.text || '',
                  chords: []
                }))
              });
            }
            else {
              console.warn('No lyrics lines in the retry response');
              setLyrics({
                lines: [],
                error: 'No lyrics detected in this audio. This may be an instrumental track or the vocals are too quiet for accurate transcription.'
              });
            }

            setShowLyrics(true);
            setActiveTab('lyricsChords'); // Switch to lyrics tab when lyrics are available
            setLyricsError(null);
          } else {
            console.warn('Retry lyrics transcription failed:', retryData.error);
            // Still set the lyrics data, which might contain an error message
            // that the LeadSheetDisplay component can show
            setLyrics(data.lyrics || {
              lines: [],
              error: data.error || retryData.error || 'No lyrics could be transcribed from this audio'
            });
            setShowLyrics(true);
            setActiveTab('lyricsChords'); // Still switch to lyrics tab to show the error

            // Also set the error message for the UI
            setLyricsError(data.error || retryData.error || 'Failed to transcribe lyrics');
          }
        } catch (retryError) {
          console.error('Error in retry lyrics transcription:', retryError);
          // Still set the lyrics data, which might contain an error message
          // that the LeadSheetDisplay component can show
          setLyrics(data.lyrics || { lines: [], error: data.error || 'Unknown error' });
          setShowLyrics(true);

          // Also set the error message for the UI
          setLyricsError(data.error || 'Failed to transcribe lyrics');
        }
      }
    } catch (error: any) {
      console.error('Error transcribing lyrics:', error);

      // Set an empty lyrics object with the error message
      setLyrics({
        lines: [],
        error: error.message || 'Failed to transcribe lyrics'
      });

      // Show the lyrics display even with an error
      setShowLyrics(true);

      // Switch to lyrics tab to show the error
      setActiveTab('lyricsChords');

      // Also set the error message for the UI
      setLyricsError(error.message || 'Failed to transcribe lyrics');
    } finally {
      setIsTranscribingLyrics(false);
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

    // Start progress animation for better user feedback
    let progressInterval = setInterval(() => {
      setProgress(prev => {
        // Simulate progress up to 90% during download phase
        // The remaining 10% will be set when we actually get the response
        return prev < 90 ? prev + 1 : prev;
      });
    }, 300);

    setAudioProcessingState(prev => ({
      ...prev,
      isExtracting: true,
      isDownloading: true, // Set the downloading flag to true
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
        const errorMessage = errorData.details || errorData.error;
        const suggestion = errorData.suggestion || null;

        // Create an error object with additional properties
        const error = new Error(errorMessage);
        (error as any).suggestion = suggestion;
        throw error;
      }

      const data = await response.json();

      // Check if extraction was successful
      if (data.success && data.audioUrl) {
        // Clear the progress interval
        clearInterval(progressInterval);

        // Update processing state
        setStage('extracting');
        setProgress(95);
        setStatusMessage('Extracting audio...');

        setAudioProcessingState(prev => ({
          ...prev,
          isExtracting: false,
          isDownloading: false, // Reset the downloading flag
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

      // Clear the progress interval
      clearInterval(progressInterval);

      // Update processing state
      let errorMessage = error instanceof Error ? error.message : 'An error occurred while extracting audio';

      // Make the error message more user-friendly
      if (errorMessage.includes('could not find brave cookies database') ||
          errorMessage.includes('could not find chrome cookies database') ||
          errorMessage.includes('could not find firefox cookies database')) {
        errorMessage = 'YouTube extraction failed. This may be due to YouTube restrictions or network issues. Please try a different video or try again later.';
      }

      // Extract suggestion if available
      let suggestion = null;
      if (error instanceof Error && (error as any).suggestion) {
        suggestion = (error as any).suggestion;
      }

      failProcessing(errorMessage);

      setAudioProcessingState(prev => ({
        ...prev,
        isExtracting: false,
        isDownloading: false, // Reset the downloading flag on error
        error: errorMessage,
        suggestion: suggestion
      }));
    } finally {
      // Release the lock when done, whether successful or not
      extractionLockRef.current = false;

      // Make sure the interval is cleared in all cases
      clearInterval(progressInterval);
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
        try {
          const audioResponse = await fetch(audioProcessingState.audioUrl);

          // Check if the response is valid
          if (!audioResponse.ok) {
            throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
          }

          const arrayBuffer = await audioResponse.arrayBuffer();

          // Check if the arrayBuffer is valid (not empty or too small)
          if (arrayBuffer.byteLength < 1000) {
            console.error(`Audio file is too small (${arrayBuffer.byteLength} bytes), likely corrupted or a placeholder`);
            throw new Error('Audio file is corrupted or invalid. Please try re-downloading the audio.');
          }

          // Create AudioContext and decode audio
          // Use a type assertion to handle browser compatibility
          const audioContext = new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

          try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Check if the audioBuffer is valid
            if (audioBuffer.duration < 0.1) {
              throw new Error('Audio file is too short or corrupted');
            }

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

            // Perform the full analysis
            results = await analyzeAudio(audioBuffer, beatDetector, chordDetector);

            // Set the time signature based on the beat detection result
            // The beat detection is performed inside analyzeAudio, and the time signature
            // should be available in the results
            if (!results.beatDetectionResult) {
              // If not available, create it with default values
              results.beatDetectionResult = {
                time_signature: 4, // Default to 4/4 time signature
                bpm: results.beats.length > 1 ?
                  Math.round(60 / ((results.beats[results.beats.length - 1].time - results.beats[0].time) / results.beats.length)) :
                  120 // Default BPM
              };
            }

            console.log('Analysis results:', results);
            console.log('Time signature:', results.beatDetectionResult.time_signature || 4);

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
          } catch (decodeError) {
            console.error('Error decoding audio:', decodeError);
            throw new Error(`Failed to decode audio: ${decodeError.message || 'Unknown error'}`);
          }
        } catch (fetchError) {
          console.error('Error fetching or processing audio:', fetchError);
          throw new Error(`Failed to fetch or process audio: ${fetchError.message || 'Unknown error'}`);
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

      // Check if there's a suggestion in the error
      let suggestion = null;
      if (error instanceof Error && (error as any).suggestion) {
        suggestion = (error as any).suggestion;
      }

      setAudioProcessingState(prev => ({
        ...prev,
        error: errorMessage,
        suggestion: suggestion,
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
      {/* Downloading Indicator - shown during initial download */}
      <DownloadingIndicator
        isVisible={audioProcessingState.isDownloading && !audioProcessingState.fromCache}
      />

      {/* Extraction Notification Banner - shown after download completes */}
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
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Audio Extraction Failed</h3>
                      <p className="text-red-700 mt-1">{audioProcessingState.error}</p>

                      {/* Show suggestion if available */}
                      {audioProcessingState.suggestion && (
                        <p className="text-red-700 mt-2 italic">{audioProcessingState.suggestion}</p>
                      )}

                      <div className="mt-3">
                        <h4 className="text-sm font-medium text-red-800">Troubleshooting:</h4>
                        <ul className="list-disc list-inside text-sm text-red-700 mt-1 space-y-1">
                          {audioProcessingState.error.includes('YouTube Short') ? (
                            <>
                              <li className="font-medium">This appears to be a YouTube Short which cannot be processed</li>
                              <li>YouTube Shorts use a different format that our system cannot extract</li>
                              <li>Please try a regular YouTube video instead</li>
                            </>
                          ) : (
                            <>
                              <li>Try a different YouTube video</li>
                              <li>Check your internet connection</li>
                              <li>The video might be restricted or unavailable for download</li>
                            </>
                          )}
                          <li>You can also try uploading an audio file directly</li>
                        </ul>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-3">
                        <button
                          onClick={() => extractAudioFromYouTube()}
                          className="inline-flex items-center px-3 py-1.5 border border-red-600 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                        <button
                          onClick={() => extractAudioFromYouTube(true)}
                          className="inline-flex items-center px-3 py-1.5 border border-red-600 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Force Re-download
                        </button>
                        <Link
                          href="/analyze"
                          className="inline-flex items-center px-3 py-1.5 border border-blue-600 text-xs font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Upload Audio File
                        </Link>
                        <Link
                          href="/"
                          className="inline-flex items-center px-3 py-1.5 border border-gray-600 text-xs font-medium rounded-md text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                          Search Different Video
                        </Link>
                      </div>
                    </div>
                  </div>
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

              {/* Tabbed interface for analysis results */}
              <div className="p-4 rounded-lg bg-white border border-gray-200 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                  <h3 className="font-medium text-lg mb-3 md:mb-0 text-gray-800">Analysis Results</h3>
                  <div className="flex flex-col w-full md:w-auto">
                    <button
                      onClick={transcribeLyrics}
                      disabled={isTranscribingLyrics || !audioProcessingState.audioUrl}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 w-full"
                    >
                      {isTranscribingLyrics ? "Transcribing Lyrics..." : showLyrics ? "Refresh Lyrics" : "Transcribe Lyrics"}
                    </button>

                    {lyricsError && (
                      <div className="text-red-500 mt-2">{lyricsError}</div>
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
                          ? 'border-b-2 border-blue-600 text-blue-600'
                          : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Beat & Chord Map
                    </button>
                    <button
                      onClick={() => setActiveTab('lyricsChords')}
                      disabled={!showLyrics}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === 'lyricsChords'
                          ? 'border-b-2 border-blue-600 text-blue-600'
                          : !showLyrics
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Lyrics & Chords
                    </button>
                  </div>
                </div>

                {/* Tab content */}
                <div className="tab-content">
                  {/* Beat & Chord Map Tab */}
                  {activeTab === 'beatChordMap' && (
                    <div>
                      <h4 className="font-medium text-md mb-3 text-gray-700">Chord Progression</h4>
                      <ChordGrid
                        chords={chordGridData.chords}
                        beats={chordGridData.beats}
                        currentBeatIndex={currentBeatIndex}
                        measuresPerRow={4}
                        timeSignature={analysisResults?.beatDetectionResult?.time_signature}
                      />
                    </div>
                  )}

                  {/* Lyrics & Chords Tab */}
                  {activeTab === 'lyricsChords' && (
                    <div>
                      {showLyrics ? (
                        lyrics ? (
                          <div>
                            {/* Font size controls */}
                            <div className="flex justify-end mb-3">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                                  className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                                  aria-label="Decrease font size"
                                >
                                  <span className="text-sm">A-</span>
                                </button>
                                <button
                                  onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                                  className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                                  aria-label="Increase font size"
                                >
                                  <span className="text-sm">A+</span>
                                </button>
                              </div>
                            </div>

                            {/* Check for error in lyrics */}
                            {lyrics.error ? (
                              <div className="p-4 bg-red-100 text-red-700 rounded-md">
                                <p className="font-medium">Lyrics Transcription Error</p>
                                <p>{lyrics.error}</p>
                              </div>
                            ) : lyrics.lines && lyrics.lines.length > 0 ? (
                              <LeadSheetDisplay
                                lyrics={lyrics}
                                currentTime={currentTime}
                                fontSize={fontSize}
                                onFontSizeChange={setFontSize}
                                darkMode={false}
                                chords={analysisResults?.chords?.map(chord => ({
                                  time: chord.start,
                                  chord: chord.chord
                                }))}
                              />
                            ) : (
                              <div className="p-4 bg-yellow-100 text-yellow-700 rounded-md">
                                <p className="font-medium">No Lyrics Detected</p>
                                <p>This may be an instrumental track or the vocals are too quiet for accurate transcription.</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 bg-yellow-100 text-yellow-700 rounded-md">
                            <p className="font-medium">Lyrics Data Unavailable</p>
                            <p>The lyrics data could not be loaded. Please try again.</p>
                          </div>
                        )
                      ) : (
                        <div className="p-4 bg-blue-100 text-blue-700 rounded-md">
                          <p className="font-medium">Lyrics Not Transcribed</p>
                          <p>Click the "Transcribe Lyrics" button to analyze the audio for lyrics.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>


              {/* Beats visualization */}
              <div className="p-4 rounded-lg bg-white border border-gray-300">
                <h3 className="font-medium text-lg mb-2 text-gray-800">Beat Timeline</h3>
                <div className="relative h-16 bg-gray-100 border border-gray-300 rounded-md overflow-hidden">
                  {/* Beat markers */}
                  {analysisResults.beats.map((beat, index) => {
                    // Get beat number from beat info if available
                    // Use the detected time signature or default to 4
                    const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
                    const beatNum = beat.beatNum ||
                                   analysisResults.synchronizedChords[index]?.beatNum ||
                                   (index % timeSignature) + 1;

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
                    <span>Regular beats {analysisResults?.beatDetectionResult?.time_signature === 3 ? '(2,3)' :
                      analysisResults?.beatDetectionResult?.time_signature === 5 ? '(2,3,4,5)' :
                      analysisResults?.beatDetectionResult?.time_signature === 6 ? '(2,3,4,5,6)' :
                      analysisResults?.beatDetectionResult?.time_signature === 7 ? '(2,3,4,5,6,7)' :
                      '(2,3,4)'}</span>
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
                      url={convertToPrivacyEnhancedUrl(audioProcessingState.youtubeEmbedUrl || audioProcessingState.videoUrl || '')}
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