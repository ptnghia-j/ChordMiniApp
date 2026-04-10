import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { AudioProcessingState } from '@/services/audio/audioProcessingService';
import { safeSessionStorage } from '@/utils/clientOnlyFirebase';

const ANALYZE_HANDOFF_STORAGE_KEY = 'chordmini_analyze_handoff';
const ANALYZE_HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;

export interface AnalyzeSessionHandoffPayload {
  videoId: string;
  beatDetector: string;
  chordDetector: string;
  videoTitle: string;
  duration: number;
  audioProcessingState: AudioProcessingState;
  analysisResults: AnalysisResult;
  createdAt: number;
}

export function consumeAnalyzeSessionHandoff(
  videoId: string,
  beatDetector: string | null | undefined,
  chordDetector: string | null | undefined
): AnalyzeSessionHandoffPayload | null {
  const storage = safeSessionStorage();
  const raw = storage.getItem(ANALYZE_HANDOFF_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as AnalyzeSessionHandoffPayload;
    storage.removeItem(ANALYZE_HANDOFF_STORAGE_KEY);

    const isFresh = Date.now() - payload.createdAt < ANALYZE_HANDOFF_MAX_AGE_MS;
    const matchesRoute = payload.videoId === videoId
      && (!beatDetector || payload.beatDetector === beatDetector)
      && (!chordDetector || payload.chordDetector === chordDetector);

    if (!isFresh || !matchesRoute) {
      return null;
    }

    return payload;
  } catch {
    storage.removeItem(ANALYZE_HANDOFF_STORAGE_KEY);
    return null;
  }
}