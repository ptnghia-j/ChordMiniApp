// YouTube Player interface for type safety
// This interface defines the methods available on the YouTube player instance
// when using ReactPlayer with YouTube videos
export interface YouTubePlayer {
  seekTo: (time: number, type?: 'seconds' | 'fraction') => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  muted: boolean;
}

// YouTube search result interface
export interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  upload_date?: string;
}
