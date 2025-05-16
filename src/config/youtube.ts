// YouTube API Configuration

// Get the API key from environment variables
export const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || ''; // API key now loaded from env var

// YouTube API endpoints
export const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
export const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

// Default search parameters
export const DEFAULT_SEARCH_PARAMS = {
  part: 'snippet',
  maxResults: 10,
  type: 'video',
  videoCategoryId: '10', // Music category
};

// Check if a string is a YouTube URL
export const isYouTubeUrl = (str: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return youtubeRegex.test(str);
};

// Extract video ID from a YouTube URL
export const extractVideoId = (url: string): string | null => {
  // Handle youtu.be format
  if (url.includes('youtu.be')) {
    const id = url.split('/').pop();
    return id || null;
  }
  
  // Handle youtube.com format
  const urlParams = new URLSearchParams(url.split('?')[1]);
  return urlParams.get('v');
};

// Search YouTube videos with provided query
export const searchYouTubeVideos = async (query: string) => {
  try {
    if (!YOUTUBE_API_KEY) {
      throw new Error('YouTube API key is missing. Please set NEXT_PUBLIC_YOUTUBE_API_KEY in your environment variables.');
    }
    
    const params = new URLSearchParams({
      ...DEFAULT_SEARCH_PARAMS,
      q: query,
      key: YOUTUBE_API_KEY,
    } as any);
    
    const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error('Error searching YouTube videos:', error);
    throw error;
  }
}; 