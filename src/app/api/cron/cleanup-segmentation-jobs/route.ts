import { NextRequest, NextResponse } from 'next/server';

import {
  cleanupStaleSegmentationJobs,
  getSegmentationJobTtlMs,
} from '@/services/firebase/segmentationJobService';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_CLEANUP_LIMIT = 200;

function isAuthorized(request: NextRequest): { ok: boolean; status?: number; error?: string } {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`
      ? { ok: true }
      : { ok: false, status: 401, error: 'Unauthorized' };
  }

  if (process.env.NODE_ENV === 'production') {
    return {
      ok: false,
      status: 500,
      error: 'CRON_SECRET is not configured for production scheduled cleanup.',
    };
  }

  return { ok: true };
}

function resolveCleanupLimit(request: NextRequest): number {
  const limitParam = Number(request.nextUrl.searchParams.get('limit'));
  if (Number.isFinite(limitParam) && limitParam > 0) {
    return Math.min(Math.floor(limitParam), 1000);
  }

  const envLimit = Number(process.env.SEGMENTATION_STALE_JOB_CLEANUP_LIMIT || DEFAULT_CLEANUP_LIMIT);
  return Number.isFinite(envLimit) && envLimit > 0
    ? Math.min(Math.floor(envLimit), 1000)
    : DEFAULT_CLEANUP_LIMIT;
}

export async function GET(request: NextRequest) {
  const authorization = isAuthorized(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { success: false, error: authorization.error },
      { status: authorization.status || 401 },
    );
  }

  try {
    const result = await cleanupStaleSegmentationJobs({
      limit: resolveCleanupLimit(request),
    });

    return NextResponse.json({
      success: true,
      ...result,
      ttlMs: {
        created: getSegmentationJobTtlMs('created'),
        processing: getSegmentationJobTtlMs('processing'),
      },
      cleanedAtMs: Date.now(),
    });
  } catch (error) {
    console.error('Error cleaning stale segmentation jobs:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to clean stale segmentation jobs' },
      { status: 500 },
    );
  }
}