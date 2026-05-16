// Chord Grid Calculation Service
// Public facade for chord-grid shifting, compaction, and assembly helpers.

export { calculateOptimalShift, calculatePaddingAndShift } from './gridShifting';
export { getChordGridData } from './gridAssembly';
export {
  compareAlignmentStrategies,
  evaluateAlignmentQuality,
  runSegmentAlignmentSolver,
  type AlignmentStrategyComparison,
  type AlignmentQualityMetrics,
  type AlignmentSolverResult,
} from './alignmentSolver';
