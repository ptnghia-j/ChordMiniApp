"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Navigation from '@/components/Navigation';
import { analyzeAudioWithRateLimit, AnalysisResult } from '@/services/chordRecognitionService';
import { ProcessingStatusSkeleton } from '@/components/SkeletonLoaders';

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

    // Analysis structure validation

    // Calculate padding for audio uploads
    const rawBeats = analysisResults.beats || [];

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

    const bpm = analysisResults.beatDetectionResult?.bpm || 120;
    const beatDuration = 60 / bpm; // seconds per beat

    // Calculate how many padding beats we need to start from 0.0s
    const calculatedPaddingCount = firstBeatTime > 0 ? Math.floor(firstBeatTime / beatDuration) : 0;

    // console.log(`🔧 UPLOAD PAGE PADDING CALCULATION:`, {
    //   firstBeatTime: firstBeatTime.toFixed(3),
    //   bpm,
    //   beatDuration: beatDuration.toFixed(3),
    //   calculatedPaddingCount,
    //   backendPaddingCount: analysisResults.beatDetectionResult?.paddingCount,
    //   backendShiftCount: analysisResults.beatDetectionResult?.shiftCount
    // });

    const paddingCount = analysisResults.beatDetectionResult?.paddingCount || calculatedPaddingCount;

    // console.log(`🔧 UPLOAD PAGE FINAL VALUES: paddingCount=${paddingCount}, shiftCount=${shiftCount}, hasPadding=${paddingCount > 0}`);

    // MISSING LOGIC: Add shift calculation for uploaded audio files
    // The upload page was missing the sophisticated shift calculation that the YouTube page has
    const calculateOptimalShiftForUpload = (chords: string[], timeSignature: number): number => {
      if (chords.length === 0) {
        // console.log('🔧 UPLOAD SHIFT: No chords available, returning shift 0');
        return 0;
      }

      // console.log(`🔧 UPLOAD SHIFT CALCULATION DEBUG - Analyzing ${chords.length} chords with ${timeSignature}/4 time signature`);
      // console.log(`🔧 UPLOAD First 20 chords: [${chords.slice(0, 20).join(', ')}]`);

      let bestShift = 0;
      let maxChordChanges = 0;
      const shiftResults: Array<{shift: number, chordChanges: number, downbeatPositions: number[], chordLabels: string[]}> = [];

      // Test each possible shift value (0 to timeSignature-1)
      // console.log(`🔧 UPLOAD TESTING SHIFT OPTIONS:`);
      for (let shift = 0; shift < timeSignature; shift++) {
        // console.log(`\n📊 === UPLOAD SHIFT ${shift} ANALYSIS ===`);

        let chordChangeCount = 0;
        const downbeatPositions: number[] = [];
        const chordLabels: string[] = [];

        // Check each beat position after applying the shift
        for (let i = shift; i < chords.length; i++) {
          const currentChord = chords[i];
          const previousChord = i > shift ? chords[i - 1] : '';

          // Detect chord change: current chord differs from previous beat's chord
          const isChordChange = currentChord && currentChord !== '' &&
                               currentChord !== previousChord && previousChord !== '' &&
                               currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

          // Calculate beat position in the shifted sequence
          const beatInMeasure = ((i - shift) % timeSignature) + 1;
          const isDownbeat = beatInMeasure === 1;

          // if (i < 20) { // Log first 20 for debugging
          //   console.log(`      🎯 UPLOAD BEAT: pos[${i}] chord="${currentChord}" prev="${previousChord}" valid=${isChordChange} downbeat=${isDownbeat} beat=${beatInMeasure}`);
          // }

          // Score: chord change that occurs on a downbeat
          if (isChordChange && isDownbeat) {
            chordChangeCount++;
            downbeatPositions.push(i);
            chordLabels.push(currentChord);
            // if (i < 20) {
            //   console.log(`      🎵 UPLOAD CHORD CHANGE ON DOWNBEAT: pos[${i}] "${previousChord}" -> "${currentChord}" beat=${beatInMeasure}`);
            // }
          }
        }

        shiftResults.push({
          shift,
          chordChanges: chordChangeCount,
          downbeatPositions,
          chordLabels
        });

        // console.log(`   ✅ UPLOAD SHIFT ${shift} RESULT: ${chordChangeCount} chord changes on downbeats`);

        if (chordChangeCount > maxChordChanges) {
          maxChordChanges = chordChangeCount;
          bestShift = shift;
        }
      }

      // console.log(`\n✅ UPLOAD BEST SHIFT: ${bestShift} (${maxChordChanges} chord changes on downbeats)`);
      // console.log(`📊 UPLOAD SHIFT SUMMARY:`);
      // shiftResults.forEach(result => {
      //   const marker = result.shift === bestShift ? '🎯' : '  ';
      //   console.log(`  ${marker} Shift ${result.shift}: ${result.chordChanges} chord changes on downbeats`);
      // });

      return bestShift;
    };

    // Padding calculation completed

    // FIXED: Use YouTube approach - only include chords that actually have timestamps within audio duration
    const filteredSynchronizedChords = analysisResults.synchronizedChords.filter(item => {
      // CRITICAL FIX: Check if we have beats data in the correct format
      if (!analysisResults.beats || !Array.isArray(analysisResults.beats)) return true;

      const beatIndex = item.beatIndex;
      if (beatIndex < 0 || beatIndex >= analysisResults.beats.length) {
        return false; // Invalid beat index
      }

      // CRITICAL FIX: Handle both number array and BeatInfo object array formats
      const beat = analysisResults.beats[beatIndex];
      let beatTime: number;

      if (typeof beat === 'number') {
        // Standard API format: beats is number[]
        beatTime = beat;
      } else if (typeof beat === 'object' && beat !== null && 'time' in beat) {
        // BeatInfo object format: beats is BeatInfo[]
        beatTime = (beat as { time: number }).time;
      } else {
        console.warn(`⚠️ Unexpected beat format at index ${beatIndex}:`, beat);
        return true; // Include by default if format is unexpected
      }

      // Only include beats that are actually within the audio duration (no buffer)
      return beatTime < duration;
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

    // Cell limiting applied for performance

    // Process limited synchronized chords with proper formatting
    const processedChords = limitedSynchronizedChords.map(item => {
      let chord = item.chord;

      // Apply chord corrections if available
      if (showCorrectedChords && chordCorrections[chord]) {
        chord = chordCorrections[chord];
      }

      // Apply sequence corrections if available
      if (showCorrectedChords && sequenceCorrections?.correctedSequence) {
        const correctedIndex = sequenceCorrections.correctedSequence.findIndex((_, idx) =>
          sequenceCorrections.originalSequence[idx] === item.chord
        );
        if (correctedIndex >= 0) {
          chord = sequenceCorrections.correctedSequence[correctedIndex];
        }
      }

      // Return raw chord name - formatting will be handled by ChordGrid component
      return chord;
    });

    // console.log(`🔧 UPLOAD PAGE CHORD DATA:`, {
    //   totalChords: processedChords.length,
    //   first20Chords: processedChords.slice(0, 20),
    //   timeSignature: analysisResults.beatDetectionResult?.time_signature || 4
    // });

    // CALCULATE OPTIMAL SHIFT for uploaded audio files
    const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;
    const calculatedShiftCount = calculateOptimalShiftForUpload(processedChords, timeSignature);

    // Update shiftCount with calculated value if not provided by backend
    const finalShiftCount = analysisResults.beatDetectionResult?.shiftCount || calculatedShiftCount;

    // console.log(`🔧 UPLOAD SHIFT CALCULATION COMPLETE:`, {
    //   calculatedShiftCount,
    //   backendShiftCount: analysisResults.beatDetectionResult?.shiftCount,
    //   finalShiftCount,
    //   willUseBackendStrategy: paddingCount > 0 || finalShiftCount > 0
    // });

    // Create beats array using actual timestamps instead of beat indices
    const processedBeats = limitedSynchronizedChords.map((item, index) => {
      const beatIndex = item.beatIndex;

      // Access beats from the correct location (log once)
      let beatsArray = analysisResults.beats;
      if (!beatsArray || beatsArray.length === 0) {
        beatsArray = analysisResults.beatDetectionResult?.beats || [];
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

      return 0; // Fallback for invalid indices
    });

    // Create original audio mapping for timestamp-based seeking
    const originalAudioMapping = limitedSynchronizedChords.map((item, index) => ({
      chord: item.chord,
      timestamp: processedBeats[index],
      visualIndex: index,
      audioIndex: index // Store the original audio index for accurate beat click handling
    }));

    // COMPREHENSIVE STRATEGY: Apply padding and shifting like YouTube page
    let finalChords = processedChords;
    let finalBeats = processedBeats;
    let finalOriginalAudioMapping = originalAudioMapping;

    // Apply comprehensive strategy if we have either padding OR shifting
    if (paddingCount > 0 || finalShiftCount > 0) {
      // console.log(`🔧 UPLOAD APPLYING COMPREHENSIVE STRATEGY: paddingCount=${paddingCount}, shiftCount=${finalShiftCount}`);

      // Create shift cells (empty strings)
      const shiftChords = Array.from({ length: finalShiftCount }, () => '');
      const shiftBeats = Array.from({ length: finalShiftCount }, (_, i) => -1 * (finalShiftCount - i) * beatDuration);

      // Create padding cells (N.C. chords with timestamps)
      const paddingChords = Array.from({ length: paddingCount }, () => 'N.C.');
      const paddingBeats = Array.from({ length: paddingCount }, (_, i) => i * beatDuration);

      // Combine: [shift cells] + [padding cells] + [regular chords]
      finalChords = [...shiftChords, ...paddingChords, ...processedChords];
      finalBeats = [...shiftBeats, ...paddingBeats, ...processedBeats];

      // console.log(`🔧 UPLOAD COMPREHENSIVE RESULT:`, {
      //   shiftCells: finalShiftCount,
      //   paddingCells: paddingCount,
      //   regularChords: processedChords.length,
      //   totalCells: finalChords.length,
      //   firstFewChords: finalChords.slice(0, 10),
      //   firstFewBeats: finalBeats.slice(0, 10).map(b => b === null ? 'null' : (typeof b === 'number' ? b.toFixed(3) : b))
      // });

      // Update original audio mapping to account for shift and padding
      finalOriginalAudioMapping = originalAudioMapping.map((item, index) => ({
        ...item,
        visualIndex: finalShiftCount + paddingCount + index // Shift by total offset
      }));

    } else if (paddingCount > 0) {
      // Legacy padding-only approach
      const paddingBeats = Array.from({ length: paddingCount }, (_, i) => i * beatDuration);
      const paddingChords = Array.from({ length: paddingCount }, () => ''); // Empty chords for padding

      finalChords = [...paddingChords, ...processedChords];
      finalBeats = [...paddingBeats, ...processedBeats];

      // console.log(`🎵 UPLOAD Added ${paddingCount} padding beats: ${paddingBeats.map(b => b.toFixed(2)).join(', ')}s`);
    }

    const result = {
      chords: finalChords,
      beats: finalBeats,
      beatNumbers: [
        ...Array.from({ length: finalShiftCount + paddingCount }, () => 1), // Shift + padding beats are beat 1
        ...limitedSynchronizedChords.map(item => item.beatNum || 1)
      ],
      hasPadding: paddingCount > 0 || finalShiftCount > 0, // Use comprehensive strategy if either is present
      paddingCount,
      shiftCount: finalShiftCount, // Use calculated shift count
      hasPickupBeats: paddingCount > 0,
      pickupBeatsCount: paddingCount,
      originalAudioMapping: finalOriginalAudioMapping
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
        audioUrl={audioProcessingState.audioUrl || undefined}
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
                isUploadPage={true}
                showCorrectedChords={showCorrectedChords}
                chordCorrections={chordCorrections}
                sequenceCorrections={sequenceCorrections}
              />



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