import { wrap, Remote } from 'comlink';
import type { WorkerAPI } from './chordAnalysis.worker';

let workerInstance: Worker | null = null;
let workerProxy: Remote<WorkerAPI> | null = null;

function createWorker(): Remote<WorkerAPI> | null {
  try {
    if (typeof window === 'undefined') return null; // SSR safety
    const worker = new Worker(new URL('./chordAnalysis.worker.ts', import.meta.url), { type: 'module' });
    workerInstance = worker;
    workerProxy = wrap<WorkerAPI>(worker);
    return workerProxy;
  } catch (err) {
    console.warn('[ChordAnalysisWorker] Failed to create worker. Falling back to main thread.', err);
    workerInstance = null;
    workerProxy = null;
    return null;
  }
}

export function getChordAnalysisWorker(): Remote<WorkerAPI> | null {
  if (workerProxy) return workerProxy;
  return createWorker();
}

export function disposeChordAnalysisWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
  }
  workerInstance = null;
  workerProxy = null;
}

// Optional helper to defer non-critical work to idle time
export function runWhenIdle<T>(fn: () => Promise<T> | T): Promise<T> {
  if (typeof window === 'undefined') return Promise.resolve().then(fn);
  return new Promise<T>((resolve) => {
    const cb = async () => resolve(await fn());
    // requestIdleCallback fallback
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) {
      ric(() => void cb());
    } else {
      setTimeout(() => void cb(), 0);
    }
  });
}

