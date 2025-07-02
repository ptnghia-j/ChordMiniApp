/**
 * Unit tests for utility functions and algorithms used in the analyze page
 * These tests focus on the core business logic and data processing functions
 */

describe('Analyze Page Utility Functions', () => {
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
      downbeats: [0.5, 2.5, 4.5],
      downbeats_with_measures: [0.5, 2.5, 4.5],
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

    describe('getChordGridData', () => {
      // Mock implementation of the getChordGridData function
      const getChordGridData = (
        analysisResults: any,
        timeSignature: number = 4,
        measuresPerRow: number = 4
      ) => {
        if (!analysisResults?.synchronizedChords || !analysisResults?.beats) {
          return null;
        }

        const { synchronizedChords, beats } = analysisResults;
        const totalBeats = beats.length;
        const beatsPerMeasure = timeSignature;
        const totalCells = measuresPerRow * beatsPerMeasure;

        // Calculate optimal shift for chord alignment
        let bestShift = 0;
        let maxDownbeatChords = 0;

        for (let shift = 0; shift < beatsPerMeasure; shift++) {
          let downbeatChords = 0;
          synchronizedChords.forEach((chord: any) => {
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
        const chords: (string | null)[] = [];
        const beatTimestamps: (number | null)[] = [];

        // Add padding
        for (let i = 0; i < paddingCount; i++) {
          chords.push('N.C.');
          beatTimestamps.push(null);
        }

        // Add synchronized chords
        synchronizedChords.forEach((chord: any, index: number) => {
          chords.push(chord.chord);
          beatTimestamps.push(beats[chord.beatIndex]?.time || 0);
        });

        // Fill remaining cells
        while (chords.length % totalCells !== 0) {
          chords.push(null);
          beatTimestamps.push(null);
        }

        return {
          chords,
          beats: beatTimestamps,
          hasPadding: paddingCount > 0,
          paddingCount,
          shiftCount: bestShift,
          totalPaddingCount: paddingCount,
          originalAudioMapping: synchronizedChords.map((chord: any, index: number) => ({
            chord: chord.chord,
            timestamp: beats[chord.beatIndex]?.time || 0,
            visualIndex: index + paddingCount,
            audioIndex: chord.beatIndex,
          })),
          animationMapping: synchronizedChords.map((chord: any, index: number) => ({
            timestamp: beats[chord.beatIndex]?.time || 0,
            visualIndex: index + paddingCount,
            chord: chord.chord,
          })),
        };
      };

      it('processes analysis results correctly', () => {
        const result = getChordGridData(mockAnalysisResults, 4, 4);
        
        expect(result).not.toBeNull();
        expect(result?.chords).toBeDefined();
        expect(result?.beats).toBeDefined();
        expect(result?.chords.length).toBeGreaterThan(0);
      });

      it('calculates optimal shift for chord alignment', () => {
        const result = getChordGridData(mockAnalysisResults, 4, 4);
        
        expect(result?.shiftCount).toBeDefined();
        expect(result?.shiftCount).toBeGreaterThanOrEqual(0);
        expect(result?.shiftCount).toBeLessThan(4);
      });

      it('adds appropriate padding for pickup beats', () => {
        const result = getChordGridData(mockAnalysisResults, 4, 4);
        
        if (result?.hasPadding) {
          expect(result.paddingCount).toBeGreaterThan(0);
          expect(result.chords.slice(0, result.paddingCount)).toEqual(
            Array(result.paddingCount).fill('N.C.')
          );
        }
      });

      it('creates proper audio-visual mapping', () => {
        const result = getChordGridData(mockAnalysisResults, 4, 4);
        
        expect(result?.originalAudioMapping).toBeDefined();
        expect(result?.animationMapping).toBeDefined();
        
        result?.originalAudioMapping?.forEach((mapping: any) => {
          expect(mapping.chord).toBeDefined();
          expect(mapping.timestamp).toBeGreaterThanOrEqual(0);
          expect(mapping.visualIndex).toBeGreaterThanOrEqual(0);
          expect(mapping.audioIndex).toBeGreaterThanOrEqual(0);
        });
      });

      it('handles empty analysis results', () => {
        const emptyResults = {
          synchronizedChords: [],
          beats: [],
          chords: [],
          downbeats: [],
        };
        
        const result = getChordGridData(emptyResults, 4, 4);
        expect(result?.chords).toEqual([]);
      });

      it('handles missing analysis results', () => {
        const result = getChordGridData(null, 4, 4);
        expect(result).toBeNull();
      });

      it('adapts to different time signatures', () => {
        const result3_4 = getChordGridData(mockAnalysisResults, 3, 4);
        const result4_4 = getChordGridData(mockAnalysisResults, 4, 4);
        
        expect(result3_4?.shiftCount).toBeLessThan(3);
        expect(result4_4?.shiftCount).toBeLessThan(4);
      });

      it('adapts to different measures per row', () => {
        const result2Measures = getChordGridData(mockAnalysisResults, 4, 2);
        const result4Measures = getChordGridData(mockAnalysisResults, 4, 4);
        
        // Different measures per row should affect grid layout
        expect(result2Measures).not.toBeNull();
        expect(result4Measures).not.toBeNull();
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
      const findCurrentBeatIndex = (currentTime: number, beats: any[], lastBeatIndex: number = -1) => {
        if (!beats || beats.length === 0) return -1;
        
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
      };

      it('finds correct beat index for given timestamp', () => {
        expect(findCurrentBeatIndex(0.6, mockBeats)).toBe(0);
        expect(findCurrentBeatIndex(1.1, mockBeats)).toBe(1);
        expect(findCurrentBeatIndex(2.6, mockBeats)).toBe(4);
      });

      it('handles edge cases with timing tolerance', () => {
        // Test timing tolerance (100ms)
        expect(findCurrentBeatIndex(0.45, mockBeats)).toBe(0); // Close to first beat
        expect(findCurrentBeatIndex(0.55, mockBeats)).toBe(0);  // Within tolerance
      });

      it('implements forward progression logic', () => {
        // Should not go backward
        expect(findCurrentBeatIndex(1.0, mockBeats, 2)).toBe(2);
        expect(findCurrentBeatIndex(2.0, mockBeats, 1)).toBe(3);
      });

      it('handles empty beat array', () => {
        expect(findCurrentBeatIndex(1.0, [])).toBe(-1);
        expect(findCurrentBeatIndex(1.0, null as any)).toBe(-1);
      });

      it('handles timestamps beyond last beat', () => {
        expect(findCurrentBeatIndex(10.0, mockBeats)).toBe(5); // Last beat index
      });
    });

    describe('Chord Correction Algorithms', () => {
      // Mock implementation of enharmonic correction
      const applyEnharmonicCorrection = (chord: string, keySignature: string) => {
        const corrections: Record<string, Record<string, string>> = {
          'C': {
            'Db': 'C#',
            'Eb': 'D#',
            'Gb': 'F#',
            'Ab': 'G#',
            'Bb': 'A#',
          },
          'F': {
            'C#': 'Db',
            'D#': 'Eb',
            'F#': 'Gb',
            'G#': 'Ab',
            'A#': 'Bb',
          },
        };
        
        return corrections[keySignature]?.[chord] || chord;
      };

      it('applies correct enharmonic spellings', () => {
        expect(applyEnharmonicCorrection('Db', 'C')).toBe('C#');
        expect(applyEnharmonicCorrection('C#', 'F')).toBe('Db');
        expect(applyEnharmonicCorrection('G', 'C')).toBe('G'); // No change needed
      });

      it('handles unknown chords gracefully', () => {
        expect(applyEnharmonicCorrection('X', 'C')).toBe('X');
        expect(applyEnharmonicCorrection('C', 'Unknown')).toBe('C');
      });
    });

    describe('Audio Synchronization', () => {
      // Mock implementation of timing sync
      const calculateSyncedTimestamp = (audioTime: number, youtubeTime: number, calibrationPoints: any[]) => {
        if (calibrationPoints.length === 0) {
          return { syncedTime: audioTime, confidence: 0.5 };
        }
        
        // Simple linear interpolation for testing
        const avgOffset = calibrationPoints.reduce((sum, point) => sum + (point.youtubeTime - point.audioTime), 0) / calibrationPoints.length;
        
        return {
          syncedTime: audioTime + avgOffset,
          confidence: Math.min(calibrationPoints.length / 10, 1.0),
        };
      };

      it('calculates synchronized timestamps', () => {
        const calibrationPoints = [
          { audioTime: 1.0, youtubeTime: 1.1 },
          { audioTime: 2.0, youtubeTime: 2.1 },
        ];
        
        const result = calculateSyncedTimestamp(3.0, 0, calibrationPoints);
        
        expect(result.syncedTime).toBeCloseTo(3.1, 1);
        expect(result.confidence).toBeGreaterThan(0);
      });

      it('handles empty calibration points', () => {
        const result = calculateSyncedTimestamp(1.0, 1.0, []);
        
        expect(result.syncedTime).toBe(1.0);
        expect(result.confidence).toBe(0.5);
      });

      it('increases confidence with more calibration points', () => {
        const fewPoints = [{ audioTime: 1.0, youtubeTime: 1.1 }];
        const manyPoints = Array(15).fill(0).map((_, i) => ({
          audioTime: i,
          youtubeTime: i + 0.1,
        }));
        
        const resultFew = calculateSyncedTimestamp(1.0, 0, fewPoints);
        const resultMany = calculateSyncedTimestamp(1.0, 0, manyPoints);
        
        expect(resultMany.confidence).toBeGreaterThan(resultFew.confidence);
      });
    });
  });

  describe('Data Validation', () => {
    it('validates analysis result structure', () => {
      const isValidAnalysisResult = (result: any) => {
        if (!result) return false;
        return (
          Array.isArray(result.chords) &&
          Array.isArray(result.beats) &&
          Array.isArray(result.synchronizedChords) &&
          typeof result.audioDuration === 'number' &&
          typeof result.beatModel === 'string' &&
          typeof result.chordModel === 'string'
        );
      };

      const validAnalysisResult = {
        chords: [{ chord: 'C', time: 0.5 }],
        beats: [{ time: 0.5 }],
        synchronizedChords: [{ chord: 'C', beatIndex: 0 }],
        audioDuration: 120,
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm'
      };

      expect(isValidAnalysisResult(validAnalysisResult)).toBe(true);
      expect(isValidAnalysisResult(null)).toBe(false);
      expect(isValidAnalysisResult({})).toBe(false);
      expect(isValidAnalysisResult({ chords: 'invalid' })).toBe(false);
    });

    it('validates chord format', () => {
      const isValidChord = (chord: string) => {
        const chordPattern = /^[A-G][#b]?(m|maj|dim|aug)?(\d+)?$/;
        return chord === 'N.C.' || chordPattern.test(chord);
      };

      expect(isValidChord('C')).toBe(true);
      expect(isValidChord('Cm')).toBe(true);
      expect(isValidChord('C#maj7')).toBe(true);
      expect(isValidChord('N.C.')).toBe(true);
      expect(isValidChord('Invalid')).toBe(false);
      expect(isValidChord('')).toBe(false);
    });

    it('validates timestamp format', () => {
      const isValidTimestamp = (timestamp: number) => {
        return typeof timestamp === 'number' && timestamp >= 0 && isFinite(timestamp);
      };

      expect(isValidTimestamp(0)).toBe(true);
      expect(isValidTimestamp(123.45)).toBe(true);
      expect(isValidTimestamp(-1)).toBe(false);
      expect(isValidTimestamp(Infinity)).toBe(false);
      expect(isValidTimestamp(NaN)).toBe(false);
    });
  });

  describe('Performance Utilities', () => {
    it('debounces rapid function calls', (done) => {
      const debounce = (func: Function, delay: number) => {
        let timeoutId: NodeJS.Timeout;
        return (...args: any[]) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func.apply(null, args), delay);
        };
      };

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
      const throttle = (func: Function, delay: number) => {
        let lastCall = 0;
        return (...args: any[]) => {
          const now = Date.now();
          if (now - lastCall >= delay) {
            lastCall = now;
            return func.apply(null, args);
          }
        };
      };

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
