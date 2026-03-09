import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { SegmentationRequest, SegmentationResult } from '@/types/chatbotTypes';
import { BACKEND_URLS } from '@/config/api';
import { normalizeSongFormerSegmentation } from '@/services/lyrics/songSegmentationService';

/**
 * POST /api/segmentation
 * 
 * Analyzes song structure and returns segmentation data with timestamps
 */

export const maxDuration = 300; // Vercel Hobby limit; long processing should be delegated to async backend jobs.

const MAX_SONGFORMER_BACKEND_TIMEOUT_MS = 10 * 60 * 1000;
const parsedSongformerBackendTimeoutMs = Number(
  process.env.SONGFORMER_BACKEND_TIMEOUT_MS || MAX_SONGFORMER_BACKEND_TIMEOUT_MS,
);
const SONGFORMER_BACKEND_TIMEOUT_MS = Number.isFinite(parsedSongformerBackendTimeoutMs) && parsedSongformerBackendTimeoutMs > 0
  ? Math.min(parsedSongformerBackendTimeoutMs, MAX_SONGFORMER_BACKEND_TIMEOUT_MS)
  : MAX_SONGFORMER_BACKEND_TIMEOUT_MS;

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

async function requestSongFormerSegmentation(audioUrl: string) {
  try {
    const response = await axios.post(
      `${BACKEND_URLS.SONGFORMER_BACKEND}/api/songformer/segment`,
      { audioUrl },
      {
        timeout: SONGFORMER_BACKEND_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      },
    );

    const payload = response.data;
    if (response.status < 200 || response.status >= 300 || !payload?.success) {
      throw new Error(payload?.error || 'SongFormer backend request failed');
    }

    return payload.data as {
      segments: Array<{ start: number | string; end: number | string; label: string }>;
      model?: string;
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.code === 'ECONNABORTED'
        ? `SongFormer backend exceeded ${Math.round(SONGFORMER_BACKEND_TIMEOUT_MS / 1000)}s timeout`
        : error.response?.data?.error || error.message;

      throw new Error(message);
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SegmentationRequest = await request.json();
    const { songContext } = body;

    if (!songContext) {
      return NextResponse.json(
        { error: 'Song context is required' },
        { status: 400 }
      );
    }

    if (!songContext.beats || songContext.beats.length === 0) {
      return NextResponse.json(
        { error: 'Beat data is required for segmentation analysis' },
        { status: 400 }
      );
    }

    if (!hasRemoteAudioSource(songContext.audioUrl)) {
      return NextResponse.json(
        { error: 'A remote audio URL is required for SongFormer segmentation' },
        { status: 400 }
      );
    }

    console.log(`Starting SongFormer segmentation analysis for song: ${songContext.title || 'Unknown'}`);

    const audioUrl = resolveAudioUrl(songContext.audioUrl as string, request);
    const songFormerResult = await requestSongFormerSegmentation(audioUrl);
    const segmentationResult: SegmentationResult = normalizeSongFormerSegmentation(
      songFormerResult.segments,
      songContext,
      songFormerResult.model || 'songformer',
    );

    console.log(`Segmentation analysis completed: ${segmentationResult.segments.length} segments identified`);

    return NextResponse.json({
      success: true,
      data: segmentationResult
    });

  } catch (error) {
    console.error('Error in segmentation API:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const statusCode = errorMessage.includes('required') ? 400 : 500;

    return NextResponse.json(
      { 
        error: errorMessage,
        success: false 
      },
      { status: statusCode }
    );
  }
}

/**
 * GET /api/segmentation
 * 
 * Returns information about the segmentation API
 */
export async function GET() {
  return NextResponse.json({
    name: 'Song Segmentation API',
    description: 'Requests SongFormer segmentation and normalizes it for the ChordMini UI.',
    version: '1.0.0',
    endpoints: {
      'POST /api/segmentation': {
        description: 'Analyze song structure with SongFormer and return segmentation data',
        parameters: {
          songContext: 'Complete song analysis data including beats and a backend-accessible audio URL',
        },
        response: {
          success: 'boolean',
          data: 'SegmentationResult object with segments and analysis'
        }
      },
      'POST /api/segmentation/jobs': {
        description: 'Create an async SongFormer segmentation job backed by Firestore',
      },
      'GET /api/segmentation/jobs/:jobId': {
        description: 'Poll SongFormer segmentation job status and retrieve the persisted result',
      }
    },
    requirements: [
      'Song must have beat detection data',
      'SongFormer requires a remote audio URL accessible by the SongFormer backend'
    ],
    segmentTypes: [
      'intro',
      'verse', 
      'pre-chorus',
      'chorus',
      'bridge',
      'outro',
      'instrumental',
      'solo',
      'breakdown'
    ]
  });
}
