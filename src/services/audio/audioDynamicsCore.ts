import type {
  AudioDynamicsAnalysisResult,
  AudioDynamicsWorkerInput,
  SignalFeatureContour,
} from './audioDynamicsTypes';

const ANALYSIS_HOP_SECONDS = 0.05;
const ANALYSIS_FRAME_SECONDS = 0.1;
const ONSET_DECAY_SECONDS = 0.18;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}

function computeQuantile(values: Float32Array, quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * quantile)));
  return sorted[index] ?? 0;
}

function normalizeSeries(values: Float32Array, lowerQuantile = 0.1, upperQuantile = 0.9): Float32Array {
  if (values.length === 0) return values;
  const lower = computeQuantile(values, lowerQuantile);
  const upper = computeQuantile(values, upperQuantile);
  const range = Math.max(upper - lower, Number.EPSILON);
  const normalized = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    normalized[index] = clamp01((values[index] - lower) / range);
  }
  return normalized;
}

function summarizeContour(values: Float32Array, timeStep: number, duration: number): SignalFeatureContour {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!isFinite(min) || !isFinite(max)) {
    min = 0;
    max = 1;
  }

  return {
    values,
    timeStep,
    duration,
    min,
    max,
    p25: computeQuantile(values, 0.25),
    p50: computeQuantile(values, 0.5),
    p75: computeQuantile(values, 0.75),
    p90: computeQuantile(values, 0.9),
  };
}

function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
  }
  return window;
}

