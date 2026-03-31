export type SignalIntensityBand = 'quiet' | 'medium' | 'loud';

export interface SignalFeatureContour {
  values: Float32Array;
  timeStep: number;
  duration: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface AudioDynamicsAnalysisResult {
  sourceSampleRate: number;
  analysisSampleRate: number;
  duration: number;
  energy: SignalFeatureContour;
  spectralFlux: SignalFeatureContour;
  onset: SignalFeatureContour;
  intensity: SignalFeatureContour;
}

export interface AudioDynamicsWorkerInput {
  monoPcm: Float32Array;
  sampleRate: number;
  sourceSampleRate?: number;
}

export interface ChordSignalDynamics {
  energy: number;
  spectralFlux: number;
  onsetStrength: number;
  intensity: number;
  normalizedIntensity: number;
  quietness: number;
  fullness: number;
  motion: number;
  attack: number;
  intensityBand: SignalIntensityBand;
}
