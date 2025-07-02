/**
 * Core functionality tests for analyze page concepts
 * Tests the business logic and algorithms without complex component dependencies
 */

describe('Analyze Page Core Functionality', () => {
  describe('Chord Grid Data Processing', () => {
    const mockAnalysisResults = {
      chords: [
        { chord: 'C', time: 0.5 },
        { chord: 'F', time: 2.0 },
        { chord: 'G', time: 3.5 },
        { chord: 'C', time: 5.0 },
      ],
      beats: [
        { time: 0.5 },
        { time: 1.0 },
        { time: 1.5 },
        { time: 2.0 },
        { time: 2.5 },
        { time: 3.0 },
        { time: 3.5 },
        { time: 4.0 },
        { time: 4.5 },
        { time: 5.0 },
      ],
      synchronizedChords: [
        { chord: 'C', beatIndex: 0, beatNum: 1 },
        { chord: 'F', beatIndex: 3, beatNum: 1 },
        { chord: 'G', beatIndex: 6, beatNum: 1 },
        { chord: 'C', beatIndex: 9, beatNum: 1 },
      ],
      beatModel: 'beat-transformer',
      chordModel: 'chord-cnn-lstm',
      audioDuration: 180,
      beatDetectionResult: {
        time_signature: 4,
        bpm: 120,
        beatShift: 0,
      },
    };

    // Mock implementation of chord grid data processing
    function getChordGridData(analysisResults, timeSignature = 4, measuresPerRow = 4) {
      if (!analysisResults?.synchronizedChords || !analysisResults?.beats) {
        return null;
      }

      const { synchronizedChords, beats } = analysisResults;
      const beatsPerMeasure = timeSignature;

      // Calculate optimal shift for chord alignment
      let bestShift = 0;
      let maxDownbeatChords = 0;

      for (let shift = 0; shift < beatsPerMeasure; shift++) {
        let downbeatChords = 0;
        synchronizedChords.forEach((chord) => {
          const adjustedIndex = (chord.beatIndex + shift) % beatsPerMeasure;
          if (adjustedIndex === 0) {
            downbeatChords++;
          }
        });
        
        if (downbeatChords > maxDownbeatChords) {
          maxDownbeatChords = downbeatChords;
          bestShift = shift;
        }
      }

      // Create chord grid with padding and shifting
      const paddingCount = Math.max(0, bestShift);
      const chords = [];
      const beatTimestamps = [];

      // Add padding
      for (let i = 0; i < paddingCount; i++) {
        chords.push('N.C.');
        beatTimestamps.push(null);
      }

      // Add synchronized chords
      synchronizedChords.forEach((chord, index) => {
        chords.push(chord.chord);
        beatTimestamps.push(beats[chord.beatIndex]?.time || 0);
      });

      return {
        chords,
        beats: beatTimestamps,
        hasPadding: paddingCount > 0,
        paddingCount,
        shiftCount: bestShift,
        totalPaddingCount: paddingCount,
      };
    }

    it('processes analysis results correctly', () => {
      const result = getChordGridData(mockAnalysisResults, 4, 4);
      
      expect(result).not.toBeNull();
      expect(result.chords).toBeDefined();
      expect(result.beats).toBeDefined();
      expect(result.chords.length).toBeGreaterThan(0);
    });

    it('calculates optimal shift for chord alignment', () => {
      const result = getChordGridData(mockAnalysisResults, 4, 4);
      
      expect(result.shiftCount).toBeDefined();
      expect(result.shiftCount).toBeGreaterThanOrEqual(0);
      expect(result.shiftCount).toBeLessThan(4);
    });

    it('adds appropriate padding for pickup beats', () => {
      const result = getChordGridData(mockAnalysisResults, 4, 4);
      
      if (result.hasPadding) {
        expect(result.paddingCount).toBeGreaterThan(0);
        expect(result.chords.slice(0, result.paddingCount)).toEqual(
          Array(result.paddingCount).fill('N.C.')
        );
      }
    });

    it('handles empty analysis results', () => {
      const emptyResults = {
        synchronizedChords: [],
        beats: [],
        chords: [],
      };
      
      const result = getChordGridData(emptyResults, 4, 4);
      expect(result.chords).toEqual([]);
    });

    it('handles missing analysis results', () => {
      const result = getChordGridData(null, 4, 4);
      expect(result).toBeNull();
    });

    it('adapts to different time signatures', () => {
      const result3_4 = getChordGridData(mockAnalysisResults, 3, 4);
      const result4_4 = getChordGridData(mockAnalysisResults, 4, 4);
      
      expect(result3_4.shiftCount).toBeLessThan(3);
      expect(result4_4.shiftCount).toBeLessThan(4);
    });
  });

  describe('Beat Tracking Algorithms', () => {
    const mockBeats = [
      { time: 0.5 },
      { time: 1.0 },
      { time: 1.5 },
      { time: 2.0 },
      { time: 2.5 },
      { time: 3.0 },
    ];

    // Mock implementation of beat tracking function
    function findCurrentBeatIndex(currentTime, beats, lastBeatIndex = -1) {
      if (!beats || beats.length === 0) return -1;

      // Handle case where currentTime is before first beat
      if (currentTime < beats[0].time - 0.1) {
        return -1;
      }

      // Find the beat that's currently playing or just passed
      let currentBeatIndex = -1;

      for (let i = 0; i < beats.length; i++) {
        if (beats[i].time <= currentTime + 0.1) { // 100ms tolerance
          currentBeatIndex = i;
        } else {
          break;
        }
      }

      // Implement forward progression logic
      if (currentBeatIndex < lastBeatIndex) {
        return lastBeatIndex;
      }

      return currentBeatIndex;
    }

    it('finds correct beat index for given timestamp', () => {
      expect(findCurrentBeatIndex(0.6, mockBeats)).toBe(0);
      expect(findCurrentBeatIndex(1.1, mockBeats)).toBe(1);
      expect(findCurrentBeatIndex(2.6, mockBeats)).toBe(4);
    });

    it('handles edge cases with timing tolerance', () => {
      // Test timing tolerance (100ms)
      expect(findCurrentBeatIndex(0.35, mockBeats)).toBe(-1); // Before first beat (0.5 - 0.1 = 0.4)
      expect(findCurrentBeatIndex(0.55, mockBeats)).toBe(0);  // Within tolerance
    });

    it('implements forward progression logic', () => {
      // Should not go backward
      expect(findCurrentBeatIndex(1.0, mockBeats, 2)).toBe(2);
      expect(findCurrentBeatIndex(2.0, mockBeats, 1)).toBe(3);
    });

    it('handles empty beat array', () => {
      expect(findCurrentBeatIndex(1.0, [])).toBe(-1);
      expect(findCurrentBeatIndex(1.0, null)).toBe(-1);
    });

    it('handles timestamps beyond last beat', () => {
      expect(findCurrentBeatIndex(10.0, mockBeats)).toBe(5); // Last beat index
    });
  });

  describe('Model Selection and Persistence', () => {
    // Mock localStorage
    const mockLocalStorage = {
      store: {},
      getItem: jest.fn((key) => mockLocalStorage.store[key] || null),
      setItem: jest.fn((key, value) => {
        mockLocalStorage.store[key] = value;
      }),
      removeItem: jest.fn((key) => {
        delete mockLocalStorage.store[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage.store = {};
      }),
    };

    beforeEach(() => {
      mockLocalStorage.clear();
      jest.clearAllMocks();
    });

    function getStoredBeatDetector() {
      const saved = mockLocalStorage.getItem('chordmini_beat_detector');
      if (saved && ['auto', 'madmom', 'beat-transformer'].includes(saved)) {
        return saved;
      }
      return 'beat-transformer'; // default
    }

    function setStoredBeatDetector(value) {
      mockLocalStorage.setItem('chordmini_beat_detector', value);
    }

    it('returns default beat detector when no stored value', () => {
      expect(getStoredBeatDetector()).toBe('beat-transformer');
    });

    it('returns stored beat detector when valid', () => {
      mockLocalStorage.setItem('chordmini_beat_detector', 'madmom');
      expect(getStoredBeatDetector()).toBe('madmom');
    });

    it('returns default when stored value is invalid', () => {
      mockLocalStorage.setItem('chordmini_beat_detector', 'invalid-model');
      expect(getStoredBeatDetector()).toBe('beat-transformer');
    });

    it('persists beat detector selection', () => {
      setStoredBeatDetector('auto');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('chordmini_beat_detector', 'auto');
    });
  });

  describe('Data Validation', () => {
    function isValidAnalysisResult(result) {
      return !!(
        result &&
        Array.isArray(result.chords) &&
        Array.isArray(result.beats) &&
        Array.isArray(result.synchronizedChords) &&
        typeof result.audioDuration === 'number' &&
        typeof result.beatModel === 'string' &&
        typeof result.chordModel === 'string'
      );
    }

    function isValidChord(chord) {
      const chordPattern = /^[A-G][#b]?(m|maj|dim|aug)?(\d+)?$/;
      return chord === 'N.C.' || chordPattern.test(chord);
    }

    function isValidTimestamp(timestamp) {
      return typeof timestamp === 'number' && timestamp >= 0 && isFinite(timestamp);
    }

    it('validates analysis result structure', () => {
      const validResult = {
        chords: [],
        beats: [],
        synchronizedChords: [],
        audioDuration: 180,
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
      };

      expect(isValidAnalysisResult(validResult)).toBe(true);
      expect(isValidAnalysisResult(null)).toBe(false);
      expect(isValidAnalysisResult({})).toBe(false);
      expect(isValidAnalysisResult({ chords: 'invalid' })).toBe(false);
    });

    it('validates chord format', () => {
      expect(isValidChord('C')).toBe(true);
      expect(isValidChord('Cm')).toBe(true);
      expect(isValidChord('C#maj7')).toBe(true);
      expect(isValidChord('N.C.')).toBe(true);
      expect(isValidChord('Invalid')).toBe(false);
      expect(isValidChord('')).toBe(false);
    });

    it('validates timestamp format', () => {
      expect(isValidTimestamp(0)).toBe(true);
      expect(isValidTimestamp(123.45)).toBe(true);
      expect(isValidTimestamp(-1)).toBe(false);
      expect(isValidTimestamp(Infinity)).toBe(false);
      expect(isValidTimestamp(NaN)).toBe(false);
    });
  });

  describe('Performance Utilities', () => {
    it('debounces rapid function calls', (done) => {
      function debounce(func, delay) {
        let timeoutId;
        return (...args) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func.apply(null, args), delay);
        };
      }

      let callCount = 0;
      const debouncedFunc = debounce(() => {
        callCount++;
      }, 50);

      // Call multiple times rapidly
      debouncedFunc();
      debouncedFunc();
      debouncedFunc();

      // Should only execute once after delay
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 100);
    });

    it('throttles function execution', (done) => {
      function throttle(func, delay) {
        let lastCall = 0;
        return (...args) => {
          const now = Date.now();
          if (now - lastCall >= delay) {
            lastCall = now;
            return func.apply(null, args);
          }
        };
      }

      let callCount = 0;
      const throttledFunc = throttle(() => {
        callCount++;
      }, 50);

      // Call multiple times rapidly
      throttledFunc();
      throttledFunc();
      throttledFunc();

      // Should execute immediately once
      expect(callCount).toBe(1);

      setTimeout(() => {
        throttledFunc();
        expect(callCount).toBe(2);
        done();
      }, 60);
    });
  });
});
