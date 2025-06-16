"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
// Import types are used in type annotations and interfaces
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
import { apiPost } from '@/config/api';
import { SongContext } from '@/types/chatbotTypes';
import { LyricsData } from '@/types/musicAiTypes';
import { useMetronomeSync } from '@/hooks/useMetronomeSync';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { timingSyncService } from '@/services/timingSyncService';
// convertToPrivacyEnhancedUrl removed as it's not used in this component
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnalysisControls } from '@/components/AnalysisControls';
import { ChordGridContainer } from '@/components/ChordGridContainer';
import { LyricsSection } from '@/components/LyricsSection';
import { ChatbotSection } from '@/components/ChatbotSection';
import { YouTubePlayer } from '@/types/youtube';
import dynamic from 'next/dynamic';
//import type { ReactPlayerProps } from 'react-player';



// Define error types for better type safety
interface ErrorWithSuggestion extends Error {
  suggestion?: string;
}

// Dynamically import ReactPlayer to avoid SSR issues
const ReactPlayer = dynamic(() => import('react-player/youtube'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
      <div className="text-white">Loading YouTube player...</div>
    </div>
  )
});

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
    // setAnalysisResults,
    // setVideoTitle
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
  } = useAudioPlayer();

  // Define detector types
  type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
  type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';


  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>('beat-transformer');
  const [chordDetector, setChordDetector] = useState<ChordDetectorType>('chord-cnn-lstm');

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

  // Debug effects removed - empty useEffect hooks

  // Check for cached enharmonic correction data when analysis results are loaded
  useEffect(() => {
    const checkCachedEnharmonicData = async () => {
      if (analysisResults?.chords && analysisResults.chords.length > 0 && !chordCorrections) {
        try {
          const cachedTranscription = await getTranscription(videoId, beatDetector, chordDetector);
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
      setHasAutoEnabledCorrections(false); // Reset auto-enable flag for new video
      setSequenceCorrections(null); // Reset sequence corrections for new video

      // Load video info asynchronously (non-blocking)
      loadVideoInfo();
      extractAudioFromService();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); // Only re-run when videoId changes

  // Debug effect removed - empty useEffect hook

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
  }, [videoId, params?.videoId, lyrics]); // Re-run when videoId changes or lyrics state changes


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

    // Log audio duration availability for debugging
    console.log(`🎵 ANALYSIS START: audioDuration=${duration ? duration.toFixed(1) + 's' : 'not available'}, audioUrl=${audioProcessingState.audioUrl ? 'available' : 'missing'}`);

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

  // Function to fetch lyrics using Genius and LRClib APIs
  const transcribeLyrics = async () => {
    if (!videoTitle) {
      setLyricsError('Video title not available for lyrics search');
      return;
    }

    setIsTranscribingLyrics(true);
    setLyricsError(null);

    try {
      // First, check for cached lyrics
      console.log('Checking for cached lyrics...');
      try {
        const cacheResponse = await fetch('/api/transcribe-lyrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId: videoId,
            checkCacheOnly: true
          }),
        });

        if (cacheResponse.ok) {
          const cacheData = await cacheResponse.json();
          if (cacheData.success && cacheData.lyrics && cacheData.lyrics.lines && cacheData.lyrics.lines.length > 0) {
            console.log(`Found ${cacheData.lyrics.lines.length} lines of cached lyrics`);
            setLyrics(cacheData.lyrics);
            setShowLyrics(true);
            setActiveTab('lyricsChords');
            setIsTranscribingLyrics(false);
            return; // Exit early with cached lyrics
          }
        }
      } catch {
        // No cached lyrics found, proceeding with external search
      }

      // Parse video title to extract artist and song title
      const { parseVideoTitle } = await import('@/services/lrclibService');
      const parsedTitle = parseVideoTitle(videoTitle);

      console.log('Searching for lyrics:', parsedTitle);

      let lyricsFound = false;

      // Try LRClib first for synchronized lyrics
      if (parsedTitle.artist && parsedTitle.title) {
        try {
          const lrclibResponse = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app'}/api/lrclib-lyrics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              artist: parsedTitle.artist,
              title: parsedTitle.title,
              duration: duration || undefined
            }),
          });

          if (lrclibResponse.ok) {
            const lrclibData = await lrclibResponse.json();
            if (lrclibData.success && lrclibData.lyrics) {
              // Parse LRC format lyrics if available
              if (lrclibData.lyrics.includes('[')) {
                // This is LRC format with timestamps
                const lines = lrclibData.lyrics.split('\n').filter((line: string) => line.trim());
                const processedLines = lines.map((line: string, index: number) => {
                  const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)/);
                  if (match) {
                    const minutes = parseInt(match[1]);
                    const seconds = parseInt(match[2]);
                    const centiseconds = parseInt(match[3]);
                    const time = minutes * 60 + seconds + centiseconds / 100;
                    return {
                      startTime: time,
                      endTime: time + 3, // Default 3-second duration
                      text: match[4],
                      chords: []
                    };
                  } else {
                    return {
                      startTime: index * 3,
                      endTime: (index + 1) * 3,
                      text: line,
                      chords: []
                    };
                  }
                });

                setLyrics({ lines: processedLines });
                setShowLyrics(true);
                setActiveTab('lyricsChords');
                lyricsFound = true;
                console.log('Found synchronized lyrics from LRClib');
              } else {
                // Plain text lyrics
                const lyricsLines = lrclibData.lyrics.split('\n').filter((line: string) => line.trim());
                const processedLines = lyricsLines.map((text: string, index: number) => ({
                  startTime: index * 3,
                  endTime: (index + 1) * 3,
                  text: text.trim(),
                  chords: []
                }));

                setLyrics({ lines: processedLines });
                setShowLyrics(true);
                setActiveTab('lyricsChords');
                lyricsFound = true;
                console.log('Found plain lyrics from LRClib');
              }
            }
          }
        } catch (lrclibError) {
          console.warn('LRClib search failed:', lrclibError);
        }
      }

      // If LRClib didn't work, try Genius
      if (!lyricsFound) {
        try {
          const geniusResponse = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app'}/api/genius-lyrics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              parsedTitle.artist && parsedTitle.title
                ? { artist: parsedTitle.artist, title: parsedTitle.title }
                : { search_query: videoTitle }
            ),
          });

          if (geniusResponse.ok) {
            const geniusData = await geniusResponse.json();
            if (geniusData.success && geniusData.lyrics) {
              // Convert plain text lyrics to lines format
              const lyricsLines = geniusData.lyrics.split('\n').filter((line: string) => line.trim());
              const processedLines = lyricsLines.map((text: string, index: number) => ({
                startTime: index * 3, // Estimate 3 seconds per line
                endTime: (index + 1) * 3,
                text: text.trim(),
                chords: []
              }));

              setLyrics({ lines: processedLines });
              setShowLyrics(true);
              setActiveTab('lyricsChords');
              lyricsFound = true;
              console.log('Found lyrics from Genius');
            }
          }
        } catch (geniusError) {
          console.warn('Genius search failed:', geniusError);
        }
      }

      if (!lyricsFound) {
        setLyricsError('No lyrics found for this song. Try searching manually in the lyrics panel.');
        setLyrics({
          lines: [],
          error: 'No lyrics found for this song'
        });
        setShowLyrics(true);
        setActiveTab('lyricsChords');
      }

    } catch (error: unknown) {
      console.error('Error fetching lyrics:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setLyricsError(errorMessage);
      setLyrics({
        lines: [],
        error: errorMessage
      });
      setShowLyrics(true);
      setActiveTab('lyricsChords');
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
      // Call our API endpoint to extract audio (now routed to Python backend)
      const response = await apiPost('EXTRACT_AUDIO', { videoId, forceRefresh });

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

    // FIXED: Direct state update without override mechanism
    // Set the beat index immediately and record click info for smart animation
    currentBeatIndexRef.current = beatIndex;
    setCurrentBeatIndex(beatIndex);

    // Record click info for smart animation positioning
    setLastClickInfo({
      visualIndex: beatIndex,
      timestamp: timestamp,
      clickTime: Date.now()
    });

    console.log(`🎯 BEAT CLICK: Set currentBeatIndex=${beatIndex}, timestamp=${timestamp.toFixed(3)}s`);
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
  const calculateOptimalShift = useCallback((chords: string[], timeSignature: number, paddingCount: number = 0): number => {
    if (chords.length === 0) {
      console.log('🔄 Optimal shift calculation: No chords available, returning shift 0');
      return 0;
    }

    // console.log('\n=== 🔍 BEAT SHIFT DEBUG ANALYSIS ===');
    // console.log(`📊 Input: ${chords.length} chords, ${timeSignature}/4 time signature`);
    // console.log(`🎵 First 20 chords: [${chords.slice(0, 20).join(', ')}]`);

    // DEBUG: Show the exact chord array being analyzed
    // console.log(`\n🔍 CHORD ARRAY VERIFICATION (first 10):`);
    // chords.slice(0, 10).forEach((chord, i) => {
    //   console.log(`  raw[${i}] = "${chord}"`);
    // });

    let bestShift = 0;
    let maxChordChanges = 0;
    const shiftResults: Array<{shift: number, chordChanges: number, downbeatPositions: number[], chordLabels: string[]}> = [];

    // Analyze chord sequence for optimal shift calculation

    // Test each possible shift value (0 to timeSignature-1)
    // console.log(`\n🔄 TESTING SHIFT OPTIONS:`);
    for (let shift = 0; shift < timeSignature; shift++) {
      // console.log(`\n📊 === SHIFT ${shift} ANALYSIS ===`);
      // console.log(`   This means beat 1 starts at position ${shift} (0-indexed)`);
      // console.log(`   📊 COORDINATE SYSTEM: paddingCount=${paddingCount}, shift=${shift}, totalPadding=${paddingCount + shift}`);
      // console.log(`   📊 MAPPING: raw[i] → visual[${paddingCount + shift} + i] (e.g., raw[0] → visual[${paddingCount + shift}])`);

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

      // Show first few beats with their alignment for this shift
      const debugBeats = Math.min(chords.length, 16); // Show first 16 beats for debugging
      const beatAnalysis: string[] = [];

      // Check each beat position after applying the shift
      let previousDownbeatChord = '';

      for (let i = 0; i < chords.length; i++) {
        const currentChord = chords[i];

        // FIXED: Calculate beat position accounting for TOTAL padding offset
        // The music will start at position (paddingCount + shiftCount) in the final visual grid
        // So we need to calculate what beat position this chord will have in the final grid
        const totalPadding = paddingCount + shift; // Total offset before music starts
        const visualPosition = totalPadding + i; // Position in final visual grid
        const beatInMeasure = (visualPosition % timeSignature) + 1;
        const isDownbeat = beatInMeasure === 1;

        // Collect debug info for first few beats
        if (i < debugBeats) {
          const chordDisplay = currentChord || '""';
          const beatType = isDownbeat ? '🔴DOWNBEAT' : `beat${beatInMeasure}`;
          beatAnalysis.push(`[${i}→${visualPosition}]=${chordDisplay}(${beatType})`);
        }

        // Only check for chord changes on downbeats
        if (isDownbeat) {
          // FIXED: Only count chord changes, not repetitions
          // A chord change occurs when:
          // 1. Current chord is different from the previous downbeat chord
          // 2. Current chord is not empty/N.C.
          // 3. We have seen a previous downbeat chord (not the very first)
          const isValidChord = currentChord && currentChord !== '' &&
                              currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

          const isChordChange = isValidChord &&
                               previousDownbeatChord !== '' && // Must have a previous chord to compare
                               currentChord !== previousDownbeatChord; // Must be different

          // Debug: Log ALL downbeat encounters for debugging
          // if (i < 20) { // Only log first 20 for readability
          //   console.log(`      🎯 DOWNBEAT: pos[${i}] chord="${currentChord}" prev="${previousDownbeatChord}" valid=${isValidChord} change=${isChordChange} visualPos=${visualPosition} beat=${beatInMeasure}`);
          // }

          // OPTION 2: Only count chord changes that START on downbeats
          // This ensures both musical alignment (on downbeats) and visual accuracy (where chords start)
          if (isChordChange) {
            // Check if this chord actually starts on this downbeat position
            const chordStartsHere = i === 0 || chords[i - 1] !== currentChord;

            if (chordStartsHere) {
              // This chord starts on this downbeat - count it!
              chordChangeCount++;
              downbeatPositions.push(i); // Record the downbeat position where chord starts
              chordLabels.push(currentChord);

              // Debug: Log chord changes that start on downbeats
              // if (i < 20) { // Only log first 20 for readability
              //   console.log(`      🎵 CHORD STARTS ON DOWNBEAT: pos[${i}] "${previousDownbeatChord}" -> "${currentChord}" (count: ${chordChangeCount}) visualPos=${visualPosition}`);
              // }
            } else {
              // This chord started earlier and continues on this downbeat - don't count it
              // if (i < 20) { // Only log first 20 for readability
              //   console.log(`      ⏸️  CHORD CONTINUES ON DOWNBEAT: pos[${i}] chord="${currentChord}" (started earlier, not counted)`);
              // }
            }
          } else {
            // Debug: Log when we DON'T count a chord change
            // if (i < 20) { // Only log first 20 for readability
            //   console.log(`      ⏸️  NO CHANGE: pos[${i}] chord="${currentChord}" prev="${previousDownbeatChord}" valid=${isValidChord} change=${isChordChange}`);
            // }
          }

          // FIXED: Update previous downbeat chord for ALL valid chords on downbeats
          // This ensures we track the last chord seen on any downbeat for comparison
          if (isValidChord) {
            previousDownbeatChord = currentChord;
          }
        }
      }

      // Show beat alignment for this shift
      // console.log(`   Beat alignment: ${beatAnalysis.join(' ')}`);

      // DEBUG: Show exact coordinate mapping for first 10 chords
      // console.log(`   🔍 COORDINATE MAPPING (first 10 chords):`);
      // chords.slice(0, 10).forEach((chord, i) => {
      //   const totalPadding = paddingCount + shift;
      //   const visualPosition = totalPadding + i;
      //   const beatInMeasure = (visualPosition % timeSignature) + 1;
      //   const isDownbeat = beatInMeasure === 1;
      //   const marker = isDownbeat ? '🎯' : '  ';
      //   console.log(`     ${marker} raw[${i}] = "${chord}" → visual[${visualPosition}] beat${beatInMeasure} ${isDownbeat ? '(DOWNBEAT)' : ''}`);
      // });

      // Show downbeat positions and chord changes - COMPLETE OUTPUT with visual positions
      // if (downbeatPositions.length > 0) {
      //   console.log(`   🎵 COMPLETE Chord changes on downbeats (${downbeatPositions.length} total):`);

      //   // Show ALL chord changes with both raw and visual positions
      //   const allDownbeatInfo = downbeatPositions.map((pos, idx) => {
      //     // FIXED: Use the same calculation as the actual visual grid construction
      //     // The visual grid is: [shiftCount empty cells] + [paddingCount N.C. cells] + [regular chords]
      //     // So a chord at raw position 'pos' appears at visual position: shiftCount + paddingCount + pos
      //     const visualPos = shift + paddingCount + pos; // CORRECTED: shift + padding + raw position
      //     return `raw[${pos}]→visual[${visualPos}]="${chordLabels[idx]}"`;
      //   });

      //   // Print in chunks of 5 for readability
      //   for (let i = 0; i < allDownbeatInfo.length; i += 5) {
      //     const chunk = allDownbeatInfo.slice(i, i + 5).join(', ');
      //     console.log(`     ${chunk}`);
      //   }
      // } else {
      //   console.log(`   ⏸️  No chord changes found on downbeats`);
      // }

      shiftResults.push({
        shift,
        chordChanges: chordChangeCount,
        downbeatPositions,
        chordLabels
      });

      // console.log(`   ✅ RESULT: ${chordChangeCount} chord changes on downbeats`);

      if (chordChangeCount > maxChordChanges) {
        maxChordChanges = chordChangeCount;
        bestShift = shift;
      }
    }

    // console.log(`\n✅ BEST SHIFT: ${bestShift} (${maxChordChanges} chord changes on downbeats)`);

    // Show summary of all shift results
    // console.log(`\n📊 SHIFT SUMMARY:`);
    // shiftResults.forEach(result => {
    //   const marker = result.shift === bestShift ? '🎯' : '  ';
    //   console.log(`  ${marker} Shift ${result.shift}: ${result.chordChanges} chord changes on downbeats`);
    // });

    // Show final coordinate mapping for the best shift
    // const bestResult = shiftResults.find(r => r.shift === bestShift);
    // if (bestResult && bestResult.downbeatPositions.length > 0) {
    //   console.log(`\n🎯 FINAL COORDINATE MAPPING (Best Shift ${bestShift}):`);
    //   const finalTotalPadding = paddingCount + bestShift;
    //   console.log(`   📊 Formula: raw[i] → visual[${bestShift} + ${paddingCount} + i] = visual[${finalTotalPadding} + i]`);
    //   console.log(`   📊 Examples:`);
    //   bestResult.downbeatPositions.slice(0, 5).forEach((pos, idx) => {
    //     // FIXED: Use the same calculation as the actual visual grid construction
    //     // The visual grid is: [shiftCount empty cells] + [paddingCount N.C. cells] + [regular chords]
    //     const visualPos = bestShift + paddingCount + pos; // CORRECTED: shift + padding + raw position
    //     console.log(`     raw[${pos}] → visual[${visualPos}] = "${bestResult.chordLabels[idx]}" (downbeatPositions[${idx}])`);
    //   });
    // }

    // Show the effect of the best shift on the first few measures
    // console.log(`\n📊 CHORD ALIGNMENT AFTER SHIFT ${bestShift} (first 12 beats):`);
    // chords.slice(0, 12).forEach((chord, index) => {
    //   const originalBeat = (index % timeSignature) + 1;
    //   // FIXED: Use same formula as frontend - positive shift moves grid forward
    //   const shiftedBeat = ((index + bestShift) % timeSignature) + 1;
    //   const isDownbeat = shiftedBeat === 1;
    //   const marker = isDownbeat ? '🎯' : '  ';
    //   const isChordChange = index === 0 || chords[index] !== chords[index - 1];
    //   const changeMarker = isChordChange ? '🎵' : '  ';
    //   console.log(`  ${marker}${changeMarker} Beat[${index.toString().padStart(2)}]: "${chord.padEnd(8)}" beat ${originalBeat} -> ${shiftedBeat} ${isDownbeat && isChordChange ? '← DOWNBEAT CHANGE!' : ''}`);
    // });

    return bestShift;
  }, []);

  const calculatePaddingAndShift = useCallback((firstDetectedBeatTime: number, bpm: number, timeSignature: number, chords: string[] = []) => {
    console.log(`🔧 PADDING CALCULATION: firstDetectedBeatTime=${firstDetectedBeatTime.toFixed(3)}s, bpm=${bpm}, timeSignature=${timeSignature}`);
    console.log(`🔧 CHORD DATA (first 15): [${chords.slice(0, 15).map((c, i) => `${i}:"${c}"`).join(', ')}]`);
    console.log(`🔧 CHORD DATA ANALYSIS:`, {
      totalChords: chords.length,
      emptyStrings: chords.filter(c => c === '').length,
      ncChords: chords.filter(c => c === 'N/C').length,
      firstNonEmpty: chords.findIndex(c => c !== '' && c !== 'N/C'),
      firstTenChords: chords.slice(0, 10)
    });



    // ANALYSIS: The backend chord data contains only N/C values, no empty strings
    // The greyed-out cells are created by ChordGrid's shift logic when hasPadding=false
    // We need to detect when the first few N/C chords represent the visual padding period

    // Count leading N/C chords that occur before the first actual chord
    const leadingNCChords = chords.findIndex(chord => chord !== 'N/C');
    const hasLeadingNCChords = leadingNCChords > 0;

    console.log(`🔧 PADDING DETECTION (CORRECTED):`);
    console.log(`  - Leading N/C chords before first real chord:`, leadingNCChords);
    console.log(`  - Has leading N/C chords:`, hasLeadingNCChords);
    console.log(`  - First real chord at index:`, leadingNCChords);
    console.log(`  - First real chord value:`, leadingNCChords >= 0 ? chords[leadingNCChords] : 'none');

    // CRITICAL INSIGHT: ChordGrid's calculateOptimalShift would add 3 empty cells for this song
    // We need to match that behavior by converting the first 3 N/C chords to empty strings
    // and setting the appropriate padding/shift counts

    // SPECIAL CASE: If we have leading N/C chords, we need to account for ChordGrid's shift behavior
    if (hasLeadingNCChords && leadingNCChords >= 3) {
      console.log(`✅ DETECTED LEADING N/C CHORDS: ${leadingNCChords} N/C chords before first real chord`);
      console.log(`🔧 SOLUTION: Let ChordGrid handle shift logic, but ensure animation skips shift cells`);

      // Let ChordGrid add its own shift cells (hasPadding=false)
      // The animation logic will skip these shift cells using shiftCount
      return {
        paddingCount: 0,  // No backend padding needed
        shiftCount: 3,    // Tell animation to skip first 3 cells (ChordGrid will add these)
        totalPaddingCount: 3
      };
    } else if (firstDetectedBeatTime <= 0.05) {
      console.log('❌ First beat starts very close to 0.0s and no significant leading N/C chords, no padding needed');
      return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STEP 1: Calculate padding based on chord content or timing
    let debugPaddingCount = 0;

    if (hasLeadingNCChords) {
      // Use chord-based padding detection (N/C chords that represent the padding period)
      debugPaddingCount = leadingNCChords;
      console.log(`🔧 CHORD-BASED PADDING: Using ${debugPaddingCount} padding beats from leading N/C chords`);
    } else {
      // Use timing-based padding calculation
      // Formula: Math.floor((first_detected_beat_time / 60) * bpm)
      const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);

      // Enhanced padding calculation: if the gap is significant (>20% of a beat), add 1 beat of padding
      // IMPROVED: Round beat duration to 3 decimal places for consistent timing calculations
      const beatDuration = Math.round((60 / bpm) * 1000) / 1000; // Duration of one beat in seconds (rounded to ms precision)
      const gapRatio = firstDetectedBeatTime / beatDuration;
      const paddingCount = rawPaddingCount === 0 && gapRatio > 0.2 ? 1 : rawPaddingCount;

      console.log(`🔧 TIMING-BASED PADDING CALC: rawPaddingCount=${rawPaddingCount}, beatDuration=${beatDuration.toFixed(3)}s, gapRatio=${gapRatio.toFixed(3)}, finalPaddingCount=${paddingCount}`);

      // DEBUG: Force padding for testing if we have a reasonable first beat time
      debugPaddingCount = paddingCount;
      if (paddingCount === 0 && firstDetectedBeatTime > 0.1) {
        debugPaddingCount = Math.max(1, Math.floor(gapRatio)); // Force at least 1 padding beat
        console.log(`🔧 DEBUG: Forcing padding count from ${paddingCount} to ${debugPaddingCount} for testing`);
      }
    }

    // More reasonable limit: allow up to 4 measures of padding for long intros
    if (debugPaddingCount <= 0 || debugPaddingCount >= timeSignature * 4) {
      // console.log(`❌ Padding rejected: paddingCount=${debugPaddingCount}, limit=${timeSignature * 4}`);
      return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STEP 2: Calculate optimal shift using chord change analysis
    let shiftCount = 0;
    // console.log(`\n🔄 SHIFT CALCULATION:`);
    if (chords.length > 0) {
      // console.log(`  Using chord-based shift calculation (${chords.length} chords available)`);
      // Use optimal chord-based shift calculation
      shiftCount = calculateOptimalShift(chords, timeSignature, debugPaddingCount);
    } else {
      // console.log(`  Using position-based shift calculation (no chords available)`);
      // Fallback to position-based calculation if no chords available
      const beatPositionInMeasure = ((debugPaddingCount) % timeSignature) + 1;
      const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
      shiftCount = finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
    }

    const totalPaddingCount = debugPaddingCount + shiftCount;

    // console.log(`✅ FINAL PADDING RESULT: paddingCount=${debugPaddingCount}, shiftCount=${shiftCount}, totalPaddingCount=${totalPaddingCount}`);

    return { paddingCount: debugPaddingCount, shiftCount, totalPaddingCount };
  }, [calculateOptimalShift]);

  // COMPREHENSIVE PADDING & SHIFTING: Get chord grid data with padding and shifting
  const getChordGridData = useCallback(() => {
    if (!analysisResults || !analysisResults.synchronizedChords) {
      return { chords: [], beats: [], hasPadding: false, paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
    }

    // STAGE 4: Log synchronized chords before visual processing

    // Use first detected beat time for padding calculation
    // FIXED: Handle both beat formats (objects with .time vs direct numbers)
    const firstDetectedBeat = analysisResults.beats.length > 0
      ? (typeof analysisResults.beats[0] === 'object' ? analysisResults.beats[0].time : analysisResults.beats[0])
      : 0;
    const bpm = analysisResults.beatDetectionResult?.bpm || 120;
    const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;

    // Extract chord data for optimal shift calculation
    const chordData = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);

    // Use first detected beat time for comprehensive padding and shifting calculation
    const { paddingCount, shiftCount } = calculatePaddingAndShift(firstDetectedBeat, bpm, timeSignature, chordData);



    // console.log(`\n🔧 CHORD GRID DATA CALCULATION:`);
    // console.log(`  paddingCount: ${paddingCount}, shiftCount: ${shiftCount}`);
    // console.log(`  firstDetectedBeat: ${firstDetectedBeat.toFixed(3)}s, bpm: ${bpm}, timeSignature: ${timeSignature}`);
    // console.log(`  Will use comprehensive strategy: ${paddingCount > 0 || shiftCount > 0}`);

    // // DEBUG: Show what values will be returned to ChordGrid
    // console.log(`\n🎯 VALUES THAT WILL BE PASSED TO CHORDGRID:`);
    // console.log(`  Final paddingCount: ${paddingCount}`);
    // console.log(`  Final shiftCount: ${shiftCount}`);

    // Apply comprehensive strategy if we have either padding OR shifting
    if (paddingCount > 0 || shiftCount > 0) {

      // Add only padding N.C. chords (based on first detected beat time)
      // Shifting will be handled in the frontend as greyed-out cells
      const paddingChords = Array(paddingCount).fill('N.C.');
      // FIXED: Create padding timestamps that start from 0.0s and are evenly distributed to first detected beat
      const paddingTimestamps = Array(paddingCount).fill(0).map((_, i) => {
        const paddingDuration = firstDetectedBeat;
        const paddingBeatDuration = paddingDuration / paddingCount;
        const timestamp = i * paddingBeatDuration; // Timestamps from 0.0s to (paddingCount-1) * paddingBeatDuration
        // console.log(`🔧 PADDING TIMESTAMP[${i}]: ${timestamp.toFixed(3)}s (duration=${paddingBeatDuration.toFixed(3)}s)`);
        return timestamp;
      });

      // Combine padding with regular chords (no shift N.C. labels added here)
      // Extract original chord data without any corrections (corrections will be applied at display time)
      const regularChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
      // FIXED: Pass actual timestamps instead of beat indices for click navigation
      const regularBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
        const beatIndex = item.beatIndex;
        if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
          // FIXED: Handle both beat formats (objects with .time vs direct numbers)
          const beat = analysisResults.beats[beatIndex];
          return typeof beat === 'object' ? beat.time : beat; // Get actual timestamp
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
        // FIXED: Handle both beat formats (objects with .time vs direct numbers)
        const beat = analysisResults.beats[index];
        const originalTimestamp = beat ? (typeof beat === 'object' ? beat.time : beat) : 0;

        // For comparison, get what the shifted system thinks this should be
        // const shiftedTimestamp = analysisResults.beats[item.beatIndex]?.time || 0;

        return {
          chord: item.chord,
          timestamp: originalTimestamp, // Use original timestamp from beat detection
          visualIndex: -1, // Will be populated below
          audioIndex: index // FIXED: Store the original audio index for accurate beat click handling
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

      const chordCnnLstmResult = {
        chords: finalChords, // Add shift cells as empty strings
        beats: correctedBeats, // FIXED: Use corrected beats with original timestamps
        hasPadding: true,
        paddingCount: paddingCount,
        shiftCount: shiftCount,
        totalPaddingCount: paddingCount + shiftCount, // Total includes both padding and shift
        originalAudioMapping: originalAudioMapping, // NEW: Original timestamp-to-chord mapping for audio sync
        animationMapping: animationMapping // NEW: Maps original timestamps to label positions for animation
      };

      console.log(`🔧 CHORD-CNN-LSTM FINAL RESULT STRUCTURE:`, {
        modelType: 'Chord-CNN-LSTM',
        chordsLength: chordCnnLstmResult.chords.length,
        beatsLength: chordCnnLstmResult.beats.length,
        hasPadding: chordCnnLstmResult.hasPadding,
        paddingCount: chordCnnLstmResult.paddingCount,
        shiftCount: chordCnnLstmResult.shiftCount,
        totalPaddingCount: chordCnnLstmResult.totalPaddingCount,
        originalAudioMappingLength: chordCnnLstmResult.originalAudioMapping.length,
        firstFewChords: chordCnnLstmResult.chords.slice(0, 10),
        firstFewBeats: chordCnnLstmResult.beats.slice(0, 10).map(b => b === null ? 'null' : b.toFixed(3))
      });

      return chordCnnLstmResult;
    }

    // FIXED: BTC models should also use the comprehensive strategy for proper audio-visual sync
    // Apply the same shifting strategy as Chord-CNN-LSTM models for consistent behavior
    const btcChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
    const btcBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
      const beatIndex = item.beatIndex;
      if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        // FIXED: Handle both beat formats (objects with .time vs direct numbers)
        const beat = analysisResults.beats[beatIndex];
        return typeof beat === 'object' ? beat.time : beat;
      }
      return 0;
    });

    console.log(`🔧 BTC BEAT EXTRACTION DEBUG:`, {
      synchronizedChordsLength: analysisResults.synchronizedChords.length,
      beatsArrayLength: analysisResults.beats.length,
      firstFewSynchronizedChords: analysisResults.synchronizedChords.slice(0, 10).map(item => ({
        chord: item.chord,
        beatIndex: item.beatIndex,
        beatNum: item.beatNum
      })),
      firstFewBeats: analysisResults.beats.slice(0, 10).map(beat =>
        typeof beat === 'object' ? beat.time : beat
      ),
      extractedBtcBeats: btcBeats.slice(0, 10),
      extractedBtcChords: btcChords.slice(0, 10)
    });

    // CRITICAL FIX: Apply the same comprehensive strategy to BTC models
    // Calculate padding and shift for BTC models using the same logic as Chord-CNN-LSTM

    // FIXED: Find the first MUSICAL chord (not "N/C") for proper shifting calculation
    let btcFirstDetectedBeatTime = 0;
    for (let i = 0; i < btcChords.length; i++) {
      const chord = btcChords[i];
      // Skip "N/C" (no chord) and empty chords to find first musical content
      if (chord && chord !== 'N/C' && chord !== '' && chord !== 'undefined') {
        btcFirstDetectedBeatTime = btcBeats[i] || 0;
        console.log(`🔧 BTC FIRST MUSICAL CHORD FOUND:`, {
          chordIndex: i,
          chord: chord,
          beatTime: btcFirstDetectedBeatTime.toFixed(3),
          previousChords: btcChords.slice(0, i)
        });
        break;
      }
    }

    const btcBpm = analysisResults?.beatDetectionResult?.bpm || 120;
    const btcTimeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;

    console.log(`🔧 BTC SHIFTING CALCULATION INPUT:`, {
      btcFirstDetectedBeatTime: btcFirstDetectedBeatTime.toFixed(3),
      btcBpm,
      btcTimeSignature,
      btcChordsLength: btcChords.length,
      btcChordsFirst10: btcChords.slice(0, 10)
    });

    const btcPaddingAndShift = calculatePaddingAndShift(btcFirstDetectedBeatTime, btcBpm, btcTimeSignature, btcChords);
    const btcPaddingCount = btcPaddingAndShift.paddingCount;
    const btcShiftCount = btcPaddingAndShift.shiftCount;

    console.log(`🔧 BTC SHIFTING CALCULATION RESULT:`, {
      btcPaddingCount,
      btcShiftCount,
      totalPaddingCount: btcPaddingCount + btcShiftCount,
      btcPaddingAndShift
    });

    // Apply padding and shifting to BTC model data
    const btcPaddingCells = Array(btcPaddingCount).fill('');
    const btcShiftCells = Array(btcShiftCount).fill('');
    const btcFinalChords = [...btcShiftCells, ...btcPaddingCells, ...btcChords];

    // Create beat timestamps for padding and shift cells
    const btcPaddingBeats = btcPaddingCells.map((_, index) => {
      const beatDuration = 60 / btcBpm;
      return index * beatDuration;
    });
    const btcShiftBeats = Array(btcShiftCount).fill(null); // Shift cells have null timestamps
    const btcFinalBeats = [...btcShiftBeats, ...btcPaddingBeats, ...btcBeats];

    console.log(`🔧 BTC VISUAL GRID CONSTRUCTION:`, {
      btcShiftCells: btcShiftCells.length,
      btcPaddingCells: btcPaddingCells.length,
      originalBtcChords: btcChords.length,
      btcFinalChordsLength: btcFinalChords.length,
      btcFinalChordsFirst15: btcFinalChords.slice(0, 15),
      btcFinalBeatsLength: btcFinalBeats.length,
      btcFinalBeatsFirst15: btcFinalBeats.slice(0, 15).map(b => b === null ? 'null' : b.toFixed(3))
    });

    // Create originalAudioMapping for BTC models with proper shifting
    const btcOriginalAudioMapping = btcChords.map((chord, index) => {
      const visualIndex = btcShiftCount + btcPaddingCount + index; // Account for shift and padding
      return {
        chord: chord,
        timestamp: btcBeats[index] || 0,
        visualIndex: visualIndex, // FIXED: Proper visual index accounting for shift and padding
        audioIndex: index // Original audio index
      };
    });

    console.log(`🔧 BTC ORIGINAL AUDIO MAPPING:`, {
      btcOriginalAudioMappingLength: btcOriginalAudioMapping.length,
      btcOriginalAudioMappingFirst10: btcOriginalAudioMapping.slice(0, 10).map(item => ({
        chord: item.chord,
        timestamp: item.timestamp.toFixed(3),
        visualIndex: item.visualIndex,
        audioIndex: item.audioIndex
      })),
      mappingFormula: `visualIndex = shiftCount(${btcShiftCount}) + paddingCount(${btcPaddingCount}) + audioIndex`
    });

    // Apply original timestamps to visual grid (same as Chord-CNN-LSTM)
    const btcCorrectedBeats = [...btcFinalBeats];
    btcOriginalAudioMapping.forEach((audioItem) => {
      const visualIndex = audioItem.visualIndex;
      const originalTimestamp = audioItem.timestamp;
      if (visualIndex >= 0 && visualIndex < btcCorrectedBeats.length) {
        btcCorrectedBeats[visualIndex] = originalTimestamp;
      }
    });

    const btcResult = {
      chords: btcFinalChords,
      beats: btcCorrectedBeats,
      hasPadding: btcPaddingCount > 0,
      paddingCount: btcPaddingCount,
      shiftCount: btcShiftCount,
      totalPaddingCount: btcPaddingCount + btcShiftCount,
      originalAudioMapping: btcOriginalAudioMapping // FIXED: Proper originalAudioMapping with shifting
    };

    console.log(`🔧 BTC FINAL RESULT STRUCTURE:`, {
      modelType: 'BTC',
      chordsLength: btcResult.chords.length,
      beatsLength: btcResult.beats.length,
      hasPadding: btcResult.hasPadding,
      paddingCount: btcResult.paddingCount,
      shiftCount: btcResult.shiftCount,
      totalPaddingCount: btcResult.totalPaddingCount,
      originalAudioMappingLength: btcResult.originalAudioMapping.length,
      firstFewChords: btcResult.chords.slice(0, 10),
      firstFewBeats: btcResult.beats.slice(0, 10).map(b => b === null ? 'null' : b.toFixed(3))
    });

    return btcResult;
  }, [analysisResults, calculatePaddingAndShift]);

  const chordGridData = useMemo(() => getChordGridData(), [getChordGridData]);

  // DEBUG: Log analysis results state
  // useEffect(() => {
  //   console.log(`📊 ANALYSIS STATE: analysisResults=${!!analysisResults}, beats=${analysisResults?.beats?.length || 0}, chords=${analysisResults?.chords?.length || 0}, synchronized=${analysisResults?.synchronizedChords?.length || 0}`);
  //   if (analysisResults?.beats) {
  //     console.log(`🥁 BEAT DATA SAMPLE:`, analysisResults.beats.slice(0, 10).map(b => b.time));
  //     console.log(`🎵 BEAT DETECTION RESULT:`, analysisResults.beatDetectionResult);
  //   }
  // }, [analysisResults]);

  // DEBUG: Log audio state
  // useEffect(() => {
  //   const audioElement = audioRef.current;
  //   if (audioElement) {
  //     console.log(`🎵 AUDIO STATE: paused=${audioElement.paused}, currentTime=${audioElement.currentTime.toFixed(3)}s, duration=${audioElement.duration?.toFixed(3) || 'unknown'}s, isPlaying=${isPlaying}`);
  //   }
  // }, [isPlaying, currentTime, audioRef]);



  // Update current time and check for current beat
  useEffect(() => {
    if (!audioRef.current || !isPlaying || !analysisResults) {
      // console.log(`🔄 ANIMATION BLOCKED: audioRef=${!!audioRef.current}, isPlaying=${isPlaying}, analysisResults=${!!analysisResults}`);
      return;
    }

    // Smooth animation for beat alignment (50ms = 20Hz update rate)
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);

        // DEBUG: Log animation interval execution every 5 seconds
        // if (Math.floor(time) % 5 === 0 && Math.floor(time * 10) % 10 === 0) {
        //   console.log(`🔄 ANIMATION INTERVAL: time=${time.toFixed(3)}s, isPlaying=${isPlaying}, chordGridData exists=${!!chordGridData}, currentBeatIndex=${currentBeatIndexRef.current}, manualOverride=${manualBeatIndexOverride}`);
        // }

        // Find the current beat based on chord grid data (includes pickup beats)
        // This ensures consistency between beat tracking and chord display
        if (chordGridData && chordGridData.chords.length > 0) {

          // SMART CLICK HANDLING: Use click as starting point, then allow natural progression
          if (lastClickInfo) {
            const timeSinceClick = Date.now() - lastClickInfo.clickTime;
            const timeDifference = Math.abs(time - lastClickInfo.timestamp);

            // PHASE 1: Initial positioning (first 200ms after click)
            if (timeSinceClick < 200 && timeDifference < 1.0) {
              currentBeatIndexRef.current = lastClickInfo.visualIndex;
              setCurrentBeatIndex(lastClickInfo.visualIndex);

              return; // Use click position for initial positioning only
            }

            // PHASE 2: Natural progression with click awareness (200ms - 4000ms)
            if (timeSinceClick < 4000) {
              // Allow natural progression but prevent backward jumps from click position
              // Continue with automatic calculation but apply minimum constraint
              // Don't return here - let automatic calculation run with constraint
            } else {
              // Clear old click info after 4 seconds
              setLastClickInfo(null);
            }
          }

          let currentBeat = -1;

          const beatTimeRangeStart = analysisResults?.beatDetectionResult?.beat_time_range_start || 0;
          // Handle both old format (objects with .time) and new format (direct numbers)
          // FIXED: Find first non-null beat instead of just beats[0]
          let firstDetectedBeat = beatTimeRangeStart;
          if (analysisResults.beats.length > 0) {
            for (const beat of analysisResults.beats) {
              const beatTime = typeof beat === 'object' ? beat?.time : beat;
              if (beatTime !== null && beatTime !== undefined) {
                firstDetectedBeat = beatTime;
                break;
              }
            }
          }

          // FIXED: Use first detected beat time for animation timing to align with actual beat model output
          // This accounts for the offset between chord model start (0.0s) and first beat detection (e.g., 0.534s)
          const animationRangeStart = firstDetectedBeat;



          // console.log(`🎬 BEAT DETECTION: time=${time.toFixed(3)}s, animationRangeStart=${animationRangeStart.toFixed(3)}s, beatsLength=${analysisResults.beats.length}`);

          // UNIFIED ANIMATION LOGIC: Use the same logic for all models (BTC and Chord-CNN-LSTM)
          // This ensures consistent behavior across all model types

          // Debug: Log the timing alignment fix (only once per 10 seconds to avoid spam)
          // if (Math.floor(time) % 10 === 0 && Math.floor(time * 10) % 10 === 0) {
          //   const bpm = analysisResults?.beatDetectionResult?.bpm || 120;
          //   const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
          //   console.log(`🎬 TIMING ALIGNMENT: beatTimeRangeStart=${beatTimeRangeStart.toFixed(3)}s, firstDetectedBeat=${firstDetectedBeat.toFixed(3)}s, offset=${(firstDetectedBeat - beatTimeRangeStart).toFixed(3)}s, beatDuration=${beatDuration.toFixed(3)}s@${bpm}BPM`);
          // }
          // if (Math.floor(time) % 10 === 0 && Math.floor(time * 10) % 10 === 0) {
          //   const bpm = analysisResults?.beatDetectionResult?.bpm || 120;
          //   const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
          //   console.log(`🎬 TIMING ALIGNMENT: beatTimeRangeStart=${beatTimeRangeStart.toFixed(3)}s, firstDetectedBeat=${firstDetectedBeat.toFixed(3)}s, offset=${(firstDetectedBeat - beatTimeRangeStart).toFixed(3)}s, beatDuration=${beatDuration.toFixed(3)}s@${bpm}BPM`);
          // }

          if (time <= animationRangeStart) {
            // PHASE 1: Pre-model context (0.0s to first detected beat)
            // Only animate if there are actual padding cells to animate through
            const paddingCount = chordGridData.paddingCount || 0;
            const shiftCount = chordGridData.shiftCount || 0;

            // DEBUG: Log padding phase execution
            // console.log(`🎬 PADDING PHASE EXECUTING: time=${time.toFixed(3)}s, animationRangeStart=${animationRangeStart.toFixed(3)}s, paddingCount=${paddingCount}, shiftCount=${shiftCount}`);
            // console.log(`🎬 PADDING PHASE ACTIVE: Should be active from 0.0s to ${animationRangeStart.toFixed(3)}s`);

            if (paddingCount > 0) {
              // FIXED: Use actual timestamps from the chord grid instead of recalculating
              // Find the padding cell that should be highlighted based on current time
              let bestPaddingIndex = -1;
              let bestTimeDifference = Infinity;

              // Search through padding cells (shift cells + padding cells)
              for (let i = 0; i < paddingCount; i++) {
                const rawBeat = shiftCount + i;
                const cellTimestamp = chordGridData.beats[rawBeat];

                if (cellTimestamp !== null && cellTimestamp !== undefined) {
                  const timeDifference = Math.abs(time - cellTimestamp);

                  // Find the cell with timestamp closest to current time
                  if (timeDifference < bestTimeDifference) {
                    bestTimeDifference = timeDifference;
                    bestPaddingIndex = i;
                  }

                  // Also check if current time falls within this cell's range
                  const nextRawBeat = shiftCount + i + 1;
                  let nextCellTime = cellTimestamp + (animationRangeStart / paddingCount); // Default estimate

                  if (nextRawBeat < chordGridData.beats.length && chordGridData.beats[nextRawBeat] !== null) {
                    nextCellTime = chordGridData.beats[nextRawBeat];
                  }

                  // If current time falls within this cell's range, prefer this
                  if (time >= cellTimestamp && time < nextCellTime) {
                    bestPaddingIndex = i;
                    bestTimeDifference = timeDifference;
                    // console.log(`🎯 PADDING RANGE MATCH: time=${time.toFixed(3)}s in range [${cellTimestamp.toFixed(3)}s, ${nextCellTime.toFixed(3)}s) -> cell ${i}`);
                    break;
                  }
                }
              }

              // console.log(`🎬 PADDING SEARCH: time=${time.toFixed(3)}s, bestPaddingIndex=${bestPaddingIndex}, bestTimeDifference=${bestTimeDifference.toFixed(3)}s`);

              if (bestPaddingIndex !== -1) {
                const rawBeat = shiftCount + bestPaddingIndex;
                // const beatTimestamp = chordGridData.beats[rawBeat];

                // console.log(`🎬 PADDING FOUND: rawBeat=${rawBeat}, timestamp=${beatTimestamp?.toFixed(3)}s`);

                // Verify this is a valid padding cell
                if (rawBeat >= shiftCount && rawBeat < (shiftCount + paddingCount)) {
                  currentBeat = rawBeat;
                  // if (currentBeat !== currentBeatIndex) {
                  //   console.log(`✅ PADDING HIGHLIGHT: Setting currentBeat=${rawBeat}, timestamp=${beatTimestamp?.toFixed(3)}s`);
                  // }
                } else {
                  currentBeat = -1;
                  // console.log(`❌ PADDING INVALID: rawBeat=${rawBeat} out of range [${shiftCount}, ${shiftCount + paddingCount})`);
                }
              } else {
                currentBeat = -1;
                // console.log(`❌ PADDING NOT FOUND: No valid padding cell found for time=${time.toFixed(3)}s`);
              }
            } else {
              // ENHANCED: Even without padding, provide visual feedback using estimated tempo
              // This ensures users see progress indication from the very start of playback
              const estimatedBPM = analysisResults?.beatDetectionResult?.bpm || 120;
              const estimatedBeatDuration = 60 / estimatedBPM; // seconds per beat

              // Calculate which virtual beat we should be on
              const rawVirtualBeatIndex = Math.floor(time / estimatedBeatDuration);

              // FIXED: Add shift count to ensure animation starts at first valid musical content
              const shiftCount = chordGridData.shiftCount || 0;
              const virtualBeatIndex = rawVirtualBeatIndex + shiftCount;



              // FIXED: Only use valid musical content cells for early animation, never shift cells
              if (chordGridData && chordGridData.chords.length > 0) {
                // Skip shift cells entirely - they should never be highlighted
                // Only consider cells that contain actual musical content (padding or regular chords)
                const firstValidCellIndex = chordGridData.shiftCount || 0; // First cell after shift cells

                if (virtualBeatIndex >= firstValidCellIndex) {
                  // Calculate the target cell, but ensure it's not a shift cell
                  let targetIndex = virtualBeatIndex;



                  // If the calculated index falls in shift cell range, move to first valid cell
                  if (targetIndex < firstValidCellIndex) {
                    targetIndex = firstValidCellIndex;
                  }

                  // Ensure we don't exceed the grid bounds
                  const maxIndex = chordGridData.chords.length - 1;
                  const clampedIndex = Math.min(targetIndex, maxIndex);

                  // Only set currentBeat if the target cell is valid (not a shift cell)
                  if (clampedIndex >= firstValidCellIndex) {
                    currentBeat = clampedIndex;
                  } else {
                    currentBeat = -1;
                  }
                } else {
                  currentBeat = -1;
                }
              } else {
                currentBeat = -1;
              }
            }

            // PADDING PHASE: Apply shift cell blocking before setting the beat
            if (currentBeat !== -1) {
              const shiftCount = chordGridData.shiftCount || 0;
              const chord = chordGridData.chords[currentBeat] || '';
              const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

              // CRITICAL: Block shift cells in pre-beat phase too (check shift cells first)
              if (currentBeat < shiftCount) {
                currentBeat = -1;
              }
              // Then check for empty/undefined cells (but NOT N.C. - that's valid musical content)
              else if (isEmptyCell) {
                currentBeat = -1;
              }
            }

            // PADDING PHASE: Apply the result immediately
            // BLOCKING LOGIC FOR PADDING PHASE PATH
            const chord = chordGridData.chords[currentBeat] || '';
            const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

            // Block shift cells and empty cells (but NOT N.C. - that's valid musical content)
            if (currentBeat < shiftCount) {
              currentBeat = -1; // Block shift cell highlighting
            } else if (isEmptyCell) {
              currentBeat = -1; // Block empty cell highlighting
            }

            // Apply click-aware minimum constraint for PADDING PHASE too
            let finalBeatIndex = currentBeat;
            if (lastClickInfo && currentBeat !== -1) {
              const timeSinceClick = Date.now() - lastClickInfo.clickTime;
              if (timeSinceClick >= 200 && timeSinceClick < 4000) {
                const minAllowedBeat = lastClickInfo.visualIndex;
                if (currentBeat < minAllowedBeat) {
                  finalBeatIndex = minAllowedBeat;
                }
              }
            }

            // if (finalBeatIndex !== currentBeatIndex) {
            //   console.log(`🎯 PADDING PHASE: setCurrentBeatIndex(${finalBeatIndex})`);
            // }
            currentBeatIndexRef.current = finalBeatIndex;
            setCurrentBeatIndex(finalBeatIndex);
          } else {
            // PHASE 2: Model beats (first detected beat onwards)
            // Use ChordGrid's beat array for consistency with click handling

            // FIXED: Use original audio mapping for accurate audio-to-visual sync
            // Instead of searching through shifted visual grid, use the preserved original timestamp mappings

            let bestVisualIndex = -1;
            let bestTimeDifference = Infinity;

            // Type guard for chord grid data with original audio mapping
            interface ChordGridDataWithMapping {
              originalAudioMapping: Array<{
                chord: string;
                timestamp: number;
                visualIndex: number;
                audioIndex: number;
              }>;
              chords: (string | null)[];
              beats: (number | null)[];
              hasPadding: boolean;
              paddingCount: number;
              shiftCount: number;
            }

            // Check if we have original audio mapping (comprehensive strategy)
            const hasOriginalAudioMapping = (data: unknown): data is ChordGridDataWithMapping => {
              return typeof data === 'object' &&
                     data !== null &&
                     'originalAudioMapping' in data &&
                     Array.isArray((data as ChordGridDataWithMapping).originalAudioMapping) &&
                     (data as ChordGridDataWithMapping).originalAudioMapping.length > 0;
            };

            if (hasOriginalAudioMapping(chordGridData)) {

              console.log(`🎬 ANIMATION MAPPING: Using originalAudioMapping path`, {
                time: time.toFixed(3),
                originalAudioMappingLength: chordGridData.originalAudioMapping.length,
                modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                chordGridDataStructure: {
                  chordsLength: chordGridData.chords.length,
                  beatsLength: chordGridData.beats.length,
                  hasPadding: chordGridData.hasPadding,
                  paddingCount: chordGridData.paddingCount,
                  shiftCount: chordGridData.shiftCount
                }
              });

              // SIMPLIFIED ADAPTIVE SYNC: Calculate speed adjustment once for first segment, use globally
              // Use synchronized timing for chord grid
              const syncedTimestamp = timingSyncService.getSyncedTimestamp(time, 'chords');
              const adjustedTime = syncedTimestamp.syncedTime;
              const animationBpm = analysisResults?.beatDetectionResult?.bpm || 120;
              const originalBeatDuration = Math.round((60 / animationBpm) * 1000) / 1000;

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

              // IMPROVED: Use forward progression logic instead of closest timestamp
              // This prevents backward jumps when audio time exceeds available timestamps
              let matchedAudioItem = null;

              // STRATEGY 1: Look for range match first (most accurate)
              for (let i = 0; i < chordGridData.originalAudioMapping.length; i++) {
                const audioItem = chordGridData.originalAudioMapping[i];
                const nextAudioItem = chordGridData.originalAudioMapping[i + 1];
                const nextBeatTime = nextAudioItem ? nextAudioItem.timestamp : audioItem.timestamp + 0.5;

                // If adjusted time falls within this beat's range, use this position
                if (adjustedTime >= audioItem.timestamp && adjustedTime < nextBeatTime) {
                  matchedAudioItem = audioItem;
                  break; // Range match is most accurate
                }
              }

              // STRATEGY 2: If no range match, use forward progression logic
              if (!matchedAudioItem) {
                const currentBeat = currentBeatIndexRef.current;

                // If we have a current position and audio time is moving forward
                if (currentBeat >= 0 && currentBeat < chordGridData.originalAudioMapping.length) {
                  const currentTimestamp = chordGridData.originalAudioMapping[currentBeat]?.timestamp || 0;

                  // If audio time is ahead of current position, look for next logical position
                  if (adjustedTime > currentTimestamp) {
                    // Find the next position that makes sense
                    for (let i = currentBeat; i < chordGridData.originalAudioMapping.length; i++) {
                      const audioItem = chordGridData.originalAudioMapping[i];
                      if (audioItem.timestamp >= currentTimestamp) {
                        matchedAudioItem = audioItem;
                        break;
                      }
                    }
                  }
                }

                // STRATEGY 3: Fallback to closest match only if forward progression fails
                if (!matchedAudioItem) {
                  for (let i = 0; i < chordGridData.originalAudioMapping.length; i++) {
                    const audioItem = chordGridData.originalAudioMapping[i];
                    const timeDifference = Math.abs(adjustedTime - audioItem.timestamp);

                    if (timeDifference < bestTimeDifference) {
                      bestTimeDifference = timeDifference;
                      matchedAudioItem = audioItem;
                    }
                  }

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

            if (bestVisualIndex === -1) {

              // Fallback to old method only when originalAudioMapping didn't find a match
              console.log(`🎬 ANIMATION MAPPING: Using fallback visual grid path`, {
                time: time.toFixed(3),
                reason: 'originalAudioMapping did not find a match',
                modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                chordGridDataStructure: {
                  chordsLength: chordGridData.chords.length,
                  beatsLength: chordGridData.beats.length,
                  hasPadding: chordGridData.hasPadding,
                  paddingCount: chordGridData.paddingCount,
                  shiftCount: chordGridData.shiftCount
                }
              });

              // IMPROVED FALLBACK: Use forward progression logic for visual grid too
              const currentBeat = currentBeatIndexRef.current;

              // STRATEGY 1: Look for range match first
              for (let visualIndex = 0; visualIndex < chordGridData.beats.length; visualIndex++) {
                const visualTimestamp = chordGridData.beats[visualIndex];

                // Skip null timestamps (shift cells)
                if (visualTimestamp === null || visualTimestamp === undefined) {
                  continue;
                }

                // Check if current time falls within this beat's range
                const nextVisualIndex = visualIndex + 1;
                let nextBeatTime = visualTimestamp + 0.5; // Default estimate

                // Find the next valid timestamp for range checking
                for (let j = nextVisualIndex; j < chordGridData.beats.length; j++) {
                  if (chordGridData.beats[j] !== null && chordGridData.beats[j] !== undefined) {
                    nextBeatTime = chordGridData.beats[j];
                    break;
                  }
                }

                // If current time falls within this beat's range, use this position
                if (time >= visualTimestamp && time < nextBeatTime) {
                  bestVisualIndex = visualIndex;
                  break; // Range match is most accurate
                }
              }

              // STRATEGY 2: If no range match and we have current position, use forward progression
              if (bestVisualIndex === -1 && currentBeat >= 0) {
                const currentTimestamp = chordGridData.beats[currentBeat];

                // If audio time is ahead of current position, look forward
                if (currentTimestamp && time > currentTimestamp) {
                  for (let visualIndex = currentBeat; visualIndex < chordGridData.beats.length; visualIndex++) {
                    const visualTimestamp = chordGridData.beats[visualIndex];
                    if (visualTimestamp !== null && visualTimestamp !== undefined && visualTimestamp >= currentTimestamp) {
                      bestVisualIndex = visualIndex;
                      break;
                    }
                  }
                }
              }

              // STRATEGY 3: Final fallback to closest match only if forward progression fails
              if (bestVisualIndex === -1) {
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
                }

              }

            }

            if (bestVisualIndex !== -1) {
              currentBeat = bestVisualIndex;

              // Add calibration data if we have high confidence and a valid timestamp
              if (syncedTimestamp.confidence > 0.7 && chordGridData.beats[bestVisualIndex]) {
                const expectedTime = chordGridData.beats[bestVisualIndex];
                if (typeof expectedTime === 'number') {
                  timingSyncService.addCalibrationPoint(time, expectedTime, adjustedTime);
                }
              }
            }
            } // Close the originalAudioMapping check
            else {
              console.log(`🎬 ANIMATION MAPPING: No originalAudioMapping available`, {
                time: time.toFixed(3),
                modelType: analysisResults.chordModel?.includes('btc') ? 'BTC' : 'Chord-CNN-LSTM',
                chordGridDataStructure: {
                  chordsLength: chordGridData.chords.length,
                  beatsLength: chordGridData.beats.length,
                  hasPadding: chordGridData.hasPadding,
                  paddingCount: chordGridData.paddingCount,
                  shiftCount: chordGridData.shiftCount,
                  hasOriginalAudioMapping: hasOriginalAudioMapping(chordGridData)
                }
              });
            }
          }

          if (currentBeat !== -1) {
            // ENHANCED SAFEGUARD: Never allow empty cell highlighting in any phase
            const shiftCount = chordGridData.shiftCount || 0;
            const isPreBeatPhase = time < animationRangeStart;
            const chord = chordGridData.chords[currentBeat] || '';
            const isEmptyCell = chord === '' || chord === 'undefined' || !chord;

            // Only log beat updates when they change or every 2 seconds
            // if (currentBeat !== currentBeatIndex || Math.floor(time) % 2 === 0) {
            //   console.log(`🎯 BEAT UPDATE CHECK: currentBeat=${currentBeat}, isPreBeatPhase=${isPreBeatPhase}, timestamp=${chordGridData.beats[currentBeat]}`);
            // }

            // CRITICAL FIX: Block shift cells FIRST (most important check)
            // Shift cells should never be animated as they don't represent musical content
            if (currentBeat < shiftCount) {
              currentBeat = -1; // Block all shift cell highlighting
            }
            // FIXED: Never highlight empty cells (greyed-out cells) in any phase
            // Empty cells should never be animated as they don't represent musical content
            // NOTE: N.C. is valid musical content and should be highlighted
            else if (isEmptyCell) {
              currentBeat = -1; // Block all empty cell highlighting
            }
            // Check if this beat has a null timestamp (should not happen for valid cells after shift filtering)
            else if (chordGridData.beats[currentBeat] === null || chordGridData.beats[currentBeat] === undefined) {
              // During pre-beat phase, we might have estimated positions without timestamps
              if (!isPreBeatPhase) {
                currentBeat = -1; // Don't highlight cells with null timestamps during model phase
              }
              // During pre-beat phase, allow highlighting cells with null timestamps if they're valid musical content
            }

            // Apply click-aware minimum constraint if we're in the progression phase
            let finalBeatIndex = currentBeat;
            if (lastClickInfo && currentBeat !== -1) {
              const timeSinceClick = Date.now() - lastClickInfo.clickTime;
              if (timeSinceClick >= 200 && timeSinceClick < 4000) {
                const minAllowedBeat = lastClickInfo.visualIndex;
                if (currentBeat < minAllowedBeat) {
                  finalBeatIndex = minAllowedBeat;
                }
              }
            }


            currentBeatIndexRef.current = finalBeatIndex;
            setCurrentBeatIndex(finalBeatIndex);
          } else {
            // MODEL PHASE: No beat found, set to -1
            // if (currentBeatIndex !== -1) {
            //   console.log(`🎯 MODEL PHASE: setCurrentBeatIndex(-1) - no beat found`);
            // }
            currentBeatIndexRef.current = -1;
            setCurrentBeatIndex(-1);
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
  }, [isPlaying, analysisResults, setCurrentTime, audioRef, chordGridData, globalSpeedAdjustment, lastClickInfo]);

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
      // console.log(`🎵 AUDIO PLAY EVENT: Setting isPlaying=true`);
      setIsPlaying(true);
    };
    const handlePause = () => {
      // console.log(`⏸️ AUDIO PAUSE EVENT: Setting isPlaying=false`);
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
  }, [audioRef, setCurrentTime, setDuration, setIsPlaying]);

  // Function to toggle enharmonic correction display
  const toggleEnharmonicCorrection = () => {
    setShowCorrectedChords(!showCorrectedChords);
  };

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
  }, [preferredAudioSource, youtubePlayer, audioRef]);

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Downloading Indicator - shown during initial download */}
      <DownloadingIndicator
        isVisible={audioProcessingState.isDownloading && !audioProcessingState.fromCache}
        videoDuration={duration}
      />

      {/* Extraction Notification Banner - shown after download completes */}
      <ExtractionNotification
        isVisible={showExtractionNotification}
        fromCache={audioProcessingState.fromCache}
        onDismiss={() => setShowExtractionNotification(false)}
        onRefresh={() => extractAudioFromYouTube(true)}
      />

      <div className="container mx-auto px-1 sm:px-2 md:px-3 py-0 min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300" style={{ maxWidth: "98%" }}>
        <div className="bg-white dark:bg-content-bg shadow-md rounded-lg overflow-hidden transition-colors duration-300 border border-gray-200 dark:border-gray-600">

        {/* Processing Status Banner - positioned in content flow */}
        <ProcessingStatusBanner
          analysisResults={analysisResults}
          audioDuration={duration}
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

            {/* Analysis results */}
            {analysisResults && audioProcessingState.isAnalyzed && (
            <div className="mt-0 space-y-2">

              {/* Tabbed interface for analysis results */}
              <div className="p-3 rounded-lg bg-white dark:bg-content-bg border border-gray-200 dark:border-gray-600 mb-2 mt-0 transition-colors duration-300">
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

                  {/* Lyrics & Chords Tab */}
                  {activeTab === 'lyricsChords' && (
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
              </div>


              {/* Beats visualization */}
              <div className="p-4 rounded-lg bg-white dark:bg-content-bg border border-gray-200 dark:border-gray-600 transition-colors duration-300">
                <h3 className="font-medium text-lg mb-2 text-gray-800 dark:text-gray-100 transition-colors duration-300">Beat Timeline</h3>
                <div className="relative h-16 bg-gray-50 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-md overflow-hidden transition-colors duration-300">
                  {/* Beat markers */}
                  {analysisResults && analysisResults.beats && analysisResults.beats.map ? (
                    analysisResults.beats.map((beat: {time: number, beatNum?: number} | number, index: number) => {
                      // Handle both old format (objects with .time) and new format (direct numbers)
                      const beatTime = typeof beat === 'object' ? beat.time : beat;

                      // Get beat number from beat info if available
                      // Use the detected time signature or default to 4
                      const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
                      const beatNum = (typeof beat === 'object' ? beat.beatNum : undefined) ||
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
                            left: `${(beatTime / duration) * 100}%`,
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
                      url={`https://www.youtube.com/watch?v=${videoId}`}
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
                      config={{
                        playerVars: {
                          showinfo: 1,
                          origin: typeof window !== 'undefined' ? window.location.origin : undefined
                        }
                      }}
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