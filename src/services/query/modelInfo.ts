import type { ModelInfoResult } from '@/services/audio/beatDetectionService';

export interface ModelInfoEntry {
  name?: string;
  description?: string;
  channels?: number;
  performance?: string;
  uses_spleeter?: boolean;
  available_chord_dicts?: string[];
  available?: boolean;
}

export interface ModelInfoPayload {
  success?: boolean;
  beat_model?: string;
  chord_model?: string;
  beat_transformer_available?: boolean;
  madmom_available?: boolean;
  beat_model_info?: Record<string, ModelInfoEntry>;
  chord_model_info?: Record<string, ModelInfoEntry>;
  error?: string;
}

export async function fetchModelInfoPayload(): Promise<ModelInfoPayload> {
  const response = await fetch('/api/model-info', {
    method: 'GET',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Model info request failed: ${response.status}`);
  }

  return payload as ModelInfoPayload;
}

export function buildBeatModelInfoResult(data: ModelInfoPayload): ModelInfoResult {
  return {
    success: true,
    default_model: data.beat_model || 'beat-transformer',
    available_models: [data.beat_model, data.chord_model].filter(Boolean) as string[],
    beat_transformer_available: data.beat_transformer_available || data.beat_model === 'Beat-Transformer',
    madmom_available: data.madmom_available || true,
    model_info: {
      'beat-transformer': {
        name: data.beat_model_info?.['beat-transformer']?.name || 'Beat-Transformer',
        description: data.beat_model_info?.['beat-transformer']?.description ||
          'DL model with 5-channel audio separation, flexible in time signatures, slow processing speed',
        performance: data.beat_model_info?.['beat-transformer']?.performance || 'High accuracy, slower processing',
        uses_spleeter: data.beat_model_info?.['beat-transformer']?.uses_spleeter ?? true,
      },
      madmom: {
        name: data.beat_model_info?.madmom?.name || 'Madmom',
        description: data.beat_model_info?.madmom?.description ||
          'Neural network with high accuracy and speed, best for common time signature',
        performance: data.beat_model_info?.madmom?.performance || 'Medium accuracy, medium speed',
        uses_spleeter: data.beat_model_info?.madmom?.uses_spleeter ?? false,
      },
      'chord-cnn-lstm': {
        name: data.chord_model_info?.['chord-cnn-lstm']?.name || 'Chord-CNN-LSTM',
        description: data.chord_model_info?.['chord-cnn-lstm']?.description ||
          'Chord recognition using CNN-LSTM architecture',
        performance: data.chord_model_info?.['chord-cnn-lstm']?.performance || 'High accuracy chord detection',
      },
    },
  };
}

export const fallbackBeatModelInfo: ModelInfoResult = {
  success: false,
  default_model: 'madmom',
  available_models: ['madmom'],
  beat_transformer_available: false,
  madmom_available: true,
  error: 'Backend service unavailable',
};
