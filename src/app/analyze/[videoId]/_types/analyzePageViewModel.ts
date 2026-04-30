import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { AudioPlayerState } from '@/hooks/chord-playback/useAudioPlayer';
import type { BeatDetectorType, ChordDetectorType } from '@/hooks/chord-analysis/useModelState';
import type { SongContext } from '@/types/chatbotTypes';
import type { AnalysisResult } from '@/types/audioAnalysis';
import type { AudioProcessingState } from '@/services/audio/audioProcessingService';
import type { LyricsData } from '@/types/musicAiTypes';
import type { YouTubePlayer } from '@/types/youtube';
import type { UseChordPlaybackReturn } from '@/hooks/chord-playback/useChordPlayback';
import type { TabKey } from '@/components/homepage/ResultsTabs';

export interface AnalyzePageChromeProps {
  analyzeBackdropUrl: string | null;
  showFooterTransition: boolean;
  processingBannersProps: {
    isDownloading: boolean;
    fromCache: boolean;
    showExtractionNotification: boolean;
    onDismissExtraction: () => void;
    onRefreshExtraction: () => void;
    analysisResults: AnalysisResult | null;
    audioDuration: number;
    audioUrl?: string;
    fromFirestoreCache: boolean;
    videoId: string;
    beatDetector: BeatDetectorType;
    error: string | null;
    suggestion?: string;
    onTryAnotherVideo: () => void;
    onRetry: () => void;
  };
  melodyToastProps: {
    isComputing: boolean;
    durationSeconds: number;
    hasResult: boolean;
    errorMessage: string | null;
  };
}

export interface AnalyzeControlsPropsGroup {
  isExtracted: boolean;
  isAnalyzed: boolean;
  isAnalyzing: boolean;
  hasError: boolean;
  stage: string;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  onBeatDetectorChange: (detector: BeatDetectorType) => void;
  onChordDetectorChange: (detector: ChordDetectorType) => void;
  onStartAnalysis: () => void;
  cacheAvailable?: boolean;
  cacheCheckCompleted?: boolean;
  actionDisabledReason?: string | null;
  hidden?: boolean;
}

export interface AnalyzeResultsPaneProps {
  analysisResults: AnalysisResult | null;
  isAnalyzed: boolean;
  videoTitle: string;
  isEditMode: boolean;
  editedTitle: string;
  onTitleChange: (title: string) => void;
  onEditToggle: () => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  showCorrectedChords: boolean;
  hasCorrections: boolean;
  toggleEnharmonicCorrection: () => void;
  isTranscribingLyrics: boolean;
  hasCachedLyrics: boolean;
  canTranscribe: boolean;
  transcribeLyricsWithAI: () => Promise<unknown>;
  lyricsError: string | null;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  showLyrics: boolean;
  lyrics: LyricsData | null;
  currentTime: number;
  fontSize: number;
  onFontSizeChange: Dispatch<SetStateAction<number>>;
  theme: string;
  segmentationData: unknown;
  sequenceCorrections: unknown;
  chordGridData: unknown;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  editedChords: Record<string, string>;
  onChordEdit: (index: number, newChord: string) => void;
  keySignature: string | null;
  currentBeatIndex: number;
  isPlaying: boolean;
  isChordPlaybackEnabled: boolean;
  audioUrl: string | null;
  sheetSageResult: unknown;
  showMelodicOverlay: boolean;
  duration: number;
  activeTranscriptionUsageCount: number;
  currentDownbeatIndex: number;
}

export interface AnalyzeSidePanelsProps {
  isLyricsPanelOpen: boolean;
  isChatbotOpen: boolean;
  closeLyricsPanel: () => void;
  closeChatbot: () => void;
  videoTitle: string;
  currentTime: number;
  songContext: SongContext;
}

export interface AnalyzeFloatingDockSectionProps {
  analysisResults: AnalysisResult | null;
  isVideoMinimized: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  videoPlayerProps: {
    isChatbotOpen: boolean;
    isLyricsPanelOpen: boolean;
    isVideoMinimized: boolean;
    isFollowModeEnabled: boolean;
    analysisResults: AnalysisResult;
    currentBeatIndex: number;
    chords: unknown[];
    beats: unknown[];
    segmentationData: unknown;
    toggleVideoMinimization: () => void;
    toggleFollowMode: () => void;
    toggleMetronomeWithSync: () => Promise<boolean>;
    videoId: string;
    isPlaying: boolean;
    playbackRate: number;
    currentTime: number;
    duration: number;
    onReady: (player: unknown) => void;
    onPlay: () => Promise<void>;
    onPause: () => void;
    onProgress: (state: { played: number; playedSeconds: number }) => void;
    onSeek: (time: number) => void;
    onEnded: () => void;
    youtubeMuted: boolean;
    youtubeEmbedUrl?: string;
    videoUrl?: string;
    youtubePlayer: YouTubePlayer | null;
    melodicTranscriptionPlayback?: {
      isEnabled: boolean;
      hasTranscription: boolean;
      isLoading: boolean;
      disabled: boolean;
      disabledReason?: string;
      errorMessage?: string | null;
      canAdjustVolume: boolean;
      togglePlayback: () => Promise<void>;
    };
    showTopToggles: boolean;
    positionMode: 'relative';
    timeSignature: number;
    isCountdownEnabled: boolean;
    isCountingDown: boolean;
    countdownDisplay: string;
    onRequestCountdown: () => Promise<boolean>;
  };
}

