import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified } from '@/services/audioExtractionSimplified';

/**
 * Async Audio Extraction Job API Route
 *
 * This route creates an async job for audio extraction that can run longer than
 * Vercel's standard timeout limits. It returns immediately with a job ID and
 * the client can poll for completion.
 */

// Configure Vercel function timeout - Use maximum available
export const maxDuration = 300; // 5 minutes for job creation and initial processing

interface ExtractAudioJobRequest {
  videoId: string;
  forceRefresh?: boolean;
  title?: string;
}

interface ExtractAudioJobResponse {
  success: boolean;
  jobId: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  error?: string;
  estimatedCompletionTime?: number; // seconds
}

// In-memory job storage (in production, use Redis or database)
const jobs = new Map<string, {
  status: 'created' | 'processing' | 'completed' | 'failed';
  videoId: string;
  title?: string;
  audioUrl?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}>();

export async function POST(request: NextRequest) {
  try {
    const body: ExtractAudioJobRequest = await request.json();
    const { videoId, forceRefresh = false, title } = body;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Video ID is required' },
        { status: 400 }
      );
    }

    // Generate job ID
    const jobId = `extract_${videoId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create job entry
    jobs.set(jobId, {
      status: 'created',
      videoId,
      title,
      createdAt: Date.now()
    });

    console.log(`🎵 Created async extraction job: ${jobId} for video ${videoId}`);

    // Start async processing (don't await)
    processExtractionJob(jobId, videoId, title, forceRefresh).catch(error => {
      console.error(`❌ Async job ${jobId} failed:`, error);
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = Date.now();
      }
    });

    return NextResponse.json({
      success: true,
      jobId,
      status: 'created',
      estimatedCompletionTime: 120 // 2 minutes estimate
    } as ExtractAudioJobResponse);

  } catch (error) {
    console.error('❌ Failed to create extraction job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create job' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const job = jobs.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Clean up old completed jobs (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id, jobData] of jobs.entries()) {
      if (jobData.completedAt && jobData.completedAt < oneHourAgo) {
        jobs.delete(id);
      }
    }

    const response: ExtractAudioJobResponse = {
      success: true,
      jobId,
      status: job.status,
      audioUrl: job.audioUrl,
      error: job.error
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Failed to get job status:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get job status' 
      },
      { status: 500 }
    );
  }
}

/**
 * Process extraction job asynchronously
 */
async function processExtractionJob(
  jobId: string, 
  videoId: string, 
  title?: string, 
  forceRefresh = false
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    console.log(`🔄 Starting async processing for job ${jobId}`);
    job.status = 'processing';

    // Use the simplified audio extraction service
    const videoMetadata = {
      id: videoId,
      title: title || `Video ${videoId}`
    };
    const result = await audioExtractionServiceSimplified.extractAudio(
      videoMetadata,
      forceRefresh
    );

    if (result.success && result.audioUrl) {
      job.status = 'completed';
      job.audioUrl = result.audioUrl;
      job.completedAt = Date.now();
      console.log(`✅ Async job ${jobId} completed successfully`);
    } else {
      job.status = 'failed';
      job.error = result.error || 'Audio extraction failed';
      job.completedAt = Date.now();
      console.error(`❌ Async job ${jobId} failed: ${job.error}`);
    }

  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.completedAt = Date.now();
    console.error(`❌ Async job ${jobId} failed with exception:`, error);
    throw error;
  }
}
