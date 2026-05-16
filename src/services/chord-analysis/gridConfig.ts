export const GRID_ALIGNMENT_CONFIG = {
  enableLocalCompaction: true,
  localCompactionBeatModel: 'madmom',
  silentChordValues: ['', 'N', 'N/C', 'N.C.', 'NC'],
  shortIntroAlignment: {
    maxChordChangePenalty: 2,
    minCompetitiveRatio: 0.65,
  },
  longIntroAlignment: {
    maxChordChangePenalty: 16,
    minCompetitiveRatio: 0.75,
    earlyStartWindow: 12,
    minEarlyDownbeatAdvantage: 2,
  },
  // Legacy visual-compaction settings. These are used by gridCompaction.ts,
  // which is retained for old-vs-new comparison tests, not production assembly.
  beat4BiasCorrection: {
    enabled: true,
    minStarts: 12,
    maxDownbeatShare: 0.25,
    minBeat4Share: 0.5,
    minCompetitiveRatio: 0.6,
  },
  leadingBeat2BiasCorrection: {
    enabled: true,
    minStarts: 12,
    maxDownbeatShare: 0.25,
    minBeat2Share: 0.5,
    minCompetitiveRatio: 0.6,
  },
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
    changeThresholdRatio: 1.15,
    maxShrinkBeats: 3,
    maxTransitionBeats: 4,
  },
  segmentAlignmentSolver: {
    editPenalty: 5,
    leadingExpansionPenalty: 3,
    downbeatReward: 16,
    nearDownbeatPenalty: 7,
    weakBeatPenalty: 3,
    firstStartBonus: 10,
    longRunStartBonus: 5,
    maxLeadingExpansionBeats: 3,
  },
  // Legacy leading-expansion scoring used only by gridCompaction.ts.
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
    minNaturalSilenceMeasuresForSuppression: 2,
    protectEarlyMusicMeasures: 2,
  },
} as const;
