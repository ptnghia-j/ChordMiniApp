import { expose } from 'comlink';
import { analyzeMonoPcm } from '@/services/audio/audioDynamicsCore';
import type { AudioDynamicsAnalysisResult, AudioDynamicsWorkerInput } from '@/services/audio/audioDynamicsTypes';

const api = {
  analyzeMonoPcm(input: AudioDynamicsWorkerInput): AudioDynamicsAnalysisResult {
    return analyzeMonoPcm(input);
  },
};

export type WorkerAPI = typeof api;

expose(api);
