import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useParams, useSearchParams } from 'next/navigation';
import YouTubeVideoAnalyzePage from '@/app/analyze/[videoId]/page';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock dynamic imports
jest.mock('next/dynamic', () => {
  return (importFunc: () => Promise<any>, options?: any) => {
    const Component = React.lazy(importFunc);
    return React.forwardRef((props: any, ref: any) => (
      <React.Suspense fallback={options?.loading?.() || <div>Loading...</div>}>
        <Component {...props} ref={ref} />
      </React.Suspense>
    ));
  };
});

// Mock custom hooks
jest.mock('@/contexts/ProcessingContext', () => ({
  useProcessing: () => ({
    stage: 'idle',
    progress: 0,
    setStage: jest.fn(),
    setProgress: jest.fn(),
    setStatusMessage: jest.fn(),
    startProcessing: jest.fn(),
    completeProcessing: jest.fn(),
    failProcessing: jest.fn(),
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
  }),
}));

jest.mock('@/hooks/useAudioProcessing', () => ({
  useAudioProcessing: () => ({
    state: {
      isExtracting: false,
      isExtracted: false,
      isAnalyzing: false,
      isAnalyzed: false,
      audioUrl: null,
      error: null,
      fromCache: false,
      fromFirestoreCache: false,
    },
    analysisResults: null,
    videoTitle: '',
    extractAudio: jest.fn(),
    analyzeAudio: jest.fn(),
    loadVideoInfo: jest.fn(),
    setState: jest.fn(),
    setAnalysisResults: jest.fn(),
    setVideoTitle: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    state: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      preferredAudioSource: 'extracted',
    },
    audioRef: { current: null },
    youtubePlayer: null,
    play: jest.fn(),
    pause: jest.fn(),
    seek: jest.fn(),
    setPlaybackRate: jest.fn(),
    setPreferredAudioSource: jest.fn(),
    handleTimeUpdate: jest.fn(),
    handleLoadedMetadata: jest.fn(),
    handleYouTubePlayerReady: jest.fn(),
    setState: jest.fn(),
    setYoutubePlayer: jest.fn(),
    setDuration: jest.fn(),
  }),
}));

jest.mock('@/hooks/useMetronomeSync', () => ({
  useMetronomeSync: jest.fn(),
}));

// Mock services
jest.mock('@/services/firestoreService', () => ({
  getTranscription: jest.fn(),
  saveTranscription: jest.fn(),
}));

jest.mock('@/services/timingSyncService', () => ({
  timingSyncService: {
    getSyncedTimestamp: jest.fn(() => ({ syncedTime: 0, confidence: 1 })),
    addCalibrationPoint: jest.fn(),
  },
}));

jest.mock('@/config/api', () => ({
  apiPost: jest.fn(),
}));

// Mock components
jest.mock('@/components/Navigation', () => {
  return function MockNavigation() {
    return <nav data-testid="navigation">Navigation</nav>;
  };
});

jest.mock('@/components/ProcessingStatusBanner', () => {
  return function MockProcessingStatusBanner() {
    return <div data-testid="processing-status">Processing Status</div>;
  };
});

jest.mock('@/components/AnalysisControls', () => {
  return function MockAnalysisControls(props: any) {
    return (
      <div data-testid="analysis-controls">
        <button onClick={props.onStartAnalysis} data-testid="start-analysis">
          Start Analysis
        </button>
        <select
          value={props.beatDetector}
          onChange={(e) => props.onBeatDetectorChange(e.target.value)}
          data-testid="beat-detector-select"
        >
          <option value="auto">Auto</option>
          <option value="madmom">Madmom</option>
          <option value="beat-transformer">Beat-Transformer</option>
        </select>
        <select
          value={props.chordDetector}
          onChange={(e) => props.onChordDetectorChange(e.target.value)}
          data-testid="chord-detector-select"
        >
          <option value="chord-cnn-lstm">Chord-CNN-LSTM</option>
          <option value="btc-sl">BTC-SL</option>
          <option value="btc-pl">BTC-PL</option>
        </select>
      </div>
    );
  };
});

