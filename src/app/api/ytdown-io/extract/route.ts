import { NextRequest, NextResponse } from 'next/server';
import { YtdownIoAudioService } from '@/services/youtube/ytdownIoAudioService';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * YTDown.io Audio Extraction API Endpoint
 * 
 * This endpoint uses ytdown.io service to extract YouTube audio
 * in M4A format, providing a production-ready alternative that
 * works in Vercel and other serverless environments.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { url: videoUrl, quality = '128K', testDownload = false } = body;

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: url'
      }, { status: 400 });
    }

    const ytdownService = new YtdownIoAudioService();

    // Validate YouTube URL
    if (!ytdownService.isValidYouTubeUrl(videoUrl)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid YouTube URL format'
      }, { status: 400 });
    }

    console.log(`[ytdown-io/extract] Processing: ${videoUrl} (quality: ${quality})`);

    // Extract audio information
    const result = await ytdownService.extractAudio(videoUrl, quality as '48K' | '128K');

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        executionTime: result.executionTime
      }, { status: 500 });
    }

    // Optionally test download URL accessibility
    let downloadUrlAccessible = undefined;
    if (testDownload && result.selectedAudio) {
      downloadUrlAccessible = await ytdownService.testDownloadUrl(result.selectedAudio.downloadUrl);
    }

    const totalExecutionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      executionTime: totalExecutionTime,
      service: 'ytdown.io',
      result: {
        videoId: result.videoId,
        title: result.title,
        duration: result.duration,
        audioFormats: result.audioFormats,
        selectedAudio: result.selectedAudio,
        downloadUrlAccessible
      }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[ytdown-io/extract] Error:', error);

    return NextResponse.json({
      success: false,
      executionTime,
      service: 'ytdown.io',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET endpoint for API documentation
 */
export async function GET() {
  return NextResponse.json({
    service: 'YTDown.io Audio Extraction',
    description: 'Extract YouTube audio using ytdown.io service with M4A format support',
    endpoint: '/api/ytdown-io/extract',
    methods: ['POST'],
    parameters: {
      url: {
        type: 'string',
        required: true,
        description: 'YouTube video URL'
      },
      quality: {
        type: 'string',
        required: false,
        default: '128K',
        options: ['48K', '128K'],
        description: 'Audio quality preference'
      },
      testDownload: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Test if download URL is accessible'
      }
    },
    example: {
      request: {
        method: 'POST',
        body: {
          url: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
          quality: '128K',
          testDownload: true
        }
      },
      response: {
        success: true,
        executionTime: 1200,
        service: 'ytdown.io',
        result: {
          videoId: 'SlPhMPnQ58k',
          title: 'Maroon 5 - Memories (Official Video)',
          duration: '00:03:15',
          audioFormats: [
            {
              quality: '48K',
              fileSize: '1.13 MB',
              downloadUrl: 'https://s3.ytcontent.net/v3/audioProcess/...',
              extension: 'M4A'
            },
            {
              quality: '128K',
              fileSize: '3.01 MB',
              downloadUrl: 'https://s3.ytcontent.net/v3/audioProcess/...',
              extension: 'M4A'
            }
          ],
          selectedAudio: {
            quality: '128K',
            fileSize: '3.01 MB',
            downloadUrl: 'https://s3.ytcontent.net/v3/audioProcess/...',
            extension: 'M4A'
          },
          downloadUrlAccessible: true
        }
      }
    },
    advantages: [
      'Works in Vercel production environment',
      'No 403 errors from Google Video URLs',
      'M4A format support with multiple quality options',
      'Fast processing (typically under 2 seconds)',
      'Reliable ytdown.io infrastructure',
      'No IP blocking issues'
    ]
  });
}
