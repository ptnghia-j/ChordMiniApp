/**
 * Async Job Service
 *
 * This service handles long-running async jobs that exceed Vercel's timeout limits.
 * It creates jobs, polls for completion, and provides progress updates.
 */

export interface AsyncJobResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  jobId?: string;
}

export interface JobStatus {
  success: boolean;
  jobId: string;
  status: 'created' | 'processing' | 'completed' | 'failed' | 'not_found';
  audioUrl?: string;
  error?: string;
  progress?: number; // 0-100
  elapsedTime?: number; // seconds
  estimatedRemainingTime?: number; // seconds
}

export interface JobProgressCallback {
  (status: JobStatus): void;
}

export class AsyncJobService {
  private static instance: AsyncJobService;
  private readonly baseUrl: string;
  private readonly maxPollAttempts = 60; // 60 attempts = 5 minutes max
  private readonly pollInterval = 5000; // 5 seconds between polls

  constructor() {
    this.baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  public static getInstance(): AsyncJobService {
    if (!AsyncJobService.instance) {
      AsyncJobService.instance = new AsyncJobService();
    }
    return AsyncJobService.instance;
  }

  /**
   * Extract audio using async job processing
   */
  async extractAudio(
    videoId: string, 
    title?: string, 
    forceRefresh = false,
    onProgress?: JobProgressCallback
  ): Promise<AsyncJobResult> {
    try {
      console.log(`🎵 Starting async audio extraction for ${videoId}`);

      // Step 1: Create the job
      const jobResponse = await fetch(`${this.baseUrl}/api/jobs/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          title,
          forceRefresh
        }),
      });

      if (!jobResponse.ok) {
        const errorData = await jobResponse.json();
        throw new Error(errorData.error || `Job creation failed: ${jobResponse.status}`);
      }

      const jobData = await jobResponse.json();
      const jobId = jobData.jobId;

      console.log(`🔄 Created async job: ${jobId}`);

      // Step 2: Poll for completion
      const result = await this.pollJobCompletion(jobId, onProgress);
      
      return {
        success: result.success,
        audioUrl: result.audioUrl,
        error: result.error,
        jobId
      };

    } catch (error) {
      console.error('❌ Async audio extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Poll job completion with progress updates
   */
  private async pollJobCompletion(
    jobId: string, 
    onProgress?: JobProgressCallback
  ): Promise<AsyncJobResult> {
    console.log(`🔄 Polling job completion: ${jobId}`);

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      try {
        // Wait before polling (except first attempt)
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }

        // Check job status
        const statusResponse = await fetch(`${this.baseUrl}/api/jobs/status/${jobId}`, {
          method: 'GET',
        });

        if (!statusResponse.ok) {
          if (statusResponse.status === 404) {
            throw new Error('Job not found or expired');
          }
          throw new Error(`Status check failed: ${statusResponse.status}`);
        }

        const status: JobStatus = await statusResponse.json();
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(status);
        }

        console.log(`📊 Job ${jobId} status: ${status.status} (${status.progress}%)`);

        // Check if job is complete
        if (status.status === 'completed') {
          if (status.audioUrl) {
            console.log(`✅ Job ${jobId} completed successfully`);
            return {
              success: true,
              audioUrl: status.audioUrl,
              jobId
            };
          } else {
            throw new Error('Job completed but no audio URL provided');
          }
        }

        // Check if job failed
        if (status.status === 'failed') {
          throw new Error(status.error || 'Job failed without error message');
        }

        // Job still processing, continue polling
        const remainingTime = status.estimatedRemainingTime || 0;
        console.log(`⏳ Job ${jobId} still processing. Estimated remaining: ${remainingTime}s`);

      } catch (error) {
        console.warn(`⚠️ Job status check ${attempt + 1} failed:`, error);
        
        // If it's the last attempt, throw the error
        if (attempt === this.maxPollAttempts - 1) {
          throw error;
        }
        
        // Otherwise, continue polling
        console.log(`🔄 Retrying in ${this.pollInterval / 1000}s...`);
      }
    }

    throw new Error(`Job ${jobId} did not complete within ${this.maxPollAttempts * this.pollInterval / 1000} seconds`);
  }

  /**
   * Get job status (one-time check)
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.baseUrl}/api/jobs/status/${jobId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Check if async job service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/jobs/extract-audio`, {
        method: 'OPTIONS',
      });
      return response.ok || response.status === 405; // 405 = Method Not Allowed is OK
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const asyncJobService = AsyncJobService.getInstance();
