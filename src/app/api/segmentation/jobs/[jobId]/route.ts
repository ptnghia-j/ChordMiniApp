import { NextRequest, NextResponse } from 'next/server';

import {
  deleteNonCompletedSegmentationJobsByRequestHash,
  getSegmentationJob,
  getSegmentationJobTtlMs,
  isSegmentationJobStale,
  updateSegmentationJob,
  verifySegmentationJobUpdateToken,
} from '@/services/firebase/segmentationJobService';
import { normalizeSongFormerSegmentation } from '@/services/lyrics/songSegmentationService';
import { SegmentationResult } from '@/types/chatbotTypes';
import { SongContext } from '@/types/chatbotTypes';

export const maxDuration = 30;

type RouteParams = { params: Promise<{ jobId: string }> };

function sanitizeSegmentationResult(result?: SegmentationResult): SegmentationResult | undefined {
  if (!result) {
    return undefined;
  }

  return {
    ...result,
    segments: result.segments.map((segment) => {
      const sanitizedSegment = { ...((segment as unknown) as Record<string, unknown>) };
      delete sanitizedSegment.reasoning;
      return (sanitizedSegment as unknown) as typeof segment;
    }),
  };
}

function getProgress(status: string): number {
  switch (status) {
    case 'created':
      return 5;
    case 'processing':
      return 50;
    case 'completed':
    case 'failed':
      return 100;
    default:
      return 0;
  }
}

function getStaleJobError(status: 'created' | 'processing'): string {
  const ttlMs = getSegmentationJobTtlMs(status);
  const ttlMinutes = ttlMs ? Math.round(ttlMs / 60000) : null;

  if (status === 'created') {
    return ttlMinutes
      ? `Segmentation job expired after ${ttlMinutes} minutes without starting SongFormer processing.`
      : 'Segmentation job expired before SongFormer processing started.';
  }

  return ttlMinutes
    ? `Segmentation job expired after ${ttlMinutes} minutes without receiving a completion callback from SongFormer.`
    : 'Segmentation job expired while waiting for SongFormer completion.';
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const job = await getSegmentationJob(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, jobId, status: 'not_found', error: 'Segmentation job not found' },
        { status: 404 },
      );
    }

    if ((job.status === 'created' || job.status === 'processing') && isSegmentationJobStale(job)) {
      return NextResponse.json({
        success: true,
        jobId,
        status: 'failed',
        progress: 100,
        error: getStaleJobError(job.status),
        data: undefined,
        title: job.title,
        updatedAtMs: job.updatedAtMs,
        stale: true,
      });
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: job.status,
      progress: getProgress(job.status),
      error: job.error,
      data: sanitizeSegmentationResult(job.result),
      title: job.title,
      updatedAtMs: job.updatedAtMs,
    });
  } catch (error) {
    console.error('Error getting segmentation job status:', error);
    const { jobId } = await params;
    return NextResponse.json(
      { success: false, jobId, status: 'not_found', error: error instanceof Error ? error.message : 'Failed to get job status' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const body = await request.json() as {
      updateToken?: string;
      status?: 'processing' | 'completed' | 'failed';
      error?: string;
      data?: SegmentationResult;
      rawSegments?: Array<{
        start?: number | string;
        end?: number | string;
        label?: string;
        type?: string;
        confidence?: number;
      }>;
      songContext?: SongContext;
      model?: string;
    };

    if (!body.updateToken) {
      return NextResponse.json({ success: false, error: 'updateToken is required' }, { status: 400 });
    }

    const existingJob = await verifySegmentationJobUpdateToken(jobId, body.updateToken);
    if (!existingJob) {
      return NextResponse.json({ success: false, error: 'Invalid segmentation job token' }, { status: 403 });
    }

    if (!body.status) {
      return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 });
    }

    if (body.status === 'completed' && !body.data && (!body.rawSegments || !body.songContext)) {
      return NextResponse.json({ success: false, error: 'data or rawSegments+songContext is required when marking a job completed' }, { status: 400 });
    }

    const normalizedData = body.data ?? (body.rawSegments && body.songContext
      ? normalizeSongFormerSegmentation(body.rawSegments, body.songContext, body.model || 'songformer')
      : undefined);
    const sanitizedData = sanitizeSegmentationResult(normalizedData);

    await updateSegmentationJob(jobId, {
      status: body.status,
      error: body.status === 'failed' ? body.error || 'SongFormer segmentation failed' : undefined,
      result: body.status === 'completed' ? sanitizedData : undefined,
      model: body.model || sanitizedData?.metadata?.model || existingJob.model,
    });

    if (body.status === 'completed') {
      await deleteNonCompletedSegmentationJobsByRequestHash(existingJob.requestHash, {
        excludeJobId: jobId,
      });
    }

    return NextResponse.json({ success: true, jobId, status: body.status });
  } catch (error) {
    console.error('Error updating segmentation job:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update segmentation job' },
      { status: 500 },
    );
  }
}