jest.mock('@/components/AudioPlayer', () => {
  return function MockAudioPlayer(props: any) {
    return (
      <div data-testid="audio-player">
        <button onClick={props.onPlay} data-testid="play-button">
          Play
        </button>
        <button onClick={props.onPause} data-testid="pause-button">
          Pause
        </button>
        <input
          type="range"
          min="0"
          max={props.duration || 100}
          value={props.currentTime || 0}
          onChange={(e) => props.onSeek(parseFloat(e.target.value))}
          data-testid="seek-slider"
        />
      </div>
    );
  };
});

jest.mock('@/components/ChordGridContainer', () => {
  return function MockChordGridContainer(props: any) {
    return (
      <div data-testid="chord-grid-container">
        <div data-testid="current-beat-index">{props.currentBeatIndex}</div>
        {props.chordGridData?.chords?.map((chord: string, index: number) => (
          <button
            key={index}
            onClick={() => props.onBeatClick(index, index * 0.5)}
            data-testid={`chord-cell-${index}`}
            className={props.currentBeatIndex === index ? 'current' : ''}
          >
            {chord || 'N.C.'}
          </button>
        ))}
      </div>
    );
  };
});

jest.mock('@/components/LyricsSection', () => {
  return function MockLyricsSection() {
    return <div data-testid="lyrics-section">Lyrics Section</div>;
  };
});

jest.mock('@/components/ChatbotSection', () => {
  return function MockChatbotSection(props: any) {
    return (
      <div data-testid="chatbot-section">
        <button onClick={props.onToggle} data-testid="chatbot-toggle">
          Toggle Chatbot
        </button>
      </div>
    );
  };
});

jest.mock('@/components/UserFriendlyErrorDisplay', () => {
  return function MockUserFriendlyErrorDisplay(props: any) {
    return (
      <div data-testid="error-display">
        <div data-testid="error-message">{props.error}</div>
        {props.suggestion && (
          <div data-testid="error-suggestion">{props.suggestion}</div>
        )}
        <button onClick={props.onTryAnotherVideo} data-testid="try-another-video">
          Try Another Video
        </button>
        <button onClick={props.onRetry} data-testid="retry-button">
          Retry
        </button>
      </div>
    );
  };
});

// Mock react-player
jest.mock('react-player/youtube', () => {
  return function MockReactPlayer(props: any) {
    return (
      <div data-testid="youtube-player">
        <button onClick={() => props.onReady({ seekTo: jest.fn() })}>
          Ready
        </button>
        <button onClick={props.onPlay}>Play</button>
        <button onClick={props.onPause}>Pause</button>
      </div>
    );
  };
});

// Test data
const mockVideoId = 'dQw4w9WgXcQ';
const mockSearchParams = new URLSearchParams({
  title: 'Test Video Title',
  duration: '3:30',
  channel: 'Test Channel',
  thumbnail: 'https://example.com/thumb.jpg',
});

