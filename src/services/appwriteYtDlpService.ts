/**
 * Appwrite YT-DLP Service
 *
 * A reliable YouTube audio extraction service using our self-hosted
 * yt-dlp server deployed on Appwrite Functions.
 *
 * This service replaces the unreliable yt2mp3MagicService that was
 * experiencing issues with ad monetization redirects.
 */


import { Client, Functions } from 'appwrite';

export interface AppwriteYtDlpResponse {
  success: boolean;
  data?: {
    videoId: string;
    filename: string;
    size: number;
    format: string;
    audio: string; // base64 encoded audio data
  };
  error?: string;
}

export interface AppwriteYtDlpRequest {
  url: string;
  format?: 'bestaudio' | 'best' | string;
}

export class AppwriteYtDlpService {
  private readonly functionId: string;
  private readonly projectId: string;
  private readonly client: Client;
  private readonly functions: Functions;
  private readonly timeout = 300000; // 5 minutes

  constructor(projectId?: string, functionId?: string) {
    // Use environment variables or provided values
    this.projectId = projectId || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';
    this.functionId = functionId || process.env.NEXT_PUBLIC_APPWRITE_FUNCTION_ID || '68d49cd300092b56014f';

    // Only initialize if project ID is available
    if (this.projectId) {
      // Initialize Appwrite client and functions
      this.client = new Client()
        .setEndpoint('https://sfo.cloud.appwrite.io/v1')
        .setProject(this.projectId);

      this.functions = new Functions(this.client);
    } else {
      // Initialize with null values when not configured
      this.client = null as unknown as Client;
      this.functions = null as unknown as Functions;
    }
  }

  /**
   * Extract audio from YouTube video
   * @param videoUrl YouTube video URL
   * @param format Audio format (default: 'worstaudio' for space efficiency)
   * @returns Promise<ArrayBuffer> Audio data as ArrayBuffer
   */
  async extractAudio(videoUrl: string, format: string = 'worstaudio'): Promise<ArrayBuffer> {
    if (!this.projectId || !this.functions) {
      throw new Error('Appwrite YT-DLP service is not configured. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID environment variable.');
    }

    if (!this.isValidYouTubeUrl(videoUrl)) {
      throw new Error('Invalid YouTube URL provided');
    }

    const requestData: AppwriteYtDlpRequest = {
      url: videoUrl,
      format
    };

    try {
      console.log(`[AppwriteYtDlpService] Extracting audio from: ${videoUrl}`);
      
      // Use Appwrite SDK to execute the function
      console.log(`[AppwriteYtDlpService] Trying request with data:`, requestData);

      // Execute the function using Appwrite SDK (new object-based API)
      const execution = await this.functions.createExecution({
        functionId: this.functionId,
        body: JSON.stringify(requestData)
      });

      // Check if execution was successful
      if (execution.responseStatusCode !== 200) {
        throw new Error(`Function execution failed with status ${execution.responseStatusCode}: ${execution.errors}`);
      }

      // Parse the response body
      const result: AppwriteYtDlpResponse = JSON.parse(execution.responseBody);

      if (!result.success) {
        throw new Error(result.error || 'Audio extraction failed');
      }

      if (!result.data?.audio) {
        throw new Error('No audio data received from server');
      }

      // Convert base64 to ArrayBuffer
      const audioBuffer = this.base64ToArrayBuffer(result.data.audio);
      
      console.log(`[AppwriteYtDlpService] Audio extracted successfully: ${result.data.filename} (${audioBuffer.byteLength} bytes)`);
      
      return audioBuffer;

    } catch (error) {
      console.error('[AppwriteYtDlpService] Audio extraction failed:', error);
      
      if (error instanceof Error) {
        // Re-throw with more context
        throw new Error(`Appwrite YT-DLP extraction failed: ${error.message}`);
      }
      
      throw new Error('Unknown error occurred during audio extraction');
    }
  }

  /**
   * Get service status and configuration
   */
  getServiceInfo() {
    return {
      serviceName: 'Appwrite YT-DLP Service',
      endpoint: 'https://sfo.cloud.appwrite.io/v1',
      functionId: this.functionId,
      projectId: this.projectId,
      timeout: this.timeout,
      isConfigured: !!this.projectId
    };
  }

  /**
   * Test the service with a sample video
   * @param testUrl Optional test URL (defaults to a short test video)
   */
  async testService(testUrl: string = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'): Promise<boolean> {
    try {
      const audioBuffer = await this.extractAudio(testUrl);
      return audioBuffer.byteLength > 0;
    } catch (error) {
      console.error('[AppwriteYtDlpService] Service test failed:', error);
      return false;
    }
  }

  /**
   * Validate YouTube URL format
   */
  private isValidYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return (
        hostname === 'www.youtube.com' ||
        hostname === 'youtube.com' ||
        hostname === 'youtu.be' ||
        hostname === 'm.youtube.com'
      );
    } catch {
      return false;
    }
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes.buffer;
    } catch {
      throw new Error('Failed to decode base64 audio data');
    }
  }
}

// Export a default instance for easy use
export const appwriteYtDlpService = new AppwriteYtDlpService();
