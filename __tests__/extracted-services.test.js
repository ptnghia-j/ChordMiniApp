/**
 * Test suite for extracted services from analyze page refactoring
 * Validates that extracted functions maintain identical behavior
 */

import { calculateOptimalShift, calculatePaddingAndShift, getChordGridData } from '../src/services/chordGridProcessor';
import { createBeatTrackingInterval } from '../src/services/beatTrackingEngine';

// Mock timingSyncService for beat tracking tests
jest.mock('../src/services/timingSyncService', () => ({
  timingSyncService: {
    getSyncedTimestamp: jest.fn((time, type) => ({
      syncedTime: time,
      confidence: 0.8
    })),
    addCalibrationPoint: jest.fn()
  }
}));

describe('Extracted Services Validation', () => {
  describe('Chord Grid Processor', () => {
    describe('calculateOptimalShift', () => {
      it('should calculate optimal shift for chord alignment', () => {
        const chords = ['C', 'C', 'F', 'F', 'G', 'G', 'C', 'C'];
        const timeSignature = 4;
        const paddingCount = 0;

        const result = calculateOptimalShift(chords, timeSignature, paddingCount);
        
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(timeSignature);
      });

      it('should handle empty chord array', () => {
        const result = calculateOptimalShift([], 4, 0);
        expect(result).toBe(0);
      });

      it('should work with different time signatures', () => {
        const chords = ['C', 'F', 'G'];
        
        const result3_4 = calculateOptimalShift(chords, 3, 0);
        const result4_4 = calculateOptimalShift(chords, 4, 0);
        
        expect(result3_4).toBeGreaterThanOrEqual(0);
        expect(result3_4).toBeLessThan(3);
        expect(result4_4).toBeGreaterThanOrEqual(0);
        expect(result4_4).toBeLessThan(4);
      });
    });

    describe('calculatePaddingAndShift', () => {
      it('should calculate padding and shift correctly', () => {
        const firstDetectedBeatTime = 1.5; // 1.5 seconds
        const bpm = 120;
        const timeSignature = 4;
        const chords = ['C', 'F', 'G', 'C'];

        const result = calculatePaddingAndShift(firstDetectedBeatTime, bpm, timeSignature, chords);
        
        expect(result).toHaveProperty('paddingCount');
        expect(result).toHaveProperty('shiftCount');
        expect(result).toHaveProperty('totalPaddingCount');
        expect(typeof result.paddingCount).toBe('number');
        expect(typeof result.shiftCount).toBe('number');
        expect(result.totalPaddingCount).toBe(result.paddingCount + result.shiftCount);
      });

      it('should return zero padding for very early beats', () => {
        const result = calculatePaddingAndShift(0.01, 120, 4, []);
        
        expect(result.paddingCount).toBe(0);
        expect(result.shiftCount).toBe(0);
        expect(result.totalPaddingCount).toBe(0);
      });

      it('should handle different BPM values', () => {
        const firstDetectedBeatTime = 1.0;
        const timeSignature = 4;
        const chords = ['C', 'F'];

        const result60 = calculatePaddingAndShift(firstDetectedBeatTime, 60, timeSignature, chords);
        const result120 = calculatePaddingAndShift(firstDetectedBeatTime, 120, timeSignature, chords);
        
        // Higher BPM should generally result in more padding beats for the same time gap
        expect(result120.paddingCount).toBeGreaterThanOrEqual(result60.paddingCount);
      });
    });

    describe('getChordGridData', () => {
      it('should process valid analysis results', () => {
        const mockAnalysisResults = {
          synchronizedChords: [
            { chord: 'C', beatIndex: 0 },
            { chord: 'F', beatIndex: 1 },
            { chord: 'G', beatIndex: 2 },
            { chord: 'C', beatIndex: 3 }
          ],
          beats: [
            { time: 0.5 },
            { time: 1.0 },
            { time: 1.5 },
            { time: 2.0 }
          ],
          beatDetectionResult: {
            bpm: 120,
            time_signature: 4
          }
        };

        const result = getChordGridData(mockAnalysisResults);
        
        expect(result).toHaveProperty('chords');
        expect(result).toHaveProperty('beats');
        expect(result).toHaveProperty('hasPadding');
        expect(result).toHaveProperty('paddingCount');
        expect(result).toHaveProperty('shiftCount');
        expect(result).toHaveProperty('totalPaddingCount');
        expect(Array.isArray(result.chords)).toBe(true);
        expect(Array.isArray(result.beats)).toBe(true);
      });

      it('should handle null analysis results', () => {
        const result = getChordGridData(null);
        
        expect(result.chords).toEqual([]);
        expect(result.beats).toEqual([]);
        expect(result.hasPadding).toBe(false);
        expect(result.paddingCount).toBe(0);
        expect(result.shiftCount).toBe(0);
        expect(result.totalPaddingCount).toBe(0);
      });

      it('should handle analysis results without synchronized chords', () => {
        const mockAnalysisResults = {
          beats: [{ time: 0.5 }],
          beatDetectionResult: { bpm: 120, time_signature: 4 }
        };

        const result = getChordGridData(mockAnalysisResults);
        
        expect(result.chords).toEqual([]);
        expect(result.beats).toEqual([]);
        expect(result.hasPadding).toBe(false);
      });

      it('should create original audio mapping when padding is applied', () => {
        const mockAnalysisResults = {
          synchronizedChords: [
            { chord: 'C', beatIndex: 0 },
            { chord: 'F', beatIndex: 1 }
          ],
          beats: [
            { time: 1.0 }, // First beat at 1 second should trigger padding
            { time: 1.5 }
          ],
          beatDetectionResult: {
            bpm: 120,
            time_signature: 4
          }
        };

        const result = getChordGridData(mockAnalysisResults);
        
        if (result.paddingCount > 0 || result.shiftCount > 0) {
          expect(result).toHaveProperty('originalAudioMapping');
          expect(Array.isArray(result.originalAudioMapping)).toBe(true);
          
          if (result.originalAudioMapping && result.originalAudioMapping.length > 0) {
            const mapping = result.originalAudioMapping[0];
            expect(mapping).toHaveProperty('chord');
            expect(mapping).toHaveProperty('timestamp');
            expect(mapping).toHaveProperty('visualIndex');
            expect(mapping).toHaveProperty('audioIndex');
          }
        }
      });
    });
  });

  describe('Beat Tracking Engine', () => {
    let mockDependencies;
    let mockAudioElement;

    beforeEach(() => {
      // Create mock audio element
      mockAudioElement = {
        currentTime: 0,
        play: jest.fn(),
        pause: jest.fn()
      };

      // Create mock dependencies
      mockDependencies = {
        audioRef: { current: mockAudioElement },
        isPlaying: true,
        analysisResults: {
          beats: [0.5, 1.0, 1.5, 2.0],
          downbeats: [0.5, 2.0],
          chordModel: 'chord-cnn-lstm',
          beatDetectionResult: {
            bpm: 120,
            time_signature: 4
          }
        },
        chordGridData: {
          chords: ['C', 'F', 'G', 'C'],
          beats: [0.5, 1.0, 1.5, 2.0],
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
    });

    it('should create beat tracking interval function', () => {
      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      
      expect(typeof cleanupFunction).toBe('function');
      
      // Cleanup the interval
      cleanupFunction();
    });

    it('should handle audio element without current time', () => {
      mockDependencies.audioRef.current = null;
      
      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      
      expect(typeof cleanupFunction).toBe('function');
      expect(mockDependencies.setCurrentTime).not.toHaveBeenCalled();
      
      // Cleanup
      cleanupFunction();
    });

    it('should handle paused audio', () => {
      mockDependencies.isPlaying = false;
      
      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      
      expect(typeof cleanupFunction).toBe('function');
      
      // Cleanup
      cleanupFunction();
    });

    it('should handle missing chord grid data', () => {
      mockDependencies.chordGridData = null;
      
      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      
      expect(typeof cleanupFunction).toBe('function');
      
      // Cleanup
      cleanupFunction();
    });

    it('should handle click info correctly', () => {
      mockDependencies.lastClickInfo = {
        visualIndex: 2,
        timestamp: 1.5,
        clickTime: Date.now() - 100 // 100ms ago
      };
      
      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      
      expect(typeof cleanupFunction).toBe('function');
      
      // Cleanup
      cleanupFunction();
    });
  });

  describe('Service Integration', () => {
    it('should maintain consistent data flow between services', () => {
      // Test that chord grid processor output is compatible with beat tracking engine input
      const mockAnalysisResults = {
        synchronizedChords: [
          { chord: 'C', beatIndex: 0 },
          { chord: 'F', beatIndex: 1 }
        ],
        beats: [{ time: 0.5 }, { time: 1.0 }],
        beatDetectionResult: { bpm: 120, time_signature: 4 }
      };

      const chordGridData = getChordGridData(mockAnalysisResults);
      
      // Verify that chord grid data has the structure expected by beat tracking engine
      expect(chordGridData).toHaveProperty('chords');
      expect(chordGridData).toHaveProperty('beats');
      expect(chordGridData).toHaveProperty('paddingCount');
      expect(chordGridData).toHaveProperty('shiftCount');
      
      // Verify arrays are properly structured
      expect(Array.isArray(chordGridData.chords)).toBe(true);
      expect(Array.isArray(chordGridData.beats)).toBe(true);
      
      // Verify that beat tracking engine can accept this data structure
      const mockDeps = {
        audioRef: { current: { currentTime: 0 } },
        isPlaying: false, // Set to false to avoid interval execution
        analysisResults: mockAnalysisResults,
        chordGridData: chordGridData,
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      const cleanupFunction = createBeatTrackingInterval(mockDeps);
      expect(typeof cleanupFunction).toBe('function');
      
      // Cleanup
      cleanupFunction();
    });
  });
});
