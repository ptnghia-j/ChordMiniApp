import { transfer, wrap, type Remote } from 'comlink';
import type { WorkerAPI } from './audioDynamics.worker';
import type { AudioDynamicsAnalysisResult } from '@/services/audio/audioDynamicsTypes';

let workerInstance: Worker | null = null;
let workerProxy: Remote<WorkerAPI> | null = null;

function createWorker(): Remote<WorkerAPI> | null {
  try {
    if (typeof window === 'undefined') return null;
    const worker = new Worker(new URL('./audioDynamics.worker.ts', import.meta.url), { type: 'module' });
    workerInstance = worker;
    workerProxy = wrap<WorkerAPI>(worker);
    return workerProxy;
  } catch (error) {
    console.warn('[AudioDynamicsWorker] Failed to create worker. Falling back to main thread.', error);
    workerInstance = null;
    workerProxy = null;
    return null;
  }
}

export function getAudioDynamicsWorker(): Remote<WorkerAPI> | null {
  if (workerProxy) return workerProxy;
  return createWorker();
}

export async function analyzeMonoPcmInWorker(
  monoPcm: Float32Array,
  sampleRate: number,
  sourceSampleRate?: number,
): Promise<AudioDynamicsAnalysisResult | null> {
  const worker = getAudioDynamicsWorker();
  if (!worker) {
    return null;
  }

  return worker.analyzeMonoPcm({
    monoPcm: transfer(monoPcm, [monoPcm.buffer]),
    sampleRate,
    sourceSampleRate,
  });
}

export function disposeAudioDynamicsWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
  }
  workerInstance = null;
  workerProxy = null;
}
