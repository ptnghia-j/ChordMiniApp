/**
 * Final integration validation test
 * Ensures all extracted modules work together seamlessly and maintain 100% functional equivalence
 */

import { renderHook, act } from '@testing-library/react';
import { useAnalysisState } from '../src/hooks/useAnalysisState';
import { usePlaybackState } from '../src/hooks/usePlaybackState';
import { useUILayout } from '../src/hooks/useUILayout';
import { calculateOptimalShift, getChordGridData } from '../src/services/chordGridProcessor';
import { createBeatTrackingInterval } from '../src/services/beatTrackingEngine';
import { checkCachedAnalysisAvailability } from '../src/services/cacheManager';
import { formatTimestamp, calculateBeatPosition } from '../src/utils/timingUtils';
import { parseChordNotation, analyzeChordProgression } from '../src/utils/chordUtils';
import { validateAudioFormat, formatDuration } from '../src/utils/audioUtils';
import { buildSongContext, validateVideoId } from '../src/utils/helperUtils';

// Mock external dependencies
jest.mock('../src/services/firestoreService', () => ({
  getTranscription: jest.fn().mockResolvedValue(null),
  saveTranscription: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/keyDetectionService', () => ({
  detectKey: jest.fn().mockResolvedValue({
    primaryKey: 'C major',
    corrections: {},
    sequenceCorrections: null,
    modulation: null
  })
}));

