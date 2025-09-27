import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;



/**
 * Test API endpoint to integrate with ytdown.io service
 * This tests if we can make direct API calls to their proxy.php endpoint
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { videoUrl, format = 'M4A - (128K)' } = body;

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: videoUrl'
      }, { status: 400 });
    }

    console.log(`[ytdown.io] Processing: ${videoUrl}`);

    // Test 1: Try to call ytdown.io proxy.php directly
    const ytdownResponse = await fetch('https://ytdown.io/proxy.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://ytdown.io/en',
        'Origin': 'https://ytdown.io'
      },
      body: new URLSearchParams({
        'url': videoUrl,
        'format': format
      })
    });

    console.log(`[ytdown.io] Response status: ${ytdownResponse.status}`);
    
    if (!ytdownResponse.ok) {
      throw new Error(`ytdown.io API returned ${ytdownResponse.status}`);
    }

    const responseText = await ytdownResponse.text();
    console.log(`[ytdown.io] Response preview: ${responseText.substring(0, 200)}...`);

    // Try to parse as JSON first
    let ytdownData;
    try {
      ytdownData = JSON.parse(responseText);
    } catch {
      // If not JSON, it might be HTML response
      console.log(`[ytdown.io] Response is not JSON, might be HTML`);
      ytdownData = { html: responseText };
    }

    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      executionTime,
      service: 'ytdown.io',
      videoUrl,
      requestedFormat: format,
      response: ytdownData,
      responseType: typeof ytdownData === 'object' && ytdownData.html ? 'html' : 'json'
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[ytdown.io] Error:', error);

    return NextResponse.json({
      success: false,
      executionTime,
      service: 'ytdown.io',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET endpoint for testing
 */
export async function GET() {
  return NextResponse.json({
    service: 'ytdown.io API Test',
    description: 'Test endpoint for integrating with ytdown.io service',
    usage: {
      method: 'POST',
      body: {
        videoUrl: 'https://www.youtube.com/watch?v=VIDEO_ID',
        format: 'M4A - (128K)' // Optional, defaults to M4A 128K
      }
    },
    availableFormats: [
      'MP4 - (1920x1080 FHD)',
      'MP4 - (1280x720 HD)', 
      'MP4 - (854x480 SD)',
      'MP4 - (640x360 SD)',
      'MP4 - (426x240 SD)',
      'MP4 - (256x144 SD)',
      'M4A - (48K)',
      'M4A - (128K)'
    ]
  });
}
