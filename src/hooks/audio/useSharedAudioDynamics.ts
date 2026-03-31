'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  DynamicsAnalyzer,
  type DynamicsParams,
} from '@/services/audio/dynamicsAnalyzer';
import { getAudioDynamicsAnalysisService } from '@/services/audio/audioDynamicsAnalysisService';

type Listener = () => void;

interface DynamicsAnalyzerStore {
  analyzer: DynamicsAnalyzer;
  getSnapshot: () => number;
  notify: () => void;
  subscribe: (listener: Listener) => () => void;
}

function createDynamicsAnalyzerStore(): DynamicsAnalyzerStore {
  const analyzer = new DynamicsAnalyzer();
  const listeners = new Set<Listener>();
  let revision = 0;

  return {
    analyzer,
    getSnapshot: () => revision,
    notify: () => {
      revision += 1;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useSharedAudioDynamics(
  audioUrl: string | null | undefined,
  params: DynamicsParams,
) {
  const store = useMemo(() => createDynamicsAnalyzerStore(), []);
  const { analyzer } = store;

  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    analyzer.setParams(params);
  }, [analyzer, params]);

  useEffect(() => {
    let isActive = true;
    const analysisService = getAudioDynamicsAnalysisService();

    if (!audioUrl) {
      analyzer.setSignalAnalysis(null);
      store.notify();
      return undefined;
    }

    const cached = analysisService.getCachedResult(audioUrl);
    if (cached) {
      analyzer.setSignalAnalysis(cached);
      store.notify();
      return undefined;
    }

    analyzer.setSignalAnalysis(null);
    store.notify();

    void analysisService
      .analyzeAudioUrl(audioUrl)
      .then((result) => {
        if (!isActive) return;
        analyzer.setSignalAnalysis(result);
        store.notify();
      })
      .catch((error) => {
        if (!isActive) return;
        console.warn('⚠️ Could not load shared audio dynamics analysis:', error);
        analyzer.setSignalAnalysis(null);
        store.notify();
      });

    return () => {
      isActive = false;
    };
  }, [analyzer, audioUrl, store]);

  return analyzer;
}
