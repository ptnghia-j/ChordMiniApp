"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { analyzeAudio, ChordDetectionResult, AnalysisResult } from '@/services/chordRecognitionService';
import { BeatInfo, BeatPosition, DownbeatInfo } from '@/services/beatDetectionService';
import { getTranscription, saveTranscription } from '@/services/firestoreService';
import ProcessingStatusBanner from '@/components/ProcessingStatusBanner';
import AnalysisSummary from '@/components/AnalysisSummary';
import ExtractionNotification from '@/components/ExtractionNotification';
import DownloadingIndicator from '@/components/DownloadingIndicator';
import Navigation from '@/components/Navigation';
import MetronomeControls from '@/components/MetronomeControls';
import LyricsToggleButton from '@/components/LyricsToggleButton';
import LyricsPanel from '@/components/LyricsPanel';
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SongContext } from '@/types/chatbotTypes';
import { LyricsData } from '@/types/musicAiTypes';
import { useMetronomeSync } from '@/hooks/useMetronomeSync';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { convertToPrivacyEnhancedUrl } from '@/utils/youtubeUtils';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnalysisControls } from '@/components/AnalysisControls';
import { ChordGridContainer } from '@/components/ChordGridContainer';
import { LyricsSection } from '@/components/LyricsSection';
import { ChatbotSection } from '@/components/ChatbotSection';
import { YouTubePlayer } from '@/types/youtube';
import dynamic from 'next/dynamic';
import SkeletonChordGrid from '@/components/SkeletonChordGrid';
import SkeletonLyrics from '@/components/SkeletonLyrics';
//import type { ReactPlayerProps } from 'react-player';

// Define error types for better type safety
interface ErrorWithSuggestion extends Error {
  suggestion?: string;
}

// Dynamically import ReactPlayer to avoid SSR issues
const ReactPlayer = dynamic(() => import('react-player/youtube'), { ssr: false });

