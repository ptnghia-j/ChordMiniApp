import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import {
  useAnalysisActions,
  useAnalysisError,
  useAnalysisResults,
  useCacheState,
  useChordCorrections,
  useIsAnalyzing,
  useIsDetectingKey,
  useIsTranscribingLyrics,
  useKeySignature,
  useLyrics,
  useModelActions,
  useShowCorrectedChords,
  useAnalysisStore,
} from '@/stores/analysisStore';
import {
  useBeatHandlers,
  useCurrentBeatIndex,
  useCurrentTime,
  useIsFollowModeEnabled,
  useIsPlaying,
  useIsVideoMinimized,
  usePlaybackControls,
  usePlaybackStore,
} from '@/stores/playbackStore';
import {
  useActiveTab,
  useChatbotOpen,
  useGuitarCapoFret,
  useGuitarSelectedPositions,
  useIsLoopEnabled,
  useLyricsPanelOpen,
  usePitchShift,
  useRomanNumerals,
  useShowSegmentation,
  useSimplifyChords,
  useToggleLoop,
  useToggleRomanNumerals,
  useToggleSegmentation,
  useToggleSimplifyChords,
  useUIStore,
} from '@/stores/uiStore';

const resetStores = () => {
  useAnalysisStore.setState(useAnalysisStore.getInitialState());
  usePlaybackStore.setState(usePlaybackStore.getInitialState());
  useUIStore.setState(useUIStore.getInitialState());
};

function AnalysisStoreHarness() {
  const analysisResults = useAnalysisResults();
  const isAnalyzing = useIsAnalyzing();
  const analysisError = useAnalysisError();
  const cacheState = useCacheState();
  const lyrics = useLyrics();
  const isTranscribingLyrics = useIsTranscribingLyrics();
  const keySignature = useKeySignature();
  const isDetectingKey = useIsDetectingKey();
  const chordCorrections = useChordCorrections();
  const showCorrectedChords = useShowCorrectedChords();
  const { startAnalysis, completeAnalysis, failAnalysis, resetAnalysis } = useAnalysisActions();
  const { setBeatDetector, setChordDetector } = useModelActions();

  return (
    <div>
      <div data-testid="analysis-state">
        {isAnalyzing ? 'analyzing' : 'idle'}|{analysisError ?? 'no-error'}|{analysisResults ? 'has-results' : 'no-results'}
      </div>
      <div data-testid="analysis-cache">
        {String(cacheState.cacheAvailable)}|{String(cacheState.cacheCheckCompleted)}
      </div>
      <div data-testid="analysis-lyrics">
        {isTranscribingLyrics ? 'transcribing' : 'not-transcribing'}|{lyrics ? 'has-lyrics' : 'no-lyrics'}
      </div>
      <div data-testid="analysis-key">
        {keySignature ?? 'no-key'}|{isDetectingKey ? 'detecting' : 'stable'}
      </div>
      <div data-testid="analysis-corrections">
        {showCorrectedChords ? 'showing' : 'hidden'}|{chordCorrections ? Object.keys(chordCorrections).join(',') : 'none'}
      </div>
      <button type="button" onClick={() => startAnalysis()}>Start analysis</button>
      <button type="button" onClick={() => completeAnalysis({ chords: [], beats: [] } as any)}>Complete analysis</button>
      <button type="button" onClick={() => failAnalysis('Test error')}>Fail analysis</button>
      <button
        type="button"
        onClick={() => {
          useAnalysisStore.getState().setCacheAvailable(true);
          useAnalysisStore.getState().setCacheCheckCompleted(true);
          useAnalysisStore.getState().startLyricsTranscription();
          useAnalysisStore.getState().completeLyricsTranscription({ lines: [] } as any);
          useAnalysisStore.getState().setKeySignature('C major');
          useAnalysisStore.getState().setIsDetectingKey(true);
          useAnalysisStore.getState().setChordCorrections({ 'C#': 'Db' });
          useAnalysisStore.getState().setShowCorrectedChords(true);
          setBeatDetector('auto');
          setChordDetector('btc-sl');
        }}
      >
        Populate analysis metadata
      </button>
      <button type="button" onClick={() => resetAnalysis()}>Reset analysis</button>
    </div>
  );
}

