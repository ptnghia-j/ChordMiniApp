import { NextRequest, NextResponse } from 'next/server';
import { ytMp3GoService } from '@/services/ytMp3GoService';

/**
 * Debug API endpoint for yt-mp3-go service testing
 * 
 * This endpoint helps debug issues with specific videos by:
 * 1. Testing service connectivity
 * 2. Checking video info retrieval
 * 3. Testing job creation
 * 4. Monitoring initial job status
 */

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json();

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Video ID is required' },
        { status: 400 }
      );
    }

    console.log(`🧪 Debug request for video: ${videoId}`);

    // Test the video extraction process
    const testResult = await ytMp3GoService.testVideoExtraction(videoId);

    return NextResponse.json({
      success: testResult.success,
      videoId,
      details: testResult.details,
      error: testResult.error,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Also support GET requests for quick testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json(
      { success: false, error: 'Video ID parameter is required' },
      { status: 400 }
    );
  }

  // Reuse the POST logic
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ videoId }),
    headers: { 'Content-Type': 'application/json' }
  }));
}
