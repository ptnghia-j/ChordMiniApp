/**
 * YTDown.io Audio Extraction Service
 * 
 * This service integrates with ytdown.io API to extract YouTube audio
 * in M4A format, providing a reliable alternative to ytdl-core that
 * works in production environments including Vercel.
 */

export interface YtdownIoMediaItem {
  type: 'Audio' | 'Video';
  name: string;
  mediaId: number;
  mediaUrl: string;
  mediaPreviewUrl: string;
  mediaThumbnail: string;
  mediaRes: string | false;
  mediaQuality: string;
  mediaDuration: string;
  mediaExtension: string;
  mediaFileSize: string;
  mediaTask: string;
}

export interface YtdownIoResponse {
  api: {
    service: string;
    status: string;
    message: string;
    id: string;
    title: string;
    description: string;
    previewUrl: string;
    imagePreviewUrl: string;
    permanentLink: string;
    userInfo: {
      name: string;
      username: string;
      userId: string;
      userAvatar: string;
      internalUrl: string;
      externalUrl: string;
      accountCountry: string;
      dateJoined: string;
      isVerified: boolean;
    };
    mediaStats: {
      mediaCount: string;
      viewsCount: string;
    };
    mediaItems: YtdownIoMediaItem[];
  };
}

export interface YtdownIoResult {
  success: boolean;
  executionTime: number;
  videoId?: string;
  title?: string;
  duration?: string;
  audioFormats?: Array<{
    quality: string;
    fileSize: string;
    downloadUrl: string;
    extension: string;
  }>;
  selectedAudio?: {
    quality: string;
    fileSize: string;
    downloadUrl: string;
    extension: string;
  };
  error?: string;
}

export class YtdownIoAudioService {
  private readonly baseUrl = 'https://ytdown.io/proxy.php';
  private readonly defaultHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://ytdown.io/en',
    'Origin': 'https://ytdown.io'
  };

  /**
   * Extract audio from YouTube URL using ytdown.io service
   */
  async extractAudio(youtubeUrl: string, preferredQuality: '48K' | '128K' = '128K'): Promise<YtdownIoResult> {
    const startTime = Date.now();

    try {
      console.log(`[YtdownIo] Processing: ${youtubeUrl}`);

      // Make API request to ytdown.io
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: new URLSearchParams({
          'url': youtubeUrl,
          'format': `M4A - (${preferredQuality})`
        })
      });

      if (!response.ok) {
        throw new Error(`ytdown.io API returned ${response.status}`);
      }

      const data: YtdownIoResponse = await response.json();

      if (data.api.status !== 'OK') {
        throw new Error(`ytdown.io processing failed: ${data.api.message}`);
      }

      // Extract audio formats
      const audioItems = data.api.mediaItems.filter(item => item.type === 'Audio');
      
      if (audioItems.length === 0) {
        throw new Error('No audio formats available');
      }

      // Map audio formats
      const audioFormats = audioItems.map(item => ({
        quality: item.mediaQuality,
        fileSize: item.mediaFileSize,
        downloadUrl: item.mediaUrl,
        extension: item.mediaExtension
      }));

      // Find preferred quality or fallback to first available
      const selectedAudio = audioFormats.find(format => format.quality === preferredQuality) || audioFormats[0];

      const executionTime = Date.now() - startTime;

      console.log(`[YtdownIo] Success: ${data.api.title} (${executionTime}ms)`);

      return {
        success: true,
        executionTime,
        videoId: data.api.id,
        title: data.api.title,
        duration: audioItems[0]?.mediaDuration,
        audioFormats,
        selectedAudio,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[YtdownIo] Error:', error);

      return {
        success: false,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Test if a download URL is accessible
   */
  async testDownloadUrl(downloadUrl: string): Promise<boolean> {
    try {
      const response = await fetch(downloadUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('[YtdownIo] Download URL test failed:', error);
      return false;
    }
  }

  /**
   * Download audio file from ytdown.io URL
   */
  async downloadAudio(downloadUrl: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('[YtdownIo] Download failed:', error);
      throw error;
    }
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Validate YouTube URL
   */
  isValidYouTubeUrl(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }
}
