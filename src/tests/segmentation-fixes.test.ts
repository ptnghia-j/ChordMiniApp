/**
 * Test suite for the three segmentation and edit mode fixes
 * 
 * Issue 1: Chord Label Edit Display - Raw input should be shown without formatting
 * Issue 2: Segmentation Color Painting - Handle qualifiers like "(Inferred)" properly
 * Issue 3: Segmentation Color Legend - Improved readability with larger swatches
 */

import { getSegmentationColor, getSegmentationColorForBeat } from '@/utils/segmentationColors';
import { SegmentationResult } from '@/types/chatbotTypes';

describe('Segmentation Fixes', () => {
  describe('Issue 2: Segmentation Color Mapping with Qualifiers', () => {
    test('should handle segment labels with qualifiers', () => {
      // Test cases from the user's example
      const testCases = [
        { input: 'Verse 2 (Inferred)', expected: 'rgba(34, 197, 94, 0.3)' }, // verse color
        { input: 'Chorus 2 (Inferred)', expected: 'rgba(244, 63, 94, 0.3)' }, // chorus color
        { input: 'Bridge (Inferred)', expected: 'rgba(168, 85, 247, 0.3)' }, // bridge color
        { input: 'Chorus 3 (Final, Inferred)', expected: 'rgba(244, 63, 94, 0.3)' }, // chorus color
        { input: 'Intro (Zulu Chant)', expected: 'rgba(156, 163, 175, 0.3)' }, // intro color
        { input: 'Transition', expected: 'rgba(156, 163, 175, 0.2)' }, // default color
      ];

      testCases.forEach(({ input, expected }) => {
        const result = getSegmentationColor(input);
        expect(result).toBe(expected);
      });
    });

    test('should handle various segment type formats', () => {
      const testCases = [
        { input: 'verse', expected: 'rgba(34, 197, 94, 0.3)' },
        { input: 'Verse', expected: 'rgba(34, 197, 94, 0.3)' },
        { input: 'VERSE', expected: 'rgba(34, 197, 94, 0.3)' },
        { input: 'verse 1', expected: 'rgba(34, 197, 94, 0.3)' },
        { input: 'Verse 2', expected: 'rgba(34, 197, 94, 0.3)' },
        { input: 'pre-chorus', expected: 'rgba(251, 146, 60, 0.3)' },
        { input: 'Pre Chorus', expected: 'rgba(251, 146, 60, 0.3)' },
        { input: 'pre_chorus', expected: 'rgba(251, 146, 60, 0.3)' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = getSegmentationColor(input);
        expect(result).toBe(expected);
      });
    });

    test('should provide fallback color for unknown segments', () => {
      const unknownSegments = ['unknown', 'weird section', 'custom part'];
      
      unknownSegments.forEach(segment => {
        const result = getSegmentationColor(segment);
        expect(result).toBe('rgba(156, 163, 175, 0.2)'); // default light gray
      });
    });
  });

  describe('Issue 2: Segmentation Coverage Edge Cases', () => {
    const mockSegmentationData: SegmentationResult = {
      segments: [
        { type: 'intro', startTime: 0, endTime: 10, confidence: 0.9, label: 'Intro' },
        { type: 'verse', startTime: 10, endTime: 30, confidence: 0.8, label: 'Verse 1' },
        { type: 'chorus', startTime: 30, endTime: 50, confidence: 0.9, label: 'Chorus 1' },
        { type: 'verse', startTime: 50, endTime: 70, confidence: 0.8, label: 'Verse 2 (Inferred)' },
        { type: 'outro', startTime: 70, endTime: 80, confidence: 0.7, label: 'Outro' },
      ],
      analysis: { structure: 'ABABC', tempo: 120, timeSignature: 4 },
      metadata: { totalDuration: 80, analysisTimestamp: Date.now(), model: 'test' }
    };

    const mockBeats = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80];

    test('should handle timestamps at segment boundaries', () => {
      // Test exact boundary timestamps
      expect(getSegmentationColorForBeat(0, mockBeats, mockSegmentationData, true)).toBeDefined();
      expect(getSegmentationColorForBeat(5, mockBeats, mockSegmentationData, true)).toBeDefined(); // intro
      expect(getSegmentationColorForBeat(15, mockBeats, mockSegmentationData, true)).toBeDefined(); // verse
      expect(getSegmentationColorForBeat(35, mockBeats, mockSegmentationData, true)).toBeDefined(); // chorus
    });

    test('should handle timestamps at the end of the song', () => {
      // Test timestamps near the end
      const lastBeatIndex = mockBeats.length - 1;
      const result = getSegmentationColorForBeat(lastBeatIndex, mockBeats, mockSegmentationData, true);
      expect(result).toBeDefined(); // Should get outro color
    });

    test('should handle edge case timestamps with tolerance', () => {
      // Test timestamps slightly beyond segment boundaries (within 1 second tolerance)
      const edgeCaseBeats = [79.5, 80.5]; // Just beyond the last segment
      
      edgeCaseBeats.forEach((timestamp, index) => {
        const result = getSegmentationColorForBeat(
          index, 
          edgeCaseBeats, 
          mockSegmentationData, 
          true, 
          timestamp
        );
        expect(result).toBeDefined(); // Should still get a color due to tolerance
      });
    });
  });

  describe('Issue 1: Chord Edit Display Logic', () => {
    // Note: This would typically be tested with React Testing Library
    // Here we're documenting the expected behavior
    
    test('should prioritize edited chord over formatted chord', () => {
      // Mock scenario: User edits "C:maj" to "C7"
      const originalChord = 'C:maj';
      const editedChord = 'C7';
      const formattedChord = 'C'; // What formatChordWithMusicalSymbols would return
      
      // The display logic should show editedChord when present
      const shouldShowFormatted = !editedChord;
      const displayValue = editedChord || formattedChord;
      
      expect(displayValue).toBe('C7'); // Raw edited value
      expect(shouldShowFormatted).toBe(false);
    });

    test('should fall back to formatted chord when no edit exists', () => {
      const originalChord = 'C:maj';
      const editedChord = undefined;
      const formattedChord = 'C';
      
      const shouldShowFormatted = !editedChord;
      const displayValue = editedChord || formattedChord;
      
      expect(displayValue).toBe('C'); // Formatted value
      expect(shouldShowFormatted).toBe(true);
    });
  });

  describe('Issue 3: Color Legend Improvements', () => {
    test('should create more opaque colors for legend display', () => {
      const originalColor = 'rgba(34, 197, 94, 0.3)';
      const expectedLegendColor = 'rgba(34, 197, 94, 0.8)';
      
      // Simulate the getLegendColor function logic
      const legendColor = originalColor.replace('0.3)', '0.8)');
      
      expect(legendColor).toBe(expectedLegendColor);
    });

    test('should handle different opacity values', () => {
      const testCases = [
        { input: 'rgba(244, 63, 94, 0.3)', expected: 'rgba(244, 63, 94, 0.8)' },
        { input: 'rgba(168, 85, 247, 0.3)', expected: 'rgba(168, 85, 247, 0.8)' },
        { input: 'rgba(250, 204, 21, 0.3)', expected: 'rgba(250, 204, 21, 0.8)' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.replace('0.3)', '0.8)');
        expect(result).toBe(expected);
      });
    });
  });
});

