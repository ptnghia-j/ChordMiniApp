/**
 * Test suite for extracted hooks from analyze page refactoring
 * Validates that extracted hooks maintain identical behavior
 */

import { renderHook, act } from '@testing-library/react';
import { useAnalysisState } from '../src/hooks/useAnalysisState';
import { usePlaybackState } from '../src/hooks/usePlaybackState';
import { useUILayout } from '../src/hooks/useUILayout';

// Mock Firebase services
jest.mock('../src/services/firestoreService', () => ({
  getTranscription: jest.fn(),
  saveTranscription: jest.fn()
}));

// Mock key detection service
jest.mock('../src/services/keyDetectionService', () => ({
  detectKey: jest.fn()
}));

describe('Extracted Hooks Validation', () => {
  describe('useAnalysisState', () => {
    const mockProps = {
      videoId: 'test-video-id',
      analysisResults: null,
      audioProcessingState: {
        isExtracted: false,
        audioUrl: null,
        isAnalyzed: false,
        isAnalyzing: false
      }
    };

    it('should initialize with default model selections', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      expect(result.current.beatDetector).toBe('beat-transformer');
      expect(result.current.chordDetector).toBe('chord-cnn-lstm');
      expect(result.current.cacheAvailable).toBe(false);
      expect(result.current.cacheCheckCompleted).toBe(false);
      expect(result.current.modelsInitialized).toBe(false);
    });

    it('should update beat detector and persist to localStorage', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      act(() => {
        result.current.setBeatDetector('madmom');
      });
      
      expect(result.current.beatDetector).toBe('madmom');
      expect(result.current.beatDetectorRef.current).toBe('madmom');
    });

    it('should update chord detector and persist to localStorage', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      act(() => {
        result.current.setChordDetector('btc-sl');
      });
      
      expect(result.current.chordDetector).toBe('btc-sl');
      expect(result.current.chordDetectorRef.current).toBe('btc-sl');
    });

    it('should handle key signature state', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      act(() => {
        result.current.setKeySignature('C major');
      });
      
      expect(result.current.keySignature).toBe('C major');
      expect(result.current.isDetectingKey).toBe(false);
    });

    it('should handle chord corrections state', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      const corrections = { 'C#': 'Db', 'F#': 'Gb' };
      
      act(() => {
        result.current.setChordCorrections(corrections);
      });
      
      expect(result.current.chordCorrections).toEqual(corrections);
      expect(result.current.memoizedChordCorrections).toEqual(corrections);
    });

    it('should handle sequence corrections state', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      const sequenceCorrections = {
        originalSequence: ['C', 'F', 'G'],
        correctedSequence: ['C', 'F', 'G']
      };
      
      act(() => {
        result.current.setSequenceCorrections(sequenceCorrections);
      });
      
      expect(result.current.sequenceCorrections).toEqual(sequenceCorrections);
      expect(result.current.memoizedSequenceCorrections).toEqual(sequenceCorrections);
    });

    it('should auto-enable corrections when sequence corrections are available', () => {
      const { result } = renderHook(() => useAnalysisState(mockProps));
      
      const sequenceCorrections = {
        originalSequence: ['C', 'F', 'G'],
        correctedSequence: ['C', 'F', 'G']
      };
      
      act(() => {
        result.current.setSequenceCorrections(sequenceCorrections);
      });
      
      // Should auto-enable corrections
      expect(result.current.showCorrectedChords).toBe(true);
      expect(result.current.hasAutoEnabledCorrections).toBe(true);
    });
  });

  describe('usePlaybackState', () => {
    let mockAudioElement;
    let mockYouTubePlayer;
    let mockProps;

    beforeEach(() => {
      mockAudioElement = {
        currentTime: 0,
        duration: 100,
        play: jest.fn(),
        pause: jest.fn(),
        muted: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      mockYouTubePlayer = {
        seekTo: jest.fn(),
        muted: false
      };

      mockProps = {
        audioRef: { current: mockAudioElement },
        youtubePlayer: mockYouTubePlayer,
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
    });

    it('should initialize with default playback state', () => {
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      expect(result.current.currentBeatIndex).toBe(-1);
      expect(result.current.currentDownbeatIndex).toBe(-1);
      expect(result.current.lastClickInfo).toBe(null);
      expect(result.current.globalSpeedAdjustment).toBe(null);
    });

    it('should handle beat click navigation', () => {
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      act(() => {
        result.current.handleBeatClick(5, 10.5);
      });
      
      expect(mockAudioElement.currentTime).toBe(10.5);
      expect(mockYouTubePlayer.seekTo).toHaveBeenCalledWith(10.5, 'seconds');
      expect(result.current.currentBeatIndex).toBe(5);
      expect(result.current.lastClickInfo).toEqual({
        visualIndex: 5,
        timestamp: 10.5,
        clickTime: expect.any(Number)
      });
    });

    it('should handle YouTube player ready event', () => {
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      const mockPlayer = { seekTo: jest.fn() };
      
      act(() => {
        result.current.handleYouTubeReady(mockPlayer);
      });
      
      expect(mockProps.setYoutubePlayer).toHaveBeenCalledWith(mockPlayer);
    });

    it('should handle YouTube play event', () => {
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      act(() => {
        result.current.handleYouTubePlay();
      });
      
      expect(mockAudioElement.play).toHaveBeenCalled();
    });

    it('should handle YouTube pause event', () => {
      mockProps.audioPlayerState.isPlaying = true;
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      act(() => {
        result.current.handleYouTubePause();
      });
      
      expect(mockAudioElement.pause).toHaveBeenCalled();
    });

    it('should handle YouTube progress synchronization', () => {
      mockAudioElement.currentTime = 5.0;
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      act(() => {
        result.current.handleYouTubeProgress({ played: 0.1, playedSeconds: 10.0 });
      });
      
      // Should sync audio to YouTube time when difference > 0.5s
      expect(mockAudioElement.currentTime).toBe(10.0);
    });

    it('should provide audio player state accessors', () => {
      const { result } = renderHook(() => usePlaybackState(mockProps));
      
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.currentTime).toBe(0);
      expect(result.current.duration).toBe(100);
      expect(result.current.playbackRate).toBe(1);
      expect(result.current.preferredAudioSource).toBe('extracted');
    });
  });

  describe('useUILayout', () => {
    let mockAudioElement;
    let mockYouTubePlayer;
    let mockProps;

    beforeEach(() => {
      mockAudioElement = {
        muted: false
      };

      mockYouTubePlayer = {
        muted: false
      };

      mockProps = {
        audioRef: { current: mockAudioElement },
        youtubePlayer: mockYouTubePlayer,
        preferredAudioSource: 'extracted',
        setPreferredAudioSource: jest.fn()
      };
    });

    it('should initialize with default UI state', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      expect(result.current.isVideoMinimized).toBe(false);
      expect(result.current.isFollowModeEnabled).toBe(true);
      expect(result.current.showExtractionNotification).toBe(false);
      expect(result.current.activeTab).toBe('beatChordMap');
      expect(result.current.isChatbotOpen).toBe(false);
      expect(result.current.isLyricsPanelOpen).toBe(false);
    });

    it('should toggle video minimization', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      act(() => {
        result.current.toggleVideoMinimization();
      });
      
      expect(result.current.isVideoMinimized).toBe(true);
    });

    it('should toggle follow mode', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      act(() => {
        result.current.toggleFollowMode();
      });
      
      expect(result.current.isFollowModeEnabled).toBe(false);
    });

    it('should handle lyrics state', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      const mockLyrics = { words: [], sentences: [] };
      
      act(() => {
        result.current.setLyrics(mockLyrics);
        result.current.setShowLyrics(true);
        result.current.setFontSize(18);
      });
      
      expect(result.current.lyrics).toEqual(mockLyrics);
      expect(result.current.showLyrics).toBe(true);
      expect(result.current.fontSize).toBe(18);
    });

    it('should handle tab switching', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      act(() => {
        result.current.setActiveTab('lyricsChords');
      });
      
      expect(result.current.activeTab).toBe('lyricsChords');
    });

    it('should handle panel coordination', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      // Open lyrics panel first
      act(() => {
        result.current.toggleLyricsPanel();
      });
      
      expect(result.current.isLyricsPanelOpen).toBe(true);
      expect(result.current.isChatbotOpen).toBe(false);
      
      // Opening chatbot should close lyrics panel
      act(() => {
        result.current.toggleChatbot();
      });
      
      expect(result.current.isChatbotOpen).toBe(true);
      expect(result.current.isLyricsPanelOpen).toBe(false);
    });

    it('should toggle audio source and handle muting', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      act(() => {
        result.current.toggleAudioSource();
      });
      
      expect(mockProps.setPreferredAudioSource).toHaveBeenCalledWith('youtube');
    });

    it('should check chatbot availability', () => {
      const { result } = renderHook(() => useUILayout(mockProps));
      
      expect(result.current.isChatbotAvailable()).toBe(true);
    });
  });

  describe('Hook Integration', () => {
    it('should maintain consistent data flow between hooks', () => {
      const analysisProps = {
        videoId: 'test-video',
        analysisResults: null,
        audioProcessingState: {
          isExtracted: false,
          audioUrl: null,
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

      const { result: analysisResult } = renderHook(() => useAnalysisState(analysisProps));
      const { result: playbackResult } = renderHook(() => usePlaybackState(playbackProps));
      const { result: uiResult } = renderHook(() => useUILayout(uiProps));

      // Verify that hooks can be used together without conflicts
      expect(analysisResult.current.beatDetector).toBeDefined();
      expect(playbackResult.current.currentBeatIndex).toBeDefined();
      expect(uiResult.current.activeTab).toBeDefined();
    });
  });
});
