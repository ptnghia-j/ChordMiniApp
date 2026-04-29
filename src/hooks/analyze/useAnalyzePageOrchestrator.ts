import { Dispatch, MutableRefObject, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { AnalyzeAudioFileOptions, AudioProcessingState } from '@/services/audio/audioProcessingService';
import {
  extractAudioFromYouTube as extractAudioFromYouTubeService,
  handleAudioAnalysis as handleAudioAnalysisService,
} from '@/services/audio/audioProcessingExtracted';
import { estimateKeySignatureFromChords } from '@/utils/chordUtils';
import {
  getTranscription,
  TranscriptionData,
  updateTranscriptionEnrichment,
} from '@/services/firebase/firestoreService';
import { ProcessingStage } from '@/contexts/ProcessingContext';
import { LyricsData } from '@/types/musicAiTypes';

type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

type SequenceCorrections = {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{
      startIndex: number;
      endIndex: number;
      key: string;
      chords: string[];
    }>;
    modulations?: Array<{
      fromKey: string;
      toKey: string;
      atIndex: number;
      atTime?: number;
    }>;
  };
  romanNumerals?: TranscriptionData['romanNumerals'];
} | null;

type TranscriptionSnapshot = TranscriptionData | Omit<TranscriptionData, 'createdAt'>;
type RomanNumeralSnapshot = NonNullable<TranscriptionData['romanNumerals']>;

interface UseAnalyzePageOrchestratorParams {
  videoId: string;
  titleFromSearch: string | null;
  durationFromSearch: string | null;
  channelFromSearch: string | null;
  thumbnailFromSearch: string | null;
  firebaseReady: boolean;
  modelsInitialized: boolean;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  beatDetectorRef: MutableRefObject<BeatDetectorType>;
  chordDetectorRef: MutableRefObject<ChordDetectorType>;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioProcessingState: AudioProcessingState;
  analysisResults: AnalysisResult | null;
  lyrics: LyricsData | null;
  showRomanNumerals: boolean;
  setShowExtractionNotification: (show: boolean) => void;
  setAudioProcessingState: Dispatch<SetStateAction<AudioProcessingState>>;
  setAnalysisResults: Dispatch<SetStateAction<AnalysisResult | null>>;
  setDuration: (duration: number) => void;
  setVideoTitle: (title: string) => void;
  setLyrics: Dispatch<SetStateAction<LyricsData | null>>;
  setShowLyrics: (show: boolean) => void;
  setHasCachedLyrics: (cached: boolean) => void;
  stage: ProcessingStage;
  setStage: (stage: ProcessingStage) => void;
  setProgress: (progress: number) => void;
  setStatusMessage: (message: string) => void;
  startProcessing: () => void;
  completeProcessing: () => void;
  failProcessing: (message: string) => void;
  updateRomanNumeralData: (romanNumerals: RomanNumeralSnapshot | null) => void;
  analyzeAudioFromService: (
    audioUrl: string,
    beatDetector: BeatDetectorType,
    chordDetector: ChordDetectorType,
    options?: AnalyzeAudioFileOptions
  ) => Promise<AnalysisResult>;
  skipInitialCacheBootstrap?: boolean;
}

const buildSnapshotKey = (
  videoId: string,
  beatDetector: string,
  chordDetector: string
) => `${videoId}_${beatDetector}_${chordDetector}`;

const areStringArraysEqual = (left: string[] = [], right: string[] = []) => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const areChordCorrectionsEqual = (
  left: Record<string, string> | null,
  right: Record<string, string> | null,
) => {
  if (left === right) return true;
  if (!left || !right) return left === right;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
};

const areRomanTemporalShiftsEqual = (
  left: RomanNumeralSnapshot['temporalShifts'] = [],
  right: RomanNumeralSnapshot['temporalShifts'] = [],
) => (
  left.length === right.length && left.every((shift, index) => (
    shift.chordIndex === right[index]?.chordIndex &&
    shift.targetKey === right[index]?.targetKey &&
    shift.romanNumeral === right[index]?.romanNumeral
  ))
);

const areRomanNumeralDataEqual = (
  left: RomanNumeralSnapshot | null,
  right: RomanNumeralSnapshot | null,
) => {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return (
    left.keyContext === right.keyContext &&
    areStringArraysEqual(left.analysis, right.analysis) &&
    areRomanTemporalShiftsEqual(left.temporalShifts, right.temporalShifts)
  );
};

