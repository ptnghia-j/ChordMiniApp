import { useEffect } from 'react';

/**
 * Custom hook to set YouTube URLs immediately for fast frame loading
 * Extracted from the main page component to isolate YouTube setup logic
 */
export const useYouTubeSetup = (
  videoId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAudioProcessingState: React.Dispatch<React.SetStateAction<any>>
) => {
  useEffect(() => {
    if (videoId) {
      // Set YouTube URLs immediately without waiting for API calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAudioProcessingState((prev: any) => ({
        ...prev,
        youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`
      }));

    }
  }, [videoId, setAudioProcessingState]);
};
