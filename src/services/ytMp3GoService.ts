/**
 * yt-mp3-go Service - Direct Integration
 *
 * This service provides audio extraction using the yt-mp3-go service
 * which supports Unicode filenames natively (unlike QuickTube).
 * 
 * API Structure:
 * 1. POST /yt-downloader/download - Submit URL for processing
 * 2. GET /yt-downloader/events?id={jobID} - Server-Sent Events for status
 * 3. GET /yt-downloader/downloads/{filename} - Download processed file
 * 
 * Key Advantages over QuickTube:
 * - Native Unicode filename support
 * - No filename matching issues
 * - Reliable job status monitoring via SSE
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

interface YtMp3GoJobResponse {
  jobID: string;
  title: string;
  thumbnail?: string;
}

interface YtMp3GoJobStatus {
  status: 'processing' | 'complete' | 'failed';
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export class YtMp3GoService {
  private static instance: YtMp3GoService;
  private readonly YT_MP3_GO_BASE_URL = 'https://lukavukanovic.xyz';
  private readonly API_PATH = '/yt-downloader';
  
  // Optimized timing for Vercel constraints (300s max)
  private readonly MAX_POLL_ATTEMPTS = 50; // 50 attempts = 250 seconds max (within 300s limit)
  private readonly POLL_INTERVAL = 5000; // 5 seconds between polls
  private readonly JOB_TIMEOUT = 15000; // 15 seconds for job creation
  private readonly STATUS_TIMEOUT = 60000; // 60 seconds for status monitoring
  
  // Simple job tracking by video ID
  private readonly activeJobs = new Map<string, Promise<YtMp3GoResult>>();

  static getInstance(): YtMp3GoService {
    if (!YtMp3GoService.instance) {
      YtMp3GoService.instance = new YtMp3GoService();
    }
    return YtMp3GoService.instance;
  }

  /**
   * Extract audio using yt-mp3-go service
   */
  async extractAudio(videoId: string, title?: string, duration?: number): Promise<YtMp3GoResult> {
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

    // Check for existing job
    if (this.activeJobs.has(videoId)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Reusing active yt-mp3-go job for ${videoId}`);
      }
      return await this.activeJobs.get(videoId)!;
    }

    // Create new job
    const jobPromise = this.performExtraction(videoId, title, duration);
    this.activeJobs.set(videoId, jobPromise);

    try {
      return await jobPromise;
    } finally {
      this.activeJobs.delete(videoId);
    }
  }

  /**
   * Perform audio extraction using yt-mp3-go
   */
  private async performExtraction(videoId: string, title?: string, duration?: number): Promise<YtMp3GoResult> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎵 yt-mp3-go extraction: ${videoId}${title ? ` ("${title}")` : ''}${duration ? ` (${duration}s)` : ''}`);
    }

    try {
      // Step 1: Create extraction job
      const jobData = await this.createJob(videoId);
      
      // Step 2: Monitor job status via polling (SSE alternative)
      const result = await this.monitorJobStatus(jobData.jobID, videoId, title, duration);
      
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
   * Create a new extraction job
   */
  private async createJob(videoId: string): Promise<YtMp3GoJobResponse> {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔧 Creating yt-mp3-go job for: ${youtubeUrl}`);
    }
    
    try {
      const formData = new FormData();
      formData.append('url', youtubeUrl);

      const response = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/download`, {
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
        throw new Error(`yt-mp3-go job creation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const jobData: YtMp3GoJobResponse = await response.json();
      
      if (!jobData.jobID) {
        throw new Error('yt-mp3-go job creation failed: No job ID returned');
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ yt-mp3-go job created: ${jobData.jobID}`);
        console.log(`📹 Video title: ${jobData.title}`);
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
   * Monitor job status using polling (alternative to SSE)
   */
  private async monitorJobStatus(jobId: string, videoId: string, title?: string, duration?: number): Promise<YtMp3GoResult> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 Monitoring yt-mp3-go job status: ${jobId}`);
    }

    for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
      try {
        // Wait between attempts
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL));
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`📡 Status check ${attempt + 1}/${this.MAX_POLL_ATTEMPTS} for job ${jobId}`);
        }

        const statusResponse = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/events?id=${jobId}`, {
          headers: {
            'Accept': 'text/event-stream',
            'User-Agent': 'ChordMiniApp/1.0'
          },
          signal: createSafeTimeoutSignal(10000) // 10 second timeout per request
        });

        if (statusResponse.ok) {
          const text = await statusResponse.text();

          // Parse the last SSE message (most recent status)
          const lines = text.split('\n');
          let latestJobData = null;

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                latestJobData = JSON.parse(line.substring(6));
              } catch {
                // Skip invalid JSON lines
              }
            }
          }

          if (latestJobData) {
            const jobStatus: YtMp3GoJobStatus = latestJobData;

            if (process.env.NODE_ENV === 'development') {
              console.log(`📊 Job status: ${jobStatus.status}`);
              console.log(`🔍 Full response:`, JSON.stringify(jobStatus, null, 2));
            }
            
            if (jobStatus.status === 'complete' && jobStatus.filePath) {
              // Job completed successfully, construct download URL from filePath
              // filePath is like: "downloads/jobID/filename.mp3"
              // We need to construct: /yt-downloader/downloads/jobID/filename.mp3
              const relativePath = jobStatus.filePath.replace('downloads/', '');
              const downloadUrl = `${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/downloads/${relativePath}`;

              if (process.env.NODE_ENV === 'development') {
                console.log(`📁 File path: ${jobStatus.filePath}`);
                console.log(`📥 Download URL: ${downloadUrl}`);
                console.log(`📊 File size: ${jobStatus.fileSize ? (jobStatus.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
              }

              // Validate the file is accessible and extract metadata
              const validation = await this.validateFileContentWithMetadata(downloadUrl);
              if (validation.isValid) {
                const finalDuration = validation.realDuration || duration || 0;

                if (process.env.NODE_ENV === 'development') {
                  console.log(`✅ yt-mp3-go extraction successful: ${downloadUrl}`);
                  console.log(`🎵 Duration source: ${validation.realDuration ? 'audio metadata' : 'search metadata'} = ${finalDuration}s`);
                }

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
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`⚠️ File validation failed for ${downloadUrl}, continuing polling...`);
                }
              }
            } else if (jobStatus.status === 'failed') {
              throw new Error(`Job failed: ${jobStatus.error || 'Unknown error'}`);
            }
            // Continue polling if status is 'processing'
          }
        }

      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ Status check ${attempt + 1} failed:`, error);
        }
        // Continue polling unless it's the last attempt
        if (attempt === this.MAX_POLL_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    // Polling timeout
    throw new Error(`yt-mp3-go job monitoring timeout after ${this.MAX_POLL_ATTEMPTS} attempts`);
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

      const contentType = headResponse.headers.get('content-type');
      const contentLength = headResponse.headers.get('content-length');

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ File validation successful, content-type: ${contentType}, size: ${contentLength} bytes`);
      }

      // Extract real audio metadata using partial download for efficiency (optional)
      try {
        const { audioMetadataService } = await import('@/services/audioMetadataService');
        const metadata = await audioMetadataService.extractMetadataFromPartialDownload(url);

        if (metadata && metadata.duration > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🎵 Real audio duration extracted: ${metadata.duration}s (${audioMetadataService.formatDuration(metadata.duration)})`);
          }

          // Validate that the duration seems reasonable
          if (audioMetadataService.isReasonableDuration(metadata.duration)) {
            return {
              isValid: true,
              realDuration: Math.round(metadata.duration)
            };
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`⚠️ Extracted duration seems unreasonable: ${metadata.duration}s`);
            }
          }
        }
      } catch (metadataError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Audio metadata extraction failed, continuing without real duration:', metadataError);
        }
      }

      // File is accessible but no valid metadata extracted
      return { isValid: true };

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ File validation failed:', error);
      }
      return { isValid: false };
    }
  }

  /**
   * Check if yt-mp3-go service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.YT_MP3_GO_BASE_URL}${this.API_PATH}/`, {
        method: 'HEAD',
        signal: createSafeTimeoutSignal(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Clear active jobs (for cleanup)
   */
  clearActiveJobs(): void {
    this.activeJobs.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Cleared active yt-mp3-go jobs');
    }
  }
}

// Export singleton instance
export const ytMp3GoService = YtMp3GoService.getInstance();