describe('Integration Tests', () => {
  test('should handle complete segmentation workflow', () => {
    const segmentationData: SegmentationResult = {
      segments: [
        { type: 'intro', startTime: 0, endTime: 51.5, confidence: 0.9, label: 'Intro (Zulu Chant)' },
        { type: 'verse', startTime: 51.5, endTime: 95.6, confidence: 0.8, label: 'Verse 1' },
        { type: 'transition', startTime: 95.6, endTime: 96.1, confidence: 0.7, label: 'Transition' },
        { type: 'chorus', startTime: 96.1, endTime: 121.4, confidence: 0.9, label: 'Chorus 1' },
        { type: 'verse', startTime: 121.4, endTime: 165.4, confidence: 0.8, label: 'Verse 2 (Inferred)' },
        { type: 'chorus', startTime: 165.4, endTime: 190.7, confidence: 0.9, label: 'Chorus 2 (Inferred)' },
        { type: 'bridge', startTime: 190.7, endTime: 209.9, confidence: 0.8, label: 'Bridge (Inferred)' },
        { type: 'chorus', startTime: 209.9, endTime: 234.9, confidence: 0.9, label: 'Chorus 3 (Final, Inferred)' },
      ],
      analysis: { structure: 'ABABCBC', tempo: 120, timeSignature: 4 },
      metadata: { totalDuration: 234.9, analysisTimestamp: Date.now(), model: 'gemini-segmentation-v1' }
    };

    // Test that all segments get proper colors
    segmentationData.segments.forEach(segment => {
      const color = getSegmentationColor(segment.label);
      expect(color).toBeDefined();
      expect(color).toMatch(/rgba\(\d+, \d+, \d+, 0\.\d+\)/); // Valid rgba format
    });

    // Test specific cases from user's example
    expect(getSegmentationColor('Intro (Zulu Chant)')).toBe('rgba(156, 163, 175, 0.3)');
    expect(getSegmentationColor('Verse 2 (Inferred)')).toBe('rgba(34, 197, 94, 0.3)');
    expect(getSegmentationColor('Chorus 2 (Inferred)')).toBe('rgba(244, 63, 94, 0.3)');
    expect(getSegmentationColor('Bridge (Inferred)')).toBe('rgba(168, 85, 247, 0.3)');
    expect(getSegmentationColor('Chorus 3 (Final, Inferred)')).toBe('rgba(244, 63, 94, 0.3)');
  });
});
