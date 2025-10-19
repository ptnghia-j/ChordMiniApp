import { NextRequest, NextResponse } from 'next/server';
import { SegmentationRequest, SegmentationResult } from '@/types/chatbotTypes';
import { analyzeSongSegmentation } from '@/services/lyrics/songSegmentationService';

/**
 * POST /api/segmentation
 * 
 * Analyzes song structure and returns segmentation data with timestamps
 */

export const maxDuration = 240; // 4 minutes for segmentation analysis

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body: SegmentationRequest = await request.json();
    const { songContext, geminiApiKey } = body;

    // Validate input
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

    if (!songContext.lyrics || songContext.lyrics.lines.length === 0) {
      return NextResponse.json(
        { error: 'Lyrics data is required for segmentation analysis' },
        { status: 400 }
      );
    }



    // Check API key availability
    const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is required for segmentation analysis' },
        { status: 400 }
      );
    }

    console.log(`Starting segmentation analysis for song: ${songContext.title || 'Unknown'}`);

    // Perform segmentation analysis
    const segmentationResult: SegmentationResult = await analyzeSongSegmentation({
      songContext,
      geminiApiKey: apiKey
    });

    console.log(`Segmentation analysis completed: ${segmentationResult.segments.length} segments identified`);

    // Return the segmentation result
    return NextResponse.json({
      success: true,
      data: segmentationResult
    });

  } catch (error) {
    console.error('Error in segmentation API:', error);
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const statusCode = errorMessage.includes('API key') ? 401 : 
                      errorMessage.includes('required') ? 400 : 500;

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
    description: 'Analyzes song structure to identify sections like intro, verse, chorus, bridge, etc.',
    version: '1.0.0',
    endpoints: {
      'POST /api/segmentation': {
        description: 'Analyze song structure and return segmentation data',
        parameters: {
          songContext: 'Complete song analysis data including beats, chords, and lyrics',
          geminiApiKey: 'Optional Gemini API key (uses environment variable if not provided)'
        },
        response: {
          success: 'boolean',
          data: 'SegmentationResult object with segments and analysis'
        }
      }
    },
    requirements: [
      'Song must have beat detection data',
      'Song must have lyrics data',
      'Gemini API key must be available'
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