function fftMagnitude(input: Float32Array): Float32Array {
  const size = input.length;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  real.set(input);

  let j = 0;
  for (let i = 0; i < size; i += 1) {
    if (i < j) {
      const realTmp = real[i];
      real[i] = real[j];
      real[j] = realTmp;
    }
    let bit = size >> 1;
    while (bit > 0 && (j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
  }

  for (let length = 2; length <= size; length <<= 1) {
    const halfLength = length >> 1;
    const theta = (-2 * Math.PI) / length;
    const sine = Math.sin(theta / 2);
    const factorMultiplier = -2 * sine * sine;
    const phaseMultiplier = Math.sin(theta);

    for (let offset = 0; offset < size; offset += length) {
      let factorReal = 1;
      let factorImag = 0;
      for (let index = 0; index < halfLength; index += 1) {
        const evenIndex = offset + index;
        const oddIndex = evenIndex + halfLength;
        const oddReal = factorReal * real[oddIndex] - factorImag * imag[oddIndex];
        const oddImag = factorReal * imag[oddIndex] + factorImag * real[oddIndex];

        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;

        const nextFactorReal = factorReal + factorReal * factorMultiplier - factorImag * phaseMultiplier;
        const nextFactorImag = factorImag + factorImag * factorMultiplier + factorReal * phaseMultiplier;
        factorReal = nextFactorReal;
        factorImag = nextFactorImag;
      }
    }
  }

  const magnitudes = new Float32Array(size >> 1);
  for (let index = 0; index < magnitudes.length; index += 1) {
    magnitudes[index] = Math.hypot(real[index], imag[index]);
  }
  return magnitudes;
}

export function analyzeMonoPcm({
  monoPcm,
  sampleRate,
  sourceSampleRate = sampleRate,
}: AudioDynamicsWorkerInput): AudioDynamicsAnalysisResult {
  if (monoPcm.length === 0 || sampleRate <= 0) {
    const empty = summarizeContour(new Float32Array(1), ANALYSIS_HOP_SECONDS, 0);
    return {
      sourceSampleRate,
      analysisSampleRate: sampleRate,
      duration: 0,
      energy: empty,
      spectralFlux: empty,
      onset: empty,
      intensity: empty,
    };
  }

  const duration = monoPcm.length / sampleRate;
  const hopSize = Math.max(1, Math.floor(sampleRate * ANALYSIS_HOP_SECONDS));
  const frameSize = nextPowerOfTwo(Math.max(hopSize * 2, Math.floor(sampleRate * ANALYSIS_FRAME_SECONDS)));
  const numFrames = Math.max(1, Math.ceil(Math.max(1, monoPcm.length - frameSize) / hopSize) + 1);
  const window = createHannWindow(frameSize);

  const energyRaw = new Float32Array(numFrames);
  const spectralFluxRaw = new Float32Array(numFrames);

  let previousMagnitudes: Float32Array | null = null;

  for (let frameIndex = 0; frameIndex < numFrames; frameIndex += 1) {
    const start = frameIndex * hopSize;
    const frame = new Float32Array(frameSize);
    const available = Math.max(0, Math.min(frameSize, monoPcm.length - start));
    let sumSquares = 0;

    for (let sampleIndex = 0; sampleIndex < available; sampleIndex += 1) {
      const sample = monoPcm[start + sampleIndex] ?? 0;
      sumSquares += sample * sample;
      frame[sampleIndex] = sample * window[sampleIndex];
    }

    energyRaw[frameIndex] = Math.sqrt(sumSquares / Math.max(1, available));

    const magnitudes = fftMagnitude(frame);
    if (previousMagnitudes) {
      let flux = 0;
      for (let binIndex = 0; binIndex < magnitudes.length; binIndex += 1) {
        const delta = magnitudes[binIndex] - previousMagnitudes[binIndex];
        if (delta > 0) flux += delta;
      }
      spectralFluxRaw[frameIndex] = flux;
    } else {
      spectralFluxRaw[frameIndex] = 0;
    }

    previousMagnitudes = magnitudes;
  }

  const normalizedEnergy = normalizeSeries(energyRaw, 0.08, 0.92);
  const normalizedFlux = normalizeSeries(spectralFluxRaw, 0.1, 0.9);

  const smoothedEnergy = new Float32Array(normalizedEnergy.length);
  const smoothedFlux = new Float32Array(normalizedFlux.length);
  const intensity = new Float32Array(normalizedEnergy.length);
  const onset = new Float32Array(normalizedEnergy.length);
  const decay = Math.exp(-ANALYSIS_HOP_SECONDS / ONSET_DECAY_SECONDS);

  for (let index = 0; index < normalizedEnergy.length; index += 1) {
    const energyValue = normalizedEnergy[index];
    const fluxValue = normalizedFlux[index];
    smoothedEnergy[index] = index === 0
      ? energyValue
      : smoothedEnergy[index - 1] * 0.82 + energyValue * 0.18;
    smoothedFlux[index] = index === 0
      ? fluxValue
      : smoothedFlux[index - 1] * 0.6 + fluxValue * 0.4;

    const previousFlux = index > 0 ? smoothedFlux[index - 1] : 0;
    const nextFlux = index + 1 < normalizedFlux.length ? normalizedFlux[index + 1] : fluxValue;
    const localPeak = fluxValue >= previousFlux && fluxValue >= nextFlux;
    const onsetImpulse = localPeak && fluxValue > 0.25 ? fluxValue : 0;
    onset[index] = Math.max(onsetImpulse, (index > 0 ? onset[index - 1] : 0) * decay);
  }

  for (let index = 0; index < intensity.length; index += 1) {
    const combined = smoothedEnergy[index] * 0.64 + smoothedFlux[index] * 0.23 + onset[index] * 0.13;
    intensity[index] = index === 0
      ? combined
      : intensity[index - 1] * 0.7 + combined * 0.3;
  }

  return {
    sourceSampleRate,
    analysisSampleRate: sampleRate,
    duration,
    energy: summarizeContour(smoothedEnergy, ANALYSIS_HOP_SECONDS, duration),
    spectralFlux: summarizeContour(smoothedFlux, ANALYSIS_HOP_SECONDS, duration),
    onset: summarizeContour(onset, ANALYSIS_HOP_SECONDS, duration),
    intensity: summarizeContour(normalizeSeries(intensity, 0.08, 0.92), ANALYSIS_HOP_SECONDS, duration),
  };
}
