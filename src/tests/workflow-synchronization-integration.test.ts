/**
 * Workflow Synchronization Integration Tests
 * 
 * This test suite validates that YouTube video analysis workflow and 
 * direct audio upload workflow produce functionally identical results
 * when given equivalent input data.
 */

import { getChordGridData } from '@/services/chordGridCalculationService';

// Mock analysis result that simulates both YouTube and upload workflow outputs
const createTestAnalysisResult = (modelType: 'youtube' | 'upload' = 'youtube') => ({
  chords: [
    {chord: 'C', time: 0.534},
    {chord: 'C', time: 1.068},
    {chord: 'Am', time: 1.602},
    {chord: 'Am', time: 2.136},
    {chord: 'F', time: 2.670},
    {chord: 'F', time: 3.204},
    {chord: 'G', time: 3.738},
    {chord: 'G', time: 4.272}
  ],
  beats: modelType === 'youtube' 
    ? [
        {time: 0.534, beatNum: 1},
        {time: 1.068, beatNum: 2},
        {time: 1.602, beatNum: 3},
        {time: 2.136, beatNum: 4},
        {time: 2.670, beatNum: 1},
        {time: 3.204, beatNum: 2},
        {time: 3.738, beatNum: 3},
        {time: 4.272, beatNum: 4}
      ]
    : [0.534, 1.068, 1.602, 2.136, 2.670, 3.204, 3.738, 4.272], // Upload format: number array
  downbeats: [0.534, 2.670],
  downbeats_with_measures: [0.534, 2.670],
  synchronizedChords: [
    {chord: 'C', beatIndex: 0, beatNum: 1},
    {chord: 'C', beatIndex: 1, beatNum: 2},
    {chord: 'Am', beatIndex: 2, beatNum: 3},
    {chord: 'Am', beatIndex: 3, beatNum: 4},
    {chord: 'F', beatIndex: 4, beatNum: 1},
    {chord: 'F', beatIndex: 5, beatNum: 2},
    {chord: 'G', beatIndex: 6, beatNum: 3},
    {chord: 'G', beatIndex: 7, beatNum: 4}
  ],
  beatModel: 'beat-transformer',
  chordModel: 'chord-cnn-lstm',
  audioDuration: 8.0,
  beatDetectionResult: {
    time_signature: 4,
    bpm: 120,
    beatShift: 0,
    beat_time_range_start: 0.534,
    paddingCount: 1,
    shiftCount: 0
  }
});

