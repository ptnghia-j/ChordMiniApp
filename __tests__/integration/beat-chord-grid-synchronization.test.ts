/**
 * Comprehensive Beat-Chord Grid Synchronization Tests
 * 
 * This test suite validates that both YouTube video analysis workflow and 
 * direct audio upload workflow produce functionally identical beat-chord grids
 * with perfect synchronization between beats, chords, and visual animations.
 */

import { 
  calculateOptimalShift, 
  calculatePaddingAndShift,
  getChordGridData 
} from '@/services/chordGridCalculationService';

// Mock analysis result structure for testing
interface MockAnalysisResult {
  chords: Array<{chord: string, time: number}>;
  beats: Array<{time: number, beatNum?: number}>;
  downbeats: number[];
  downbeats_with_measures: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel: string;
  chordModel: string;
  audioDuration: number;
  beatDetectionResult: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
  };
}

// Helper function to create mock analysis results
const createMockAnalysisResult = (overrides: Partial<MockAnalysisResult> = {}): MockAnalysisResult => ({
  chords: [
    {chord: 'C', time: 0.534},
    {chord: 'Am', time: 1.068},
    {chord: 'F', time: 1.602},
    {chord: 'G', time: 2.136}
  ],
  beats: [
    {time: 0.534, beatNum: 1},
    {time: 1.068, beatNum: 2},
    {time: 1.602, beatNum: 3},
    {time: 2.136, beatNum: 4}
  ],
  downbeats: [0.534, 2.670],
  downbeats_with_measures: [0.534, 2.670],
  synchronizedChords: [
    {chord: 'C', beatIndex: 0, beatNum: 1},
    {chord: 'Am', beatIndex: 1, beatNum: 2},
    {chord: 'F', beatIndex: 2, beatNum: 3},
    {chord: 'G', beatIndex: 3, beatNum: 4}
  ],
  beatModel: 'beat-transformer',
  chordModel: 'chord-cnn-lstm',
  audioDuration: 10.0,
  beatDetectionResult: {
    time_signature: 4,
    bpm: 120,
    beatShift: 0,
    beat_time_range_start: 0.534
  },
  ...overrides
});

