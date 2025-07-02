/**
 * Integration tests for all extracted modules from analyze page refactoring
 * Validates that all modules work together identically to the original monolithic component
 */

import { renderHook, act } from '@testing-library/react';
import { useAnalysisState } from '../src/hooks/useAnalysisState';
import { usePlaybackState } from '../src/hooks/usePlaybackState';
import { useUILayout } from '../src/hooks/useUILayout';
import { calculateOptimalShift, calculatePaddingAndShift, getChordGridData } from '../src/services/chordGridProcessor';
import { createBeatTrackingInterval } from '../src/services/beatTrackingEngine';
import { 
  checkCachedEnharmonicData, 
  checkCachedAnalysisAvailability, 
  performKeyDetectionWithCache 
} from '../src/services/cacheManager';
import { 
  formatTimestamp, 
  calculateBeatDuration, 
  calculateBeatPosition 
} from '../src/utils/timingUtils';
import { 
  parseChordNotation, 
  applyEnharmonicCorrection, 
  analyzeChordProgression 
} from '../src/utils/chordUtils';
import { 
  validateAudioFormat, 
  formatDuration, 
  classifyAudioError 
} from '../src/utils/audioUtils';
import { 
  buildSongContext, 
  validateVideoId, 
  generateUserFriendlyErrorMessage 
} from '../src/utils/helperUtils';

// Mock external dependencies
jest.mock('../src/services/firestoreService', () => ({
  getTranscription: jest.fn(),
  saveTranscription: jest.fn()
}));

jest.mock('../src/services/keyDetectionService', () => ({
  detectKey: jest.fn().mockResolvedValue({
    primaryKey: 'C major',
    corrections: { 'C#': 'Db', 'F#': 'Gb' },
    sequenceCorrections: {
      originalSequence: ['C', 'F', 'G'],
      correctedSequence: ['C', 'F', 'G']
    },
    modulation: null
  })
}));

jest.mock('../src/services/timingSyncService', () => ({
  timingSyncService: {
    getSyncedTimestamp: jest.fn((time) => ({ syncedTime: time, confidence: 0.8 })),
    addCalibrationPoint: jest.fn()
  }
}));

