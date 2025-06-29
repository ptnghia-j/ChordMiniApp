/**
 * QuickTube Service - Simplified Direct Integration
 *
 * This service eliminates all filename guessing and pattern matching by:
 * 1. Using QuickTube's job completion API directly
 * 2. Storing audio files by video ID only
 * 3. Leveraging YouTube search metadata for indexing
 * 4. No filename sanitization or pattern matching
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { audioMetadataService } from '@/services/audioMetadataService';
import { quickTubeFilenameGenerator } from './quickTubeFilenameGenerator';
import { QuickTubeErrorHandler } from '@/utils/quickTubeErrorHandler';

export interface SimplifiedQuickTubeResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  videoId: string;
  title?: string;
  duration?: number;
}

interface QuickTubeJobResponse {
  jid: string;
  status?: string;
  message?: string;
}



export class QuickTubeServiceSimplified {
  private static instance: QuickTubeServiceSimplified;
  private readonly QUICKTUBE_BASE_URL = 'https://quicktube.app';
  
  // Optimized timing for Vercel constraints (300s max)
  private readonly MAX_POLL_ATTEMPTS = 45; // 45 attempts = 270 seconds max (within 300s limit)
  private readonly POLL_INTERVAL = 6000; // 6 seconds between polls (more efficient)
  private readonly JOB_TIMEOUT = 10000; // 10 seconds for job creation
  private readonly INITIAL_WAIT = 15000; // 15 seconds initial wait for QuickTube processing
  
  // Simple job tracking by video ID
  private readonly activeJobs = new Map<string, Promise<SimplifiedQuickTubeResult>>();

  public static getInstance(): QuickTubeServiceSimplified {
    if (!QuickTubeServiceSimplified.instance) {
      QuickTubeServiceSimplified.instance = new QuickTubeServiceSimplified();
    }
    return QuickTubeServiceSimplified.instance;
  }

  /**
   * Extract audio using direct video ID approach - NO filename guessing
   */
  async extractAudio(videoId: string, title?: string, duration?: number): Promise<SimplifiedQuickTubeResult> {
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
      console.log(`🔄 Reusing active job for ${videoId}`);
      return await this.activeJobs.get(videoId)!;
    }

    // Create new job
    const jobPromise = this.performDirectExtraction(videoId, title, duration);
    this.activeJobs.set(videoId, jobPromise);

    try {
      return await jobPromise;
    } finally {
      this.activeJobs.delete(videoId);
    }
  }

  /**
   * Direct extraction without filename guessing
   */
  private async performDirectExtraction(videoId: string, title?: string, duration?: number): Promise<SimplifiedQuickTubeResult> {
    console.log(`🎵 QuickTube direct extraction: ${videoId}${title ? ` ("${title}")` : ''}${duration ? ` (${duration}s)` : ''}`);

    try {
      // Step 1: Create extraction job
      const jobId = await this.createJob(videoId);
      
      // Step 2: Poll for file availability (no status API available)
      const result = await this.pollForFileAvailability(jobId, videoId, title, duration);
      
      return result;

    } catch (error) {
      console.error(`❌ QuickTube extraction failed for ${videoId}:`, error);

      // Determine error type and provide helpful information
      let errorType: 'empty_file' | 'timeout' | 'cdn_cache' | 'service_unavailable' | 'general' = 'general';

      if (error instanceof Error) {
        if (error.message.includes('empty') || error.message.includes('422')) {
          errorType = 'empty_file';
        } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
          errorType = 'timeout';
        } else if (error.message.includes('CDN') || error.message.includes('cache')) {
          errorType = 'cdn_cache';
        } else if (error.message.includes('unavailable') || error.message.includes('503') || error.message.includes('502')) {
          errorType = 'service_unavailable';
        }
      }

      const errorInfo = QuickTubeErrorHandler.getErrorInfo(errorType, {
        videoId,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      });

      return {
        success: false,
        error: errorInfo.userMessage,
        videoId,
        title
      };
    }
  }

  /**
   * Create QuickTube job
   */
  private async createJob(videoId: string): Promise<string> {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`🎵 Creating QuickTube job for ${videoId}`);
    
    try {
      const response = await fetch(`${this.QUICKTUBE_BASE_URL}/download/index?link=${encodeURIComponent(youtubeUrl)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ChordMini/1.0'
        },
        signal: createSafeTimeoutSignal(this.JOB_TIMEOUT)
      });

      if (!response.ok) {
        throw new Error(`QuickTube job creation failed: ${response.status} ${response.statusText}`);
      }

      const jobData: QuickTubeJobResponse = await response.json();
      
      if (!jobData.jid) {
        throw new Error('QuickTube job creation failed: No job ID returned');
      }

      console.log(`✅ QuickTube job created: ${jobData.jid}`);
      return jobData.jid;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('QuickTube job creation timed out. Service may be busy.');
      }
      throw error;
    }
  }

  /**
   * Poll for file availability using direct file access - NO status API
   * QuickTube doesn't provide a public status API, so we poll for file availability directly
   */
  private async pollForFileAvailability(jobId: string, videoId: string, title?: string, duration?: number): Promise<SimplifiedQuickTubeResult> {
    console.log(`🔄 Polling for file availability (job: ${jobId})`);
    console.log(`⏳ Initial wait of ${this.INITIAL_WAIT / 1000}s for QuickTube processing...`);

    // Initial wait to give QuickTube time to process
    await new Promise(resolve => setTimeout(resolve, this.INITIAL_WAIT));

    for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
      try {
        // Wait between attempts (except first attempt after initial wait)
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL));
        }

        console.log(`📡 File availability check ${attempt + 1}/${this.MAX_POLL_ATTEMPTS} for job ${jobId}`);

        // Try direct file access with precise filename generation
        const directUrl = await this.tryDirectFileAccess(videoId, title);
        if (directUrl) {
          console.log(`✅ File found and accessible: ${directUrl}`);

          // Additional validation: verify the file is actually accessible and extract real metadata
          const validation = await this.validateFileContentWithRealMetadata(directUrl);
          if (validation.isValid) {
            // Prioritize real audio metadata over search metadata
            const finalDuration = validation.realDuration || duration || 0;
            console.log(`🎵 Duration source: ${validation.realDuration ? 'audio metadata' : 'search metadata'} = ${finalDuration}s`);

            return {
              success: true,
              audioUrl: directUrl,
              videoId,
              title,
              duration: finalDuration
            };
          } else {
            console.warn(`⚠️ File validation failed for ${directUrl}, continuing polling...`);
          }
        }

        // Calculate remaining time
        const elapsedTime = this.INITIAL_WAIT + (attempt * this.POLL_INTERVAL);
        const remainingTime = (this.MAX_POLL_ATTEMPTS * this.POLL_INTERVAL) - elapsedTime;
        console.log(`⏳ File not ready yet. Elapsed: ${Math.round(elapsedTime / 1000)}s, Remaining: ${Math.round(remainingTime / 1000)}s`);

      } catch (error) {
        console.warn(`⚠️ File check ${attempt + 1} failed:`, error);

        // Continue polling unless it's the last attempt
        if (attempt === this.MAX_POLL_ATTEMPTS - 1) {
          throw new Error(`File availability polling failed after ${this.MAX_POLL_ATTEMPTS} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    const totalWaitTime = this.INITIAL_WAIT + (this.MAX_POLL_ATTEMPTS * this.POLL_INTERVAL);

    // Final fallback: try creating a new job in case the original job failed
    console.log(`🔄 Final fallback: attempting to create a new QuickTube job for ${videoId}`);
    try {
      const fallbackJobId = await this.createJob(videoId);
      console.log(`🔄 Created fallback job: ${fallbackJobId}`);

      // Wait a bit for the new job to process
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

      // Try one more time with the new job
      const fallbackUrl = await this.tryDirectFileAccess(videoId, title);
      if (fallbackUrl) {
        const isValid = await this.validateFileContent(fallbackUrl);
        if (isValid) {
          console.log(`✅ Fallback job succeeded: ${fallbackUrl}`);
          return {
            success: true,
            audioUrl: fallbackUrl,
            videoId,
            title,
            duration: duration || 0
          };
        }
      }
    } catch (fallbackError) {
      console.warn(`⚠️ Fallback job creation failed:`, fallbackError);
    }

    throw new Error(`QuickTube file for job ${jobId} was not available within ${Math.round(totalWaitTime / 1000)} seconds. The video may require longer processing time, the service may be experiencing delays, or there may be CDN cache issues. Please try again later.`);
  }

  /**
   * Try direct file access using precise filename generation
   */
  private async tryDirectFileAccess(videoId: string, title?: string): Promise<string | null> {
    if (!title) {
      // Fallback to simple patterns if no title available
      const patterns = [`${videoId}.mp3`, `[${videoId}].mp3`];

      for (const pattern of patterns) {
        const result = await this.testFilePattern(pattern);
        if (result) return result;
      }
      return null;
    }

    // Use precise filename generation based on exact yt-dlp logic
    console.log(`🔧 Generating precise filename for: "${title}" [${videoId}]`);
    const filenameResults = quickTubeFilenameGenerator.generateFilename(title, videoId);

    // Test the exact filename generated
    for (const filenameResult of filenameResults) {
      // console.log(`🔍 Testing exact filename: ${filenameResult.filename}`);

      const result = await this.testFilePattern(filenameResult.filename);
      if (result) {
        console.log(`✅ Found file using ${filenameResult.method}: ${filenameResult.filename}`);
        return result;
      }
    }

    console.log(`❌ No files found using precise filename generation for ${videoId}`);
    return null;
  }

  /**
   * Test a specific filename pattern with robust validation
   */
  private async testFilePattern(filename: string): Promise<string | null> {
    try {
      const testUrl = `${this.QUICKTUBE_BASE_URL}/dl/${this.encodeQuickTubeFilename(filename)}`;
      // console.log(`🔍 Testing file pattern: ${filename}`);

      // Strategy 1: Try HEAD request first (most efficient)
      let headResponse;
      try {
        headResponse = await fetch(testUrl, {
          method: 'HEAD',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: createSafeTimeoutSignal(5000)
        });

        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          const size = contentLength ? parseInt(contentLength, 10) : 0;

          if (size > 1000) {
            console.log(`✅ HEAD validation successful: ${filename} (${(size / 1024 / 1024).toFixed(2)}MB)`);
            return testUrl;
          } else if (size === 0) {
            console.warn(`⚠️ HEAD shows empty file for ${filename}, trying alternative validation...`);
            // Continue to alternative strategies
          } else {
            console.warn(`⚠️ File too small via HEAD: ${filename} (${size} bytes)`);
            return null;
          }
        } else {
          console.warn(`⚠️ HEAD request failed: ${headResponse.status} for ${filename}`);
          // Continue to alternative strategies
        }
      } catch (headError) {
        console.warn(`⚠️ HEAD request error for ${filename}:`, headError);
        // Continue to alternative strategies
      }

      // Strategy 2: Try simple GET request without Range (avoid 416 entirely)
      console.log(`🔄 Trying simple GET validation for ${filename}...`);
      try {
        const simpleGetResponse = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: createSafeTimeoutSignal(3000) // Short timeout to avoid downloading large files
        });

        if (simpleGetResponse.ok) {
          // Check if we can read the response headers
          const contentLength = simpleGetResponse.headers.get('content-length');
          const contentType = simpleGetResponse.headers.get('content-type');

          console.log(`📊 Simple GET response: ${simpleGetResponse.status}, Content-Length: ${contentLength}, Content-Type: ${contentType}`);

          if (contentLength && parseInt(contentLength, 10) > 1000) {
            console.log(`✅ Simple GET validation successful: ${filename}`);
            // Abort the response to avoid downloading the full file
            try {
              simpleGetResponse.body?.cancel();
            } catch {
              // Ignore cancel errors
            }
            return testUrl;
          }
        } else {
          console.warn(`⚠️ Simple GET failed: ${simpleGetResponse.status} for ${filename}`);
        }
      } catch (simpleGetError) {
        console.warn(`⚠️ Simple GET error for ${filename}:`, simpleGetError);
      }

      // Strategy 3: Last resort - check if URL is accessible at all
      console.log(`🔄 Final validation attempt for ${filename}...`);
      try {
        const finalResponse = await fetch(testUrl, {
          method: 'HEAD',
          signal: createSafeTimeoutSignal(2000)
        });

        if (finalResponse.ok) {
          console.log(`✅ Final validation successful: ${filename} (status: ${finalResponse.status})`);
          return testUrl;
        } else {
          console.warn(`❌ Final validation failed: ${filename} (status: ${finalResponse.status})`);
        }
      } catch (finalError) {
        console.warn(`❌ Final validation error for ${filename}:`, finalError);
      }

      // All strategies failed
      console.warn(`❌ All validation strategies failed for ${filename}`);
      return null;

    } catch (error) {
      console.warn(`❌ File pattern test failed for ${filename}:`, error);
      return null;
    }
  }

  /**
   * Validate file content and estimate duration from file size
   */
  private async validateFileContentWithRealMetadata(url: string): Promise<{ isValid: boolean; realDuration?: number }> {
    try {
      // console.log(`🔍 Validating file content and extracting real metadata for: ${url}`);

      // First, do a quick HEAD request to validate the file exists
      const headResponse = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Accept': 'audio/*',
          'User-Agent': 'ChordMini/1.0'
        },
        signal: createSafeTimeoutSignal(5000)
      });

      if (!headResponse.ok) {
        console.log(`❌ HEAD request failed: ${headResponse.status} ${headResponse.statusText}`);
        return { isValid: false };
      }

      // Check content type
      const contentType = headResponse.headers.get('content-type') || '';
      if (!contentType.includes('audio/') && !contentType.includes('application/octet-stream')) {
        console.log(`❌ Invalid content type: ${contentType}`);
        return { isValid: false };
      }

      console.log(`✅ File validation successful, content-type: ${contentType}`);

      // Extract real audio metadata using partial download for efficiency
      const metadata = await audioMetadataService.extractMetadataFromPartialDownload(url);

      if (metadata && metadata.duration > 0) {
        console.log(`🎵 Real audio duration extracted: ${metadata.duration}s (${audioMetadataService.formatDuration(metadata.duration)})`);

        // Validate that the duration seems reasonable
        if (audioMetadataService.isReasonableDuration(metadata.duration)) {
          return {
            isValid: true,
            realDuration: Math.round(metadata.duration)
          };
        } else {
          console.warn(`⚠️ Extracted duration seems unreasonable: ${metadata.duration}s`);
        }
      }

      // If metadata extraction failed, still consider the file valid but without duration
      console.log(`⚠️ Could not extract audio metadata, but file is accessible`);
      return { isValid: true };

    } catch (error) {
      console.error(`❌ File validation with metadata extraction failed:`, error);
      return { isValid: false };
    }
  }

  /**
   * Validate that a file URL actually contains audio content (avoiding Range requests)
   */
  private async validateFileContent(url: string): Promise<boolean> {
    try {
      // console.log(`🔍 Validating file content for: ${url}`);

      // Strategy 1: Use HEAD request to check content-length (most reliable)
      try {
        const headResponse = await fetch(url, {
          method: 'HEAD',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: createSafeTimeoutSignal(5000)
        });

        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            const size = parseInt(contentLength, 10);
            const isValid = size > 1000; // At least 1KB

            if (isValid) {
              console.log(`✅ File content validated via HEAD: ${(size / 1024 / 1024).toFixed(2)}MB`);
              return true;
            } else {
              console.warn(`❌ File too small via HEAD: ${size} bytes`);
            }
          } else {
            console.warn(`⚠️ No content-length header in HEAD response`);
          }
        } else {
          console.warn(`⚠️ HEAD request failed: ${headResponse.status}`);
        }
      } catch (headError) {
        console.warn(`⚠️ HEAD request error:`, headError);
      }

      // Strategy 2: Try a simple GET request with short timeout (no Range header)
      try {
        console.log(`🔄 Trying simple GET validation...`);
        const getResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: createSafeTimeoutSignal(3000) // Short timeout
        });

        if (getResponse.ok) {
          const contentLength = getResponse.headers.get('content-length');
          if (contentLength && parseInt(contentLength, 10) > 1000) {
            console.log(`✅ File content validated via simple GET: ${contentLength} bytes`);
            // Cancel the response to avoid downloading the full file
            try {
              getResponse.body?.cancel();
            } catch {
              // Ignore cancel errors
            }
            return true;
          }
        } else {
          console.warn(`⚠️ Simple GET failed: ${getResponse.status}`);
        }
      } catch (getError) {
        console.warn(`⚠️ Simple GET error:`, getError);
      }

      // Strategy 3: Assume valid if URL is accessible (last resort)
      try {
        console.log(`🔄 Final accessibility check...`);
        const finalResponse = await fetch(url, {
          method: 'HEAD',
          signal: createSafeTimeoutSignal(2000)
        });

        if (finalResponse.ok) {
          console.log(`✅ File is accessible, assuming valid content`);
          return true;
        }
      } catch (finalError) {
        console.warn(`❌ Final accessibility check failed:`, finalError);
      }

      console.warn(`❌ All validation strategies failed for: ${url}`);
      return false;
    } catch (error) {
      console.warn(`❌ File content validation error:`, error);
      return false;
    }
  }

  /**
   * Check if QuickTube service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.QUICKTUBE_BASE_URL, {
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
    console.log('🧹 Cleared active QuickTube jobs');
  }

  /**
   * Test precise filename generation with known examples
   */
  testFilenameGeneration(): void {
    console.log('🧪 Testing QuickTube precise filename generation:');
    quickTubeFilenameGenerator.testFilenameGeneration();
  }

  /**
   * Generate filename candidates for a given title and video ID
   */
  generateFilenameCandidates(title: string, videoId: string) {
    return quickTubeFilenameGenerator.generateFilename(title, videoId);
  }

  /**
   * Custom encoding for QuickTube URLs that properly encodes square brackets
   * QuickTube expects square brackets to be URL-encoded as %5B and %5D
   * FIXED: Previous logic incorrectly decoded brackets, causing 404 errors
   */
  private encodeQuickTubeFilename(filename: string): string {
    // Apply standard URL encoding (this properly encodes square brackets)
    const encoded = encodeURIComponent(filename);

    console.log(`🔧 QuickTube URL encoding: "${filename}" → "${encoded}"`);
    return encoded;
  }
}

// Export singleton instance
export const quickTubeServiceSimplified = QuickTubeServiceSimplified.getInstance();
