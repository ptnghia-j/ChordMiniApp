import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/segmentation
 * 
 * Deprecated synchronous segmentation entrypoint.
 * Long-running SongFormer work must go through /api/segmentation/jobs.
 */

export const maxDuration = 30;

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Synchronous SongFormer segmentation is deprecated. Create a segmentation job at /api/segmentation/jobs instead.',
    },
    { status: 410 },
  );
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
        description: 'Deprecated. Use POST /api/segmentation/jobs.',
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