describe('Integration Tests - Complete Module Interaction', () => {
  describe('End-to-End Data Flow', () => {
    it('should handle complete analysis workflow from audio to display', async () => {
      // Mock analysis results
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
        },
        chords: [
          { chord: 'C', time: 0.5 },
          { chord: 'F', time: 1.0 },
          { chord: 'G', time: 1.5 },
          { chord: 'C', time: 2.0 }
        ]
      };

      // Step 1: Process chord grid data
      const chordGridData = getChordGridData(mockAnalysisResults);
      expect(chordGridData).toHaveProperty('chords');
      expect(chordGridData).toHaveProperty('beats');
      expect(Array.isArray(chordGridData.chords)).toBe(true);

      // Step 2: Calculate optimal shift
      const chords = mockAnalysisResults.synchronizedChords.map(item => item.chord);
      const optimalShift = calculateOptimalShift(chords, 4, 0);
      expect(typeof optimalShift).toBe('number');
      expect(optimalShift).toBeGreaterThanOrEqual(0);

      // Step 3: Calculate padding and shift
      const paddingResult = calculatePaddingAndShift(0.5, 120, 4, chords);
      expect(paddingResult).toHaveProperty('paddingCount');
      expect(paddingResult).toHaveProperty('shiftCount');
      expect(paddingResult).toHaveProperty('totalPaddingCount');

      // Step 4: Analyze chord progression
      const progressionAnalysis = analyzeChordProgression(chords);
      expect(progressionAnalysis).toHaveProperty('changes');
      expect(progressionAnalysis).toHaveProperty('uniqueChords');
      expect(progressionAnalysis).toHaveProperty('progressionPattern');

      // Step 5: Format timing information
      const formattedTime = formatTimestamp(1.5);
      expect(formattedTime).toBe('0:01');

      const beatDuration = calculateBeatDuration(120);
      expect(beatDuration).toBe(0.5);

      // Step 6: Build song context
      const songContext = buildSongContext(
        'test-video',
        'Test Song',
        mockAnalysisResults,
        'C major',
        null,
        false
      );
      expect(songContext).toContain('Test Song');
      expect(songContext).toContain('BPM: 120');
    });

    it('should handle state management integration across hooks', () => {
      // Mock props for all hooks
      const analysisProps = {
        videoId: 'test-video',
        analysisResults: {
          chords: [{ chord: 'C', time: 0.5 }],
          beats: [{ time: 0.5 }]
        },
        audioProcessingState: {
          isExtracted: true,
          audioUrl: 'test-audio.mp3',
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

      // Render all hooks
      const { result: analysisResult } = renderHook(() => useAnalysisState(analysisProps));
      const { result: playbackResult } = renderHook(() => usePlaybackState(playbackProps));
      const { result: uiResult } = renderHook(() => useUILayout(uiProps));

      // Test state coordination
      expect(analysisResult.current.beatDetector).toBeDefined();
      expect(playbackResult.current.currentBeatIndex).toBeDefined();
      expect(uiResult.current.activeTab).toBeDefined();

      // Test state updates
      act(() => {
        analysisResult.current.setBeatDetector('madmom');
        playbackResult.current.setCurrentBeatIndex(5);
        uiResult.current.setActiveTab('lyricsChords');
      });

      expect(analysisResult.current.beatDetector).toBe('madmom');
      expect(playbackResult.current.currentBeatIndex).toBe(5);
      expect(uiResult.current.activeTab).toBe('lyricsChords');
    });

    it('should handle beat tracking with chord grid integration', () => {
      const mockAnalysisResults = {
        beats: [0.5, 1.0, 1.5, 2.0],
        downbeats: [0.5, 2.0],
        chordModel: 'chord-cnn-lstm',
        beatDetectionResult: { bpm: 120, time_signature: 4 }
      };

      const mockChordGridData = {
        chords: ['C', 'F', 'G', 'C'],
        beats: [0.5, 1.0, 1.5, 2.0],
        paddingCount: 0,
        shiftCount: 0
      };

      const mockDependencies = {
        audioRef: { current: { currentTime: 1.0 } },
        isPlaying: true,
        analysisResults: mockAnalysisResults,
        chordGridData: mockChordGridData,
        currentBeatIndexRef: { current: -1 },
        globalSpeedAdjustment: null,
        lastClickInfo: null,
        setCurrentTime: jest.fn(),
        setCurrentBeatIndex: jest.fn(),
        setCurrentDownbeatIndex: jest.fn(),
        setGlobalSpeedAdjustment: jest.fn(),
        setLastClickInfo: jest.fn()
      };

      const cleanupFunction = createBeatTrackingInterval(mockDependencies);
      expect(typeof cleanupFunction).toBe('function');

      // Cleanup
      cleanupFunction();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors consistently across all modules', () => {
      // Test audio error classification
      const audioError = classifyAudioError('YouTube Short cannot be processed');
      expect(audioError.type).toBe('format');
      expect(audioError.suggestion).toContain('YouTube Shorts');

      // Test user-friendly error generation
      const friendlyError = generateUserFriendlyErrorMessage('Network timeout occurred');
      expect(friendlyError.severity).toBe('warning');
      expect(friendlyError.message).toContain('Network');

      // Test chord parsing error handling
      const invalidChord = parseChordNotation('InvalidChord123');
      expect(invalidChord.isValid).toBe(false);

      // Test audio format validation
      const invalidAudio = validateAudioFormat('not-an-audio-file.txt');
      expect(invalidAudio).toBe(false);

      const validAudio = validateAudioFormat('audio.mp3');
      expect(validAudio).toBe(true);
    });

    it('should handle edge cases in data processing', () => {
      // Test empty chord grid data
      const emptyChordGrid = getChordGridData(null);
      expect(emptyChordGrid.chords).toEqual([]);
      expect(emptyChordGrid.beats).toEqual([]);

      // Test optimal shift with empty chords
      const emptyShift = calculateOptimalShift([], 4, 0);
      expect(emptyShift).toBe(0);

      // Test chord progression with empty array
      const emptyProgression = analyzeChordProgression([]);
      expect(emptyProgression.changes).toEqual([]);
      expect(emptyProgression.uniqueChords).toEqual([]);

      // Test timing calculations with invalid values
      const invalidDuration = formatDuration(NaN);
      expect(invalidDuration).toBe('0:00');

      const invalidTimestamp = formatTimestamp(NaN);
      expect(invalidTimestamp).toBe('0:00');
    });
  });

  describe('Performance and Memory Management', () => {
    it('should properly cleanup resources', () => {
      const mockDependencies = {
        audioRef: { current: { currentTime: 0, addEventListener: jest.fn(), removeEventListener: jest.fn() } },
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

      // Create and cleanup beat tracking interval
      const cleanup = createBeatTrackingInterval(mockDependencies);
      expect(typeof cleanup).toBe('function');
      
      // Should not throw when cleaning up
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle large datasets efficiently', () => {
      // Create large dataset
      const largeChordArray = Array(1000).fill(0).map((_, i) => `C${i % 12}`);
      
      // Test chord progression analysis with large dataset
      const start = performance.now();
      const progression = analyzeChordProgression(largeChordArray);
      const end = performance.now();
      
      expect(progression.uniqueChords.length).toBeGreaterThan(0);
      expect(end - start).toBeLessThan(100); // Should complete within 100ms
      
      // Test optimal shift calculation with large dataset
      const shiftStart = performance.now();
      const shift = calculateOptimalShift(largeChordArray.slice(0, 100), 4, 0); // Limit for performance
      const shiftEnd = performance.now();
      
      expect(typeof shift).toBe('number');
      expect(shiftEnd - shiftStart).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should maintain data consistency across transformations', () => {
      const originalChords = ['C', 'F', 'G', 'C'];
      const corrections = { 'C': 'C', 'F': 'F', 'G': 'G' };
      
      // Apply corrections
      const correctedChords = originalChords.map(chord => 
        applyEnharmonicCorrection(chord, corrections)
      );
      
      expect(correctedChords).toEqual(originalChords);
      
      // Test with actual corrections
      const realCorrections = { 'C#': 'Db', 'F#': 'Gb' };
      const sharpsChords = ['C#', 'F#', 'G'];
      const correctedSharps = sharpsChords.map(chord => 
        applyEnharmonicCorrection(chord, realCorrections)
      );
      
      expect(correctedSharps).toEqual(['Db', 'Gb', 'G']);
    });

    it('should validate video IDs correctly', () => {
      // Valid YouTube video IDs
      expect(validateVideoId('dQw4w9WgXcQ')).toBe(true);
      expect(validateVideoId('abcdefghijk')).toBe(true);
      
      // Invalid video IDs
      expect(validateVideoId('too-short')).toBe(false);
      expect(validateVideoId('way-too-long-to-be-valid')).toBe(false);
      expect(validateVideoId('invalid@chars')).toBe(false);
      expect(validateVideoId('')).toBe(false);
    });

    it('should handle beat position calculations correctly', () => {
      // Test various beat positions
      const position1 = calculateBeatPosition(0, 4, 0);
      expect(position1.measureNumber).toBe(1);
      expect(position1.beatInMeasure).toBe(1);
      expect(position1.isDownbeat).toBe(true);
      
      const position2 = calculateBeatPosition(3, 4, 0);
      expect(position2.measureNumber).toBe(1);
      expect(position2.beatInMeasure).toBe(4);
      expect(position2.isDownbeat).toBe(false);
      
      const position3 = calculateBeatPosition(4, 4, 0);
      expect(position3.measureNumber).toBe(2);
      expect(position3.beatInMeasure).toBe(1);
      expect(position3.isDownbeat).toBe(true);
      
      // Test with padding
      const positionWithPadding = calculateBeatPosition(2, 4, 2);
      expect(positionWithPadding.measureNumber).toBe(1);
      expect(positionWithPadding.beatInMeasure).toBe(1);
      expect(positionWithPadding.isDownbeat).toBe(true);
    });
  });

  describe('Cache Integration', () => {
    it('should handle cache operations consistently', async () => {
      const mockDependencies = {
        videoId: 'test-video',
        beatDetector: 'beat-transformer',
        chordDetector: 'chord-cnn-lstm',
        analysisResults: {
          chords: [{ chord: 'C', time: 0.5 }]
        },
        audioProcessingState: {
          isExtracted: true,
          audioUrl: 'test.mp3',
          isAnalyzed: false,
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

      // Test cache availability check
      await checkCachedAnalysisAvailability(mockDependencies);
      expect(mockDependencies.setCacheCheckCompleted).toHaveBeenCalled();

      // Test enharmonic data check
      await checkCachedEnharmonicData(mockDependencies);
      // Should not throw errors
    });
  });
});
