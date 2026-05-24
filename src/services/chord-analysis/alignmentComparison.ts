import {
  evaluateAlignmentQuality,
  runSegmentAlignmentSolver,
  type AlignmentQualityMetrics,
  type AlignmentSolverResult,
} from './alignmentSolver';
import { runVisualCompactionPipeline } from './gridCompaction';
import type { ChordGridData } from './gridTypes';

export type AlignmentStrategyComparison = {
  current: {
    gridData: ChordGridData;
    metrics: AlignmentQualityMetrics;
  };
  solver: AlignmentSolverResult;
};

export type AlignmentStrategyComparisonParams = {
  chordGridData: ChordGridData;
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>;
  beatTimes: number[];
  timeSignature: number;
  beatDuration: number;
  enabled: boolean;
  suppressLeadingSilenceExpansion?: boolean;
  disableLeadingSilenceWindow?: boolean;
};

export function compareAlignmentStrategies(params: AlignmentStrategyComparisonParams): AlignmentStrategyComparison {
  const currentGridData = runVisualCompactionPipeline(params);
  const solver = runSegmentAlignmentSolver(params);

  return {
    current: {
      gridData: currentGridData,
      metrics: evaluateAlignmentQuality(currentGridData, params.timeSignature),
    },
    solver,
  };
}
