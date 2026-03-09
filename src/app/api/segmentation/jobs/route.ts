import { NextRequest, NextResponse } from 'next/server';

import { BACKEND_URLS } from '@/config/api';
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
} from '@/services/firebase/segmentationJobService';
import { SegmentationRequest } from '@/types/chatbotTypes';

export const maxDuration = 60;

function hasRemoteAudioSource(audioUrl?: string): boolean {
  if (!audioUrl) return false;
  return audioUrl.startsWith('http://') || audioUrl.startsWith('https://') || audioUrl.startsWith('/audio/');
}

function resolveAudioUrl(audioUrl: string, request: NextRequest): string {
  if (audioUrl.startsWith('/')) {
    return new URL(audioUrl, request.nextUrl.origin).toString();
  }

  return audioUrl;
}

function resolveCallbackBaseUrl(request: NextRequest): string {
  return (process.env.SONGFORMER_CALLBACK_BASE_URL || request.nextUrl.origin).replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  try {
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

    const audioUrl = resolveAudioUrl(songContext.audioUrl as string, request);
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
    const callbackUrl = `${resolveCallbackBaseUrl(request)}/api/segmentation/jobs/${jobId}`;

    return NextResponse.json({
      success: true,
      jobId,
      status: 'created',
      updateToken,
      workerRequest: {
        endpointUrl: `${BACKEND_URLS.SONGFORMER_BACKEND}/api/songformer/segment`,
        audioUrl,
        callbackUrl,
      },
    });
  } catch (error) {
    console.error('Error creating segmentation job:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create segmentation job' },
      { status: 500 },
    );
  }
}