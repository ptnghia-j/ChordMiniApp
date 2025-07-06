import { NextRequest, NextResponse } from 'next/server';
import { ytMp3GoService } from '@/services/ytMp3GoService';

/**
 * Test yt-mp3-go Service API
 * 
 * This endpoint tests the yt-mp3-go service integration
 * for YouTube audio extraction with Unicode support.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    const title = searchParams.get('title');
    const test = searchParams.get('test');

    if (test === 'availability') {
      // Test service availability
      const isAvailable = await ytMp3GoService.isAvailable();
      
      return NextResponse.json({
        success: true,
        available: isAvailable,
        service: 'yt-mp3-go',
        endpoint: 'https://lukavukanovic.xyz/yt-downloader/'
      });
    }

    if (!videoId) {
      return NextResponse.json({
        success: false,
        error: 'Missing videoId parameter',
        usage: 'GET /api/test-yt-mp3-go?videoId=VIDEO_ID&title=VIDEO_TITLE'
      }, { status: 400 });
    }

    // Test extraction
    const result = await ytMp3GoService.extractAudio(videoId, title || undefined);

    return NextResponse.json({
      success: true,
      input: { videoId, title },
      result: {
        success: result.success,
        audioUrl: result.audioUrl,
        title: result.title,
        duration: result.duration,
        filename: result.filename,
        jobId: result.jobId,
        error: result.error
      },
      metadata: {
        service: 'yt-mp3-go',
        unicodeSupport: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ yt-mp3-go test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'yt-mp3-go'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { videoId, title, testMultiple = false } = data;

    if (!videoId) {
      return NextResponse.json({
        success: false,
        error: 'Missing videoId in request body'
      }, { status: 400 });
    }

    if (testMultiple && Array.isArray(videoId)) {
      // Test multiple videos
      const results = [];
      
      for (const vid of videoId) {
        try {
          const result = await ytMp3GoService.extractAudio(vid, title || undefined);
          results.push({
            videoId: vid,
            success: result.success,
            audioUrl: result.audioUrl,
            title: result.title,
            duration: result.duration,
            filename: result.filename,
            error: result.error
          });
        } catch (error) {
          results.push({
            videoId: vid,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
        // Wait between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return NextResponse.json({
        success: true,
        service: 'yt-mp3-go',
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });
    }

    // Single video test
    const result = await ytMp3GoService.extractAudio(videoId, title || undefined);

    return NextResponse.json({
      success: true,
      input: { videoId, title },
      result: {
        success: result.success,
        audioUrl: result.audioUrl,
        title: result.title,
        duration: result.duration,
        filename: result.filename,
        jobId: result.jobId,
        error: result.error
      },
      comparison: {
        service: 'yt-mp3-go',
        advantages: [
          'Native Unicode filename support',
          'No filename matching issues',
          'Reliable job status monitoring',
          'Better error handling'
        ]
      }
    });

  } catch (error) {
    console.error('❌ yt-mp3-go test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'yt-mp3-go'
    }, { status: 500 });
  }
}