describe('Workflow Synchronization Integration Tests', () => {
  
  describe('Data Structure Equivalence', () => {
    test('should produce identical chord grid data for equivalent inputs', () => {
      const youtubeResult = createTestAnalysisResult('youtube');
      const uploadResult = createTestAnalysisResult('upload');
      
      const youtubeGridData = getChordGridData(youtubeResult);
      const uploadGridData = getChordGridData(uploadResult);
      
      // Core structure should be identical
      expect(youtubeGridData.chords).toEqual(uploadGridData.chords);
      expect(youtubeGridData.hasPadding).toBe(uploadGridData.hasPadding);
      expect(youtubeGridData.paddingCount).toBe(uploadGridData.paddingCount);
      expect(youtubeGridData.shiftCount).toBe(uploadGridData.shiftCount);
      expect(youtubeGridData.totalPaddingCount).toBe(uploadGridData.totalPaddingCount);
    });

    test('should handle beat data format differences correctly', () => {
      const youtubeResult = createTestAnalysisResult('youtube');
      const uploadResult = createTestAnalysisResult('upload');
      
      const youtubeGridData = getChordGridData(youtubeResult);
      const uploadGridData = getChordGridData(uploadResult);
      
      // Beat timestamps should be equivalent (accounting for format differences)
      expect(youtubeGridData.beats.length).toBe(uploadGridData.beats.length);
      
      // Compare actual timestamp values
      for (let i = 0; i < youtubeGridData.beats.length; i++) {
        const youtubeBeat = youtubeGridData.beats[i];
        const uploadBeat = uploadGridData.beats[i];
        
        if (youtubeBeat !== null && uploadBeat !== null) {
          expect(Math.abs(youtubeBeat - uploadBeat)).toBeLessThan(0.001); // Allow for floating point precision
        }
      }
    });
  });

  describe('Padding and Shift Logic Consistency', () => {
    test('should apply identical padding logic', () => {
      const testResult = createTestAnalysisResult('youtube');
      
      const gridData = getChordGridData(testResult);
      
      // Validate padding is applied correctly
      if (gridData.paddingCount > 0) {
        // First paddingCount chords should be padding chords
        for (let i = gridData.shiftCount; i < gridData.shiftCount + gridData.paddingCount; i++) {
          expect(gridData.chords[i]).toBe('N.C.');
        }
      }
    });

    test('should apply identical shift logic', () => {
      const testResult = createTestAnalysisResult('youtube');
      
      const gridData = getChordGridData(testResult);
      
      // Validate shift is applied correctly
      if (gridData.shiftCount > 0) {
        // First shiftCount chords should be empty
        for (let i = 0; i < gridData.shiftCount; i++) {
          expect(gridData.chords[i]).toBe('');
        }
      }
    });
  });

  describe('Original Audio Mapping Consistency', () => {
    test('should create consistent audio mapping for both workflows', () => {
      const youtubeResult = createTestAnalysisResult('youtube');
      const uploadResult = createTestAnalysisResult('upload');
      
      const youtubeGridData = getChordGridData(youtubeResult);
      const uploadGridData = getChordGridData(uploadResult);
      
      expect(youtubeGridData.originalAudioMapping).toBeDefined();
      expect(uploadGridData.originalAudioMapping).toBeDefined();
      
      const youtubeMapping = youtubeGridData.originalAudioMapping!;
      const uploadMapping = uploadGridData.originalAudioMapping!;
      
      expect(youtubeMapping.length).toBe(uploadMapping.length);
      
      // Compare mapping entries
      for (let i = 0; i < youtubeMapping.length; i++) {
        expect(youtubeMapping[i].chord).toBe(uploadMapping[i].chord);
        expect(Math.abs(youtubeMapping[i].timestamp - uploadMapping[i].timestamp)).toBeLessThan(0.001);
        expect(youtubeMapping[i].visualIndex).toBe(uploadMapping[i].visualIndex);
        expect(youtubeMapping[i].originalIndex).toBe(uploadMapping[i].originalIndex);
      }
    });
  });

  describe('Time Signature Handling', () => {
    test('should handle different time signatures identically', () => {
      const timeSignatures = [3, 4, 5, 6, 7];
      
      timeSignatures.forEach(timeSignature => {
        const testResult = {
          ...createTestAnalysisResult('youtube'),
          beatDetectionResult: {
            ...createTestAnalysisResult('youtube').beatDetectionResult,
            time_signature: timeSignature
          }
        };
        
        const gridData = getChordGridData(testResult);
        
        expect(gridData.chords).toBeInstanceOf(Array);
        expect(gridData.beats).toBeInstanceOf(Array);
        expect(gridData.chords.length).toBe(gridData.beats.length);
      });
    });
  });

  describe('BPM and Timing Consistency', () => {
    test('should handle different BPM values consistently', () => {
      const bpmValues = [60, 90, 120, 140, 180];
      
      bpmValues.forEach(bpm => {
        const testResult = {
          ...createTestAnalysisResult('youtube'),
          beatDetectionResult: {
            ...createTestAnalysisResult('youtube').beatDetectionResult,
            bpm: bpm
          }
        };
        
        const gridData = getChordGridData(testResult);
        
        expect(gridData.chords).toBeInstanceOf(Array);
        expect(gridData.beats).toBeInstanceOf(Array);
        expect(gridData.paddingCount).toBeGreaterThanOrEqual(0);
        expect(gridData.shiftCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Model Compatibility', () => {
    test('should handle Chord-CNN-LSTM model consistently', () => {
      const testResult = {
        ...createTestAnalysisResult('youtube'),
        chordModel: 'chord-cnn-lstm'
      };
      
      const gridData = getChordGridData(testResult);
      
      expect(gridData.chords).toBeInstanceOf(Array);
      expect(gridData.beats).toBeInstanceOf(Array);
      expect(gridData.originalAudioMapping).toBeDefined();
    });

    test('should handle BTC models consistently', () => {
      const btcModels = ['btc-sl', 'btc-pl'];
      
      btcModels.forEach(model => {
        const testResult = {
          ...createTestAnalysisResult('youtube'),
          chordModel: model
        };
        
        const gridData = getChordGridData(testResult);
        
        expect(gridData.chords).toBeInstanceOf(Array);
        expect(gridData.beats).toBeInstanceOf(Array);
        expect(gridData.originalAudioMapping).toBeDefined();
      });
    });
  });

  describe('Edge Cases and Robustness', () => {
    test('should handle minimal data gracefully', () => {
      const minimalResult = {
        chords: [{chord: 'C', time: 0}],
        beats: [{time: 0, beatNum: 1}],
        downbeats: [0],
        downbeats_with_measures: [0],
        synchronizedChords: [{chord: 'C', beatIndex: 0, beatNum: 1}],
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
        audioDuration: 1.0,
        beatDetectionResult: {
          time_signature: 4,
          bpm: 120,
          beatShift: 0,
          beat_time_range_start: 0
        }
      };
      
      const gridData = getChordGridData(minimalResult);
      
      expect(gridData.chords.length).toBeGreaterThan(0);
      expect(gridData.beats.length).toBe(gridData.chords.length);
    });

    test('should handle missing optional properties', () => {
      const incompleteResult = {
        chords: [{chord: 'C', time: 0}],
        beats: [{time: 0}], // Missing beatNum
        downbeats: [0],
        downbeats_with_measures: [0],
        synchronizedChords: [{chord: 'C', beatIndex: 0}], // Missing beatNum
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
        audioDuration: 1.0,
        beatDetectionResult: {
          // Missing optional properties
          bpm: 120
        }
      };
      
      const gridData = getChordGridData(incompleteResult);
      
      expect(gridData.chords).toBeInstanceOf(Array);
      expect(gridData.beats).toBeInstanceOf(Array);
    });
  });

  describe('Performance and Memory Consistency', () => {
    test('should handle large datasets efficiently', () => {
      // Create a large dataset (1000 chords/beats)
      const largeChords = Array.from({length: 1000}, (_, i) => ({
        chord: ['C', 'Am', 'F', 'G'][i % 4],
        time: i * 0.5
      }));
      
      const largeBeats = Array.from({length: 1000}, (_, i) => ({
        time: i * 0.5,
        beatNum: (i % 4) + 1
      }));
      
      const largeSyncChords = Array.from({length: 1000}, (_, i) => ({
        chord: ['C', 'Am', 'F', 'G'][i % 4],
        beatIndex: i,
        beatNum: (i % 4) + 1
      }));
      
      const largeResult = {
        chords: largeChords,
        beats: largeBeats,
        downbeats: Array.from({length: 250}, (_, i) => i * 2.0),
        downbeats_with_measures: Array.from({length: 250}, (_, i) => i * 2.0),
        synchronizedChords: largeSyncChords,
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
        audioDuration: 500.0,
        beatDetectionResult: {
          time_signature: 4,
          bpm: 120,
          beatShift: 0,
          beat_time_range_start: 0
        }
      };
      
      const startTime = performance.now();
      const gridData = getChordGridData(largeResult);
      const endTime = performance.now();
      
      expect(gridData.chords).toBeInstanceOf(Array);
      expect(gridData.beats).toBeInstanceOf(Array);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