export default function YouTubeVideoAnalyzePage() {
  const params = useParams();
  const videoId = params?.videoId as string;
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

  // Use custom hooks for audio processing and player
  const {
    state: audioProcessingState,
    analysisResults,
    videoTitle,
    extractAudio: extractAudioFromService,
    analyzeAudio: analyzeAudioFromService,
    loadVideoInfo,
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
    handleTimeUpdate,
    handleLoadedMetadata,
    handleYouTubePlayerReady,
    setState: setAudioPlayerState,
    setYoutubePlayer,
    setDuration
  } = useAudioPlayer(audioProcessingState.audioUrl);

  // Define detector types
  type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer' | 'beat-transformer-light';
  type ChordDetectorType = 'chord-cnn-lstm';

  // Define lyrics item interface
  interface LyricsItem {
    start?: number;
    startTime?: number;
    end?: number;
    endTime?: number;
    text?: string;
  }
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>('beat-transformer-light');
  const [chordDetector, setChordDetector] = useState<ChordDetectorType>('chord-cnn-lstm');

  const extractionLockRef = useRef<boolean>(false); // Prevent duplicate extraction

  // Extract state from audio player hook
  const { isPlaying, currentTime, duration, playbackRate, preferredAudioSource } = audioPlayerState;

  // Create setters for individual state properties
  const setIsPlaying = (playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  };

  const setCurrentTime = (time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  };

  // Key signature state
  const [keySignature, setKeySignature] = useState<string | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);

  // Enharmonic correction state
  const [chordCorrections, setChordCorrections] = useState<Record<string, string> | null>(null);
  const [showCorrectedChords, setShowCorrectedChords] = useState(false);




  const [isRequestingEnharmonicCorrection, setIsRequestingEnharmonicCorrection] = useState(false);
  const [keyDetectionAttempted, setKeyDetectionAttempted] = useState(false);

  // Current state for playback
  const [currentBeatIndex, setCurrentBeatIndex] = useState(-1);
  const [currentDownbeatIndex, setCurrentDownbeatIndex] = useState(-1);
  const [manualBeatIndexOverride, setManualBeatIndexOverride] = useState<number | null>(null);
  const [globalSpeedAdjustment, setGlobalSpeedAdjustment] = useState<number | null>(null); // Store calculated speed adjustment

  // YouTube player state
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  // Lyrics transcription state
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isTranscribingLyrics, setIsTranscribingLyrics] = useState<boolean>(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(16);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'lyricsChords'>('beatChordMap');

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

  // Debug log for lyrics state changes
  useEffect(() => {
  }, [lyrics, showLyrics, isTranscribingLyrics, lyricsError]);

  // Debug log for analysis results changes
  useEffect(() => {
  }, [analysisResults]);

  // Check for cached enharmonic correction data when analysis results are loaded
  useEffect(() => {
    const checkCachedEnharmonicData = async () => {
      if (analysisResults?.chords && analysisResults.chords.length > 0 && !chordCorrections) {
        try {
          const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);
          console.log('🔍 CACHED TRANSCRIPTION DATA:', {
            hasChordCorrections: !!cachedTranscription?.chordCorrections,
            chordCorrections: cachedTranscription?.chordCorrections,
            hasOldFormat: !!(cachedTranscription?.originalChords && cachedTranscription?.correctedChords),
            originalChords: cachedTranscription?.originalChords,
            correctedChords: cachedTranscription?.correctedChords,
            keySignature: cachedTranscription?.keySignature
          });

          if (cachedTranscription && cachedTranscription.chordCorrections) {
            console.log('✅ Loading cached chord corrections (new format):', cachedTranscription.chordCorrections);
            setChordCorrections(cachedTranscription.chordCorrections);
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
          } else if (cachedTranscription && cachedTranscription.originalChords && cachedTranscription.correctedChords) {
            // Backward compatibility: convert old format to new format
            console.log('🔄 Converting old format to new format');
            const corrections: Record<string, string> = {};
            for (let i = 0; i < cachedTranscription.originalChords.length && i < cachedTranscription.correctedChords.length; i++) {
              const original = cachedTranscription.originalChords[i];
              const corrected = cachedTranscription.correctedChords[i];
              if (original !== corrected) {
                corrections[original] = corrected;
              }
            }
            console.log('🔄 Converted corrections:', corrections);
            if (Object.keys(corrections).length > 0) {
              console.log('✅ Setting converted chord corrections:', corrections);
              setChordCorrections(corrections);
            }
            if (cachedTranscription.keySignature) {
              setKeySignature(cachedTranscription.keySignature);
            }
          } else {
            console.log('❌ No cached chord corrections found');
          }
        } catch (error) {
          console.error('Failed to load cached enharmonic correction data:', error);
        }
      }
    };

    checkCachedEnharmonicData();
  }, [analysisResults?.chords, videoId, beatDetector, chordDetector, chordCorrections]);

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
      console.log('🔍 CALLING KEY DETECTION SERVICE:', {
        chordData: chordData.slice(0, 5), // Log first 5 chords
        totalChords: chordData.length,
        requestEnharmonicCorrection: true
      });

      import('@/services/keyDetectionService').then(({ detectKey }) => {
        console.log('🔍 KEY DETECTION SERVICE IMPORTED, calling detectKey...');
        detectKey(chordData, true) // Request enharmonic correction
          .then(result => {
            console.log('🔍 KEY DETECTION RESULT:', {
              primaryKey: result.primaryKey,
              corrections: result.corrections,
              hasCorrections: result.corrections && Object.keys(result.corrections).length > 0,
              fullResult: result
            });

            setKeySignature(result.primaryKey);

            // Store enharmonic correction data if available
            if (result.corrections && Object.keys(result.corrections).length > 0) {
              console.log('✅ Setting chord corrections:', result.corrections);
              setChordCorrections(result.corrections);
            } else {
              console.log('❌ No corrections found or empty corrections object');
            }

            // Update the transcription cache with key signature and enharmonic correction data
            if (result.primaryKey && result.primaryKey !== 'Unknown') {
              const updateTranscriptionWithKey = async () => {
                try {
                  const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);
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
  }, [analysisResults?.chords, isDetectingKey, chordCorrections, keyDetectionAttempted, beatDetector, chordDetector, videoId]); // Only run when chords are available and no enharmonic correction data

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
      // console.log('Loading video info and extracting audio for videoId:', videoId);

      // Reset processing context for new video
      setStage('idle');
      setProgress(0);
      setStatusMessage('');

      // Reset key detection flag for new video
      setKeyDetectionAttempted(false);
      setChordCorrections(null); // Reset chord corrections for new video
      setShowCorrectedChords(false); // Reset to show original chords

      // Load video info asynchronously (non-blocking)
      loadVideoInfo();
      extractAudioFromService();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); // Only re-run when videoId changes

  // Debug: Log audioProcessingState changes
  useEffect(() => {
  }, [audioProcessingState]);

  // Check for cached lyrics on component mount (but don't auto-load)
  useEffect(() => {
    const checkCachedLyrics = async () => {
      if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
        try {
          const response = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params?.videoId || videoId,
              audioUrl: null, // We don't have audio URL yet, but API should check cache first
              forceRefresh: false,
              checkCacheOnly: true // New flag to only check cache without processing
            }),
          });

          const data = await response.json();
          // console.log('Cache check lyrics response:', data);

          if (response.ok && data.success && data.lyrics) {
            if (data.lyrics.lines && Array.isArray(data.lyrics.lines) && data.lyrics.lines.length > 0) {
              // console.log(`Found ${data.lyrics.lines.length} lines of cached lyrics (not auto-loading)`);
              // Don't auto-load, just log that cached lyrics are available
              // User will need to click "Transcribe Lyrics" to load them
            }
          }
        } catch (error) {
          console.log('No cached lyrics found or error checking:', error);
        }
      }
    };

    // Delay slightly to let the component mount fully
    const timer = setTimeout(checkCachedLyrics, 1000);
    return () => clearTimeout(timer);
  }, [videoId, params?.videoId]); // Re-run when videoId changes


  // Audio event handlers are now handled by the useAudioPlayer hook

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
    setPreferredAudioSource(preferredAudioSource === 'youtube' ? 'extracted' : 'youtube');

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

  // Enhanced audio analysis function that integrates with processing context
  const handleAudioAnalysis = async () => {
    if (!audioProcessingState.audioUrl) {
      console.error('No audio URL available for analysis');
      return;
    }

    let stageTimeout: NodeJS.Timeout | null = null;

    try {
      // Start processing context
      startProcessing();
      setStage('beat-detection');
      setProgress(0);
      setStatusMessage('Starting beat detection...');


      // Update to chord recognition stage after a brief delay
      stageTimeout = setTimeout(() => {
        setStage('chord-recognition');
        setProgress(50);
        setStatusMessage('Recognizing chords and synchronizing with beats...');
      }, 1000);

      // Call the audio processing service
      const results = await analyzeAudioFromService(audioProcessingState.audioUrl, beatDetector, chordDetector);

      // FIXED: Clear the stage timeout to prevent it from overriding completion
      if (stageTimeout) {
        clearTimeout(stageTimeout);
        stageTimeout = null;
      }

      // Update processing context for completion
      completeProcessing();

      return results;
    } catch (error) {
      console.error('Audio analysis failed:', error);

      // Clear timeout on error too
      if (stageTimeout) {
        clearTimeout(stageTimeout);
        stageTimeout = null;
      }

      // Update processing context for error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      failProcessing(errorMessage);

      throw error;
    }
  };

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

  // Function to transcribe lyrics
  const transcribeLyrics = async () => {
    if (!audioProcessingState.audioUrl) {
      setLyricsError('Audio must be extracted first');
      return;
    }

    setIsTranscribingLyrics(true);
    setLyricsError(null);

    try {
      // console.log('Starting lyrics transcription request...');
      const response = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: params?.videoId || videoId,
          audioUrl: audioProcessingState.audioUrl,
          forceRefresh: false
        }),
      });

      const data = await response.json();
      // console.log('Lyrics transcription response:', data);

      if (!response.ok) {
        // Handle HTTP error
        throw new Error(data.error || `HTTP error ${response.status}: Failed to transcribe lyrics`);
      }

      // Even if the API call was successful (HTTP 200), the transcription might have failed
      if (data.success) {
        // console.log('Lyrics transcription successful');

        // Check if we have lyrics data from the response
        if (data.lyrics) {

          // Handle the case where data.lyrics is a string URL (from cache)
          if (typeof data.lyrics === 'string' && data.lyrics.startsWith('http')) {
            console.warn('Received a URL instead of lyrics data:', data.lyrics);

            // Try to fetch the URL directly from the client side
            try {
              // console.log('Attempting to fetch lyrics from URL directly...');
              const lyricsResponse = await fetch(data.lyrics);
              if (!lyricsResponse.ok) {
                throw new Error(`Failed to fetch lyrics from URL: ${lyricsResponse.status}`);
              }

              const lyricsData = await lyricsResponse.json();
              // console.log('Successfully fetched lyrics data from URL:', lyricsData);

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
            // console.log(`Received ${data.lyrics.lines.length} lines of lyrics`);
            setLyrics(data.lyrics);
          }
          // Handle the case where data.lyrics is an array (direct format from Music.ai)
          else if (Array.isArray(data.lyrics) && data.lyrics.length > 0) {
            // console.log(`Received ${data.lyrics.length} lines of lyrics in array format`);
            // Convert to the expected format
            setLyrics({
              lines: data.lyrics.map((item: LyricsItem) => ({
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
        // console.log('Trying with "Chords and Beat Mapping" workflow...');

        try {
          const retryResponse = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params?.videoId || videoId,
              audioUrl: audioProcessingState.audioUrl,
              forceRefresh: true,
              workflow: 'untitled-workflow-a743cc' // Use the "Chords and Beat Mapping" workflow
            }),
          });

          const retryData = await retryResponse.json();
          // console.log('Lyrics transcription retry response:', retryData);

          if (!retryResponse.ok) {
            throw new Error(retryData.error || `HTTP error ${retryResponse.status}: Failed to transcribe lyrics with alternative workflow`);
          }

          if (retryData.success && retryData.lyrics) {
            // console.log('Retry lyrics transcription successful');

            // console.log('Retry lyrics data type:', typeof retryData.lyrics);
            // console.log('Is retry lyrics data an array?', Array.isArray(retryData.lyrics));

            // Handle the case where retryData.lyrics is a string URL (from cache)
            if (typeof retryData.lyrics === 'string' && retryData.lyrics.startsWith('http')) {
              console.warn('Received a URL instead of lyrics data in retry:', retryData.lyrics);

              // Try to fetch the URL directly from the client side
              try {
                // console.log('Attempting to fetch lyrics from URL directly...');
                const lyricsResponse = await fetch(retryData.lyrics);
                if (!lyricsResponse.ok) {
                  throw new Error(`Failed to fetch lyrics from URL: ${lyricsResponse.status}`);
                }

                const lyricsData = await lyricsResponse.json();
                // console.log('Successfully fetched lyrics data from URL:', lyricsData);

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
              // console.log(`Received ${retryData.lyrics.lines.length} lines of lyrics from retry`);
              setLyrics(retryData.lyrics);
            }
            // Handle the case where retryData.lyrics is an array (direct format from Music.ai)
            else if (Array.isArray(retryData.lyrics) && retryData.lyrics.length > 0) {
              // console.log(`Received ${retryData.lyrics.length} lines of lyrics in array format from retry`);
              // Convert to the expected format
              setLyrics({
                lines: retryData.lyrics.map((item: LyricsItem) => ({
                  startTime: parseFloat(String(item.start || item.startTime || 0)),
                  endTime: parseFloat(String(item.end || item.endTime || 0)),
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Set an empty lyrics object with the error message
      setLyrics({
        lines: [],
        error: errorMessage
      });

      // Show the lyrics display even with an error
      setShowLyrics(true);

      // Switch to lyrics tab to show the error
      setActiveTab('lyricsChords');

      // Also set the error message for the UI
      setLyricsError(error instanceof Error ? error.message : 'Failed to transcribe lyrics');
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
    const progressInterval = setInterval(() => {
      // Get current progress from context and increment if less than 90%
      setProgress(progress < 90 ? progress + 1 : progress);
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
        const error: ErrorWithSuggestion = new Error(errorMessage);
        error.suggestion = suggestion;
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
      if (error instanceof Error && 'suggestion' in error) {
        suggestion = (error as ErrorWithSuggestion).suggestion;
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

  // Handle beat cell clicks for navigation
  const handleBeatClick = (beatIndex: number, timestamp: number) => {
    // Seek audio element
    if (audioRef.current) {
      audioRef.current.currentTime = timestamp;
      setCurrentTime(timestamp);
    }

    // Seek YouTube player if available
    if (youtubePlayer && youtubePlayer.seekTo) {
      youtubePlayer.seekTo(timestamp, 'seconds');
    }

    // CRITICAL FIX: Set manual override to prevent animation system from recalculating
    setManualBeatIndexOverride(beatIndex);
    setCurrentBeatIndex(beatIndex);

    // Clear the override after a longer delay to allow the seek to stabilize
    // and prevent immediate recalculation conflicts
    setTimeout(() => {
      setManualBeatIndexOverride(null);
    }, 1000); // 1 second should be enough for the seek to complete and stabilize
  };

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

  // Metronome synchronization hook - direct alignment approach
  useMetronomeSync({
    beats: analysisResults?.beats || [],
    downbeats: analysisResults?.downbeats,
    currentTime,
    isPlaying
  });

  // Helper functions for chord grid data calculation
  const calculateOptimalShift = useCallback((chords: string[], timeSignature: number): number => {
    if (chords.length === 0) {
      console.log('🔄 Optimal shift calculation: No chords available, returning shift 0');
      return 0;
    }

    let bestShift = 0;
    let maxChordChanges = 0;
    const shiftResults: Array<{shift: number, chordChanges: number, downbeatPositions: number[], chordLabels: string[]}> = [];

    // Show complete chord sequence (first 20 for manageable output)
    // const displayCount = Math.min(chords.length, 20);
    // console.log(`\n🎵 COMPLETE CHORD SEQUENCE (first ${displayCount} of ${chords.length}):`);
    // chords.slice(0, displayCount).forEach((chord, index) => {
    //   const beatInMeasure = (index % timeSignature) + 1;
    //   const isDownbeat = beatInMeasure === 1;
    //   const marker = isDownbeat ? '🎯' : '  ';
    //   const isChordChange = index === 0 || chords[index] !== chords[index - 1];
    //   const changeMarker = isChordChange ? '🎵' : '  ';
    //   console.log(`  ${marker}${changeMarker} Beat[${index.toString().padStart(2)}]: "${chord.padEnd(8)}" (beat ${beatInMeasure}) ${isChordChange ? '← CHANGE' : ''}`);
    // });
    // if (chords.length > displayCount) {
    //   console.log(`  ... and ${chords.length - displayCount} more chords`);
    // }

    // Test each possible shift value (0 to timeSignature-1)
    // console.log(`\n🔄 TESTING SHIFT OPTIONS:`);
    for (let shift = 0; shift < timeSignature; shift++) {
      // console.log(`\n📊 === SHIFT ${shift} ANALYSIS ===`);

      // Show how all chord positions change with this shift (first 16 for manageable output)
      // const shiftDisplayCount = Math.min(chords.length, 16);
      // console.log(`  🔄 POSITION MAPPING (first ${shiftDisplayCount}):`);
      // chords.slice(0, shiftDisplayCount).forEach((chord, originalPos) => {
      //   const originalBeat = (originalPos % timeSignature) + 1;
      //   // FIXED: When we add shift grey cells at start, content moves right visually
      //   // but beat positions shift backward in the measure cycle
      //   const shiftedBeat = ((originalPos - shift + timeSignature) % timeSignature) + 1;
      //   const isDownbeat = shiftedBeat === 1;
      //   const downbeatMarker = isDownbeat ? '🎯' : '  ';
      //   const isChordChange = originalPos === 0 || chords[originalPos] !== chords[originalPos - 1];
      //   const changeMarker = isChordChange ? '🎵' : '  ';

      //   console.log(`    ${downbeatMarker}${changeMarker} Beat[${originalPos.toString().padStart(2)}]: "${chord.padEnd(8)}" beat ${originalBeat} -> ${shiftedBeat} ${isDownbeat ? '(DOWNBEAT)' : ''} ${isChordChange ? '(CHANGE)' : ''}`);
      // });

      let chordChangeCount = 0;
      const downbeatPositions: number[] = [];
      const chordLabels: string[] = [];

      // Check each beat position after applying the shift
      let previousDownbeatChord = '';

      for (let i = 0; i < chords.length; i++) {
        const currentChord = chords[i];

        // Calculate if this beat is a downbeat after applying the shift
        const beatInMeasure = ((i - shift + timeSignature) % timeSignature) + 1;
        const isDownbeat = beatInMeasure === 1;

        // Only check for chord changes on downbeats
        if (isDownbeat) {
          // Detect chord change: current downbeat chord differs from previous downbeat chord
          const isChordChange = currentChord && currentChord !== '' &&
                               currentChord !== previousDownbeatChord &&
                               previousDownbeatChord !== '' && // Don't count first downbeat as change
                               currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

          // Score: chord change that occurs on a downbeat
          if (isChordChange) {
            chordChangeCount++;
            downbeatPositions.push(i);
            chordLabels.push(currentChord);
          }

          // Update previous downbeat chord for next comparison
          if (currentChord && currentChord !== '' && currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N') {
            previousDownbeatChord = currentChord;
          }
        }
      }

      shiftResults.push({
        shift,
        chordChanges: chordChangeCount,
        downbeatPositions,
        chordLabels
      });

      // console.log(`  ✅ RESULT: ${chordChangeCount} chord changes on downbeats`);

      // if (chordChangeCount > 0) {
      //   const allChanges = downbeatPositions.map((pos, idx) =>
      //     `beat[${pos}]="${chordLabels[idx]}"`
      //   ).join(', ');
      //   console.log(`    🎵 Downbeat changes: ${allChanges}`);
      // } else {
      //   console.log(`    ⏸️  No chord changes on downbeats`);
      // }

      if (chordChangeCount > maxChordChanges) {
        maxChordChanges = chordChangeCount;
        bestShift = shift;
      }
    }

    // console.log(`\n✅ BEST SHIFT: ${bestShift} (${maxChordChanges} chord changes on downbeats)`);

    // Show the effect of the best shift on the first few measures
    // console.log(`\n📊 CHORD ALIGNMENT AFTER SHIFT ${bestShift} (first 12 beats):`);
    // chords.slice(0, 12).forEach((chord, index) => {
    //   const originalBeat = (index % timeSignature) + 1;
    //   // FIXED: When we add bestShift grey cells at start, content moves right visually
    //   // but beat positions shift backward in the measure cycle
    //   const shiftedBeat = ((index - bestShift + timeSignature) % timeSignature) + 1;
    //   const isDownbeat = shiftedBeat === 1;
    //   const marker = isDownbeat ? '🎯' : '  ';
    //   const isChordChange = index === 0 || chords[index] !== chords[index - 1];
    //   const changeMarker = isChordChange ? '🎵' : '  ';
    //   console.log(`  ${marker}${changeMarker} Beat[${index.toString().padStart(2)}]: "${chord.padEnd(8)}" beat ${originalBeat} -> ${shiftedBeat} ${isDownbeat && isChordChange ? '← DOWNBEAT CHANGE!' : ''}`);
    // });

    return bestShift;
  }, []);

  const calculatePaddingAndShift = useCallback((firstDetectedBeatTime: number, bpm: number, timeSignature: number, chords: string[] = []) => {
    // console.log('\n🔧 === PADDING & SHIFT CALCULATION ===');
    // console.log(`First detected beat time: ${firstDetectedBeatTime.toFixed(3)}s`);
    // console.log(`BPM: ${bpm}, Time signature: ${timeSignature}/4`);

    if (firstDetectedBeatTime <= 0.1) {
      // console.log('❌ First beat starts very close to 0.0s, no padding needed');
      return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STEP 1: Calculate padding based on first detected beat time
    // Formula: Math.floor((first_detected_beat_time / 60) * bpm)
    const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);

    // Enhanced padding calculation: if the gap is significant (>20% of a beat), add 1 beat of padding
    // IMPROVED: Round beat duration to 3 decimal places for consistent timing calculations
    const beatDuration = Math.round((60 / bpm) * 1000) / 1000; // Duration of one beat in seconds (rounded to ms precision)
    const gapRatio = firstDetectedBeatTime / beatDuration;
    const paddingCount = rawPaddingCount === 0 && gapRatio > 0.2 ? 1 : rawPaddingCount;

    // console.log(`\n📊 PADDING CALCULATION:`);
    // console.log(`  Beat duration: ${beatDuration.toFixed(3)}s`);
    // console.log(`  Gap ratio: ${gapRatio.toFixed(3)} (${(gapRatio * 100).toFixed(1)}% of a beat)`);
    // console.log(`  Raw padding count: ${rawPaddingCount}`);
    // console.log(`  Final padding count: ${paddingCount}`);

    // More reasonable limit: allow up to 4 measures of padding for long intros
    if (paddingCount <= 0 || paddingCount >= timeSignature * 4) {
      // console.log(`❌ Padding rejected: paddingCount=${paddingCount}, limit=${timeSignature * 4}`);
      return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STEP 2: Calculate optimal shift using chord change analysis
    let shiftCount = 0;
    // console.log(`\n🔄 SHIFT CALCULATION:`);
    if (chords.length > 0) {
      // console.log(`  Using chord-based shift calculation (${chords.length} chords available)`);
      // Use optimal chord-based shift calculation
      shiftCount = calculateOptimalShift(chords, timeSignature);
    } else {
      // console.log(`  Using fallback position-based calculation (no chords available)`);
      // Fallback to position-based calculation if no chords available
      const beatPositionInMeasure = ((paddingCount) % timeSignature) + 1;
      const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
      shiftCount = finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
      // console.log(`    Beat position in measure: ${beatPositionInMeasure}`);
      // console.log(`    Final beat position: ${finalBeatPosition}`);
      // console.log(`    Calculated shift: ${shiftCount}`);
    }

    const totalPaddingCount = paddingCount + shiftCount;

    // console.log(`\n✅ FINAL RESULT:`);
    // console.log(`  Padding count: ${paddingCount} beats`);
    // console.log(`  Shift count: ${shiftCount} beats`);
    // console.log(`  Total padding: ${totalPaddingCount} beats`);
    // console.log(`  This means ${shiftCount} grey cells + ${paddingCount} orange N.C. cells`);

    return { paddingCount, shiftCount, totalPaddingCount };
  }, [calculateOptimalShift]);

  // COMPREHENSIVE PADDING & SHIFTING: Get chord grid data with padding and shifting
  const getChordGridData = useCallback(() => {
    if (!analysisResults || !analysisResults.synchronizedChords) {
      return { chords: [], beats: [], hasPadding: false, paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STAGE 4: Log synchronized chords before visual processing

    // Use first detected beat time for padding calculation
    const firstDetectedBeat = analysisResults.beats.length > 0 ? analysisResults.beats[0].time : 0;
    const bpm = analysisResults.beatDetectionResult?.bpm || 120;
    const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;

    // Extract chord data for optimal shift calculation
    const chordData = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);

    // Use first detected beat time for comprehensive padding and shifting calculation
    const { paddingCount, shiftCount } = calculatePaddingAndShift(firstDetectedBeat, bpm, timeSignature, chordData);

    // Apply comprehensive strategy if we have either padding OR shifting
    if (paddingCount > 0 || shiftCount > 0) {
      // Add only padding N.C. chords (based on first detected beat time)
      // Shifting will be handled in the frontend as greyed-out cells
      const paddingChords = Array(paddingCount).fill('N.C.');
      // FIXED: Create padding timestamps that are evenly distributed from 0.0s to first detected beat
      const paddingTimestamps = Array(paddingCount).fill(0).map((_, i) => {
        const paddingDuration = firstDetectedBeat;
        const paddingBeatDuration = paddingDuration / paddingCount;
        return (i + 1) * paddingBeatDuration; // Timestamps from paddingBeatDuration to firstDetectedBeat
      });

      // Combine padding with regular chords (no shift N.C. labels added here)
      // Extract original chord data without any corrections (corrections will be applied at display time)
      const regularChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
      // FIXED: Pass actual timestamps instead of beat indices for click navigation
      const regularBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
        const beatIndex = item.beatIndex;
        if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
          return analysisResults.beats[beatIndex].time; // Get actual timestamp
        }
        return 0; // Fallback for invalid indices
      });

      const shiftNullTimestamps = Array(shiftCount).fill(null); // Shift cells should not have timestamps

      // STAGE 5: Log final visual grid construction
      const finalChords = [...Array(shiftCount).fill(''), ...paddingChords, ...regularChords];
      const finalBeats = [...shiftNullTimestamps, ...paddingTimestamps, ...regularBeats];

      // FIXED: Create separate arrays for audio mapping vs visual display
      // Visual grid: shifted positions with padding/shift for musical alignment
      // Audio mapping: original timestamp-to-chord relationships for accurate sync

      // Create original timestamp-to-chord mapping for audio sync (no shifting)
      // console.log('\n🔍 ORIGINAL AUDIO MAPPING DEBUG:');
      const originalAudioMapping = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}, index) => {
        // CRITICAL FIX: The synchronizedChords array index IS the original sequence
        // The item.beatIndex might be shifted, but the array index represents the original beat sequence
        // We need to map back to the original beat detection results

        // Get the original timestamp from the raw beat detection results
        // analysisResults.beats should contain the original unshifted beat times
        const originalTimestamp = analysisResults.beats[index]?.time || 0;

        // For comparison, get what the shifted system thinks this should be
        // const shiftedTimestamp = analysisResults.beats[item.beatIndex]?.time || 0;

        return {
          chord: item.chord,
          timestamp: originalTimestamp, // Use original timestamp from beat detection
          visualIndex: -1 // Will be populated below
        };
      });

      // FIXED: Map original chords to their actual visual positions after shifting
      // Instead of using a formula, search the actual visual grid to find where each chord appears
      // console.log('\n🔍 MAPPING AUDIO TO VISUAL POSITIONS:');
      originalAudioMapping.forEach((audioItem, originalIndex) => {
        // Search through the final visual grid to find where this chord actually appears
        // We need to find the correct occurrence that corresponds to this original position

        let foundVisualIndex = -1;
        let occurrenceCount = 0;

        // Count occurrences of this chord up to the original position to handle duplicates
        for (let i = 0; i < originalIndex; i++) {
          if (originalAudioMapping[i].chord === audioItem.chord) {
            occurrenceCount++;
          }
        }

        // Now find the (occurrenceCount + 1)th occurrence of this chord in the visual grid
        let currentOccurrence = 0;
        for (let visualIndex = 0; visualIndex < finalChords.length; visualIndex++) {
          if (finalChords[visualIndex] === audioItem.chord && audioItem.chord !== '' && audioItem.chord !== 'N.C.') {
            if (currentOccurrence === occurrenceCount) {
              foundVisualIndex = visualIndex;
              break;
            }
            currentOccurrence++;
          }
        }

        audioItem.visualIndex = foundVisualIndex;

      });

      // FIXED: Create animation mapping that maps original timestamps to label positions
      // This ensures animation highlights where the chord LABELS appear, not where chords start
      // console.log('\n🎬 CREATING ANIMATION MAPPING:');
      const animationMapping: { timestamp: number; visualIndex: number; chord: string }[] = [];

      // For each unique chord, map its original timestamp to where its LABEL appears in the visual grid
      const processedChords = new Set<string>();

      originalAudioMapping.forEach((audioItem) => {
        if (!processedChords.has(audioItem.chord) && audioItem.chord !== '' && audioItem.chord !== 'N.C.') {
          // Find where this chord's LABEL appears in the visual grid (first occurrence with label)
          let labelVisualIndex = -1;

          // Search for the first position where this chord appears and would show a label
          for (let visualIndex = 0; visualIndex < finalChords.length; visualIndex++) {
            if (finalChords[visualIndex] === audioItem.chord) {
              // Check if this position would show a label (chord change detection)
              const prevChord = visualIndex > 0 ? finalChords[visualIndex - 1] : '';
              if (prevChord !== audioItem.chord) {
                labelVisualIndex = visualIndex;
                break;
              }
            }
          }

          if (labelVisualIndex !== -1) {
            animationMapping.push({
              timestamp: audioItem.timestamp, // Original timestamp
              visualIndex: labelVisualIndex, // Where the label appears
              chord: audioItem.chord
            });

            // console.log(`  Animation[${animationMapping.length - 1}]: chord="${audioItem.chord.padEnd(8)}" originalTime=${audioItem.timestamp.toFixed(3)}s -> labelAt=Visual[${labelVisualIndex}]`);
          }

          processedChords.add(audioItem.chord);
        }
      });

      // FIXED: Replace shifted timestamps with original timestamps in the visual grid
      // This ensures animation and beat clicks use original timestamps for perfect sync
      // console.log('\n🔧 APPLYING ORIGINAL TIMESTAMPS TO VISUAL GRID:');
      const correctedBeats = [...finalBeats]; // Start with the shifted beats array

      originalAudioMapping.forEach((audioItem) => {
        const visualIndex = audioItem.visualIndex;
        const originalTimestamp = audioItem.timestamp;
        // const shiftedTimestamp = correctedBeats[visualIndex];

        // Replace the shifted timestamp with the original timestamp
        correctedBeats[visualIndex] = originalTimestamp;

        // if (index < 5) { // Log first few corrections
        //   console.log(`  Visual[${visualIndex}]: ${typeof shiftedTimestamp === 'number' ? shiftedTimestamp.toFixed(3) + 's' : shiftedTimestamp} -> ${originalTimestamp.toFixed(3)}s (chord="${audioItem.chord}")`);
        // }
      });

      return {
        chords: finalChords, // Add shift cells as empty strings
        beats: correctedBeats, // FIXED: Use corrected beats with original timestamps
        hasPadding: true,
        paddingCount: paddingCount,
        shiftCount: shiftCount,
        totalPaddingCount: paddingCount + shiftCount, // Total includes both padding and shift
        originalAudioMapping: originalAudioMapping, // NEW: Original timestamp-to-chord mapping for audio sync
        animationMapping: animationMapping // NEW: Maps original timestamps to label positions for animation
      };
    }

    return {
      chords: analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord),
      beats: analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
        const beatIndex = item.beatIndex;
        if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
          return analysisResults.beats[beatIndex].time;
        }
        return 0;
      }),
      hasPadding: false,
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0
    };
  }, [analysisResults, calculatePaddingAndShift]);

  const chordGridData = useMemo(() => getChordGridData(), [getChordGridData]);

  // Update current time and check for current beat
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !analysisResults) return;

    // Smooth animation for beat alignment (50ms = 20Hz update rate)
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);

        // Find the current beat based on chord grid data (includes pickup beats)
        // This ensures consistency between beat tracking and chord display
        if (chordGridData && chordGridData.chords.length > 0) {
          // Check if we have a manual override (from user click)
          if (manualBeatIndexOverride !== null) {
            // Use the manually set beat index and skip automatic calculation
            setCurrentBeatIndex(manualBeatIndexOverride);
            return;
          }

          let currentBeat = -1;

          const beatTimeRangeStart = analysisResults?.beatDetectionResult?.beat_time_range_start || 0;
          const firstDetectedBeat = analysisResults.beats.length > 0 ? analysisResults.beats[0].time : beatTimeRangeStart;

          // FIXED: Use first detected beat time for animation timing to align with actual beat model output
          // This accounts for the offset between chord model start (0.0s) and first beat detection (e.g., 0.534s)
          const animationRangeStart = firstDetectedBeat;

          // Debug: Log the timing alignment fix (only once per second to avoid spam)
          if (Math.floor(time * 4) % 20 === 0) { // Log every 5 seconds
            const bpm = analysisResults?.beatDetectionResult?.bpm || 120;
            const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
            console.log(`🎬 TIMING ALIGNMENT: beatTimeRangeStart=${beatTimeRangeStart.toFixed(3)}s, firstDetectedBeat=${firstDetectedBeat.toFixed(3)}s, offset=${(firstDetectedBeat - beatTimeRangeStart).toFixed(3)}s, beatDuration=${beatDuration.toFixed(3)}s@${bpm}BPM`);
          }

          if (time < animationRangeStart) {
            // PHASE 1: Pre-model context (0.0s to first detected beat)
            // Only animate if there are actual padding cells to animate through
            const paddingCount = chordGridData.paddingCount || 0;
            const shiftCount = chordGridData.shiftCount || 0;

            if (paddingCount > 0) {
              // FIXED: Calculate the timestamp for the first non-shift cell (first padding cell)
              const firstNonShiftCellIndex = shiftCount; // First cell after shift cells
              const firstNonShiftTimestamp = chordGridData.beats[firstNonShiftCellIndex];

              // Only start animation when we reach the timestamp of the first non-shift cell
              if (firstNonShiftTimestamp !== null && firstNonShiftTimestamp !== undefined && time >= firstNonShiftTimestamp) {
                // Stretch the animation across the time from first non-shift timestamp to first detected beat
                const adjustedTime = time - firstNonShiftTimestamp;
                const adjustedDuration = animationRangeStart - firstNonShiftTimestamp;
                const paddingBeatDuration = adjustedDuration / paddingCount;
                // IMPROVED: Use Math.round for more accurate beat progression instead of always rounding down
                const paddingBeatIndex = Math.round(adjustedTime / paddingBeatDuration);

                // FIXED: Start animation from first non-shift cell (shiftCount + 0)
                // Grid layout: [shift cells (null timestamps, never highlight)] + [padding cells (orange/N.C.)] + [model beats]
                // Animation starts from position shiftCount (first padding cell)
                const rawBeat = shiftCount + Math.min(paddingBeatIndex, paddingCount - 1);

                // console.log(`🎬 PADDING PHASE: time=${time.toFixed(3)}s, firstNonShiftTimestamp=${firstNonShiftTimestamp.toFixed(3)}s, paddingBeatIndex=${paddingBeatIndex}, rawBeat=${rawBeat}, shiftCount=${shiftCount}`);

                // CRITICAL: Verify the beat has a valid timestamp before highlighting
                if (chordGridData.beats[rawBeat] !== null && chordGridData.beats[rawBeat] !== undefined) {
                  currentBeat = rawBeat;
                } else {
                  console.warn(`🚨 PADDING: Beat ${rawBeat} has null timestamp, skipping highlight`);
                  currentBeat = -1; // Don't highlight cells with null timestamps
                }

              } else {
                // Too early - before the first non-shift cell timestamp
                // console.log(`🎬 PRE-PADDING: time=${time.toFixed(3)}s < firstNonShiftTimestamp=${firstNonShiftTimestamp?.toFixed(3) || 'null'}s, no animation yet`);
                currentBeat = -1; // Don't highlight any cell before the first non-shift timestamp
              }
            } else {
              // FIXED: No padding available - skip pre-model animation entirely
              // Don't animate anything during pre-model phase if there are no padding cells
              // This prevents highlighting of greyed-out shift cells
              // console.log(`🎬 NO PADDING PHASE: time=${time.toFixed(3)}s < animationRangeStart=${animationRangeStart.toFixed(3)}s, skipping animation (no padding cells to animate)`);
              currentBeat = -1; // Don't highlight any cell during pre-model phase without padding
            }
          } else {
            // PHASE 2: Model beats (first detected beat onwards)
            // Use ChordGrid's beat array for consistency with click handling

            // FIXED: Use original audio mapping for accurate audio-to-visual sync
            // Instead of searching through shifted visual grid, use the preserved original timestamp mappings

            let bestVisualIndex = -1;
            let bestTimeDifference = Infinity;

            // Check if we have original audio mapping (comprehensive strategy)
            if (chordGridData.originalAudioMapping && chordGridData.originalAudioMapping.length > 0) {

              // SIMPLIFIED ADAPTIVE SYNC: Calculate speed adjustment once for first segment, use globally
              const adjustedTime = time; // No longer modified per-segment
              const bpm = analysisResults?.beatDetectionResult?.bpm || 120;
              const originalBeatDuration = Math.round((60 / bpm) * 1000) / 1000;

              // Use global speed adjustment if already calculated, otherwise use original
              // const currentBeatDuration = globalSpeedAdjustment !== null ? globalSpeedAdjustment : originalBeatDuration;

              // Find chord changes to identify segments using CHORD MODEL timestamps for calculation
              const chordChanges: { index: number; chord: string; timestamp: number; chordModelTimestamp: number }[] = [];
              let lastChord = '';

              chordGridData.originalAudioMapping.forEach((item, index) => {
                if (item.chord !== lastChord) {
                  // Find the original chord model timestamp for this chord
                  let chordModelTimestamp = item.timestamp; // Default to current timestamp

                  if (analysisResults.chords && analysisResults.chords.length > 0) {
                    const matchingChord = analysisResults.chords.find(chord =>
                      chord.chord === item.chord &&
                      Math.abs(chord.start - item.timestamp) < 2.0 // Within 2 seconds tolerance
                    );

                    if (matchingChord) {
                      chordModelTimestamp = matchingChord.start; // Use chord model start time for calculation
                    }
                  }

                  chordChanges.push({
                    index,
                    chord: item.chord,
                    timestamp: item.timestamp, // Keep original for animation
                    chordModelTimestamp: chordModelTimestamp // Use for calculation
                  });
                  lastChord = item.chord;
                }
              });



              // Calculate speed adjustment only for the FIRST segment, then use globally
              if (globalSpeedAdjustment === null && chordChanges.length >= 2) {
                const label1 = chordChanges[0]; // First chord change
                const label2 = chordChanges[1]; // Second chord change

                // Calculate expected vs actual cells using CHORD MODEL timestamps
                const chordModelDuration = label2.chordModelTimestamp - label1.chordModelTimestamp;
                const expectedCells = chordModelDuration / originalBeatDuration;
                const actualCells = label2.index - label1.index;
                const cellDiff = expectedCells - actualCells;

                if (Math.abs(cellDiff) > 0.5 && cellDiff > 0.5) {
                  // Calculate new global speed
                  const speedupCells = Math.round(cellDiff);
                  const adjustedCells = actualCells + speedupCells;
                  const newGlobalSpeed = (originalBeatDuration * adjustedCells) / actualCells;

                  setGlobalSpeedAdjustment(newGlobalSpeed);
                }
              }

              // Check if current time falls within a segment for animation
              for (let i = 0; i < chordChanges.length - 1; i++) {
                const label1 = chordChanges[i];
                const label2 = chordChanges[i + 1];

                if (time >= label1.timestamp && time <= label2.timestamp) {
                  // Simple animation timing - no per-segment calculation needed
                  // Global speed adjustment is already applied to beatDuration above
                  break;
                }
              }

              // FIXED: Find the audio mapping entry with timestamp closest to adjusted time
              // Then find the visual position where that chord appears (accounting for shifting)
              let matchedAudioItem = null;

              // Search through original audio mapping for the closest timestamp using adjusted time
              for (let i = 0; i < chordGridData.originalAudioMapping.length; i++) {
                const audioItem = chordGridData.originalAudioMapping[i];
                const timeDifference = Math.abs(adjustedTime - audioItem.timestamp);

                if (timeDifference < bestTimeDifference) {
                  bestTimeDifference = timeDifference;
                  matchedAudioItem = audioItem;
                }

                // Also check if adjusted time falls within this beat's range
                const nextAudioItem = chordGridData.originalAudioMapping[i + 1];
                const nextBeatTime = nextAudioItem ? nextAudioItem.timestamp : audioItem.timestamp + 0.5;

                // If adjusted time falls within this beat's range, prefer this over just closest
                if (adjustedTime >= audioItem.timestamp && adjustedTime < nextBeatTime) {
                  matchedAudioItem = audioItem;
                  bestTimeDifference = timeDifference;
                  // if (shouldLogMapping) {
                  //   console.log(`🎯 RANGE MATCH: time=${time.toFixed(3)}s falls in range [${audioItem.timestamp.toFixed(3)}s, ${nextBeatTime.toFixed(3)}s) -> AudioMap chord="${audioItem.chord}"`);
                  // }
                  break; // Range match is better than just closest
                }
              }

              // FIXED: Now find the visual position where this chord appears
              if (matchedAudioItem) {
                // IMPROVED: Find the visual position that corresponds to this audio mapping entry
                // Use the visualIndex from the audio mapping if available, otherwise search by chord
                if (matchedAudioItem.visualIndex !== undefined && matchedAudioItem.visualIndex >= 0) {
                  bestVisualIndex = matchedAudioItem.visualIndex;
                  
                } else {
                  // Fallback: Search through the visual grid to find where this chord appears
                  for (let visualIndex = 0; visualIndex < chordGridData.chords.length; visualIndex++) {
                    const visualChord = chordGridData.chords[visualIndex];
                    if (visualChord === matchedAudioItem.chord && visualChord !== '' && visualChord !== 'N.C.') {
                      bestVisualIndex = visualIndex;
                      
                      break; // Use first occurrence of this chord in visual grid
                    }
                  }
                }
              }

            if (bestVisualIndex === -1 || matchedAudioItem) {

              // Fallback to old method for non-comprehensive strategy
              // console.log(`📊 Fallback: Using visual grid search (no original audio mapping)`);

              // Search through ALL visual cells to find the one with timestamp closest to current audio time
              for (let visualIndex = 0; visualIndex < chordGridData.beats.length; visualIndex++) {
                const visualTimestamp = chordGridData.beats[visualIndex];

                // Skip null timestamps (shift cells)
                if (visualTimestamp === null || visualTimestamp === undefined) {
                  continue;
                }

                // Calculate how close this visual cell's timestamp is to the current audio time
                const timeDifference = Math.abs(time - visualTimestamp);

                // Find the visual cell with the closest timestamp to current audio time
                if (timeDifference < bestTimeDifference) {
                  bestTimeDifference = timeDifference;
                  bestVisualIndex = visualIndex;
                }

                // Also check if current time falls within this beat's range
                const nextVisualIndex = visualIndex + 1;
                let nextBeatTime = visualTimestamp + 0.5; // Default estimate

                // Find the next valid timestamp for range checking
                for (let j = nextVisualIndex; j < chordGridData.beats.length; j++) {
                  if (chordGridData.beats[j] !== null && chordGridData.beats[j] !== undefined) {
                    nextBeatTime = chordGridData.beats[j];
                    break;
                  }
                }

                // If current time falls within this beat's range, prefer this over just closest
                if (time >= visualTimestamp && time < nextBeatTime) {
                  bestVisualIndex = visualIndex;
                  bestTimeDifference = timeDifference;
                  // const chord = chordGridData.chords[visualIndex] || 'undefined';
                  // console.log(`🎯 FALLBACK RANGE MATCH: time=${time.toFixed(3)}s falls in range [${visualTimestamp.toFixed(3)}s, ${nextBeatTime.toFixed(3)}s) -> visual[${visualIndex}] chord="${chord}"`);
                  break; // Range match is better than just closest
                }
              }

            }

            if (bestVisualIndex !== -1) {
              currentBeat = bestVisualIndex;
            } else {
              console.warn(`❌ NO VISUAL MATCH: Could not find visual cell for time=${time.toFixed(3)}s`);
            }
          }

          if (currentBeat !== -1) {
            // FINAL SAFEGUARD: Never highlight shift cells (cells with null timestamps)
            const shiftCount = chordGridData.shiftCount || 0;

            // Check if this beat has a null timestamp (shift cell)
            if (currentBeat < shiftCount || chordGridData.beats[currentBeat] === null || chordGridData.beats[currentBeat] === undefined) {
              console.warn(`🚨 FINAL SAFEGUARD: Animation tried to highlight shift cell ${currentBeat} (null timestamp), skipping highlight`);
              currentBeat = -1; // Don't highlight cells with null timestamps
            }

            // console.log(`🎬 FINAL RESULT: originalBeat=${originalBeat}, finalBeat=${currentBeat}, shiftCount=${shiftCount}, timestamp=${chordGridData.beats[originalBeat]}`);

            setCurrentBeatIndex(currentBeat);
          } else {
            // No animation during pre-model phase without padding - clear any existing highlight
            setCurrentBeatIndex(-1);
            // console.log(`🎬 NO ANIMATION: currentBeat=-1, clearing beat highlight`);
          }
        }

          // Find current downbeat if available
          const downbeats = analysisResults.downbeats || [];
          if (downbeats && downbeats.length > 0 && downbeats.findIndex) {
            const currentDownbeat = downbeats.findIndex(
              (beatTime, index) => time >= beatTime &&
              (index === (downbeats && downbeats.length ? downbeats.length - 1 : 0) ||
               (downbeats && index + 1 < downbeats.length && time < downbeats[index + 1]))
            );

            if (currentDownbeat !== -1) {
              setCurrentDownbeatIndex(currentDownbeat);
            }
          }
        }
      }
    }, 50); // Update at 20Hz for smoother beat tracking

    return () => clearInterval(interval);
  }, [isPlaying, analysisResults, setCurrentTime, setCurrentBeatIndex]);

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

  // Function to toggle enharmonic correction display
  const toggleEnharmonicCorrection = () => {
    setShowCorrectedChords(!showCorrectedChords);
  };

  // Function to detect key signature using Gemini
  const detectKeySignature = async (chords: string[]) => {
    console.log('🔑 DETECT KEY SIGNATURE CALLED:', {
      chords: chords.slice(0, 10), // Log first 10 chords
      totalChords: chords.length,
      isDetectingKey,
      hasChords: chords && chords.length > 0
    });

    if (!chords || chords.length === 0 || isDetectingKey) {
      console.log('🔑 DETECT KEY SIGNATURE SKIPPED:', {
        hasChords: chords && chords.length > 0,
        isDetectingKey
      });
      return;
    }

    setIsDetectingKey(true);
    try {
      // Get unique chords and their frequencies
      const chordCounts: Record<string, number> = {};
      chords.forEach(chord => {
        if (chord && chord !== 'N/C') {
          chordCounts[chord] = (chordCounts[chord] || 0) + 1;
        }
      });

      const uniqueChords = Object.keys(chordCounts);
      console.log('🔑 UNIQUE CHORDS:', {
        uniqueChords,
        chordCounts,
        totalUniqueChords: uniqueChords.length
      });

      if (uniqueChords.length === 0) {
        console.log('🔑 NO UNIQUE CHORDS FOUND, setting key to Unknown');
        setKeySignature('Unknown');
        return;
      }

      // Sort chords by frequency
      const sortedChords = uniqueChords.sort((a, b) => chordCounts[b] - chordCounts[a]);
      const topChords = sortedChords.slice(0, Math.min(10, sortedChords.length));

      const prompt = `Analyze these chord progressions and determine the most likely key signature.

Chords in order of frequency: ${topChords.join(', ')}

Please respond with just the key signature in this format: "C major" or "A minor" or "F# major" etc.
Consider:
- The most frequent chords
- Common chord progressions (I-V-vi-IV, ii-V-I, etc.)
- Circle of fifths relationships
- Major vs minor tonality

Respond with only the key signature, nothing else.`;

      const response = await fetch('/api/gemini-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          conversationHistory: []
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const detectedKey = data.response?.trim();
        if (detectedKey) {
          setKeySignature(detectedKey);
        } else {
          setKeySignature('Unknown');
        }
      } else {
        setKeySignature('Unknown');
      }
    } catch (error) {
      console.error('Error detecting key signature:', error);
      setKeySignature('Unknown');
    } finally {
      setIsDetectingKey(false);
    }
  };

  // Effect to detect key signature when analysis results are available
  useEffect(() => {
    if (analysisResults?.synchronizedChords && analysisResults.synchronizedChords.length > 0 && !keySignature && !isDetectingKey) {
      const chords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
      detectKeySignature(chords);
    }
  }, [analysisResults, keySignature, isDetectingKey]);

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
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-800 transition-colors duration-300">
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
        onDismiss={() => setShowExtractionNotification(false)}
        onRefresh={() => extractAudioFromYouTube(true)}
      />

      <div className="container mx-auto px-1 sm:px-2 md:px-3 py-0 min-h-screen bg-white dark:bg-gray-800 transition-colors duration-300" style={{ maxWidth: "98%" }}>
        <div className="bg-white dark:bg-gray-700 shadow-md rounded-lg overflow-hidden transition-colors duration-300 border border-gray-200 dark:border-gray-600">

        {/* Main content area - responsive width based on chatbot and lyrics panel state */}
        <div className={`flex flex-col transition-all duration-300 ${
          isChatbotOpen || isLyricsPanelOpen ? 'mr-[420px]' : ''
        }`}>
          {/* Content area: Chord and beat visualization */}
          <div className="w-full p-0 overflow-visible">
            {/* Audio player is now handled by the AudioPlayer component */}

            {/* Processing Status and Model Selection in a single row */}
            <div className="mb-2">
              {/* Error message */}
              {audioProcessingState.error && (
                <div className="bg-red-50 p-3 rounded-lg mb-2">
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
                        <p className="text-red-700 mt-1 italic">{audioProcessingState.suggestion}</p>
                      )}

                      <div className="mt-2">
                        <h4 className="text-sm font-medium text-red-800">Troubleshooting:</h4>
                        <ul className="list-disc list-inside text-sm text-red-700 mt-1 space-y-0.5">
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

                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          onClick={() => extractAudioFromService()}
                          className="inline-flex items-center px-3 py-1.5 border border-red-600 dark:border-red-500 text-xs font-medium rounded-md text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900 hover:bg-red-100 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-300"
                        >
                          Try Again
                        </button>
                        <button
                          onClick={() => extractAudioFromService(true)}
                          className="inline-flex items-center px-3 py-1.5 border border-red-600 dark:border-red-500 text-xs font-medium rounded-md text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900 hover:bg-red-100 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-300"
                        >
                          Force Re-download
                        </button>
                        <Link
                          href="/analyze"
                          className="inline-flex items-center px-3 py-1.5 border border-blue-600 dark:border-blue-500 text-xs font-medium rounded-md text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-300"
                        >
                          Upload Audio File
                        </Link>
                        <Link
                          href="/"
                          className="inline-flex items-center px-3 py-1.5 border border-gray-600 dark:border-gray-500 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-300"
                        >
                          Search Different Video
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Processing Status Banner - shown at the top of the page */}
              <ProcessingStatusBanner
                analysisResults={analysisResults}
                audioDuration={duration}
                fromCache={audioProcessingState.fromCache}
                fromFirestoreCache={audioProcessingState.fromFirestoreCache}
              />

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
              />
              </div>
            </div>

            {/* Analysis results - show during processing or when complete */}
            {(audioProcessingState.isAnalyzing || (analysisResults && audioProcessingState.isAnalyzed)) && (
            <div className="mt-0 space-y-2">

              {/* Tabbed interface for analysis results */}
              <div className="p-3 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 mb-2 mt-0 transition-colors duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center mb-2">
                  <div className="mb-2 md:mb-0">
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">Analysis Results</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 mt-1 truncate max-w-md">
                      {videoTitle}
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    {/* Only show interactive buttons when not processing */}
                    {!audioProcessingState.isAnalyzing && (
                      <>
                        {/* Enharmonic correction toggle button */}
                        <button
                          onClick={toggleEnharmonicCorrection}
                          disabled={!chordCorrections || Object.keys(chordCorrections).length === 0}
                          className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors duration-200 ${
                            !chordCorrections || Object.keys(chordCorrections).length === 0
                              ? 'bg-gray-100 dark:bg-gray-600 border-gray-200 dark:border-gray-500 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                              : showCorrectedChords
                                ? 'bg-purple-100 dark:bg-purple-200 border-purple-300 dark:border-purple-400 text-purple-800 dark:text-purple-900 hover:bg-purple-200 dark:hover:bg-purple-300'
                                : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                          }`}
                          title={
                            !chordCorrections || Object.keys(chordCorrections).length === 0
                              ? 'No chord corrections available'
                              : showCorrectedChords
                                ? 'Show original chord spellings'
                                : 'Show corrected enharmonic spellings'
                          }
                        >
                          {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
                        </button>

                        <button
                          onClick={transcribeLyrics}
                          disabled={isTranscribingLyrics || !audioProcessingState.audioUrl}
                          className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 w-full md:w-auto"
                        >
                          {isTranscribingLyrics ? "Transcribing Lyrics..." : showLyrics ? "Refresh Lyrics" : "Transcribe Lyrics"}
                        </button>

                        {lyricsError && (
                          <div className="text-red-500 mt-2 md:col-span-2">{lyricsError}</div>
                        )}
                      </>
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
                      onClick={() => setActiveTab('lyricsChords')}
                      disabled={!showLyrics}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === 'lyricsChords'
                          ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                          : !showLyrics
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
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
                      {audioProcessingState.isAnalyzing ? (
                        <SkeletonChordGrid
                          timeSignature={analysisResults?.beatDetectionResult?.time_signature || 4}
                        />
                      ) : (
                        <>
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
                            chordCorrections={chordCorrections}
                          />

                          {/* Control buttons moved to the component level */}

                          {/* Collapsible Analysis Summary */}
                          {analysisResults && (
                            <AnalysisSummary
                              analysisResults={analysisResults}
                              audioDuration={duration}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Lyrics & Chords Tab */}
                  {activeTab === 'lyricsChords' && (
                    <div>
                      {audioProcessingState.isAnalyzing ? (
                        <SkeletonLyrics />
                      ) : (
                        <LyricsSection
                          lyrics={lyrics}
                          showLyrics={showLyrics}
                          currentTime={currentTime}
                          fontSize={fontSize}
                          onFontSizeChange={setFontSize}
                          theme={theme}
                          analysisResults={analysisResults}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>


              {/* Beats visualization - only show when not processing */}
              {!audioProcessingState.isAnalyzing && (
              <div className="p-4 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors duration-300">
                <h3 className="font-medium text-lg mb-2 text-gray-800 dark:text-gray-100 transition-colors duration-300">Beat Timeline</h3>
                <div className="relative h-16 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden transition-colors duration-300">
                  {/* Beat markers */}
                  {analysisResults && analysisResults.beats && analysisResults.beats.map ? (
                    analysisResults.beats.map((beat: {time: number, beatNum?: number}, index: number) => {
                      // Get beat number from beat info if available
                      // Use the detected time signature or default to 4
                      const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
                      const beatNum = beat.beatNum ||
                                    (analysisResults.synchronizedChords && analysisResults.synchronizedChords[index]?.beatNum) ||
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
                            isFirstBeat ? 'text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-300'
                          }`}>
                            {beatNum}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm transition-colors duration-300">
                      No beat data available
                    </div>
                  )}

                  {/* Downbeat markers (if available) - simplified */}
                  {analysisResults && analysisResults.downbeats && analysisResults.downbeats.map &&
                   analysisResults.downbeats.map((beatTime: number, index: number) => (
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
                  <div className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">
                    <div className="w-3 h-3 bg-blue-500"></div>
                    <span>First beat (1)</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">
                    <div className="w-3 h-3 bg-gray-500"></div>
                    <span>Regular beats {analysisResults?.beatDetectionResult?.time_signature === 3 ? '(2,3)' :
                      analysisResults?.beatDetectionResult?.time_signature === 5 ? '(2,3,4,5)' :
                      analysisResults?.beatDetectionResult?.time_signature === 6 ? '(2,3,4,5,6)' :
                      analysisResults?.beatDetectionResult?.time_signature === 7 ? '(2,3,4,5,6,7)' :
                      '(2,3,4)'}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">
                    <div className="w-3 h-3 bg-red-500"></div>
                    <span>Measure start (downbeat)</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">
                    <div className="w-3 h-3 bg-blue-600"></div>
                    <span>Current beat</span>
                  </div>
                </div>
              </div>

              {/* Beat statistics section removed as requested */}
            </div>
            )}
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
              <div className="absolute -top-10 left-0 right-0 z-60 flex flex-wrap justify-end gap-1 p-2 bg-white dark:bg-gray-800 bg-opacity-80 dark:bg-opacity-90 backdrop-blur-sm rounded-lg shadow-md transition-colors duration-300">
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
                  <MetronomeControls isVideoMinimized={isVideoMinimized} />
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