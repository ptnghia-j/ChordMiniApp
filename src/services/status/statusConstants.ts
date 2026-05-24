import type { StatusServiceId } from '@/services/status/statusTypes';

export const STATUS_SERVICE_LABELS: Record<StatusServiceId, string> = {
  beat: 'Beat Detection',
  chord: 'Chord Recognition',
  sheetsage: 'Sheet Sage',
  gemini: 'Gemini API',
};

export const STATUS_SERVICE_IDS = ['beat', 'chord', 'sheetsage', 'gemini'] as const satisfies readonly StatusServiceId[];

export const STATUS_DEPENDENCY_GROUPS = [
  ['beat', 'chord'],
  ['sheetsage'],
  ['gemini'],
] as const satisfies readonly (readonly StatusServiceId[])[];
