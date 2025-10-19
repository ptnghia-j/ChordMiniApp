import { NextRequest, NextResponse } from 'next/server';
import { ytMp3GoService } from '@/services/youtube/ytMp3GoService';

/**
 * Test API endpoint for the API format fix
 * 
 * This endpoint tests the corrected yt-mp3-go service with consistent JSON format
 */

export async function POST(request: NextRequest) {
  try {
    const { videoId, title } = await request.json();

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: 'Video ID is required' },
        { status: 400 }
      );
    }

    console.log(`🧪 Testing API fix for video: ${videoId}`);

    // Test the corrected yt-mp3-go service
    const result = await ytMp3GoService.extractAudio(videoId, title);

    return NextResponse.json({
      success: result.success,
      videoId,
      title: result.title,
      audioUrl: result.audioUrl,
      duration: result.duration,
      filename: result.filename,
      jobId: result.jobId,
      error: result.error,
      apiFormat: 'JSON (consistent)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ API fix test error:', error);
    
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
  const title = searchParams.get('title');

  if (!videoId) {
    return NextResponse.json(
      { success: false, error: 'Video ID parameter is required' },
      { status: 400 }
    );
  }

  // Reuse the POST logic
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ videoId, title }),
    headers: { 'Content-Type': 'application/json' }
  }));
}
