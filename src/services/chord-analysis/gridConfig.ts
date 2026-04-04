export const GRID_ALIGNMENT_CONFIG = {
  enableLocalCompaction: true,
  localCompactionBeatModel: 'madmom',
  silentChordValues: ['', 'N', 'N/C', 'N.C.', 'NC'],
  padding: {
    meaningfulPreBeatSeconds: 0.05,
    minGapRatioForSinglePadding: 0.2,
    fallbackBeatDurationSeconds: 0.5,
  },
  silentRun: {
    minLengthFloor: 2,
  },
  gap: {
    thresholdBeatsMultiplier: 2.5,
    minGapSeconds: 1.1,
    onsetLeadInBeatsMultiplier: 0.35,
    releaseTailBeatsMultiplier: 0.1,
    maxReleaseTailSeconds: 0.08,
  },
  tempo: {
    minConfirmationBeats: 3,
    steadyToleranceRatio: 0.18,
    changeThresholdRatio: 1.08,
    maxShrinkBeats: 3,
  },
  leadingExpansion: {
    maxExtraBeats: 3,
    scoreImprovementThreshold: 0.5,
    maxChordStartsToScore: 8,
    primaryStartWeight: 20,
    descendingWeightStart: 12,
    minWeight: 4,
    extraBeatPenalty: 0.25,
  },
  longIntroCompaction: {
    protectEarlyMusicMeasures: 2,
  },
} as const;
