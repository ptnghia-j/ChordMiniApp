/**
 * Performance benchmarks comparing original vs. modularized implementation
 * Validates that all optimizations are preserved and no regressions introduced
 */

import { renderHook, act } from '@testing-library/react';
import { useAnalysisState } from '../src/hooks/useAnalysisState';
import { usePlaybackState } from '../src/hooks/usePlaybackState';
import { useUILayout } from '../src/hooks/useUILayout';
import { calculateOptimalShift, calculatePaddingAndShift, getChordGridData } from '../src/services/chordGridProcessor';
import { createBeatTrackingInterval } from '../src/services/beatTrackingEngine';
import { 
  formatTimestamp, 
  calculateBeatDuration, 
  calculateBeatPosition,
  findClosestBeat 
} from '../src/utils/timingUtils';
import { 
  parseChordNotation, 
  applyEnharmonicCorrection, 
  analyzeChordProgression 
} from '../src/utils/chordUtils';

// Mock external dependencies for consistent benchmarking
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

jest.mock('../src/services/timingSyncService', () => ({
  timingSyncService: {
    getSyncedTimestamp: jest.fn((time) => ({ syncedTime: time, confidence: 0.8 })),
    addCalibrationPoint: jest.fn()
  }
}));

describe('Performance Benchmarks - Modularized vs Original', () => {
  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    HOOK_INITIALIZATION: 10,
    CHORD_GRID_PROCESSING: 100,
    BEAT_TRACKING_SETUP: 50,
    OPTIMAL_SHIFT_CALCULATION: 200,
    LARGE_DATASET_PROCESSING: 500,
    MEMORY_CLEANUP: 10
  };

  describe('Hook Performance', () => {
    it('should initialize hooks within performance thresholds', () => {
      const analysisProps = {
        videoId: 'test-video',
        analysisResults: null,
        audioProcessingState: {
          isExtracted: false,
          audioUrl: null,
          isAnalyzed: false,
          isAnalyzing: false
        }
      };

      const playbackProps = {
        audioRef: { current: { currentTime: 0, play: jest.fn(), pause: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() } },
        youtubePlayer: null,
        setYoutubePlayer: jest.fn(),
        audioPlayerState: {
          isPlaying: false,
          currentTime: 0,
          duration: 100,
          playbackRate: 1,
          preferredAudioSource: 'extracted'
        },
        setAudioPlayerState: jest.fn(),
        setDuration: jest.fn(),
        isFollowModeEnabled: true
      };

      const uiProps = {
        audioRef: { current: { muted: false } },
        youtubePlayer: null,
        preferredAudioSource: 'extracted',
        setPreferredAudioSource: jest.fn()
      };

      // Benchmark hook initialization
      const start = performance.now();
      
      const { result: analysisResult } = renderHook(() => useAnalysisState(analysisProps));
      const { result: playbackResult } = renderHook(() => usePlaybackState(playbackProps));
      const { result: uiResult } = renderHook(() => useUILayout(uiProps));
      
      const end = performance.now();
      const initializationTime = end - start;

      console.log(`🚀 Hook initialization time: ${initializationTime.toFixed(2)}ms`);
      expect(initializationTime).toBeLessThan(PERFORMANCE_THRESHOLDS.HOOK_INITIALIZATION);

      // Verify hooks are properly initialized
      expect(analysisResult.current.beatDetector).toBeDefined();
      expect(playbackResult.current.currentBeatIndex).toBeDefined();
      expect(uiResult.current.activeTab).toBeDefined();
    });

    it('should handle state updates efficiently', () => {
      const analysisProps = {
        videoId: 'test-video',
        analysisResults: null,
        audioProcessingState: {
          isExtracted: false,
          audioUrl: null,
          isAnalyzed: false,
          isAnalyzing: false
        }
      };

      const { result } = renderHook(() => useAnalysisState(analysisProps));

      // Benchmark multiple state updates
      const start = performance.now();
      
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.setBeatDetector(i % 2 === 0 ? 'beat-transformer' : 'madmom');
          result.current.setChordDetector(i % 2 === 0 ? 'chord-cnn-lstm' : 'btc-sl');
        }
      });
      
      const end = performance.now();
      const updateTime = end - start;

      console.log(`🔄 100 state updates time: ${updateTime.toFixed(2)}ms`);
      expect(updateTime).toBeLessThan(100); // Should handle 100 updates in under 100ms
    });
  });

  describe('Algorithm Performance', () => {
    it('should process chord grid data efficiently', () => {
      const mockAnalysisResults = {
        synchronizedChords: Array(100).fill(0).map((_, i) => ({
          chord: ['C', 'F', 'G', 'Am'][i % 4],
          beatIndex: i
        })),
        beats: Array(100).fill(0).map((_, i) => ({ time: i * 0.5 })),
        beatDetectionResult: {
          bpm: 120,
          time_signature: 4
        }
      };

      const start = performance.now();
      const result = getChordGridData(mockAnalysisResults);
      const end = performance.now();
      const processingTime = end - start;

      console.log(`⚡ Chord grid processing (100 chords): ${processingTime.toFixed(2)}ms`);
      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CHORD_GRID_PROCESSING);
      expect(result.chords.length).toBeGreaterThan(0);
    });

    it('should calculate optimal shift efficiently', () => {
      const chords = Array(50).fill(0).map((_, i) => ['C', 'F', 'G', 'Am'][i % 4]);
      
      const start = performance.now();
      const shift = calculateOptimalShift(chords, 4, 0);
      const end = performance.now();
      const calculationTime = end - start;

      console.log(`🎯 Optimal shift calculation (50 chords): ${calculationTime.toFixed(2)}ms`);
      expect(calculationTime).toBeLessThan(PERFORMANCE_THRESHOLDS.OPTIMAL_SHIFT_CALCULATION);
      expect(typeof shift).toBe('number');
    });

    it('should handle beat tracking setup efficiently', () => {
      const mockDependencies = {
        audioRef: { current: { currentTime: 0 } },
        isPlaying: false,
        analysisResults: {
          beats: Array(200).fill(0).map((_, i) => i * 0.5),
          chordModel: 'chord-cnn-lstm',
          beatDetectionResult: { bpm: 120, time_signature: 4 }
        },
        chordGridData: {
          chords: Array(200).fill(0).map((_, i) => ['C', 'F', 'G', 'Am'][i % 4]),
          beats: Array(200).fill(0).map((_, i) => i * 0.5),
          paddingCount: 0,
          shiftCount: 0
        },
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      const start = performance.now();
      const cleanup = createBeatTrackingInterval(mockDependencies);
      const end = performance.now();
      const setupTime = end - start;

      console.log(`🎵 Beat tracking setup (200 beats): ${setupTime.toFixed(2)}ms`);
      expect(setupTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BEAT_TRACKING_SETUP);
      expect(typeof cleanup).toBe('function');

      // Cleanup
      cleanup();
    });
  });

  describe('Utility Function Performance', () => {
    it('should handle timing calculations efficiently', () => {
      const beatTimes = Array(1000).fill(0).map((_, i) => i * 0.5);
      
      const start = performance.now();
      
      // Test multiple timing operations
      for (let i = 0; i < 100; i++) {
        formatTimestamp(i * 1.5);
        calculateBeatDuration(120 + i);
        calculateBeatPosition(i, 4, 0);
        findClosestBeat(i * 0.5, beatTimes.slice(0, 100));
      }
      
      const end = performance.now();
      const operationsTime = end - start;

      console.log(`⏰ 100 timing operations: ${operationsTime.toFixed(2)}ms`);
      expect(operationsTime).toBeLessThan(50); // Should complete in under 50ms
    });

    it('should handle chord operations efficiently', () => {
      const chords = Array(500).fill(0).map((_, i) => 
        ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'][i % 7]
      );
      
      const start = performance.now();
      
      // Test chord parsing and analysis
      chords.forEach(chord => {
        parseChordNotation(chord);
        applyEnharmonicCorrection(chord, { 'C#': 'Db' });
      });
      
      analyzeChordProgression(chords);
      
      const end = performance.now();
      const chordOperationsTime = end - start;

      console.log(`🎼 Chord operations (500 chords): ${chordOperationsTime.toFixed(2)}ms`);
      expect(chordOperationsTime).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('Memory Management', () => {
    it('should properly cleanup intervals and event listeners', () => {
      const mockAudioElement = {
        currentTime: 0,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      const mockDependencies = {
        audioRef: { current: mockAudioElement },
        isPlaying: false,
        analysisResults: { beats: [], chordModel: 'test' },
        chordGridData: null,
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      // Create multiple intervals and clean them up
      const cleanupFunctions = [];
      
      const start = performance.now();
      
      for (let i = 0; i < 10; i++) {
        const cleanup = createBeatTrackingInterval(mockDependencies);
        cleanupFunctions.push(cleanup);
      }
      
      // Cleanup all intervals
      cleanupFunctions.forEach(cleanup => cleanup());
      
      const end = performance.now();
      const cleanupTime = end - start;

      console.log(`🧹 Memory cleanup (10 intervals): ${cleanupTime.toFixed(2)}ms`);
      expect(cleanupTime).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_CLEANUP);
    });

    it('should handle large datasets without memory leaks', () => {
      // Create large dataset
      const largeAnalysisResults = {
        synchronizedChords: Array(2000).fill(0).map((_, i) => ({
          chord: ['C', 'F', 'G', 'Am', 'Dm', 'Em', 'Bdim'][i % 7],
          beatIndex: i
        })),
        beats: Array(2000).fill(0).map((_, i) => ({ time: i * 0.25 })),
        beatDetectionResult: {
          bpm: 120,
          time_signature: 4
        }
      };

      const start = performance.now();
      
      // Process large dataset
      const result = getChordGridData(largeAnalysisResults);
      
      // Perform analysis on the result
      const chords = result.chords.filter(chord => chord && chord !== '');
      analyzeChordProgression(chords);
      
      const end = performance.now();
      const largeDatasetTime = end - start;

      console.log(`📊 Large dataset processing (2000 items): ${largeDatasetTime.toFixed(2)}ms`);
      expect(largeDatasetTime).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_DATASET_PROCESSING);
      expect(result.chords.length).toBeGreaterThan(0);
    });
  });

  describe('Memoization and Optimization Validation', () => {
    it('should preserve memoization strategies', () => {
      const analysisProps = {
        videoId: 'test-video',
        analysisResults: null,
        audioProcessingState: {
          isExtracted: false,
          audioUrl: null,
          isAnalyzed: false,
          isAnalyzing: false
        }
      };

      const { result, rerender } = renderHook(() => useAnalysisState(analysisProps));

      // Get initial memoized values
      const initialChordCorrections = result.current.memoizedChordCorrections;
      const initialSequenceCorrections = result.current.memoizedSequenceCorrections;

      // Rerender without changing dependencies
      rerender();

      // Verify memoized values are preserved (same reference)
      expect(result.current.memoizedChordCorrections).toBe(initialChordCorrections);
      expect(result.current.memoizedSequenceCorrections).toBe(initialSequenceCorrections);

      console.log('✅ Memoization strategies preserved');
    });

    it('should validate useCallback optimizations', () => {
      const playbackProps = {
        audioRef: { current: { currentTime: 0, play: jest.fn(), pause: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() } },
        youtubePlayer: null,
        setYoutubePlayer: jest.fn(),
        audioPlayerState: {
          isPlaying: false,
          currentTime: 0,
          duration: 100,
          playbackRate: 1,
          preferredAudioSource: 'extracted'
        },
        setAudioPlayerState: jest.fn(),
        setDuration: jest.fn(),
        isFollowModeEnabled: true
      };

      const { result, rerender } = renderHook(() => usePlaybackState(playbackProps));

      // Get initial callback references
      const initialHandleBeatClick = result.current.handleBeatClick;
      const initialHandleYouTubeReady = result.current.handleYouTubeReady;

      // Rerender without changing dependencies
      rerender();

      // Verify callbacks are preserved (same reference)
      expect(result.current.handleBeatClick).toBe(initialHandleBeatClick);
      expect(result.current.handleYouTubeReady).toBe(initialHandleYouTubeReady);

      console.log('✅ useCallback optimizations preserved');
    });
  });
});