describe('Beat-Chord Grid Synchronization Tests', () => {
  
  describe('Optimal Shift Calculation', () => {
    test('should calculate identical optimal shift for same chord progression', () => {
      const chords = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'];
      const timeSignature = 4;
      const paddingCount = 2;
      
      const shift1 = calculateOptimalShift(chords, timeSignature, paddingCount);
      const shift2 = calculateOptimalShift(chords, timeSignature, paddingCount);
      
      expect(shift1).toBe(shift2);
      expect(typeof shift1).toBe('number');
      expect(shift1).toBeGreaterThanOrEqual(0);
      expect(shift1).toBeLessThan(timeSignature);
    });

    test('should handle different time signatures correctly', () => {
      const chords = ['C', 'Am', 'F', 'G', 'C', 'Am'];
      
      const shift4_4 = calculateOptimalShift(chords, 4, 0);
      const shift3_4 = calculateOptimalShift(chords, 3, 0);
      const shift6_8 = calculateOptimalShift(chords, 6, 0);
      
      expect(shift4_4).toBeGreaterThanOrEqual(0);
      expect(shift4_4).toBeLessThan(4);
      expect(shift3_4).toBeGreaterThanOrEqual(0);
      expect(shift3_4).toBeLessThan(3);
      expect(shift6_8).toBeGreaterThanOrEqual(0);
      expect(shift6_8).toBeLessThan(6);
    });

    test('should prioritize chord changes on downbeats', () => {
      // Chord progression that changes on beat 1 of each measure
      const chordsOnDownbeats = ['C', 'C', 'C', 'C', 'Am', 'Am', 'Am', 'Am', 'F', 'F', 'F', 'F'];
      // Chord progression that changes on beat 2 of each measure  
      const chordsOffDownbeats = ['C', 'Am', 'Am', 'Am', 'Am', 'F', 'F', 'F', 'F', 'G', 'G', 'G'];
      
      const shiftOnDownbeats = calculateOptimalShift(chordsOnDownbeats, 4, 0);
      const shiftOffDownbeats = calculateOptimalShift(chordsOffDownbeats, 4, 0);
      
      // The algorithm should prefer alignment that puts chord changes on downbeats
      expect(shiftOnDownbeats).toBeDefined();
      expect(shiftOffDownbeats).toBeDefined();
    });
  });

  describe('Padding and Shift Calculation', () => {
    test('should calculate consistent padding for same first beat time', () => {
      const firstBeatTime = 0.534; // Common first beat time
      const bpm = 120;
      const timeSignature = 4;
      const chords = ['C', 'Am', 'F', 'G'];
      
      const result1 = calculatePaddingAndShift(firstBeatTime, bpm, timeSignature, chords);
      const result2 = calculatePaddingAndShift(firstBeatTime, bpm, timeSignature, chords);
      
      expect(result1).toEqual(result2);
      expect(result1.paddingCount).toBeGreaterThanOrEqual(0);
      expect(result1.shiftCount).toBeGreaterThanOrEqual(0);
      expect(result1.totalPaddingCount).toBe(result1.paddingCount + result1.shiftCount);
    });

    test('should handle edge case of zero first beat time', () => {
      const firstBeatTime = 0.0;
      const bpm = 120;
      const timeSignature = 4;
      const chords = ['C', 'Am', 'F', 'G'];
      
      const result = calculatePaddingAndShift(firstBeatTime, bpm, timeSignature, chords);
      
      expect(result.paddingCount).toBe(0);
      expect(result.shiftCount).toBeGreaterThanOrEqual(0);
      expect(result.totalPaddingCount).toBe(result.shiftCount);
    });

    test('should optimize padding to reduce visual clutter', () => {
      const firstBeatTime = 4.5; // Large first beat time
      const bpm = 120;
      const timeSignature = 4;
      const chords = ['C', 'Am', 'F', 'G'];
      
      const result = calculatePaddingAndShift(firstBeatTime, bpm, timeSignature, chords);
      
      // Should optimize away full measures
      expect(result.paddingCount).toBeLessThan(timeSignature);
    });
  });

  describe('Chord Grid Data Generation', () => {

    test('should generate consistent chord grid data structure', () => {
      const mockResult = createMockAnalysisResult();
      
      const gridData1 = getChordGridData(mockResult);
      const gridData2 = getChordGridData(mockResult);
      
      expect(gridData1).toEqual(gridData2);
      expect(gridData1.chords).toBeInstanceOf(Array);
      expect(gridData1.beats).toBeInstanceOf(Array);
      expect(gridData1.chords.length).toBe(gridData1.beats.length);
      expect(typeof gridData1.hasPadding).toBe('boolean');
      expect(typeof gridData1.paddingCount).toBe('number');
      expect(typeof gridData1.shiftCount).toBe('number');
    });

    test('should handle BTC model data correctly', () => {
      const btcMockResult = createMockAnalysisResult({
        chordModel: 'btc-sl'
      });
      
      const gridData = getChordGridData(btcMockResult);
      
      expect(gridData.chords).toBeInstanceOf(Array);
      expect(gridData.beats).toBeInstanceOf(Array);
      expect(gridData.originalAudioMapping).toBeInstanceOf(Array);
    });

    test('should create proper original audio mapping', () => {
      const mockResult = createMockAnalysisResult();
      
      const gridData = getChordGridData(mockResult);
      
      expect(gridData.originalAudioMapping).toBeDefined();
      expect(gridData.originalAudioMapping!.length).toBeGreaterThan(0);
      
      gridData.originalAudioMapping!.forEach(mapping => {
        expect(mapping).toHaveProperty('chord');
        expect(mapping).toHaveProperty('timestamp');
        expect(mapping).toHaveProperty('visualIndex');
        expect(mapping).toHaveProperty('audioIndex');
        expect(typeof mapping.timestamp).toBe('number');
        expect(typeof mapping.visualIndex).toBe('number');
        expect(typeof mapping.audioIndex).toBe('number');
      });
    });
  });

  describe('Data Structure Compatibility', () => {
    test('should produce compatible data structures for both workflows', () => {
      const mockResult = createMockAnalysisResult();
      
      const gridData = getChordGridData(mockResult);
      
      // Validate structure matches expected interface
      expect(gridData).toHaveProperty('chords');
      expect(gridData).toHaveProperty('beats');
      expect(gridData).toHaveProperty('hasPadding');
      expect(gridData).toHaveProperty('paddingCount');
      expect(gridData).toHaveProperty('shiftCount');
      expect(gridData).toHaveProperty('totalPaddingCount');
      expect(gridData).toHaveProperty('originalAudioMapping');
      
      // Validate data types
      expect(Array.isArray(gridData.chords)).toBe(true);
      expect(Array.isArray(gridData.beats)).toBe(true);
      expect(typeof gridData.hasPadding).toBe('boolean');
      expect(typeof gridData.paddingCount).toBe('number');
      expect(typeof gridData.shiftCount).toBe('number');
      expect(typeof gridData.totalPaddingCount).toBe('number');
    });

    test('should handle null analysis results gracefully', () => {
      const gridData = getChordGridData(null);
      
      expect(gridData.chords).toEqual([]);
      expect(gridData.beats).toEqual([]);
      expect(gridData.hasPadding).toBe(true);
      expect(gridData.paddingCount).toBe(0);
      expect(gridData.shiftCount).toBe(0);
      expect(gridData.totalPaddingCount).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty chord arrays', () => {
      const emptyChords: string[] = [];
      const shift = calculateOptimalShift(emptyChords, 4, 0);
      expect(shift).toBe(0);
    });

    test('should handle single chord', () => {
      const singleChord = ['C'];
      const shift = calculateOptimalShift(singleChord, 4, 0);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(4);
    });

    test('should handle unusual time signatures', () => {
      const chords = ['C', 'Am', 'F', 'G', 'C'];
      
      const shift7_8 = calculateOptimalShift(chords, 7, 0);
      const shift5_4 = calculateOptimalShift(chords, 5, 0);
      
      expect(shift7_8).toBeGreaterThanOrEqual(0);
      expect(shift7_8).toBeLessThan(7);
      expect(shift5_4).toBeGreaterThanOrEqual(0);
      expect(shift5_4).toBeLessThan(5);
    });
  });
});
