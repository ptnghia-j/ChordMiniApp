// Chord Grid Calculation Service
// Public facade for production chord-grid shifting and assembly helpers.

export { calculateOptimalShift, calculatePaddingAndShift } from './gridShifting';
export { getChordGridData } from './gridAssembly';
export {
  evaluateAlignmentQuality,
  runSegmentAlignmentSolver,
  type AlignmentQualityMetrics,
  type AlignmentSolverResult,
} from './alignmentSolver';