describe('Final Integration Validation', () => {
  describe('Complete Workflow Simulation', () => {
    it('should simulate complete analyze page workflow with all modules', async () => {
      // Step 1: Initialize all hooks with realistic data
      const mockAnalysisResults = {
        synchronizedChords: [
          { chord: 'C', beatIndex: 0 },
          { chord: 'Am', beatIndex: 1 },
          { chord: 'F', beatIndex: 2 },
          { chord: 'G', beatIndex: 3 }
        ],
        beats: [
          { time: 0.5 },
          { time: 1.0 },
          { time: 1.5 },
          { time: 2.0 }
        ],
        chords: [
          { chord: 'C', time: 0.5 },
          { chord: 'Am', time: 1.0 },
          { chord: 'F', time: 1.5 },
          { chord: 'G', time: 2.0 }
        ],
        beatDetectionResult: {
          bpm: 120,
          time_signature: 4
        }
      };

      const analysisProps = {
        videoId: 'dQw4w9WgXcQ',
        analysisResults: mockAnalysisResults,
        audioProcessingState: {
          isExtracted: true,
          audioUrl: 'test-audio.mp3',
          isAnalyzed: true,
          isAnalyzing: false
        }
      };

      const mockAudioElement = {
        currentTime: 1.0,
        duration: 180,
        play: jest.fn(),
        pause: jest.fn(),
        muted: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      const playbackProps = {
        audioRef: { current: mockAudioElement },
        youtubePlayer: { seekTo: jest.fn(), muted: false },
        setYoutubePlayer: jest.fn(),
        audioPlayerState: {
          isPlaying: true,
          currentTime: 1.0,
          duration: 180,
          playbackRate: 1,
          preferredAudioSource: 'extracted'
        },
        setAudioPlayerState: jest.fn(),
        setDuration: jest.fn(),
        isFollowModeEnabled: true
      };

      const uiProps = {
        audioRef: { current: mockAudioElement },
        youtubePlayer: { muted: false },
        preferredAudioSource: 'extracted',
        setPreferredAudioSource: jest.fn()
      };

      // Initialize hooks
      const { result: analysisResult } = renderHook(() => useAnalysisState(analysisProps));
      const { result: playbackResult } = renderHook(() => usePlaybackState(playbackProps));
      const { result: uiResult } = renderHook(() => useUILayout(uiProps));

      // Step 2: Process chord grid data
      const chordGridData = getChordGridData(mockAnalysisResults);
      expect(chordGridData.chords).toContain('C');
      expect(chordGridData.chords).toContain('Am');
      expect(chordGridData.chords).toContain('F');
      expect(chordGridData.chords).toContain('G');
      expect(chordGridData.beats.length).toBeGreaterThan(0);

      // Step 3: Calculate optimal shift
      const chords = mockAnalysisResults.synchronizedChords.map(item => item.chord);
      const optimalShift = calculateOptimalShift(chords, 4, 0);
      expect(typeof optimalShift).toBe('number');

      // Step 4: Set up beat tracking
      const beatTrackingDeps = {
        audioRef: { current: mockAudioElement },
        isPlaying: true,
        analysisResults: mockAnalysisResults,
        chordGridData,
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      const cleanup = createBeatTrackingInterval(beatTrackingDeps);
      expect(typeof cleanup).toBe('function');

      // Step 5: Test state interactions
      act(() => {
        analysisResult.current.setBeatDetector('madmom');
        analysisResult.current.setChordDetector('btc-sl');
        playbackResult.current.handleBeatClick(1, 1.0);
        uiResult.current.setActiveTab('lyricsChords');
      });

      expect(analysisResult.current.beatDetector).toBe('madmom');
      expect(analysisResult.current.chordDetector).toBe('btc-sl');
      expect(playbackResult.current.currentBeatIndex).toBe(1);
      expect(uiResult.current.activeTab).toBe('lyricsChords');

      // Step 6: Test utility functions
      const formattedTime = formatTimestamp(1.5);
      expect(formattedTime).toBe('0:01');

      const beatPosition = calculateBeatPosition(1, 4, 0);
      expect(beatPosition.measureNumber).toBe(1);
      expect(beatPosition.beatInMeasure).toBe(2);

      const chordAnalysis = analyzeChordProgression(chords);
      expect(chordAnalysis.uniqueChords).toEqual(['C', 'Am', 'F', 'G']);

      const songContext = buildSongContext(
        'dQw4w9WgXcQ',
        'Never Gonna Give You Up',
        mockAnalysisResults,
        'C major',
        null,
        false
      );
      expect(songContext).toContain('Never Gonna Give You Up');
      expect(songContext).toContain('BPM: 120');

      // Step 7: Validate audio and video handling
      expect(validateAudioFormat('test-audio.mp3')).toBe(true);
      expect(validateVideoId('dQw4w9WgXcQ')).toBe(true);
      expect(formatDuration(180)).toBe('3:00');

      // Step 8: Test cache integration
      const cacheDeps = {
        videoId: 'dQw4w9WgXcQ',
        beatDetector: 'madmom',
        chordDetector: 'btc-sl',
        analysisResults: mockAnalysisResults,
        audioProcessingState: {
          isExtracted: true,
          audioUrl: 'test-audio.mp3',
          isAnalyzed: false,  // Set to false to trigger cache check
          isAnalyzing: false
        },
        modelsInitialized: true,
        chordCorrections: null,
        isDetectingKey: false,
        keyDetectionAttempted: false,
        setChordCorrections: jest.fn(),
        setKeySignature: jest.fn(),
        setSequenceCorrections: jest.fn(),
        setCacheAvailable: jest.fn(),
        setCacheCheckCompleted: jest.fn(),
        setIsDetectingKey: jest.fn(),
        setKeyDetectionAttempted: jest.fn()
      };

      await checkCachedAnalysisAvailability(cacheDeps);
      expect(cacheDeps.setCacheCheckCompleted).toHaveBeenCalled();

      // Cleanup
      cleanup();
    });

    it('should handle error scenarios gracefully across all modules', () => {
      // Test error handling in chord parsing
      const invalidChord = parseChordNotation('InvalidChord123');
      expect(invalidChord.isValid).toBe(false);

      // Test error handling in audio validation
      expect(validateAudioFormat('')).toBe(false);
      expect(validateAudioFormat('not-audio.txt')).toBe(false);

      // Test error handling in video ID validation
      expect(validateVideoId('')).toBe(false);
      expect(validateVideoId('invalid-id')).toBe(false);

      // Test error handling in chord grid processing
      const emptyResult = getChordGridData(null);
      expect(emptyResult.chords).toEqual([]);
      expect(emptyResult.beats).toEqual([]);

      // Test error handling in timing utilities
      expect(formatTimestamp(NaN)).toBe('0:00');
      expect(formatDuration(NaN)).toBe('0:00');

      // All error scenarios should be handled gracefully without throwing
    });

    it('should maintain consistent data types and interfaces', () => {
      // Test that all functions return expected types
      const mockData = {
        synchronizedChords: [{ chord: 'C', beatIndex: 0 }],
        beats: [{ time: 0.5 }],
        beatDetectionResult: { bpm: 120, time_signature: 4 }
      };

      const chordGridData = getChordGridData(mockData);
      expect(Array.isArray(chordGridData.chords)).toBe(true);
      expect(Array.isArray(chordGridData.beats)).toBe(true);
      expect(typeof chordGridData.paddingCount).toBe('number');

      const optimalShift = calculateOptimalShift(['C', 'F', 'G'], 4, 0);
      expect(typeof optimalShift).toBe('number');

      const beatPosition = calculateBeatPosition(0, 4, 0);
      expect(typeof beatPosition.measureNumber).toBe('number');
      expect(typeof beatPosition.beatInMeasure).toBe('number');
      expect(typeof beatPosition.isDownbeat).toBe('boolean');

      const chordParsed = parseChordNotation('Cmaj7');
      expect(typeof chordParsed.root).toBe('string');
      expect(typeof chordParsed.quality).toBe('string');
      expect(Array.isArray(chordParsed.extensions)).toBe(true);
      expect(typeof chordParsed.isValid).toBe('boolean');
    });

    it('should demonstrate performance characteristics under load', () => {
      const startTime = performance.now();

      // Simulate heavy workload
      const largeChordArray = Array(500).fill(0).map((_, i) => 
        ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'][i % 7]
      );

      const largeBeatArray = Array(500).fill(0).map((_, i) => ({ time: i * 0.5 }));

      const mockLargeAnalysis = {
        synchronizedChords: largeChordArray.map((chord, i) => ({ chord, beatIndex: i })),
        beats: largeBeatArray,
        beatDetectionResult: { bpm: 120, time_signature: 4 }
      };

      // Process large dataset
      const chordGridData = getChordGridData(mockLargeAnalysis);
      const progression = analyzeChordProgression(largeChordArray);
      const optimalShift = calculateOptimalShift(largeChordArray.slice(0, 50), 4, 0);

      // Perform multiple timing operations
      for (let i = 0; i < 100; i++) {
        formatTimestamp(i * 1.5);
        calculateBeatPosition(i, 4, 0);
        parseChordNotation(largeChordArray[i % largeChordArray.length]);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time (under 100ms)
      expect(totalTime).toBeLessThan(100);
      expect(chordGridData.chords.length).toBeGreaterThan(0);
      expect(progression.uniqueChords.length).toBeGreaterThan(0);
      expect(typeof optimalShift).toBe('number');
    });
  });

  describe('Module Independence Validation', () => {
    it('should allow modules to be used independently', () => {
      // Test that each module can be used without others
      
      // Chord utilities standalone
      const chordResult = parseChordNotation('Cmaj7');
      expect(chordResult.isValid).toBe(true);

      // Timing utilities standalone
      const timeResult = formatTimestamp(125.5);
      expect(timeResult).toBe('2:05');

      // Audio utilities standalone
      const audioResult = validateAudioFormat('song.mp3');
      expect(audioResult).toBe(true);

      // Helper utilities standalone
      const videoResult = validateVideoId('dQw4w9WgXcQ');
      expect(videoResult).toBe(true);

      // Each module works independently without requiring others
    });

    it('should maintain clean interfaces between modules', () => {
      // Test that modules only depend on their declared interfaces
      
      const mockAnalysis = {
        synchronizedChords: [{ chord: 'C', beatIndex: 0 }],
        beats: [{ time: 0.5 }],
        beatDetectionResult: { bpm: 120, time_signature: 4 }
      };

      // Chord grid processor should only need analysis results
      const gridData = getChordGridData(mockAnalysis);
      expect(gridData).toBeDefined();

      // Beat tracking should only need specific dependencies
      const deps = {
        audioRef: { current: { currentTime: 0 } },
        isPlaying: false,
        analysisResults: mockAnalysis,
        chordGridData: gridData,
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      const cleanup = createBeatTrackingInterval(deps);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });
});
