import { NextRequest, NextResponse } from 'next/server';

import { verifyAppCheckRequest } from '@/utils/serverAppCheck';
import {
  getSegmentationAccessMissingConfigurationMessage,
  validateSegmentationAccessCode,
} from '@/services/api/segmentationAccessService';
import {
  buildSegmentationRequestHash,
  createSegmentationJob,
  deleteNonCompletedSegmentationJobsByRequestHash,
  findActiveSegmentationJobByRequestHash,
  findCompletedSegmentationJobByRequestHash,
  updateSegmentationJob,
} from '@/services/firebase/segmentationJobService';
import { enqueueSongFormerSegmentationTask } from '@/services/google/cloudTasksService';
import { SegmentationRequest } from '@/types/chatbotTypes';

export const maxDuration = 60;

function hasRemoteAudioSource(audioUrl?: string): boolean {
  if (!audioUrl) return false;
  return audioUrl.startsWith('http://') || audioUrl.startsWith('https://') || audioUrl.startsWith('/audio/');
}

function isBlockedCallbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return normalized === 'localhost'
      || normalized === '127.0.0.1'
      || normalized === '::1'
      || normalized === '[::1]';
  }

  return false;
}

function normalizePublicBaseUrl(candidate?: string | null): string | null {
  const value = candidate?.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || isBlockedCallbackHostname(url.hostname)) {
      return null;
    }

    return url.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function resolveForwardedBaseUrl(request: NextRequest): string | null {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || request.headers.get('host')?.split(',')[0]?.trim();

  return host ? normalizePublicBaseUrl(`${proto}://${host}`) : null;
}

function resolvePublicRequestBaseUrl(request: NextRequest): string {
  const configuredBaseUrl = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const forwardedBaseUrl = resolveForwardedBaseUrl(request);
  if (forwardedBaseUrl) {
    return forwardedBaseUrl;
  }

  const requestOrigin = normalizePublicBaseUrl(request.nextUrl.origin);
  if (requestOrigin) {
    return requestOrigin;
  }

  throw new Error(
    'Unable to resolve a public base URL for SongFormer. Set NEXT_PUBLIC_BASE_URL or ensure the proxy sends x-forwarded-host.',
  );
}

function resolveCallbackBaseUrl(publicRequestBaseUrl: string): string {
  return normalizePublicBaseUrl(process.env.SONGFORMER_CALLBACK_BASE_URL) || publicRequestBaseUrl;
}

function resolveAudioUrl(audioUrl: string, publicBaseUrl: string): string {
  if (audioUrl.startsWith('/')) {
    return new URL(audioUrl, publicBaseUrl).toString();
  }

  return audioUrl;
}

export async function POST(request: NextRequest) {
  try {
    const appCheck = await verifyAppCheckRequest(request);
    if (!appCheck.ok) {
      return NextResponse.json({ success: false, error: appCheck.error }, { status: appCheck.status || 403 });
    }

    const body: SegmentationRequest = await request.json();
    const { songContext, accessCode } = body;

    if (!songContext) {
      return NextResponse.json({ success: false, error: 'Song context is required' }, { status: 400 });
    }

    if (!songContext.beats || songContext.beats.length === 0) {
      return NextResponse.json({ success: false, error: 'Beat data is required for segmentation analysis' }, { status: 400 });
    }

    if (!hasRemoteAudioSource(songContext.audioUrl)) {
      return NextResponse.json({ success: false, error: 'A remote audio URL is required for SongFormer segmentation' }, { status: 400 });
    }

    const publicRequestBaseUrl = resolvePublicRequestBaseUrl(request);
    const callbackBaseUrl = resolveCallbackBaseUrl(publicRequestBaseUrl);
    const audioUrl = resolveAudioUrl(songContext.audioUrl as string, publicRequestBaseUrl);
    const requestHash = buildSegmentationRequestHash(songContext, audioUrl);
    const cachedJob = await findCompletedSegmentationJobByRequestHash(requestHash);

    if (cachedJob?.result) {
      return NextResponse.json({
        success: true,
        jobId: cachedJob.jobId,
        status: 'completed',
        data: cachedJob.result,
        cached: true,
      });
    }

    const activeJob = await findActiveSegmentationJobByRequestHash(requestHash);
    if (activeJob) {
      return NextResponse.json({
        success: true,
        jobId: activeJob.jobId,
        status: activeJob.status,
        reused: true,
      });
    }

    const accessValidation = validateSegmentationAccessCode(accessCode);
    if (!accessValidation.isValid) {
      const status = accessValidation.error === getSegmentationAccessMissingConfigurationMessage() ? 503 : 403;
      return NextResponse.json(
        { success: false, error: accessValidation.error || 'Song segmentation access denied' },
        { status },
      );
    }

    await deleteNonCompletedSegmentationJobsByRequestHash(requestHash);

    const { jobId, updateToken } = await createSegmentationJob(songContext, audioUrl);
    const callbackUrl = `${callbackBaseUrl}/api/segmentation/jobs/${jobId}`;

    try {
      await enqueueSongFormerSegmentationTask({
        audioUrl,
        jobId,
        updateToken,
        callbackUrl,
        songContext,
      });
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : 'Failed to dispatch SongFormer job';
      await updateSegmentationJob(jobId, {
        status: 'failed',
        error: message,
      });
      return NextResponse.json(
        { success: false, jobId, status: 'failed', error: message },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: 'created',
    });
  } catch (error) {
    console.error('Error creating segmentation job:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create segmentation job' },
      { status: 500 },
    );
  }
}