function PlaybackStoreHarness() {
  const isPlaying = useIsPlaying();
  const currentTime = useCurrentTime();
  const currentBeatIndex = useCurrentBeatIndex();
  const isVideoMinimized = useIsVideoMinimized();
  const isFollowModeEnabled = useIsFollowModeEnabled();
  const { play, pause, seek } = usePlaybackControls();
  const { onBeatClick } = useBeatHandlers();

  return (
    <div>
      <div data-testid="playback-state">
        {isPlaying ? 'playing' : 'paused'}|{currentTime}|{currentBeatIndex}|{isVideoMinimized ? 'minimized' : 'expanded'}|{isFollowModeEnabled ? 'follow-on' : 'follow-off'}
      </div>
      <button type="button" onClick={() => play()}>Play</button>
      <button type="button" onClick={() => pause()}>Pause</button>
      <button type="button" onClick={() => seek(12.5)}>Seek</button>
      <button type="button" onClick={() => onBeatClick(2, 4.2)}>Beat click</button>
      <button type="button" onClick={() => usePlaybackStore.getState().toggleVideoMinimization()}>Toggle minimize</button>
      <button type="button" onClick={() => usePlaybackStore.getState().toggleFollowMode()}>Toggle follow</button>
    </div>
  );
}

function UIStoreHarness() {
  const activeTab = useActiveTab();
  const isChatbotOpen = useChatbotOpen();
  const isLyricsPanelOpen = useLyricsPanelOpen();
  const { showRomanNumerals } = useRomanNumerals();
  const showSegmentation = useShowSegmentation();
  const simplifyChords = useSimplifyChords();
  const isLoopEnabled = useIsLoopEnabled();
  const { pitchShiftSemitones, targetKey, isPitchShiftReady } = usePitchShift();
  const guitarCapoFret = useGuitarCapoFret();
  const guitarSelectedPositions = useGuitarSelectedPositions();
  const toggleRomanNumerals = useToggleRomanNumerals();
  const toggleSegmentation = useToggleSegmentation();
  const toggleSimplifyChords = useToggleSimplifyChords();
  const toggleLoop = useToggleLoop();

  return (
    <div>
      <div data-testid="ui-state">
        {activeTab}|chatbot:{String(isChatbotOpen)}|lyrics:{String(isLyricsPanelOpen)}|roman:{String(showRomanNumerals)}|seg:{String(showSegmentation)}|simple:{String(simplifyChords)}|loop:{String(isLoopEnabled)}|pitch:{pitchShiftSemitones}|target:{targetKey}|ready:{String(isPitchShiftReady)}|capo:{guitarCapoFret}|positions:{Object.keys(guitarSelectedPositions).join(',') || 'none'}
      </div>
      <button type="button" onClick={() => useUIStore.getState().setActiveTab('lyricsChords')}>Set tab</button>
      <button type="button" onClick={() => useUIStore.getState().toggleLyricsPanel()}>Toggle lyrics grid</button>
      <button type="button" onClick={() => useUIStore.getState().toggleChatbot()}>Toggle chatbot</button>
      <button type="button" onClick={() => toggleRomanNumerals()}>Toggle roman numerals</button>
      <button type="button" onClick={() => toggleSegmentation()}>Toggle segmentation</button>
      <button type="button" onClick={() => toggleSimplifyChords()}>Toggle simplify</button>
      <button type="button" onClick={() => toggleLoop()}>Toggle loop</button>
      <button
        type="button"
        onClick={() => {
          useUIStore.getState().setIsPitchShiftReady(true);
          useUIStore.getState().setOriginalKey('C');
          useUIStore.getState().setPitchShiftSemitones(3);
        }}
      >
        Prepare pitch shift
      </button>
      <button type="button" onClick={() => useUIStore.getState().resetPitchShift()}>Reset pitch shift</button>
      <button
        type="button"
        onClick={() => {
          useUIStore.getState().setGuitarSelectedPosition('G', 2);
          useUIStore.getState().setGuitarCapoFret(3);
        }}
      >
        Update guitar voicing
      </button>
    </div>
  );
}

