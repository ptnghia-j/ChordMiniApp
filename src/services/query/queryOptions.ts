export const queryStaleTimes = {
  modelInfo: 5 * 60 * 1000,
  recentVideos: 15 * 60 * 1000,
  sheetSageBackend: 60 * 1000,
  cachedMelody: 30 * 1000,
  cachedLyrics: 2 * 60 * 1000,
  transcriptionDetail: 12 * 60 * 60 * 1000,
} as const;

export const queryGcTimes = {
  modelInfo: 30 * 60 * 1000,
  recentVideos: 6 * 60 * 60 * 1000,
  sheetSageBackend: 10 * 60 * 1000,
  cachedMelody: 10 * 60 * 1000,
  cachedLyrics: 10 * 60 * 1000,
  transcriptionDetail: 12 * 60 * 60 * 1000,
} as const;
