import { NextRequest, NextResponse } from 'next/server';

/**
 * Extract and Analyze API Route
 * 
 * This route extracts the complete MP3 file and sends it directly to 
 * Google Cloud Run backend for ML processing (beat detection, chord recognition).
 * 
 * This bypasses the 60-second Vercel timeout by delegating the entire
 * process to the Google Cloud Run backend which has higher timeout limits.
 */

// Configure Vercel function timeout (max 60 seconds for Hobby plan)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const { 
      videoId, 
      beatDetector = 'beat-transformer', 
      chordDetector = 'chord-cnn-lstm',
      forceRedownload = false 
    } = data;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    console.log(`🎵 Extract and analyze request: videoId=${videoId}, beatDetector=${beatDetector}, chordDetector=${chordDetector}`);

    // Forward the complete request to Python backend (environment-configured)
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';
    
    console.log(`🚀 Forwarding complete extraction and analysis to backend: ${backendUrl}`);

    const response = await fetch(`${backendUrl}/api/extract-and-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ChordMini/1.0',
      },
      body: JSON.stringify({
        videoId,
        beatDetector,
        chordDetector,
        forceRedownload,
        // Additional parameters for backend processing
        extractFullAudio: true,
        processWithML: true,
        timeout: 600 // 10 minutes timeout for backend
      }),
      // Use a longer timeout for this request since it includes ML processing
      signal: AbortSignal.timeout(55000) // 55 seconds to stay under Vercel limit
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend extraction and analysis failed: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      
      return NextResponse.json(
        {
          success: false,
          error: 'Backend processing failed',
          details: errorText,
          suggestion: 'The video may be too long or the backend service is experiencing issues. Please try again later.'
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    console.log(`✅ Backend extraction and analysis completed for ${videoId}`);
    
    return NextResponse.json({
      success: true,
      ...result,
      message: 'Complete extraction and analysis completed via backend'
    });

  } catch (error: unknown) {
    console.error('❌ Extract and analyze error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Processing timeout',
          details: 'The extraction and analysis process took too long. This may happen with very long videos or during high server load.',
          suggestion: 'Please try with a shorter video or try again later when server load is lower.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to extract and analyze audio',
        details: errorMessage,
        suggestion: 'Please check your internet connection and try again. If the problem persists, the video may not be available for processing.'
      },
      { status: 500 }
    );
  }
}