const areKeyAnalysisEqual = (
  left: NonNullable<SequenceCorrections>['keyAnalysis'],
  right: NonNullable<SequenceCorrections>['keyAnalysis'],
) => {
  if (left === right) return true;
  if (!left || !right) return left === right;

  const sectionsEqual =
    left.sections.length === right.sections.length &&
    left.sections.every((section, index) => (
      section.startIndex === right.sections[index]?.startIndex &&
      section.endIndex === right.sections[index]?.endIndex &&
      section.key === right.sections[index]?.key &&
      areStringArraysEqual(section.chords, right.sections[index]?.chords ?? [])
    ));

  if (!sectionsEqual) {
    return false;
  }

  const leftModulations = left.modulations ?? [];
  const rightModulations = right.modulations ?? [];

  return (
    leftModulations.length === rightModulations.length &&
    leftModulations.every((modulation, index) => (
      modulation.fromKey === rightModulations[index]?.fromKey &&
      modulation.toKey === rightModulations[index]?.toKey &&
      modulation.atIndex === rightModulations[index]?.atIndex &&
      modulation.atTime === rightModulations[index]?.atTime
    ))
  );
};

const areSequenceCorrectionsEqual = (
  left: SequenceCorrections,
  right: SequenceCorrections,
) => {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return (
    areStringArraysEqual(left.originalSequence, right.originalSequence) &&
    areStringArraysEqual(left.correctedSequence, right.correctedSequence) &&
    areKeyAnalysisEqual(left.keyAnalysis, right.keyAnalysis) &&
    areRomanNumeralDataEqual(left.romanNumerals ?? null, right.romanNumerals ?? null)
  );
};

const withRomanNumerals = (
  corrections: SequenceCorrections,
  romanNumerals: TranscriptionData['romanNumerals'] | null | undefined,
): SequenceCorrections => (
  corrections
    ? {
        ...corrections,
        romanNumerals: romanNumerals ?? corrections.romanNumerals ?? null,
      }
    : null
);

const mergeSequenceCorrections = (
  authoritativeCorrections: SequenceCorrections,
  incomingCorrections: SequenceCorrections,
): SequenceCorrections => {
  if (!authoritativeCorrections) {
    return incomingCorrections;
  }

  if (!incomingCorrections) {
    return authoritativeCorrections;
  }

  return {
    originalSequence: incomingCorrections.originalSequence.length
      ? incomingCorrections.originalSequence
      : authoritativeCorrections.originalSequence,
    correctedSequence: incomingCorrections.correctedSequence.length
      ? incomingCorrections.correctedSequence
      : authoritativeCorrections.correctedSequence,
    keyAnalysis: incomingCorrections.keyAnalysis ?? authoritativeCorrections.keyAnalysis,
    romanNumerals: incomingCorrections.romanNumerals ?? authoritativeCorrections.romanNumerals ?? null,
  };
};

const preferMoreCompleteSequenceCorrections = (
  currentCorrections: SequenceCorrections,
  nextCorrections: SequenceCorrections,
): SequenceCorrections => {
  if (!currentCorrections || !nextCorrections) {
    return nextCorrections;
  }

  const sameSequences =
    areStringArraysEqual(currentCorrections.originalSequence, nextCorrections.originalSequence) &&
    areStringArraysEqual(currentCorrections.correctedSequence, nextCorrections.correctedSequence);

  if (!sameSequences) {
    return nextCorrections;
  }

  const wouldLoseRomanNumerals = !nextCorrections.romanNumerals && !!currentCorrections.romanNumerals;
  const wouldLoseKeyAnalysis = !nextCorrections.keyAnalysis && !!currentCorrections.keyAnalysis;

  return (wouldLoseRomanNumerals || wouldLoseKeyAnalysis)
    ? mergeSequenceCorrections(currentCorrections, nextCorrections)
    : nextCorrections;
};