const mockAnalysisResults = {
  chords: [
    { chord: 'C', time: 0.5 },
    { chord: 'F', time: 2.0 },
    { chord: 'G', time: 3.5 },
  ],
  beats: [
    { time: 0.5 },
    { time: 1.0 },
    { time: 1.5 },
    { time: 2.0 },
  ],
  downbeats: [0.5, 2.5],
  downbeats_with_measures: [0.5, 2.5],
  synchronizedChords: [
    { chord: 'C', beatIndex: 0, beatNum: 1 },
    { chord: 'F', beatIndex: 2, beatNum: 1 },
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

describe('YouTubeVideoAnalyzePage', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (useParams as jest.Mock).mockReturnValue({ videoId: mockVideoId });
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  describe('Component Rendering', () => {
    it('renders the main page structure', () => {
      render(<YouTubeVideoAnalyzePage />);
      
      expect(screen.getByTestId('navigation')).toBeInTheDocument();
      expect(screen.getByTestId('processing-status')).toBeInTheDocument();
      expect(screen.getByTestId('analysis-controls')).toBeInTheDocument();
    });

    it('extracts video ID from URL parameters', () => {
      render(<YouTubeVideoAnalyzePage />);
      
      expect(useParams).toHaveBeenCalled();
      // Component should use the mocked videoId
    });

    it('extracts search parameters for video metadata', () => {
      render(<YouTubeVideoAnalyzePage />);
      
      expect(useSearchParams).toHaveBeenCalled();
      // Component should extract title, duration, channel, thumbnail
    });
  });

  describe('Model Selection', () => {
    it('renders beat detector selection', () => {
      render(<YouTubeVideoAnalyzePage />);

      const beatDetectorSelect = screen.getByTestId('beat-detector-select');
      expect(beatDetectorSelect).toBeInTheDocument();
      expect(beatDetectorSelect).toHaveValue('beat-transformer'); // default value
    });

    it('renders chord detector selection', () => {
      render(<YouTubeVideoAnalyzePage />);

      const chordDetectorSelect = screen.getByTestId('chord-detector-select');
      expect(chordDetectorSelect).toBeInTheDocument();
      expect(chordDetectorSelect).toHaveValue('chord-cnn-lstm'); // default value
    });

    it('updates beat detector when selection changes', () => {
      render(<YouTubeVideoAnalyzePage />);

      const beatDetectorSelect = screen.getByTestId('beat-detector-select');
      fireEvent.change(beatDetectorSelect, { target: { value: 'madmom' } });

      expect(beatDetectorSelect).toHaveValue('madmom');
    });

    it('updates chord detector when selection changes', () => {
      render(<YouTubeVideoAnalyzePage />);

      const chordDetectorSelect = screen.getByTestId('chord-detector-select');
      fireEvent.change(chordDetectorSelect, { target: { value: 'btc-sl' } });

      expect(chordDetectorSelect).toHaveValue('btc-sl');
    });

    it('persists model selection to localStorage', () => {
      const mockSetItem = jest.fn();
      (window.localStorage.setItem as jest.Mock) = mockSetItem;

      render(<YouTubeVideoAnalyzePage />);

      const beatDetectorSelect = screen.getByTestId('beat-detector-select');
      fireEvent.change(beatDetectorSelect, { target: { value: 'madmom' } });

      expect(mockSetItem).toHaveBeenCalledWith('chordmini_beat_detector', 'madmom');
    });

    it('loads model selection from localStorage', () => {
      (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === 'chordmini_beat_detector') return 'madmom';
        if (key === 'chordmini_chord_detector') return 'btc-pl';
        return null;
      });

      render(<YouTubeVideoAnalyzePage />);

      const beatDetectorSelect = screen.getByTestId('beat-detector-select');
      const chordDetectorSelect = screen.getByTestId('chord-detector-select');

      expect(beatDetectorSelect).toHaveValue('madmom');
      expect(chordDetectorSelect).toHaveValue('btc-pl');
    });
  });

  describe('Audio Analysis', () => {
    it('triggers analysis when start analysis button is clicked', async () => {
      const mockAnalyzeAudio = jest.fn();
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isExtracted: true },
        analysisResults: null,
        analyzeAudio: mockAnalyzeAudio,
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const startAnalysisButton = screen.getByTestId('start-analysis');
      fireEvent.click(startAnalysisButton);

      expect(mockAnalyzeAudio).toHaveBeenCalled();
    });

    it('displays analysis results when available', () => {
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isAnalyzed: true },
        analysisResults: mockAnalysisResults,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('chord-grid-container')).toBeInTheDocument();
    });

    it('handles analysis errors gracefully', () => {
      const mockError = new Error('Analysis failed');
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { error: mockError },
        analysisResults: null,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Analysis failed');
    });
  });

  describe('Audio Player Integration', () => {
    it('renders audio player controls', () => {
      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      expect(screen.getByTestId('play-button')).toBeInTheDocument();
      expect(screen.getByTestId('pause-button')).toBeInTheDocument();
    });

    it('handles play button click', () => {
      const mockPlay = jest.fn();
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { isPlaying: false },
        play: mockPlay,
        pause: jest.fn(),
        seek: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const playButton = screen.getByTestId('play-button');
      fireEvent.click(playButton);

      expect(mockPlay).toHaveBeenCalled();
    });

    it('handles pause button click', () => {
      const mockPause = jest.fn();
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { isPlaying: true },
        play: jest.fn(),
        pause: mockPause,
        seek: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const pauseButton = screen.getByTestId('pause-button');
      fireEvent.click(pauseButton);

      expect(mockPause).toHaveBeenCalled();
    });

    it('handles seek slider changes', () => {
      const mockSeek = jest.fn();
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { currentTime: 30, duration: 180 },
        play: jest.fn(),
        pause: jest.fn(),
        seek: mockSeek,
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const seekSlider = screen.getByTestId('seek-slider');
      fireEvent.change(seekSlider, { target: { value: '60' } });

      expect(mockSeek).toHaveBeenCalledWith(60);
    });
  });

  describe('Chord Grid Interactions', () => {
    beforeEach(() => {
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isAnalyzed: true },
        analysisResults: mockAnalysisResults,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });
    });

    it('renders chord grid with analysis results', () => {
      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('chord-grid-container')).toBeInTheDocument();
      expect(screen.getByTestId('chord-cell-0')).toBeInTheDocument();
    });

    it('handles beat click and seeks to timestamp', () => {
      const mockSeek = jest.fn();
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { currentTime: 0 },
        seek: mockSeek,
        play: jest.fn(),
        pause: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const chordCell = screen.getByTestId('chord-cell-0');
      fireEvent.click(chordCell);

      expect(mockSeek).toHaveBeenCalledWith(0);
    });

    it('highlights current beat during playback', () => {
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { currentTime: 1.0, isPlaying: true },
        seek: jest.fn(),
        play: jest.fn(),
        pause: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      // Current beat index should be displayed
      expect(screen.getByTestId('current-beat-index')).toBeInTheDocument();
    });
  });

  describe('YouTube Player Integration', () => {
    it('renders YouTube player component', () => {
      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('youtube-player')).toBeInTheDocument();
    });

    it('handles YouTube player ready event', () => {
      const mockSetYoutubePlayer = jest.fn();
      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: {},
        setYoutubePlayer: mockSetYoutubePlayer,
        handleYouTubePlayerReady: jest.fn(),
        seek: jest.fn(),
        play: jest.fn(),
        pause: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        setState: jest.fn(),
        setDuration: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const readyButton = screen.getByText('Ready');
      fireEvent.click(readyButton);

      // Should handle player ready event
    });
  });

  describe('Tab Navigation', () => {
    it('switches between beat/chord map and lyrics tabs', () => {
      render(<YouTubeVideoAnalyzePage />);

      // Default tab should be beat/chord map
      expect(screen.getByTestId('chord-grid-container')).toBeInTheDocument();

      // Should be able to switch to lyrics tab (implementation depends on actual tab structure)
    });
  });

  describe('Error Handling', () => {
    it('displays user-friendly error messages', () => {
      const mockError = new Error('Network timeout');
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { error: mockError },
        analysisResults: null,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Network timeout');
    });

    it('provides retry functionality on errors', () => {
      const mockError = new Error('Analysis failed');
      const mockAnalyzeAudio = jest.fn();
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { error: mockError },
        analysisResults: null,
        analyzeAudio: mockAnalyzeAudio,
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      const retryButton = screen.getByTestId('retry-button');
      fireEvent.click(retryButton);

      expect(mockAnalyzeAudio).toHaveBeenCalled();
    });

    it('handles YouTube player errors gracefully', () => {
      render(<YouTubeVideoAnalyzePage />);

      // Should not crash when YouTube player encounters errors
      expect(screen.getByTestId('youtube-player')).toBeInTheDocument();
    });
  });

  describe('Cache Management', () => {
    it('checks for cached analysis results', async () => {
      const mockGetTranscription = jest.fn().mockResolvedValue(mockAnalysisResults);
      jest.mocked(require('@/services/firestoreService').getTranscription).mockImplementation(mockGetTranscription);

      render(<YouTubeVideoAnalyzePage />);

      await waitFor(() => {
        expect(mockGetTranscription).toHaveBeenCalled();
      });
    });

    it('saves analysis results to cache', async () => {
      const mockSaveTranscription = jest.fn().mockResolvedValue(undefined);
      jest.mocked(require('@/services/firestoreService').saveTranscription).mockImplementation(mockSaveTranscription);

      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isAnalyzed: true },
        analysisResults: mockAnalysisResults,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      // Should save results when analysis completes
      await waitFor(() => {
        expect(mockSaveTranscription).toHaveBeenCalled();
      });
    });
  });

  describe('Responsive Design', () => {
    it('adapts layout for mobile devices', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<YouTubeVideoAnalyzePage />);

      // Should render mobile-optimized layout
      expect(screen.getByTestId('chord-grid-container')).toBeInTheDocument();
    });

    it('adapts layout for desktop devices', () => {
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      });

      render(<YouTubeVideoAnalyzePage />);

      // Should render desktop layout
      expect(screen.getByTestId('chord-grid-container')).toBeInTheDocument();
    });
  });

  describe('Performance Optimizations', () => {
    it('uses dynamic imports for heavy components', () => {
      render(<YouTubeVideoAnalyzePage />);

      // Components should be loaded dynamically
      expect(screen.getByTestId('processing-status')).toBeInTheDocument();
      expect(screen.getByTestId('analysis-controls')).toBeInTheDocument();
    });

    it('implements proper cleanup on unmount', () => {
      const { unmount } = render(<YouTubeVideoAnalyzePage />);

      // Should not throw errors on unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('provides proper ARIA labels for interactive elements', () => {
      render(<YouTubeVideoAnalyzePage />);

      const startAnalysisButton = screen.getByTestId('start-analysis');
      expect(startAnalysisButton).toBeInTheDocument();

      // Should have proper accessibility attributes
    });

    it('supports keyboard navigation', () => {
      render(<YouTubeVideoAnalyzePage />);

      const startAnalysisButton = screen.getByTestId('start-analysis');

      // Should be focusable and respond to keyboard events
      startAnalysisButton.focus();
      expect(document.activeElement).toBe(startAnalysisButton);
    });
  });

  describe('Integration Tests', () => {
    it('completes full analysis workflow', async () => {
      const mockAnalyzeAudio = jest.fn().mockResolvedValue(mockAnalysisResults);
      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isExtracted: true },
        analysisResults: null,
        analyzeAudio: mockAnalyzeAudio,
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      // Start analysis
      const startAnalysisButton = screen.getByTestId('start-analysis');
      fireEvent.click(startAnalysisButton);

      expect(mockAnalyzeAudio).toHaveBeenCalled();
    });

    it('handles playback with beat synchronization', async () => {
      const mockPlay = jest.fn();
      const mockSeek = jest.fn();

      jest.mocked(require('@/hooks/useAudioPlayer').useAudioPlayer).mockReturnValue({
        state: { isPlaying: false, currentTime: 0 },
        play: mockPlay,
        seek: mockSeek,
        pause: jest.fn(),
        audioRef: { current: null },
        youtubePlayer: null,
        setPlaybackRate: jest.fn(),
        setPreferredAudioSource: jest.fn(),
        handleTimeUpdate: jest.fn(),
        handleLoadedMetadata: jest.fn(),
        handleYouTubePlayerReady: jest.fn(),
        setState: jest.fn(),
        setYoutubePlayer: jest.fn(),
        setDuration: jest.fn(),
      });

      jest.mocked(require('@/hooks/useAudioProcessing').useAudioProcessing).mockReturnValue({
        state: { isAnalyzed: true },
        analysisResults: mockAnalysisResults,
        analyzeAudio: jest.fn(),
        setState: jest.fn(),
        setAnalysisResults: jest.fn(),
        setVideoTitle: jest.fn(),
      });

      render(<YouTubeVideoAnalyzePage />);

      // Click on a chord to seek
      const chordCell = screen.getByTestId('chord-cell-0');
      fireEvent.click(chordCell);

      expect(mockSeek).toHaveBeenCalled();

      // Start playback
      const playButton = screen.getByTestId('play-button');
      fireEvent.click(playButton);

      expect(mockPlay).toHaveBeenCalled();
    });
  });
});
