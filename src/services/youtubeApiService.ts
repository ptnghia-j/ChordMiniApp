/**
 * YouTube Data API v3 Service
 * Provides client-side YouTube search and metadata functionality
 *
 * This service bypasses server-side YouTube restrictions by using
 * the official YouTube Data API v3 directly from the browser.
 */

export interface YouTubeSearchResult {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  duration?: string;
  viewCount?: number;
}

export interface YouTubeVideoDetails {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  channelTitle: string;
  publishedAt: string;
  tags?: string[];
}

// YouTube API response interfaces
interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

interface YouTubeApiVideoItem {
  id: string | { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: YouTubeThumbnails;
    tags?: string[];
  };
  contentDetails?: {
    duration: string;
  };
  statistics?: {
    viewCount: string;
    likeCount?: string;
  };
}

interface YouTubeApiSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: YouTubeThumbnails;
  };
}

export class YouTubeApiService {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for YouTube videos
   */
  async searchVideos(
    query: string, 
    maxResults = 10,
    options: {
      order?: 'relevance' | 'date' | 'rating' | 'viewCount' | 'title';
      videoDuration?: 'any' | 'short' | 'medium' | 'long';
      videoCategoryId?: string;
    } = {}
  ): Promise<YouTubeSearchResult[]> {
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: maxResults.toString(),
        type: 'video',
        q: query,
        key: this.apiKey,
        order: options.order || 'relevance',
        videoCategoryId: options.videoCategoryId || '10', // Music category
      });

      if (options.videoDuration) {
        params.append('videoDuration', options.videoDuration);
      }

      const response = await fetch(`${this.baseUrl}/search?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`YouTube API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid YouTube API response structure');
      }

      return this.formatSearchResults(data.items);
    } catch (error) {
      console.error('YouTube search failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific video
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetails> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: videoId,
        key: this.apiKey,
      });

      const response = await fetch(`${this.baseUrl}/videos?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`YouTube API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('Video not found or unavailable');
      }

      return this.formatVideoDetails(data.items[0]);
    } catch (error) {
      console.error('Failed to get video details:', error);
      throw error;
    }
  }

  /**
   * Get multiple video details at once
   */
  async getMultipleVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetails[]> {
    if (videoIds.length === 0) return [];
    
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: videoIds.join(','),
        key: this.apiKey,
      });

      const response = await fetch(`${this.baseUrl}/videos?${params}`);
      const data = await response.json();
      
      return data.items?.map((item: YouTubeApiVideoItem) => this.formatVideoDetails(item)) || [];
    } catch (error) {
      console.error('Failed to get multiple video details:', error);
      return [];
    }
  }

  /**
   * Search with enhanced results including video details
   */
  async searchWithDetails(
    query: string, 
    maxResults = 10,
    options: Parameters<typeof this.searchVideos>[2] = {}
  ): Promise<YouTubeSearchResult[]> {
    try {
      // First, get search results
      const searchResults = await this.searchVideos(query, maxResults, options);
      
      // Then, get detailed information for each video
      const videoIds = searchResults.map(result => result.id);
      const videoDetails = await this.getMultipleVideoDetails(videoIds);
      
      // Merge search results with detailed information
      return searchResults.map(result => {
        const details = videoDetails.find(detail => detail.id === result.id);
        return {
          ...result,
          duration: details ? this.formatDurationString(details.duration) : undefined,
          viewCount: details?.viewCount,
        };
      });
    } catch (error) {
      console.error('Enhanced search failed:', error);
      // Fallback to basic search if detailed search fails
      return this.searchVideos(query, maxResults, options);
    }
  }

  /**
   * Format search results from YouTube API response
   */
  private formatSearchResults(items: YouTubeApiSearchItem[]): YouTubeSearchResult[] {
    return items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title || 'Unknown Title',
      description: item.snippet.description || '',
      thumbnail: this.getBestThumbnail(item.snippet.thumbnails),
      channelTitle: item.snippet.channelTitle || 'Unknown Channel',
      publishedAt: item.snippet.publishedAt || '',
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
  }

  /**
   * Format video details from YouTube API response
   */
  private formatVideoDetails(item: YouTubeApiVideoItem): YouTubeVideoDetails {
    return {
      id: typeof item.id === 'string' ? item.id : item.id.videoId,
      title: item.snippet.title || 'Unknown Title',
      description: item.snippet.description || '',
      thumbnail: this.getBestThumbnail(item.snippet.thumbnails),
      duration: this.parseDuration(item.contentDetails?.duration || 'PT0S'),
      viewCount: parseInt(item.statistics?.viewCount || '0'),
      likeCount: parseInt(item.statistics?.likeCount || '0'),
      channelTitle: item.snippet.channelTitle || 'Unknown Channel',
      publishedAt: item.snippet.publishedAt || '',
      tags: item.snippet.tags || [],
    };
  }

  /**
   * Get the best available thumbnail URL
   */
  private getBestThumbnail(thumbnails: YouTubeThumbnails): string {
    if (thumbnails.maxres?.url) return thumbnails.maxres.url;
    if (thumbnails.high?.url) return thumbnails.high.url;
    if (thumbnails.medium?.url) return thumbnails.medium.url;
    if (thumbnails.default?.url) return thumbnails.default.url;
    return `https://img.youtube.com/vi/default/mqdefault.jpg`;
  }

  /**
   * Parse ISO 8601 duration (PT4M13S) to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration in seconds to readable string
   */
  private formatDurationString(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Validate API key
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/search?part=snippet&maxResults=1&q=test&key=${this.apiKey}`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Utility functions for YouTube API
 */
export const youtubeUtils = {
  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  },

  /**
   * Format view count for display
   */
  formatViewCount(count: number): string {
    if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  },

  /**
   * Format duration for display
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Check if a string is a valid YouTube URL
   */
  isYouTubeUrl(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }
};
