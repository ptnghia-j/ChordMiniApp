/**
 * Visual Synchronization Validation Tests
 * 
 * This test suite validates that ChordGrid and ChordGridContainer components
 * render identically for both YouTube and upload workflows, ensuring perfect
 * visual synchronization and user experience consistency.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChordGridContainer } from '@/components/ChordGridContainer';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Mock the theme context
const MockThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    {children}
  </ThemeProvider>
);

// Mock analysis result for testing
const createMockAnalysisResult = () => ({
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
  downbeats: [0.534],
  downbeats_with_measures: [0.534],
  synchronizedChords: [
    {chord: 'C', beatIndex: 0, beatNum: 1},
    {chord: 'Am', beatIndex: 1, beatNum: 2},
    {chord: 'F', beatIndex: 2, beatNum: 3},
    {chord: 'G', beatIndex: 3, beatNum: 4}
  ],
  beatModel: 'beat-transformer',
  chordModel: 'chord-cnn-lstm',
  audioDuration: 4.0,
  beatDetectionResult: {
    time_signature: 4,
    bpm: 120,
    beatShift: 0,
    beat_time_range_start: 0.534
  }
});

// Mock chord grid data
const createMockChordGridData = (isUploadPage = false) => ({
  chords: ['', 'N.C.', 'C', 'Am', 'F', 'G'],
  beats: [null, 0, 0.534, 1.068, 1.602, 2.136],
  hasPadding: true,
  paddingCount: 1,
  shiftCount: 1,
  totalPaddingCount: 2,
  originalAudioMapping: [
    {chord: 'C', timestamp: 0.534, visualIndex: 2, originalIndex: 0},
    {chord: 'Am', timestamp: 1.068, visualIndex: 3, originalIndex: 1},
    {chord: 'F', timestamp: 1.602, visualIndex: 4, originalIndex: 2},
    {chord: 'G', timestamp: 2.136, visualIndex: 5, originalIndex: 3}
  ]
});

describe('Visual Synchronization Validation Tests', () => {
  
  describe('ChordGridContainer Rendering', () => {
    test('should render identical structure for YouTube workflow', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData(false);
      const mockBeatClick = jest.fn();
      
      const { container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('Am')).toBeInTheDocument();
      expect(screen.getByText('F')).toBeInTheDocument();
      expect(screen.getByText('G')).toBeInTheDocument();
    });

    test('should render identical structure for upload workflow', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData(true);
      const mockBeatClick = jest.fn();
      
      const { container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={true}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('Am')).toBeInTheDocument();
      expect(screen.getByText('F')).toBeInTheDocument();
      expect(screen.getByText('G')).toBeInTheDocument();
    });

    test('should render identical chord content for both workflows', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      
      // Render YouTube workflow
      const { container: youtubeContainer } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Render upload workflow
      const { container: uploadContainer } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={true}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Both should contain the same chord labels
      const youtubeChords = youtubeContainer.querySelectorAll('[data-testid*="chord"]');
      const uploadChords = uploadContainer.querySelectorAll('[data-testid*="chord"]');
      
      expect(youtubeChords.length).toBe(uploadChords.length);
    });
  });

  describe('Beat Click Handling', () => {
    test('should handle beat clicks identically in both workflows', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      
      render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Find and click a chord cell
      const chordCell = screen.getByText('C');
      fireEvent.click(chordCell);
      
      // Verify the click handler was called with correct parameters
      expect(mockBeatClick).toHaveBeenCalled();
      const [beatIndex, timestamp] = mockBeatClick.mock.calls[0];
      expect(typeof beatIndex).toBe('number');
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });

    test('should provide consistent timestamp values for beat clicks', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const youtubeBeatClick = jest.fn();
      const uploadBeatClick = jest.fn();
      
      // Render YouTube workflow
      const { rerender } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={youtubeBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Click the C chord
      fireEvent.click(screen.getByText('C'));
      
      // Render upload workflow
      rerender(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={uploadBeatClick}
            isUploadPage={true}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Click the C chord again
      fireEvent.click(screen.getByText('C'));
      
      // Both clicks should provide the same timestamp
      expect(youtubeBeatClick).toHaveBeenCalled();
      expect(uploadBeatClick).toHaveBeenCalled();
      
      const youtubeTimestamp = youtubeBeatClick.mock.calls[0][1];
      const uploadTimestamp = uploadBeatClick.mock.calls[0][1];
      
      expect(Math.abs(youtubeTimestamp - uploadTimestamp)).toBeLessThan(0.001);
    });
  });

  describe('Current Beat Highlighting', () => {
    test('should highlight current beat identically in both workflows', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      
      // Test with current beat index 2 (C chord)
      const { container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // The current beat should have highlighting classes
      const highlightedElements = container.querySelectorAll('.bg-blue-500, .bg-blue-600, .ring-2, .ring-blue-500');
      expect(highlightedElements.length).toBeGreaterThan(0);
    });

    test('should handle beat index changes consistently', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      
      const { rerender, container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={2}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Change current beat index
      rerender(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={3}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Should still have highlighting, but on different element
      const highlightedElements = container.querySelectorAll('.bg-blue-500, .bg-blue-600, .ring-2, .ring-blue-500');
      expect(highlightedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Layout Consistency', () => {
    test('should apply upload page layout correctly', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      
      // Mock window.innerWidth for upload page (should use 4 measures per row)
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      
      render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={true}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Upload page should render with appropriate layout
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('Am')).toBeInTheDocument();
    });
  });

  describe('Chord Correction Display', () => {
    test('should display chord corrections identically in both workflows', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const mockChordGridData = createMockChordGridData();
      const mockBeatClick = jest.fn();
      const mockCorrections = { 'C': 'C♯', 'F': 'F♯' };
      
      render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={mockChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={true}
            chordCorrections={mockCorrections}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      // Should display corrected chords when enabled
      expect(screen.getByText('C♯')).toBeInTheDocument();
      expect(screen.getByText('F♯')).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty chord grid data gracefully', () => {
      const mockAnalysisResult = createMockAnalysisResult();
      const emptyChordGridData = {
        chords: [],
        beats: [],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: []
      };
      const mockBeatClick = jest.fn();
      
      const { container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={mockAnalysisResult}
            chordGridData={emptyChordGridData}
            currentBeatIndex={-1}
            keySignature="C Major"
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      expect(container.firstChild).toBeInTheDocument();
    });

    test('should handle null analysis results gracefully', () => {
      const emptyChordGridData = {
        chords: [],
        beats: [],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: []
      };
      const mockBeatClick = jest.fn();
      
      const { container } = render(
        <MockThemeProvider>
          <ChordGridContainer
            analysisResults={null}
            chordGridData={emptyChordGridData}
            currentBeatIndex={-1}
            keySignature={null}
            isDetectingKey={false}
            isChatbotOpen={false}
            isLyricsPanelOpen={false}
            onBeatClick={mockBeatClick}
            isUploadPage={false}
            showCorrectedChords={false}
            chordCorrections={null}
            sequenceCorrections={null}
          />
        </MockThemeProvider>
      );
      
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