export interface AnalyzePageViewModel {
  audioRef: RefObject<HTMLAudioElement | null>;
  audioPlayerState: AudioPlayerState;
  setAudioPlayerState: Dispatch<SetStateAction<AudioPlayerState>>;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  youtubePlayer: YouTubePlayer | null;
  analysisResults: AnalysisResult | null;
  keySignature: string | null;
  currentBeatIndex: number;
  chordGridData: unknown;
  segmentationData: unknown;
  audioUrl: string | null;
  bpm: number;
  timeSignature: number;
  chordPlayback: UseChordPlaybackReturn;
  handleChordPlaybackChange: (playback: UseChordPlaybackReturn) => void;
  splitLayoutHeight: string;
  chromeProps: AnalyzePageChromeProps;
  controlsProps: AnalyzeControlsPropsGroup;
  resultsPaneProps: AnalyzeResultsPaneProps;
  sidePanelsProps: AnalyzeSidePanelsProps;
  floatingDockProps: AnalyzeFloatingDockSectionProps;
  utilityBarProps: {
    isFollowModeEnabled: boolean;
    chordPlayback: UseChordPlaybackReturn;
    melodicTranscriptionPlayback?: {
      isEnabled: boolean;
      hasTranscription: boolean;
      isLoading: boolean;
      disabled: boolean;
      disabledReason?: string;
      errorMessage?: string | null;
      canAdjustVolume: boolean;
      togglePlayback: () => Promise<void>;
    };
    youtubePlayer: YouTubePlayer | null;
    playbackRate: number;
    setPlaybackRate: (rate: number) => void;
    toggleFollowMode: () => void;
    isCountdownEnabled: boolean;
    isCountingDown: boolean;
    countdownDisplay: string;
    toggleCountdown: () => void;
    isChatbotOpen: boolean;
    isLyricsPanelOpen: boolean;
    toggleChatbot: () => void;
    toggleLyricsPanel: () => void;
    segmentation: {
      isVisible: boolean;
      hasData: boolean;
      isLoading: boolean;
      disabled?: boolean;
      disabledReason?: string;
      errorMessage?: string | null;
      onToggle: () => void;
    };
    metronome: {
      isEnabled: boolean;
      toggleMetronomeWithSync: () => Promise<boolean>;
    };
    totalBeats: number;
  };
}

export interface UseAnalyzePageStoreSyncParams {
  analysisResults: AnalysisResult | null;
  audioProcessingState: AudioProcessingState;
  cacheAvailable: boolean;
  cacheCheckCompleted: boolean;
  cacheCheckInProgress: boolean;
  keySignature: string | null;
  isDetectingKey: boolean;
  chordCorrections: Record<string, string> | null;
  showCorrectedChords: boolean;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  modelsInitialized: boolean;
  lyrics: LyricsData | null;
  showLyrics: boolean;
  hasCachedLyrics: boolean;
  isTranscribingLyrics: boolean;
  lyricsError: string | null;
  videoTitle: string;
  showSegmentation: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  youtubePlayer: YouTubePlayer | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  isVideoMinimized: boolean;
  isFollowModeEnabled: boolean;
}

export interface UseAnalyzePageLifecycleResetParams {
  videoId: string;
  resetSegmentation: () => void;
  setIsMelodicTranscriptionPlaybackEnabled: (enabled: boolean) => void;
  setIsFollowModeEnabled: Dispatch<SetStateAction<boolean>>;
  setIsCountdownEnabled: Dispatch<SetStateAction<boolean>>;
  cancelCountdown: () => void;
  countdownStateRef: MutableRefObject<{ inProgress: boolean; completed: boolean }>;
  chordPlayback: UseChordPlaybackReturn;
  setIsMetronomeEnabled: Dispatch<SetStateAction<boolean>>;
  disableMetronomeService: () => void;
}