describe('Zustand store behavior', () => {
  beforeEach(() => {
    resetStores();
  });

  it('exposes analysis progress, completion, and reset behavior through selectors', () => {
    render(<AnalysisStoreHarness />);

    expect(screen.getByTestId('analysis-state')).toHaveTextContent('idle|no-error|no-results');

    fireEvent.click(screen.getByRole('button', { name: /start analysis/i }));
    expect(screen.getByTestId('analysis-state')).toHaveTextContent('analyzing|no-error|no-results');

    fireEvent.click(screen.getByRole('button', { name: /complete analysis/i }));
    expect(screen.getByTestId('analysis-state')).toHaveTextContent('idle|no-error|has-results');

    fireEvent.click(screen.getByRole('button', { name: /fail analysis/i }));
    expect(screen.getByTestId('analysis-state')).toHaveTextContent('idle|Test error|has-results');

    fireEvent.click(screen.getByRole('button', { name: /reset analysis/i }));
    expect(screen.getByTestId('analysis-state')).toHaveTextContent('idle|no-error|no-results');
  });

  it('surfaces cache, lyrics, key, and correction behavior through selector output', () => {
    render(<AnalysisStoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /populate analysis metadata/i }));

    expect(screen.getByTestId('analysis-cache')).toHaveTextContent('true|true');
    expect(screen.getByTestId('analysis-lyrics')).toHaveTextContent('not-transcribing|has-lyrics');
    expect(screen.getByTestId('analysis-key')).toHaveTextContent('C major|detecting');
    expect(screen.getByTestId('analysis-corrections')).toHaveTextContent('showing|C#');
  });

  it('updates playback-facing behavior through public playback controls and selectors', () => {
    render(<PlaybackStoreHarness />);

    expect(screen.getByTestId('playback-state')).toHaveTextContent('paused|0|-1|expanded|follow-on');

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.getByTestId('playback-state')).toHaveTextContent('playing|0|-1|expanded|follow-on');

    fireEvent.click(screen.getByRole('button', { name: /^seek$/i }));
    expect(screen.getByTestId('playback-state')).toHaveTextContent('playing|12.5|-1|expanded|follow-on');

    fireEvent.click(screen.getByRole('button', { name: /beat click/i }));
    expect(screen.getByTestId('playback-state')).toHaveTextContent('playing|4.2|2|expanded|follow-on');

    fireEvent.click(screen.getByRole('button', { name: /toggle minimize/i }));
    fireEvent.click(screen.getByRole('button', { name: /toggle follow/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    expect(screen.getByTestId('playback-state')).toHaveTextContent('paused|4.2|2|minimized|follow-off');
  });

  it('preserves UI behaviors like panel exclusivity, feature toggles, and pitch-shift reset', () => {
    render(<UIStoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /set tab/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('lyricsChords');

    fireEvent.click(screen.getByRole('button', { name: /toggle lyrics grid/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('chatbot:false|lyrics:true');

    fireEvent.click(screen.getByRole('button', { name: /toggle chatbot/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('chatbot:true|lyrics:false');

    fireEvent.click(screen.getByRole('button', { name: /toggle roman numerals/i }));
    fireEvent.click(screen.getByRole('button', { name: /toggle segmentation/i }));
    fireEvent.click(screen.getByRole('button', { name: /toggle simplify/i }));
    fireEvent.click(screen.getByRole('button', { name: /toggle loop/i }));

    expect(screen.getByTestId('ui-state')).toHaveTextContent('roman:true|seg:true|simple:true|loop:true');

    fireEvent.click(screen.getByRole('button', { name: /prepare pitch shift/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('pitch:3|target:Eb|ready:true');

    fireEvent.click(screen.getByRole('button', { name: /reset pitch shift/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('pitch:0|target:C|ready:false');

    fireEvent.click(screen.getByRole('button', { name: /update guitar voicing/i }));
    expect(screen.getByTestId('ui-state')).toHaveTextContent('capo:3|positions:none');
  });

  it('resets utility bar state to defaults for a fresh analysis session', () => {
    act(() => {
      const store = useUIStore.getState();
      store.setShowRomanNumerals(true);
      store.updateRomanNumeralData({ analysis: ['I'], keyContext: 'C' });
      store.setShowSegmentation(true);
      store.setSimplifyChords(true);
      store.setIsMelodicTranscriptionPlaybackEnabled(true);
      store.setIsLoopEnabled(true);
      store.setLoopRange(2, 8);
      store.setIsPitchShiftEnabled(true);
      store.setIsPitchShiftReady(true);
      store.setOriginalKey('D');
      store.setPitchShiftSemitones(2);
      store.setIsProcessingPitchShift(true);
      store.setPitchShiftError('pitch error');
    });

    act(() => {
      useUIStore.getState().resetAnalysisUtilityBarState();
    });

    const state = useUIStore.getState();
    expect(state.showRomanNumerals).toBe(false);
    expect(state.romanNumeralData).toBeNull();
    expect(state.showSegmentation).toBe(false);
    expect(state.simplifyChords).toBe(false);
    expect(state.isMelodicTranscriptionPlaybackEnabled).toBe(false);
    expect(state.isLoopEnabled).toBe(false);
    expect(state.loopStartBeat).toBe(-1);
    expect(state.loopEndBeat).toBe(-1);
    expect(state.isPitchShiftEnabled).toBe(false);
    expect(state.isPitchShiftReady).toBe(false);
    expect(state.pitchShiftSemitones).toBe(0);
    expect(state.isProcessingPitchShift).toBe(false);
    expect(state.pitchShiftError).toBeNull();
    expect(state.targetKey).toBe(state.originalKey);
  });
});
