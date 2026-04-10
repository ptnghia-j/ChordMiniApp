export const MAX_ANALYSIS_DURATION_MINUTES = 12;
export const MAX_ANALYSIS_DURATION_SECONDS = MAX_ANALYSIS_DURATION_MINUTES * 60;

export function parseAnalysisDurationSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isAnalysisDurationExceeded(durationSeconds: number | null | undefined): boolean {
  return typeof durationSeconds === 'number'
    && Number.isFinite(durationSeconds)
    && durationSeconds > MAX_ANALYSIS_DURATION_SECONDS;
}

export function getAnalysisDurationLimitReason(durationSeconds: number | null | undefined): string | null {
  if (!isAnalysisDurationExceeded(durationSeconds)) {
    return null;
  }

  return `Analysis is limited to audio up to ${MAX_ANALYSIS_DURATION_MINUTES} minutes.`;
}