export function useAnalyzePageOrchestrator({
  videoId,
  titleFromSearch,
  durationFromSearch,
  channelFromSearch,
  thumbnailFromSearch,
  firebaseReady,
  modelsInitialized,
  beatDetector,
  chordDetector,
  beatDetectorRef,
  chordDetectorRef,
  audioRef,
  audioProcessingState,
  analysisResults,
  lyrics,
  showRomanNumerals,
  setShowExtractionNotification,
  setAudioProcessingState,
  setAnalysisResults,
  setDuration,
  setVideoTitle,
  setLyrics,
  setShowLyrics,
  setHasCachedLyrics,
  stage,
  setStage,
  setProgress,
  setStatusMessage,
  startProcessing,
  completeProcessing,
  failProcessing,
  updateRomanNumeralData,
  analyzeAudioFromService,
  skipInitialCacheBootstrap = false,
}: UseAnalyzePageOrchestratorParams) {
  const [cacheAvailable, setCacheAvailable] = useState(false);
  const [cacheCheckCompleted, setCacheCheckCompleted] = useState(false);
  const [cacheCheckInProgress, setCacheCheckInProgress] = useState(false);
  const [initialCacheCheckDone, setInitialCacheCheckDone] = useState(skipInitialCacheBootstrap);
  const [keySignature, setKeySignature] = useState<string | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);
  const [romanNumeralsRequested, setRomanNumeralsRequested] = useState(false);
  const [keyDetectionAttempted, setKeyDetectionAttempted] = useState(false);
  const [chordCorrections, setChordCorrections] = useState<Record<string, string> | null>(null);
  const [showCorrectedChords, setShowCorrectedChords] = useState(false);
  const [sequenceCorrections, setSequenceCorrections] = useState<SequenceCorrections>(null);
  const [hasAutoEnabledCorrections, setHasAutoEnabledCorrections] = useState(false);

  const extractionLockRef = useRef(false);
  const latestRequestIdRef = useRef<string | null>(null);
  const audioExtractionAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionSnapshotsRef = useRef<Record<string, TranscriptionSnapshot | null | undefined>>({});
  const romanNumeralDataRef = useRef<RomanNumeralSnapshot | null>(null);
  const [persistedSnapshotKeys, setPersistedSnapshotKeys] = useState<Record<string, true>>({});
  const [snapshotUsageCounts, setSnapshotUsageCounts] = useState<Record<string, number>>({});

  const storeTranscriptionSnapshot = useCallback((
    snapshot: TranscriptionSnapshot | null,
    snapshotBeatDetector = beatDetector,
    snapshotChordDetector = chordDetector
  ) => {
    const snapshotKey = buildSnapshotKey(videoId, snapshotBeatDetector, snapshotChordDetector);
    transcriptionSnapshotsRef.current[snapshotKey] = snapshot;
    setSnapshotUsageCounts((current) => {
      const nextUsageCount = snapshot?.usageCount;
      const normalizedUsageCount =
        typeof nextUsageCount === 'number' && Number.isFinite(nextUsageCount) && nextUsageCount >= 0
          ? nextUsageCount
          : 0;

      if (current[snapshotKey] === normalizedUsageCount) {
        return current;
      }

      return {
        ...current,
        [snapshotKey]: normalizedUsageCount,
      };
    });

    setPersistedSnapshotKeys((current) => {
      const hasPersistedSnapshot = Boolean(snapshot);
      const alreadyTracked = Object.prototype.hasOwnProperty.call(current, snapshotKey);

      if (hasPersistedSnapshot) {
        if (alreadyTracked) {
          return current;
        }

        return {
          ...current,
          [snapshotKey]: true,
        };
      }

      if (!alreadyTracked) {
        return current;
      }

      const next = { ...current };
      delete next[snapshotKey];
      return next;
    });
  }, [beatDetector, chordDetector, videoId]);

  const setTranscriptionSnapshot = useCallback(
    (snapshot: TranscriptionSnapshot | null, snapshotBeatDetector = beatDetector, snapshotChordDetector = chordDetector) => {
      storeTranscriptionSnapshot(snapshot, snapshotBeatDetector, snapshotChordDetector);
    },
    [beatDetector, chordDetector, storeTranscriptionSnapshot]
  );

  const loadTranscriptionSnapshot = useCallback(async (
    snapshotBeatDetector = beatDetector,
    snapshotChordDetector = chordDetector
  ) => {
    const snapshotKey = buildSnapshotKey(videoId, snapshotBeatDetector, snapshotChordDetector);

    if (Object.prototype.hasOwnProperty.call(transcriptionSnapshotsRef.current, snapshotKey)) {
      const inMemorySnapshot = transcriptionSnapshotsRef.current[snapshotKey] ?? null;
      return inMemorySnapshot;
    }

    const snapshot = await getTranscription(videoId, snapshotBeatDetector, snapshotChordDetector);
    storeTranscriptionSnapshot(snapshot, snapshotBeatDetector, snapshotChordDetector);
    return snapshot;
  }, [beatDetector, chordDetector, storeTranscriptionSnapshot, videoId]);

  const syncKeySignature = useCallback((nextKeySignature: string | null) => {
    setKeySignature((current) => current === nextKeySignature ? current : nextKeySignature);
  }, []);

  const syncChordCorrections = useCallback((nextChordCorrections: Record<string, string> | null) => {
    setChordCorrections((current) => areChordCorrectionsEqual(current, nextChordCorrections) ? current : nextChordCorrections);
  }, []);

  const syncSequenceCorrections = useCallback((nextSequenceCorrections: SequenceCorrections) => {
    setSequenceCorrections((current) => {
      const normalizedNextSequenceCorrections = preferMoreCompleteSequenceCorrections(current, nextSequenceCorrections);
      return areSequenceCorrectionsEqual(current, normalizedNextSequenceCorrections)
        ? current
        : normalizedNextSequenceCorrections;
    });
  }, []);

  const syncRomanNumeralData = useCallback((nextRomanNumerals: RomanNumeralSnapshot | null) => {
    if (areRomanNumeralDataEqual(romanNumeralDataRef.current, nextRomanNumerals)) {
      return;
    }

    romanNumeralDataRef.current = nextRomanNumerals;
    updateRomanNumeralData(nextRomanNumerals);
  }, [updateRomanNumeralData]);

  useEffect(() => {
    transcriptionSnapshotsRef.current = {};
    setPersistedSnapshotKeys({});
    setSnapshotUsageCounts({});
    audioExtractionAbortControllerRef.current?.abort();
    audioExtractionAbortControllerRef.current = null;
    romanNumeralDataRef.current = null;
  }, [videoId]);

  useEffect(() => {
    setCacheCheckCompleted(false);
    setCacheAvailable(false);
    setCacheCheckInProgress(false);
    setInitialCacheCheckDone(false);
  }, [beatDetector, chordDetector]);

  useEffect(() => {
    setInitialCacheCheckDone(false);
  }, [videoId]);

  const activeTranscriptionDocId = buildSnapshotKey(videoId, beatDetector, chordDetector);
  const hasPersistedActiveTranscription = Boolean(persistedSnapshotKeys[activeTranscriptionDocId]);
  const activeTranscriptionUsageCount = snapshotUsageCounts[activeTranscriptionDocId] ?? 0;

  const incrementActiveTranscriptionUsageCount = useCallback(() => {
    setSnapshotUsageCounts((current) => ({
      ...current,
      [activeTranscriptionDocId]: (current[activeTranscriptionDocId] ?? 0) + 1,
    }));
  }, [activeTranscriptionDocId]);

  useEffect(() => {
    return () => {
      audioExtractionAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (sequenceCorrections && sequenceCorrections.correctedSequence.length > 0 && !showCorrectedChords && !hasAutoEnabledCorrections) {
      setShowCorrectedChords(true);
      setHasAutoEnabledCorrections(true);
    }
  }, [sequenceCorrections, showCorrectedChords, hasAutoEnabledCorrections]);

  useEffect(() => {
    if (!showRomanNumerals) {
      setRomanNumeralsRequested(false);
    }
  }, [showRomanNumerals]);

  const extractAudioFromYouTube = useCallback(async (forceRefresh = false) => {
    if (audioExtractionAbortControllerRef.current) {
      try {
        audioExtractionAbortControllerRef.current.abort();
      } catch {
        // noop
      }
    }

    extractionLockRef.current = false;

    const controller = new AbortController();
    audioExtractionAbortControllerRef.current = controller;

    const requestId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

    latestRequestIdRef.current = requestId;

    const deps = {
      setAudioProcessingState: (updater: (prev: AudioProcessingState) => AudioProcessingState) => setAudioProcessingState(updater),
      setAnalysisResults: () => {},
      setDuration,
      setShowExtractionNotification,
      setLyrics: () => {},
      setShowLyrics: () => {},
      setHasCachedLyrics: () => {},
      setActiveTab: () => {},
      setIsTranscribingLyrics: () => {},
      setLyricsError: () => {},
      processingContext: {
        stage,
        progress: 0,
        setStage,
        setProgress,
        setStatusMessage,
        startProcessing,
        completeProcessing,
        failProcessing,
      },
      analyzeAudioFromService: () => Promise.resolve({} as AnalysisResult),
      audioRef,
      extractionLockRef,
      beatDetectorRef,
      chordDetectorRef,
      videoId,
      titleFromSearch,
      durationFromSearch,
      channelFromSearch,
      thumbnailFromSearch,
      audioProcessingState: {
        ...audioProcessingState,
        audioUrl: audioProcessingState.audioUrl ?? null,
      },
      beatDetector,
      chordDetector,
      progress: 0,
      lyrics,
      requestId,
      abortSignal: controller.signal,
      isRequestStillCurrent: (id: string) => latestRequestIdRef.current === id,
    };

    return extractAudioFromYouTubeService(
      deps as unknown as Parameters<typeof extractAudioFromYouTubeService>[0],
      forceRefresh
    );
  }, [
    audioProcessingState,
    audioRef,
    beatDetector,
    beatDetectorRef,
    channelFromSearch,
    chordDetector,
    chordDetectorRef,
    completeProcessing,
    durationFromSearch,
    failProcessing,
    setDuration,
    setProgress,
    setShowExtractionNotification,
    setStage,
    setStatusMessage,
    setAudioProcessingState,
    stage,
    startProcessing,
    thumbnailFromSearch,
    titleFromSearch,
    lyrics,
    videoId,
  ]);

  const handleAudioAnalysis = useCallback(async () => {
    const deps = {
      setAudioProcessingState: (updater: (prev: AudioProcessingState) => AudioProcessingState) => setAudioProcessingState(updater),
      setAnalysisResults,
      setDuration,
      setShowExtractionNotification,
      setLyrics: () => {},
      setShowLyrics: () => {},
      setHasCachedLyrics: () => {},
      setActiveTab: () => {},
      setIsTranscribingLyrics: () => {},
      setLyricsError: () => {},
      processingContext: {
        stage: '',
        progress: 0,
        setStage,
        setProgress,
        setStatusMessage,
        startProcessing,
        completeProcessing,
        failProcessing,
      },
      analyzeAudioFromService,
      audioRef,
      extractionLockRef,
      beatDetectorRef,
      chordDetectorRef,
      videoId,
      titleFromSearch,
      durationFromSearch,
      channelFromSearch,
      thumbnailFromSearch,
      audioProcessingState: {
        ...audioProcessingState,
        audioUrl: audioProcessingState.audioUrl ?? null,
      },
      beatDetector,
      chordDetector,
      progress: 0,
      lyrics,
      requestId: `analysis-${videoId}`,
      isRequestStillCurrent: () => true,
      loadTranscriptionSnapshot,
      setTranscriptionSnapshot,
    };

    return handleAudioAnalysisService(
      deps as unknown as Parameters<typeof handleAudioAnalysisService>[0]
    );
  }, [
    analyzeAudioFromService,
    audioProcessingState,
    audioRef,
    beatDetector,
    beatDetectorRef,
    channelFromSearch,
    chordDetector,
    chordDetectorRef,
    completeProcessing,
    durationFromSearch,
    failProcessing,
    loadTranscriptionSnapshot,
    lyrics,
    setAnalysisResults,
    setAudioProcessingState,
    setDuration,
    setProgress,
    setShowExtractionNotification,
    setStage,
    setStatusMessage,
    setTranscriptionSnapshot,
    startProcessing,
    thumbnailFromSearch,
    titleFromSearch,
    videoId,
  ]);

  const checkCacheBeforeExtraction = useCallback(async () => {
    if (!firebaseReady || initialCacheCheckDone) {
      return;
    }

    const applyCachedTranscriptionIfAvailable = async () => {
      const cachedTranscription = await loadTranscriptionSnapshot(beatDetector, chordDetector).catch((error) => {
        console.warn('Cached analysis lookup failed before extraction fallback:', error);
        return null;
      });
      if (!cachedTranscription) {
        return false;
      }

      setCacheAvailable(true);
      setCacheCheckCompleted(true);
      setCacheCheckInProgress(false);
      setStage('idle');
      setProgress(0);
      setStatusMessage('');

      if (cachedTranscription.audioDuration && cachedTranscription.audioDuration > 0) {
        setDuration(cachedTranscription.audioDuration);
      }

      if (titleFromSearch) {
        setVideoTitle(titleFromSearch);
      } else if (cachedTranscription.title) {
        setVideoTitle(cachedTranscription.title);
      }

      const cachedAudioUrl =
        typeof cachedTranscription.audioUrl === 'string' && cachedTranscription.audioUrl.trim().length > 0
          ? cachedTranscription.audioUrl
          : null;

      if (cachedAudioUrl) {
        setAudioProcessingState((prev) => ({
          ...prev,
          isExtracting: false,
          isDownloading: false,
          isExtracted: true,
          audioUrl: cachedAudioUrl,
          fromCache: true,
          error: null,
          suggestion: null,
        }));
      } else {
        setAudioProcessingState((prev) => ({
          ...prev,
          isExtracting: false,
          isDownloading: false,
          error: null,
          suggestion: null,
        }));
      }

      return true;
    };

    try {
      setInitialCacheCheckDone(true);

      const { ensureFirebaseInitialized } = await import('@/config/firebase');
      await ensureFirebaseInitialized();

      const { withFirebaseConnectionCheck } = await import('@/utils/firebaseConnectionManager');
      const cachedAudio = await withFirebaseConnectionCheck(async () => {
        const { getCachedAudioFile } = await import('@/services/firebase/firebaseStorageService');
        return getCachedAudioFile(videoId);
      }, 'cached audio check');

      if (cachedAudio) {
        setStage('idle');
        setProgress(0);
        setStatusMessage('');
        setAudioProcessingState((prev) => ({
          ...prev,
          isExtracting: false,
          isDownloading: false,
          isExtracted: true,
          audioUrl: cachedAudio.audioUrl,
          fromCache: true,
          error: null,
          suggestion: null,
        }));

        if (cachedAudio.duration && cachedAudio.duration > 0) {
          setDuration(cachedAudio.duration);
        }

        if (titleFromSearch) {
          setVideoTitle(titleFromSearch);
        } else if (cachedAudio.title && cachedAudio.title !== `YouTube Video ${videoId}`) {
          setVideoTitle(cachedAudio.title);
        }

        return;
      }

      if (await applyCachedTranscriptionIfAvailable()) {
        return;
      }

      const extractionResult = await extractAudioFromYouTube(false);
      if (extractionResult?.title) {
        setVideoTitle(extractionResult.title);
      }
    } catch (error) {
      console.error('Error checking cached audio:', error);
      if (await applyCachedTranscriptionIfAvailable()) {
        return;
      }

      const extractionResult = await extractAudioFromYouTube(false);
      if (extractionResult?.title) {
        setVideoTitle(extractionResult.title);
      }
    }
  }, [
    extractAudioFromYouTube,
    firebaseReady,
    initialCacheCheckDone,
    beatDetector,
    chordDetector,
    loadTranscriptionSnapshot,
    setAudioProcessingState,
    setDuration,
    setProgress,
    setStage,
    setStatusMessage,
    setVideoTitle,
    titleFromSearch,
    videoId,
  ]);

  useEffect(() => {
    const checkAnalysisCache = async () => {
      if (
        audioProcessingState.isAnalyzed ||
        audioProcessingState.isAnalyzing ||
        !modelsInitialized ||
        cacheCheckCompleted ||
        cacheCheckInProgress
      ) {
        return;
      }

      try {
        setCacheCheckInProgress(true);
        const { withFirebaseConnectionCheck } = await import('@/utils/firebaseConnectionManager');
        const cachedData = await withFirebaseConnectionCheck(
          () => loadTranscriptionSnapshot(beatDetector, chordDetector),
          'analysis cache check'
        );

        setCacheAvailable(!!cachedData);
        setCacheCheckCompleted(true);
      } catch (error) {
        console.error('Error checking cached analysis:', error);
        setCacheAvailable(false);
        setCacheCheckCompleted(true);
      } finally {
        setCacheCheckInProgress(false);
      }
    };

    void checkAnalysisCache();
  }, [
    audioProcessingState.isAnalyzed,
    audioProcessingState.isAnalyzing,
    beatDetector,
    cacheCheckCompleted,
    cacheCheckInProgress,
    chordDetector,
    loadTranscriptionSnapshot,
    modelsInitialized,
  ]);

  useEffect(() => {
    if (!cacheCheckCompleted) {
      return;
    }

    if (stage === 'downloading' || stage === 'extracting') {
      setStage('idle');
      setProgress(0);
      setStatusMessage('');
    }
  }, [cacheCheckCompleted, setProgress, setStage, setStatusMessage, stage]);

  useEffect(() => {
    const loadCachedEnharmonicData = async () => {
      const hasSequenceCorrections = (sequenceCorrections?.correctedSequence?.length ?? 0) > 0;
      const hasRomanNumeralData = (sequenceCorrections?.romanNumerals?.analysis?.length ?? 0) > 0;

      if (
        !analysisResults?.chords?.length ||
        (chordCorrections && keySignature && hasSequenceCorrections && (!showRomanNumerals || hasRomanNumeralData))
      ) {
        return;
      }

      try {
        const cachedTranscription = await loadTranscriptionSnapshot(beatDetector, chordDetector);
        if (!cachedTranscription) {
          return;
        }

        const nextSequenceCorrections = withRomanNumerals(
          cachedTranscription.sequenceCorrections ?? null,
          cachedTranscription.romanNumerals ?? null,
        );

        if (cachedTranscription.chordCorrections) {
          syncChordCorrections(cachedTranscription.chordCorrections);
        }

        if (nextSequenceCorrections?.correctedSequence?.length) {
          syncSequenceCorrections(nextSequenceCorrections);
        }

        if (cachedTranscription.keySignature) {
          syncKeySignature(cachedTranscription.keySignature);
        }

        if (cachedTranscription.romanNumerals) {
          syncRomanNumeralData(cachedTranscription.romanNumerals);
        }
      } catch (error) {
        console.error('Failed to load cached enharmonic correction data:', error);
      }
    };

    void loadCachedEnharmonicData();
  }, [analysisResults?.chords, beatDetector, chordCorrections, chordDetector, keySignature, loadTranscriptionSnapshot, sequenceCorrections, showRomanNumerals, syncChordCorrections, syncKeySignature, syncRomanNumeralData, syncSequenceCorrections]);

  useEffect(() => {
    const needsInitialDetection = !!analysisResults?.chords?.length && !isDetectingKey && !keyDetectionAttempted;
    const needsRomanNumerals =
      showRomanNumerals &&
      !!analysisResults?.chords?.length &&
      !romanNumeralsRequested &&
      (sequenceCorrections?.romanNumerals?.analysis?.length ?? 0) === 0;

    if (!needsInitialDetection && !needsRomanNumerals) {
      return;
    }

    const runKeyDetection = async () => {
      setIsDetectingKey(true);
      if (needsInitialDetection) {
        setKeyDetectionAttempted(true);
      }
      if (needsRomanNumerals) {
        setRomanNumeralsRequested(true);
      }

      const rawChordData = analysisResults!.chords.map((chord) => ({
        chord: chord.chord,
        time: chord.time,
      }));

      const chordData = rawChordData.filter((chord, index) => (
        index === 0 || chord.chord !== rawChordData[index - 1].chord
      ));

      try {
        const cachedTranscription = await loadTranscriptionSnapshot(beatDetector, chordDetector);
        const cachedRomanNumerals = cachedTranscription?.romanNumerals ?? null;
        const cachedSequenceCorrections = cachedTranscription?.sequenceCorrections ?? null;
        const nextCachedSequenceCorrections = withRomanNumerals(cachedSequenceCorrections, cachedRomanNumerals);
        const hasCachedKeySignature = !!cachedTranscription?.keySignature;
        const hasCachedRomanNumerals = (cachedRomanNumerals?.analysis?.length ?? 0) > 0;
        const hasCachedSequenceCorrections = (cachedSequenceCorrections?.correctedSequence?.length ?? 0) > 0;
        const hasCachedChordCorrections = Object.keys(cachedTranscription?.chordCorrections ?? {}).length > 0;
        const needsInitialDetectionAfterCache = needsInitialDetection && !(
          hasCachedKeySignature &&
          (hasCachedSequenceCorrections || hasCachedChordCorrections)
        );
        const needsRomanNumeralsAfterCache = needsRomanNumerals && !hasCachedRomanNumerals;

        if (cachedTranscription?.chordCorrections) {
          syncChordCorrections(cachedTranscription.chordCorrections);
        }

        if (nextCachedSequenceCorrections && hasCachedSequenceCorrections) {
          syncSequenceCorrections(nextCachedSequenceCorrections);
        }

        if (hasCachedKeySignature) {
          syncKeySignature(cachedTranscription?.keySignature ?? null);
        }

        if (hasCachedRomanNumerals) {
          syncRomanNumeralData(cachedRomanNumerals);
        }

        const heuristicKeySignature = !hasCachedKeySignature
          ? estimateKeySignatureFromChords(chordData.map((entry) => entry.chord)).keySignature
          : null;

        const canReuseCachedDetection =
          (!!cachedTranscription) &&
          !needsInitialDetectionAfterCache &&
          !needsRomanNumeralsAfterCache;

        if (canReuseCachedDetection) {
          return;
        }

        if (needsInitialDetectionAfterCache && heuristicKeySignature) {
          syncKeySignature(heuristicKeySignature);
        }

        const includeRomanNumeralsInDetection = showRomanNumerals && needsRomanNumeralsAfterCache;
        // Always re-run Gemini against the original chord timeline so a later
        // Roman numeral enrichment pass can improve enharmonic corrections
        // instead of being locked to the first corrected sequence.
        const romanNumeralChordData = chordData;

        const { detectKey } = await import('@/services/audio/keyDetectionService');
        const result = await detectKey(romanNumeralChordData, true, false, includeRomanNumeralsInDetection);

        syncKeySignature(
          result.primaryKey && result.primaryKey !== 'Unknown'
            ? result.primaryKey
            : heuristicKeySignature
        );

        const nextResultSequenceCorrections = withRomanNumerals(result.sequenceCorrections ?? null, result.romanNumerals || null);
        const incomingChordCorrections = result.corrections || null;
        const incomingHasSequenceCorrections = (nextResultSequenceCorrections?.correctedSequence?.length ?? 0) > 0;
        const incomingHasChordCorrections = Object.keys(incomingChordCorrections ?? {}).length > 0;
        const effectiveSequenceCorrections = incomingHasSequenceCorrections
          ? nextResultSequenceCorrections
          : (nextCachedSequenceCorrections ?? sequenceCorrections);
        const effectiveChordCorrections = incomingHasChordCorrections
          ? incomingChordCorrections
          : (cachedTranscription?.chordCorrections ?? chordCorrections ?? null);

        if (effectiveSequenceCorrections?.correctedSequence) {
          syncSequenceCorrections(effectiveSequenceCorrections);
          if (effectiveChordCorrections && Object.keys(effectiveChordCorrections).length > 0) {
            syncChordCorrections(effectiveChordCorrections);
          }
        } else if (effectiveChordCorrections && Object.keys(effectiveChordCorrections).length > 0) {
          syncChordCorrections(effectiveChordCorrections);
        }

        syncRomanNumeralData(result.romanNumerals || null);

        if (result.primaryKey && result.primaryKey !== 'Unknown' && !result.fromHeuristicFallback) {
          const cachedTranscription = await loadTranscriptionSnapshot(beatDetector, chordDetector);
          if (cachedTranscription) {
            const updateSucceeded = await updateTranscriptionEnrichment(
              videoId,
              beatDetector,
              chordDetector,
              {
                keySignature: result.primaryKey,
                keyModulation: result.modulation,
                chordCorrections: effectiveChordCorrections,
                sequenceCorrections: effectiveSequenceCorrections,
                correctedChords: effectiveSequenceCorrections?.correctedSequence ?? null,
                originalChords: effectiveSequenceCorrections?.originalSequence ?? null,
                romanNumerals: result.romanNumerals || null,
              }
            );

            if (updateSucceeded) {
              setTranscriptionSnapshot({
                ...cachedTranscription,
                keySignature: result.primaryKey,
                keyModulation: result.modulation,
                chordCorrections: effectiveChordCorrections,
                sequenceCorrections: effectiveSequenceCorrections,
                correctedChords: effectiveSequenceCorrections?.correctedSequence ?? null,
                originalChords: effectiveSequenceCorrections?.originalSequence ?? null,
                romanNumerals: result.romanNumerals || null,
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to detect key:', error);
      } finally {
        setIsDetectingKey(false);
      }
    };

    void runKeyDetection();
  }, [
    analysisResults,
    beatDetector,
    chordCorrections,
    chordDetector,
    isDetectingKey,
    keyDetectionAttempted,
    loadTranscriptionSnapshot,
    romanNumeralsRequested,
    sequenceCorrections,
    sequenceCorrections?.romanNumerals?.analysis?.length,
    setTranscriptionSnapshot,
    showRomanNumerals,
    syncChordCorrections,
    syncKeySignature,
    syncRomanNumeralData,
    syncSequenceCorrections,
    videoId,
  ]);

  useEffect(() => {
    if (!videoId || !firebaseReady || audioProcessingState.isExtracting || extractionLockRef.current || initialCacheCheckDone) {
      return;
    }

    setStage('idle');
    setProgress(0);
    setStatusMessage('');
    setKeyDetectionAttempted(false);
    setRomanNumeralsRequested(false);
    setKeySignature(null);
    setChordCorrections(null);
    setShowCorrectedChords(false);
    setHasAutoEnabledCorrections(false);
    setSequenceCorrections(null);
    romanNumeralDataRef.current = null;
    updateRomanNumeralData(null);

    void checkCacheBeforeExtraction();
  }, [
    audioProcessingState.isExtracting,
    checkCacheBeforeExtraction,
    firebaseReady,
    initialCacheCheckDone,
    setProgress,
    setStage,
    setStatusMessage,
    updateRomanNumeralData,
    videoId,
  ]);

  useEffect(() => {
    const autoLoadCachedLyrics = async () => {
      if ((lyrics?.lines?.length ?? 0) > 0 || !audioProcessingState.audioUrl) {
        return;
      }

      try {
        const response = await fetch('/api/transcribe-lyrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId,
            audioPath: audioProcessingState.audioUrl,
            forceRefresh: false,
            checkCacheOnly: true,
          }),
        });

        const data = await response.json();
        if (response.ok && data.success && data.lyrics?.lines?.length) {
          setLyrics(data.lyrics);
          setShowLyrics(true);
          setHasCachedLyrics(false);
          return;
        }

        setHasCachedLyrics(false);
      } catch (error) {
        console.log('Cache check failed:', error);
        setHasCachedLyrics(false);
      }
    };

    if (audioProcessingState.isExtracted && audioProcessingState.audioUrl) {
      void autoLoadCachedLyrics();
    }
  }, [
    audioProcessingState.audioUrl,
    audioProcessingState.isExtracted,
    lyrics?.lines?.length,
    setHasCachedLyrics,
    setLyrics,
    setShowLyrics,
    videoId,
  ]);

  return {
    cacheAvailable,
    cacheCheckCompleted,
    cacheCheckInProgress,
    activeTranscriptionDocId,
    hasPersistedActiveTranscription,
    activeTranscriptionUsageCount,
    incrementActiveTranscriptionUsageCount,
    keySignature,
    isDetectingKey,
    chordCorrections,
    showCorrectedChords,
    setShowCorrectedChords,
    sequenceCorrections,
    handleAudioAnalysis,
    extractAudioFromYouTube,
  };
}
