import { NextRequest, NextResponse } from 'next/server';

/**
 * Job Status API Route
 *
 * This route provides status checking for async jobs.
 * It's a lightweight endpoint that can be polled frequently.
 */

// Configure Vercel function timeout - Keep short for status checks
export const maxDuration = 30; // 30 seconds for status checks

interface JobStatusResponse {
  success: boolean;
  jobId: string;
  status: 'created' | 'processing' | 'completed' | 'failed' | 'not_found';
  audioUrl?: string;
  error?: string;
  progress?: number; // 0-100
  elapsedTime?: number; // seconds
  estimatedRemainingTime?: number; // seconds
}

// This would be shared with the main job endpoint in production
// For now, we'll implement a simple in-memory store
const jobs = new Map<string, {
  status: 'created' | 'processing' | 'completed' | 'failed';
  videoId: string;
  title?: string;
  audioUrl?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const resolvedParams = await params;
    const jobId = resolvedParams.jobId;

    if (!jobId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Job ID is required',
          status: 'not_found'
        } as JobStatusResponse,
        { status: 400 }
      );
    }

    const job = jobs.get(jobId);
    if (!job) {
      return NextResponse.json({
        success: false,
        jobId,
        status: 'not_found',
        error: 'Job not found or expired'
      } as JobStatusResponse, { status: 404 });
    }

    // Calculate progress and timing
    const elapsedTime = Math.round((Date.now() - job.createdAt) / 1000);
    let progress = 0;
    let estimatedRemainingTime = 0;

    switch (job.status) {
      case 'created':
        progress = 5;
        estimatedRemainingTime = 115; // ~2 minutes total
        break;
      case 'processing':
        // Estimate progress based on elapsed time (rough estimate)
        progress = Math.min(90, 10 + (elapsedTime / 120) * 80); // 10% + up to 80% over 2 minutes
        estimatedRemainingTime = Math.max(0, 120 - elapsedTime);
        break;
      case 'completed':
        progress = 100;
        estimatedRemainingTime = 0;
        break;
      case 'failed':
        progress = 0;
        estimatedRemainingTime = 0;
        break;
    }

    const response: JobStatusResponse = {
      success: true,
      jobId,
      status: job.status,
      audioUrl: job.audioUrl,
      error: job.error,
      progress: Math.round(progress),
      elapsedTime,
      estimatedRemainingTime: Math.round(estimatedRemainingTime)
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Failed to get job status:', error);
    return NextResponse.json(
      { 
        success: false, 
        jobId: (await params).jobId,
        status: 'not_found',
        error: error instanceof Error ? error.message : 'Failed to get job status' 
      } as JobStatusResponse,
      { status: 500 }
    );
  }
}
