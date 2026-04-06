/**
 * yt-mp3-go Service - Updated API Integration (v1.0.29+)
 *
 * This service provides audio extraction using the yt-mp3-go service
 * which supports Unicode filenames natively and quality selection.
 *
 * Updated API Structure (v1.0.29+):
 * 1. POST /yt-downloader/info - Get video metadata first
 * 2. POST /yt-downloader/download - Submit videoID and quality for processing
 * 3. GET /yt-downloader/events?id={jobID} - Server-Sent Events for status
 * 4. GET /yt-downloader/downloads/{filename} - Download processed file
 *
 * Key Features:
 * - Quality selection: low, medium, high
 * - Native Unicode filename support
 * - Two-step process for better reliability
 * - Long-lived SSE job monitoring
 * - Better error handling
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

export interface YtMp3GoResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  videoId: string;
  title?: string;
  duration?: number;
  filename?: string;
  jobId?: string;
}

interface YtMp3GoInfoResponse {
  id: string;
  title: string;
  thumbnail?: string;
}

interface YtMp3GoJobResponse {
  jobID: string;
}

interface YtMp3GoJobStatus {
  status: 'processing' | 'complete' | 'failed';
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export class YtMp3GoService {
  private static instance: YtMp3GoService;
  // Updated to new service URL (lukavukanovic.xyz)
  private readonly YT_MP3_GO_BASE_URL = 'https://lukavukanovic.xyz';
  private readonly API_PATH = '/yt-downloader';

  // Quality options for the new API
  private readonly QUALITY_OPTIONS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  } as const;

  // Default quality setting (medium for balanced file size and quality)
  private readonly DEFAULT_QUALITY = this.QUALITY_OPTIONS.MEDIUM;

  // Optimized timing for Vercel constraints (300s max)
  private readonly MAX_MONITOR_DURATION_MS = 250000; // Keep within Vercel route maxDuration window
  private readonly JOB_TIMEOUT = 15000; // 15 seconds for job creation

  // Simple job tracking by video ID
  private readonly activeJobs = new Map<string, Promise<YtMp3GoResult>>();

  static getInstance(): YtMp3GoService {
    if (!YtMp3GoService.instance) {
      YtMp3GoService.instance = new YtMp3GoService();
    }
    return YtMp3GoService.instance;
  }

  /**
   * Extract audio using yt-mp3-go service with quality selection
   */
  async extractAudio(videoId: string, title?: string, duration?: number, quality?: string): Promise<YtMp3GoResult> {
    // Validate video ID
    if (!videoId || videoId.length !== 11) {
      return {
        success: false,
        error: `Invalid YouTube video ID: ${videoId}`,
        videoId,
        title,
        duration: duration || 0
      };
    }

    // Validate and set quality
    const selectedQuality = this.validateQuality(quality);

    // Check for existing job
    if (this.activeJobs.has(videoId)) {
      return await this.activeJobs.get(videoId)!;
    }

    // Create new job
    const jobPromise = this.performExtraction(videoId, title, duration, selectedQuality);
    this.activeJobs.set(videoId, jobPromise);

    try {
      return await jobPromise;
    } finally {
      this.activeJobs.delete(videoId);
    }
  }

  /**
   * Perform audio extraction using yt-mp3-go with new two-step API
   */
  private async performExtraction(videoId: string, title?: string, duration?: number, quality?: string): Promise<YtMp3GoResult> {

    try {
      // Step 1: Get video info
      const videoInfo = await this.getVideoInfo(videoId);

      // Step 2: Create extraction job with quality
      const jobData = await this.createJob(videoInfo.id, quality || this.DEFAULT_QUALITY, videoInfo.title);

      // Step 3: Monitor job status via long-lived SSE stream
      const result = await this.monitorJobStatus(jobData.jobID, videoId, title || videoInfo.title, duration);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `yt-mp3-go extraction failed: ${errorMessage}`,
        videoId,
        title,
        duration: duration || 0
      };
    }
  }

  /**
   * Get video information using the new /info endpoint
   */
  private async getVideoInfo(videoId: string): Promise<YtMp3GoInfoResponse> {

    try {
      // Use FormData format (as required by the service)
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const formData = new FormData();
      formData.append('url', youtubeUrl);


      const response = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/info`, {
        method: 'POST',
        headers: {
          'User-Agent': 'ChordMiniApp/1.0',
          'Referer': `${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/`
        },
        body: formData,
        signal: createSafeTimeoutSignal(this.JOB_TIMEOUT)
      });

      if (!response.ok) {
        const errorText = await response.text();


        throw new Error(`yt-mp3-go info request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const videoInfo: YtMp3GoInfoResponse = await response.json();

      if (!videoInfo.id) {
        throw new Error('yt-mp3-go info request failed: No video ID returned');
      }


      return videoInfo;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('yt-mp3-go info request timed out. Service may be busy.');
      }
      throw error;
    }
  }

  /**
   * Create a new extraction job with quality selection
   */
  private async createJob(videoId: string, quality: string, title?: string): Promise<YtMp3GoJobResponse> {

    try {
      // Generate a safe filename from the video title or use video ID as fallback
      const safeFilename = this.generateSafeFilename(videoId, title);

      const requestBody = {
        videoID: videoId,
        quality: quality,
        filename: safeFilename
      };


      const response = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChordMiniApp/1.0',
          'Referer': `${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/`
        },
        body: JSON.stringify(requestBody),
        signal: createSafeTimeoutSignal(this.JOB_TIMEOUT)
      });

      if (!response.ok) {
        const errorText = await response.text();


        throw new Error(`yt-mp3-go job creation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const jobData: YtMp3GoJobResponse = await response.json();

      if (!jobData.jobID) {
        throw new Error('yt-mp3-go job creation failed: No job ID returned');
      }


      return jobData;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('yt-mp3-go job creation timed out. Service may be busy.');
      }
      throw error;
    }
  }

  /**
   * Monitor job status with long-lived SSE stream.
   */
  private async monitorJobStatus(jobId: string, videoId: string, title?: string, duration?: number): Promise<YtMp3GoResult> {
    return await this.monitorJobStatusWithStreamingSse(jobId, videoId, title, duration);
  }

  /**
   * Monitor job status using one long-lived SSE stream.
   */
  private async monitorJobStatusWithStreamingSse(
    jobId: string,
    videoId: string,
    title?: string,
    duration?: number
  ): Promise<YtMp3GoResult> {

    const statusResponse = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/events?id=${jobId}`, {
      headers: {
        'Accept': 'text/event-stream',
        'User-Agent': 'ChordMiniApp/1.0'
      },
      signal: createSafeTimeoutSignal(this.MAX_MONITOR_DURATION_MS)
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`SSE stream request failed: ${statusResponse.status} ${statusResponse.statusText} - ${errorText}`);
    }

    if (!statusResponse.body) {
      throw new Error('SSE stream response has no readable body');
    }

    const reader = statusResponse.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = '';
    let sawAnyStatus = false;

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      streamBuffer += decoder.decode(value, { stream: true });

      const { messages, remainder } = this.consumeSseBuffer(streamBuffer);
      streamBuffer = remainder;

      for (const message of messages) {
        const jobStatus = this.parseJobStatusPayload(message);
        if (!jobStatus) {
          continue;
        }

        sawAnyStatus = true;


        const terminalResult = await this.handleJobTerminalStatus(jobStatus, jobId, videoId, title, duration);
        if (terminalResult) {
          await reader.cancel();
          return terminalResult;
        }
      }
    }

    streamBuffer += decoder.decode();

    const trailingMessage = this.extractSseDataFromEventBlock(streamBuffer);
    if (trailingMessage) {
      const trailingStatus = this.parseJobStatusPayload(trailingMessage);
      if (trailingStatus) {
        sawAnyStatus = true;
        const terminalResult = await this.handleJobTerminalStatus(trailingStatus, jobId, videoId, title, duration);
        if (terminalResult) {
          return terminalResult;
        }
      }
    }

    if (!sawAnyStatus) {
      throw new Error('SSE stream closed without any status updates');
    }

    throw new Error('SSE stream closed before job reached a terminal state');
  }

  private consumeSseBuffer(buffer: string): { messages: string[]; remainder: string } {
    const eventBlocks = buffer.split(/\r?\n\r?\n/);
    const remainder = eventBlocks.pop() || '';
    const messages: string[] = [];

    for (const block of eventBlocks) {
      const message = this.extractSseDataFromEventBlock(block);
      if (message) {
        messages.push(message);
      }
    }

    return { messages, remainder };
  }

  private extractSseDataFromEventBlock(eventBlock: string): string | null {
    const dataLines: string[] = [];

    for (const line of eventBlock.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    return dataLines.join('\n');
  }

  private parseJobStatusPayload(payload: string): YtMp3GoJobStatus | null {
    try {
      const parsed = JSON.parse(payload) as Partial<YtMp3GoJobStatus>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      if (parsed.status !== 'processing' && parsed.status !== 'complete' && parsed.status !== 'failed') {
        return null;
      }

      return parsed as YtMp3GoJobStatus;
    } catch {
      return null;
    }
  }

  private async handleJobTerminalStatus(
    jobStatus: YtMp3GoJobStatus,
    jobId: string,
    videoId: string,
    title?: string,
    duration?: number
  ): Promise<YtMp3GoResult | null> {
    if (jobStatus.status === 'complete' && jobStatus.filePath) {
      // Job completed successfully, construct download URL from filePath
      // filePath is like: "downloads/jobID/filename.mp3"
      // We need to construct: /yt-downloader/downloads/jobID/filename.mp3
      const relativePath = jobStatus.filePath.replace('downloads/', '');
      const downloadUrl = `${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/downloads/${relativePath}`;


      // Validate the file is accessible and extract metadata
      const validation = await this.validateFileContentWithMetadata(downloadUrl);
      if (validation.isValid) {
        const finalDuration = validation.realDuration || duration || 0;


        // Extract filename from filePath for compatibility
        const filename = jobStatus.filePath.split('/').pop() || 'audio.mp3';

        return {
          success: true,
          audioUrl: downloadUrl,
          videoId,
          title,
          duration: finalDuration,
          filename,
          jobId
        };
      }


      return null;
    }

    if (jobStatus.status === 'failed') {
      // Job has permanently failed - get detailed error info and return failure immediately
      const basicError = jobStatus.error || 'Unknown error';


      // Try to get more detailed error information
      const detailedError = await this.getJobErrorDetails(jobId);
      const finalError = detailedError !== 'No additional error details available'
        ? `${basicError} (Details: ${detailedError})`
        : basicError;


      return {
        success: false,
        error: `yt-mp3-go extraction failed: ${finalError}`,
        videoId,
        title,
        duration: duration || 0,
        jobId
      };
    }

    // Non-terminal processing state.
    return null;
  }

  /**
   * Get detailed error information for a failed job
   */
  private async getJobErrorDetails(jobId: string): Promise<string> {
    try {
      // Try to get more detailed error information from the service
      const response = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/events?id=${jobId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'User-Agent': 'ChordMiniApp/1.0'
        },
        signal: createSafeTimeoutSignal(5000) // Short timeout for error details
      });

      if (response.ok) {
        const text = await response.text();


        // Parse all SSE messages to find error details
        const { messages, remainder } = this.consumeSseBuffer(text);
        const trailingMessage = this.extractSseDataFromEventBlock(remainder);
        if (trailingMessage) {
          messages.push(trailingMessage);
        }

        const errorMessages: string[] = [];

        for (const message of messages) {
          try {
            const data = JSON.parse(message) as { error?: string; details?: string };
            if (data.error && data.error !== 'yt-dlp command finished with an error.') {
              errorMessages.push(data.error);
            }
            if (data.details) {
              errorMessages.push(data.details);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }

        if (errorMessages.length > 0) {
          return errorMessages.join('; ');
        }
      }
    } catch {
    }

    return 'No additional error details available';
  }

  /**
   * Validate file content and extract metadata
   */
  private async validateFileContentWithMetadata(url: string): Promise<{ isValid: boolean; realDuration?: number }> {
    try {
      // First, check if the file is accessible
      const headResponse = await fetch(url, { 
        method: 'HEAD',
        signal: createSafeTimeoutSignal(10000)
      });

      if (!headResponse.ok) {
        return { isValid: false };
      }

      // Extract real audio metadata using partial download for efficiency (optional)
      try {
        const { audioMetadataService } = await import('@/services/audio/audioMetadataService');
        const metadata = await audioMetadataService.extractMetadataFromPartialDownload(url);

        if (metadata && metadata.duration > 0) {

          // Validate that the duration seems reasonable
          if (audioMetadataService.isReasonableDuration(metadata.duration)) {
            return {
              isValid: true,
              realDuration: Math.round(metadata.duration)
            };
          }
        }
      } catch {
      }

      // File is accessible but no valid metadata extracted
      return { isValid: true };

    } catch {
      return { isValid: false };
    }
  }

  /**
   * Validate and normalize quality parameter
   */
  private validateQuality(quality?: string): string {
    if (!quality) {
      return this.DEFAULT_QUALITY;
    }

    const normalizedQuality = quality.toLowerCase();
    const validQualities: string[] = Object.values(this.QUALITY_OPTIONS);

    if (validQualities.includes(normalizedQuality)) {
      return normalizedQuality;
    }


    return this.DEFAULT_QUALITY;
  }

  /**
   * Generate a safe filename for the yt-mp3-go service
   */
  private generateSafeFilename(videoId: string, title?: string): string {
    if (title) {
      // Clean the title to make it filesystem-safe
      const cleanTitle = title
        .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, and hyphens
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 50); // Limit length to 50 characters

      return `${cleanTitle}_${videoId}`;
    }

    // Fallback to video ID only
    return videoId;
  }
}

// Export singleton instance
export const ytMp3GoService = YtMp3GoService.getInstance();
