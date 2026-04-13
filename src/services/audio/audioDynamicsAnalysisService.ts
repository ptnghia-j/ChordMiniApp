import { audioContextManager } from './audioContextManager';
import type { AudioDynamicsAnalysisResult } from './audioDynamicsTypes';
import { analyzeMonoPcm } from './audioDynamicsCore';
import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';
import { analyzeMonoPcmInWorker } from '@/workers/audioDynamicsClient';

const TARGET_ANALYSIS_SAMPLE_RATE = 11025;

function resolveAnalysisFetchUrl(audioUrl: string): string {
  if (audioUrl.startsWith('blob:')) {
    return audioUrl;
  }
  return buildAudioProxyUrl(audioUrl);
}

function downmixAndDownsampleBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number = TARGET_ANALYSIS_SAMPLE_RATE,
): { monoPcm: Float32Array; sampleRate: number } {
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const sourceLength = audioBuffer.length;
  const sourceRate = audioBuffer.sampleRate;
  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));

  if (sourceLength === 0) {
    return { monoPcm: new Float32Array(0), sampleRate: sourceRate };
  }

  if (sourceRate <= targetSampleRate * 1.05) {
    const mono = new Float32Array(sourceLength);
    for (let sampleIndex = 0; sampleIndex < sourceLength; sampleIndex += 1) {
      let sum = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        sum += channels[channelIndex]?.[sampleIndex] ?? 0;
      }
      mono[sampleIndex] = sum / channelCount;
    }
    return { monoPcm: mono, sampleRate: sourceRate };
  }

  const ratio = sourceRate / targetSampleRate;
  const targetLength = Math.max(1, Math.floor(sourceLength / ratio));
  const mono = new Float32Array(targetLength);

  for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
    const sourceStart = Math.floor(targetIndex * ratio);
    const sourceEnd = Math.min(sourceLength, Math.max(sourceStart + 1, Math.floor((targetIndex + 1) * ratio)));
    let accumulated = 0;
    let sampleCount = 0;

    for (let sampleIndex = sourceStart; sampleIndex < sourceEnd; sampleIndex += 1) {
      let mixed = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        mixed += channels[channelIndex]?.[sampleIndex] ?? 0;
      }
      accumulated += mixed / channelCount;
      sampleCount += 1;
    }

    mono[targetIndex] = sampleCount > 0 ? accumulated / sampleCount : 0;
  }

  return { monoPcm: mono, sampleRate: targetSampleRate };
}

export class AudioDynamicsAnalysisService {
  private static instance: AudioDynamicsAnalysisService | null = null;

  private readonly resultCache = new Map<string, AudioDynamicsAnalysisResult>();
  private readonly promiseCache = new Map<string, Promise<AudioDynamicsAnalysisResult | null>>();

  static getInstance(): AudioDynamicsAnalysisService {
    if (!this.instance) {
      this.instance = new AudioDynamicsAnalysisService();
    }
    return this.instance;
  }

  getCachedResult(audioUrl: string | null | undefined): AudioDynamicsAnalysisResult | null {
    if (!audioUrl) return null;
    return this.resultCache.get(audioUrl) ?? null;
  }

  async analyzeAudioUrl(audioUrl: string): Promise<AudioDynamicsAnalysisResult | null> {
    if (!audioUrl) return null;

    const cached = this.resultCache.get(audioUrl);
    if (cached) {
      return cached;
    }

    const inflight = this.promiseCache.get(audioUrl);
    if (inflight) {
      return inflight;
    }

    const analysisPromise = this.performAnalysis(audioUrl)
      .then((result) => {
        if (result) {
          this.resultCache.set(audioUrl, result);
        }
        return result;
      })
      .finally(() => {
        this.promiseCache.delete(audioUrl);
      });

    this.promiseCache.set(audioUrl, analysisPromise);
    return analysisPromise;
  }

  private async performAnalysis(audioUrl: string): Promise<AudioDynamicsAnalysisResult | null> {
    try {
      const response = await fetch(resolveAnalysisFetchUrl(audioUrl));
      if (!response.ok) {
        throw new Error(`Failed to fetch audio for dynamics analysis: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const context = audioContextManager.getContext();
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      const { monoPcm, sampleRate } = downmixAndDownsampleBuffer(decoded);
      const workerResult = await analyzeMonoPcmInWorker(monoPcm, sampleRate, decoded.sampleRate);
      if (workerResult) {
        return workerResult;
      }
      return analyzeMonoPcm({ monoPcm, sampleRate, sourceSampleRate: decoded.sampleRate });
    } catch (error) {
      console.warn('⚠️ Audio dynamics analysis failed:', error);
      return null;
    }
  }
}

export function getAudioDynamicsAnalysisService(): AudioDynamicsAnalysisService {
  return AudioDynamicsAnalysisService.getInstance();
}
