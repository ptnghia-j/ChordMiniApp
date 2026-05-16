export const queryKeys = {
  modelInfo: ['model-info'] as const,
  recentVideos: {
    all: ['recent-videos'] as const,
    list: (selectedKey: string, pageSize: number) => (
      [...queryKeys.recentVideos.all, { selectedKey, pageSize }] as const
    ),
  },
  sheetSage: {
    backendAvailability: ['sheetsage', 'backend-availability'] as const,
    cachedMelody: (videoId: string) => ['sheetsage', 'cached-melody', videoId] as const,
  },
  lyrics: {
    cached: (videoId: string, audioUrl: string) => ['lyrics', 'cached', videoId, audioUrl] as const,
  },
  transcriptions: {
    detail: (videoId: string, beatModel: string, chordModel: string) => (
      ['transcriptions', 'detail', videoId, beatModel, chordModel] as const
    ),
  },
};
