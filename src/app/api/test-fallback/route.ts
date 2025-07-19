import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified } from '@/services/audioExtractionSimplified';

/**
 * Test API endpoint for fallback strategy
 * 
 * This endpoint tests the new fallback mechanism:
 * 1. yt-mp3-go medium quality
 * 2. yt-mp3-go low quality  
 * 3. QuickTube fallback
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

    console.log(`🧪 Testing fallback strategy for video: ${videoId}`);

    // Create video metadata for testing
    const videoMetadata = {
      id: videoId,
      title: title || `Test Video ${videoId}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      channelTitle: 'Test Channel',
      duration: '0:00'
    };

    // Test the extraction with fallback strategy
    const result = await audioExtractionServiceSimplified.extractAudio(videoMetadata, false);

    return NextResponse.json({
      success: result.success,
      videoId,
      audioUrl: result.audioUrl,
      error: result.error,
      fromCache: result.fromCache,
      isStreamUrl: result.isStreamUrl,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Fallback test error:', error);
    
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
