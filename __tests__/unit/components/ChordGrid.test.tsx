/**
 * Component Tests: ChordGrid
 * 
 * Tests for the ChordGrid component including:
 * - Rendering with different chord data scenarios
 * - User interactions (beat clicks, hover, keyboard navigation)
 * - Accessibility features (ARIA labels, keyboard focus, screen reader support)
 * - Responsive behavior
 * - Integration with context providers
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChordGrid from '@/components/chord-analysis/ChordGrid';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { groupPlacementsIntoRows } from '@/components/chord-analysis/GridLyricsRow';

jest.mock('@/components/chord-analysis/BeatHighlighter', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock ThemeContext to avoid useSyncExternalStore + MutationObserver in jsdom
jest.mock('@/contexts/ThemeContext', () => {
  const React = require('react');
  const ThemeContext = React.createContext({ theme: 'light', toggleTheme: jest.fn() });
  return {
    __esModule: true,
    default: ThemeContext,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => (
      React.createElement(ThemeContext.Provider, { value: { theme: 'light', toggleTheme: jest.fn() } }, children)
    ),
    useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
  };
});

// Mock hooks
jest.mock('@/hooks/chord-analysis/useChordGridLayout', () => ({
  useChordGridLayout: () => ({
    cellSize: 60,
    screenWidth: 1024,
    gridLayoutConfig: { measuresPerRow: 4 },
    getDynamicFontSize: (_chordLength: number) => 'text-base',
    getGridColumnsClass: () => 'grid-cols-4',
    containerRef: jest.fn()
  })
}));

jest.mock('@/hooks/chord-analysis/useChordDataProcessing', () => ({
  useChordDataProcessing: (chords: string[]) => ({
    shiftedChords: chords,
    getDisplayChord: (chord: string) => ({ chord, wasCorrected: false }),
    shouldShowChordLabel: (_index: number) => true
  })
}));

jest.mock('@/hooks/chord-analysis/useChordInteractions', () => ({
  useChordInteractions: (onBeatClick: any, beats: Array<number | null>) => ({
    handleBeatClick: (index: number) => {
      if (onBeatClick) {
        const timestamp = typeof beats[index] === 'number' ? beats[index] : 0;
        onBeatClick(index, timestamp);
      }
    },
    isClickable: (index: number, chord: string) => (
      Boolean(onBeatClick) && typeof beats[index] === 'number' && (beats[index] as number) >= 0 && chord !== ''
    )
  })
}));

jest.mock('@/hooks/chord-analysis/useLoopBeatSelection', () => ({
  useLoopBeatSelection: () => ({
    isLoopEnabled: false,
    handleLoopBeatClick: jest.fn(),
    isInLoopRange: jest.fn(() => false)
  })
}));

// Wrapper component with ThemeProvider
const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
};

describe('ChordGrid Component', () => {
  describe('Rendering with Different Chord Data', () => {
    it('should render with empty chord array', () => {
      const { container } = renderWithTheme(
        <ChordGrid chords={[]} beats={[]} />
      );
      
      expect(container).toBeInTheDocument();
    });

    it('should render with single chord', () => {
      const chords = ['C'];
      const beats = [0];
      
      renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );
      
      const chordCells = screen.getAllByText('C');
      expect(chordCells.length).toBeGreaterThan(0);
    });

    it('should render with multiple chords in a progression', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      // Check that chords are rendered (may be split across elements)
      expect(container.textContent).toContain('C');
      expect(container.textContent).toContain('Am');
      expect(container.textContent).toContain('F');
      expect(container.textContent).toContain('G');
    });

    it('should render complex progressions with slash chords', () => {
      const chords = ['C/E', 'Am/C', 'F/A', 'G/B'];
      const beats = [0, 0.5, 1.0, 1.5];

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      // Check that slash chords are rendered (may be formatted)
      expect(container.textContent).toContain('C');
      expect(container.textContent).toContain('E');
      expect(container.textContent).toContain('Am');
    });

    it('should render complex jazz chords', () => {
      const chords = ['Cmaj7', 'Am7', 'Dm7', 'G7'];
      const beats = [0, 0.5, 1.0, 1.5];

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      // Check that jazz chords are rendered (may be formatted with symbols)
      expect(container.textContent).toContain('C');
      expect(container.textContent).toContain('Am');
      expect(container.textContent).toContain('Dm');
      expect(container.textContent).toContain('G');
    });

    it('should render with 3/4 time signature', () => {
      const chords = ['C', 'Am', 'F'];
      const beats = [0, 0.5, 1.0];
      
      renderWithTheme(
        <ChordGrid 
          chords={chords} 
          beats={beats} 
          timeSignature={3}
        />
      );
      
      expect(screen.getByText('Time: 3/4')).toBeInTheDocument();
    });

    it('should render with 6/8 time signature', () => {
      const chords = ['C', 'Am', 'F', 'G', 'Dm', 'Em'];
      const beats = [0, 0.33, 0.66, 1.0, 1.33, 1.66];

      const { container } = renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          timeSignature={6}
        />
      );

      expect(screen.getByText('Time: 6/8')).toBeInTheDocument();
      expect(container.textContent).toContain('Am');
    });
  });

  describe('User Interactions', () => {
    it('should trigger onBeatClick callback when beat is clicked', () => {
      const onBeatClick = jest.fn();
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];
      
      renderWithTheme(
        <ChordGrid 
          chords={chords} 
          beats={beats} 
          onBeatClick={onBeatClick}
        />
      );
      
      const chordCell = screen.getByRole('button', { name: /jump to beat 1, chord c/i });
      fireEvent.click(chordCell);
      
      expect(onBeatClick).toHaveBeenCalled();
    });

    it('should pass correct beatIndex and timestamp to onBeatClick', () => {
      const onBeatClick = jest.fn();
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={onBeatClick}
        />
      );

      // Click on first chord cell
      const chordCell = screen.getByRole('button', { name: /jump to beat 1, chord c/i });
      fireEvent.click(chordCell);

      expect(onBeatClick).toHaveBeenCalledWith(0, 0);
    });

    it('should rerender safely when structural props change', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];
      
      const { rerender } = renderWithTheme(
        <ChordGrid 
          chords={chords} 
          beats={beats} 
          timeSignature={4}
        />
      );
      
      rerender(
        <ThemeProvider>
          <ChordGrid 
            chords={chords} 
            beats={beats} 
            timeSignature={3}
          />
        </ThemeProvider>
      );
      
      expect(screen.getByText('Time: 3/4')).toBeInTheDocument();
    });

    it('should support keyboard navigation with Enter key', () => {
      const onBeatClick = jest.fn();
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={onBeatClick}
        />
      );

      const chordCell = screen.getByText('C').closest('[role="button"]');
      expect(chordCell).not.toBeNull();
      fireEvent.keyDown(chordCell!, { key: 'Enter', code: 'Enter' });
      expect(onBeatClick).toHaveBeenCalledWith(0, 0);
    });

    it('should support keyboard navigation with Space key', () => {
      const onBeatClick = jest.fn();
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={onBeatClick}
        />
      );

      const chordCell = screen.getByText('C').closest('[role="button"]');
      expect(chordCell).not.toBeNull();
      fireEvent.keyDown(chordCell!, { key: ' ', code: 'Space' });
      expect(onBeatClick).toHaveBeenCalledWith(0, 0);
    });
  });

  describe('Accessibility', () => {
    it('should have ARIA labels on clickable elements', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={jest.fn()}
        />
      );

      const chordCell = screen.getByText('C').closest('[role="button"]');
      expect(chordCell).toHaveAttribute('aria-label');
    });

    it('should have proper role attributes for interactive elements', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={jest.fn()}
        />
      );

      const chordCell = screen.getByText('C').closest('[role="button"]');
      expect(chordCell).toHaveAttribute('role', 'button');
    });

    it('should have tabIndex for keyboard navigation', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={jest.fn()}
        />
      );

      const chordCell = screen.getByText('C').closest('[role="button"]');
      expect(chordCell).toHaveAttribute('tabIndex', '0');
    });

    it('should not have role or tabIndex on non-clickable elements', () => {
      const chords = ['C', '', 'F', 'G']; // Empty chord in middle
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          onBeatClick={jest.fn()}
        />
      );

      expect(screen.getAllByRole('button')).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null beats gracefully', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, null, 1.0, null];

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle mismatched chords and beats arrays', () => {
      const chords = ['C', 'Am'];
      const beats = [0, 0.5, 1.0, 1.5]; // More beats than chords

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle very long chord progressions', () => {
      const chords = Array(100).fill('C');
      const beats = Array(100).fill(0).map((_, i) => i * 0.5);

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle special characters in chord names', () => {
      const chords = ['C#', 'Bb', 'F#m', 'Abmaj7'];
      const beats = [0, 0.5, 1.0, 1.5];

      const { container } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      // Chords with sharps/flats are rendered with special symbols
      expect(container.textContent).toContain('C');
      expect(container.textContent).toContain('B');
      expect(container.textContent).toContain('F');
    });
  });

  describe('Props and Configuration', () => {
    it('should respect keySignature prop', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          keySignature="C Major"
        />
      );

      expect(screen.getByText('Key: C Major')).toBeInTheDocument();
    });

    it('should handle isDetectingKey state', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          isDetectingKey={true}
        />
      );

      expect(screen.getByText('Detecting key...')).toBeInTheDocument();
    });

    it('should handle hasPickupBeats configuration', () => {
      const chords = ['', 'C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5, 2.0];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          hasPickupBeats={true}
          pickupBeatsCount={1}
        />
      );

      expect(screen.getByText('Pickup: 1 beat')).toBeInTheDocument();
    });

    it('should handle hasPadding configuration', () => {
      const chords = ['', '', 'C', 'Am', 'F', 'G'];
      const beats = [0, 0.25, 0.5, 0.75, 1.0, 1.25];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          hasPadding={true}
          paddingCount={2}
          shiftCount={0}
        />
      );

      expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('should compute segmented label strip height from row count and Roman numeral cell height', () => {
      const chords = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'];
      const beats = Array.from({ length: 20 }, (_, index) => index);

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          showSegmentation={true}
          showRomanNumerals={true}
          romanNumeralData={{
            analysis: ['I', 'V', 'vi', 'IV'],
            keyContext: 'C major',
          }}
          segmentationData={{
            segments: [
              {
                startTime: 0,
                endTime: 3,
                type: 'verse',
                label: 'Verse',
              },
            ],
            analysis: {
              structure: 'Verse',
            },
            metadata: {
              totalDuration: 4,
              analysisTimestamp: 1,
              model: 'test',
            },
          }}
        />
      );

      const sectionLabel = screen.getByText('Verse');
      const stripContainer = sectionLabel as HTMLElement | null;
      const sectionRow = stripContainer?.parentElement?.parentElement;
      const heightValue = stripContainer?.style.height ?? '';

      expect(heightValue).not.toBe('');
      expect(parseFloat(heightValue)).toBeGreaterThan(0);
      expect(sectionRow).toHaveClass('items-stretch');
    });
  });

  describe('Responsive Behavior', () => {
    it('should render on different viewport sizes', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      // Mobile viewport
      global.innerWidth = 375;
      global.innerHeight = 667;

      const { rerender } = renderWithTheme(
        <ChordGrid chords={chords} beats={beats} />
      );

      expect(screen.getByText('C')).toBeInTheDocument();

      // Desktop viewport
      global.innerWidth = 1920;
      global.innerHeight = 1080;

      rerender(
        <ThemeProvider>
          <ChordGrid chords={chords} beats={beats} />
        </ThemeProvider>
      );

      expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('should adjust layout when chatbot is open', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          isChatbotOpen={true}
        />
      );

      expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('should adjust layout when embedded lyrics grid is open', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 0.5, 1.0, 1.5];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          isLyricsPanelOpen={true}
        />
      );

      expect(screen.getByText('C')).toBeInTheDocument();
    });
  });

  describe('Grid Lyrics', () => {
    it('renders timed lyrics directly under the matching beat row', () => {
      const chords = ['C', 'Am', 'F', 'G'];
      const beats = [0, 1, 2, 3];

      renderWithTheme(
        <ChordGrid
          chords={chords}
          beats={beats}
          gridLyrics={{
            mode: 'line',
            lyrics: {
              lines: [
                {
                  startTime: 1.2,
                  endTime: 2.5,
                  text: 'Grid lyric line',
                  chords: [],
                },
              ],
            },
          }}
        />,
      );

      expect(screen.getByText('Grid lyric line')).toBeInTheDocument();
    });

    it('groups non-overlapping lyric lines onto the same visual row using groupPlacementsIntoRows', () => {
      const placements = [
        { line: { text: 'First line', startTime: 0, endTime: 2, chords: [] }, columnStart: 1, columnEnd: 4 },
        { line: { text: 'Second line', startTime: 2, endTime: 4, chords: [] }, columnStart: 5, columnEnd: 8 },
        { line: { text: 'Third overlapping line', startTime: 1, endTime: 3, chords: [] }, columnStart: 3, columnEnd: 6 },
      ];

      const grouped = groupPlacementsIntoRows(placements);
      expect(grouped).toHaveLength(2);
      expect(grouped[0]).toHaveLength(2);
      expect(grouped[0][0].line.text).toBe('First line');
      expect(grouped[0][1].line.text).toBe('Second line');
      expect(grouped[1]).toHaveLength(1);
      expect(grouped[1][0].line.text).toBe('Third overlapping line');
    });
  });
});
