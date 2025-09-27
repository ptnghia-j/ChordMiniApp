import { NextRequest, NextResponse } from 'next/server';

/**
 * Test endpoint for ytdl-core implementation
 * Tests the same videos we've been using to compare with other services
 */

export const runtime = 'nodejs';
export const maxDuration = 60; // Extended timeout for testing

interface TestResult {
  success: boolean;
  testName: string;
  videoId: string;
  videoUrl: string;
  executionTime: number;
  result?: unknown;
  error?: string;
}

interface TestSummary {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  environment: {
    vercelEnv: string;
    nodeVersion: string;
    timestamp: string;
  };
}

// Test videos - same ones we've been using
const TEST_VIDEOS = [
  {
    name: 'Maroon 5 - Memories',
    videoId: 'SlPhMPnQ58k',
    url: 'https://www.youtube.com/watch?v=SlPhMPnQ58k'
  },
  {
    name: 'PSY - Gangnam Style',
    videoId: '9bZkp7q19f0',
    url: 'https://www.youtube.com/watch?v=9bZkp7q19f0'
  },
  {
    name: 'Rick Astley - Never Gonna Give You Up',
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  }
];

export async function GET(request: NextRequest): Promise<NextResponse<TestSummary>> {
  console.log('🧪 Starting ytdl-core test suite');
  const startTime = Date.now();
  
  const results: TestResult[] = [];
  let passedTests = 0;
  let failedTests = 0;

  // Get base URL for API calls
  const baseUrl = request.nextUrl.origin;
  
  for (const testVideo of TEST_VIDEOS) {
    console.log(`🎵 Testing: ${testVideo.name} (${testVideo.videoId})`);
    const testStartTime = Date.now();
    
    try {
      // Call our ytdl-core extraction API
      const response = await fetch(`${baseUrl}/api/ytdl-core/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: testVideo.url,
          quality: 'highestaudio'
        }),
      });

      const result = await response.json();
      const executionTime = Date.now() - testStartTime;

      if (response.ok && result.success) {
        console.log(`✅ Test passed: ${testVideo.name} (${executionTime}ms)`);
        results.push({
          success: true,
          testName: testVideo.name,
          videoId: testVideo.videoId,
          videoUrl: testVideo.url,
          executionTime,
          result: {
            title: result.data?.title,
            duration: result.data?.duration,
            formatsCount: result.data?.formats?.length,
            selectedFormat: {
              mimeType: result.data?.selectedFormat?.mimeType,
              audioQuality: result.data?.selectedFormat?.audioQuality,
              hasUrl: !!result.data?.selectedFormat?.url
            }
          }
        });
        passedTests++;
      } else {
        console.log(`❌ Test failed: ${testVideo.name} - ${result.error}`);
        results.push({
          success: false,
          testName: testVideo.name,
          videoId: testVideo.videoId,
          videoUrl: testVideo.url,
          executionTime,
          error: result.error || `HTTP ${response.status}`
        });
        failedTests++;
      }
    } catch (testError: unknown) {
      const executionTime = Date.now() - testStartTime;
      console.log(`❌ Test error: ${testVideo.name} - ${testError instanceof Error ? testError.message : String(testError)}`);
      results.push({
        success: false,
        testName: testVideo.name,
        videoId: testVideo.videoId,
        videoUrl: testVideo.url,
        executionTime,
        error: testError instanceof Error ? testError.message : String(testError)
      });
      failedTests++;
    }
  }

  const totalExecutionTime = Date.now() - startTime;
  console.log(`🏁 Test suite completed in ${totalExecutionTime}ms`);
  console.log(`📊 Results: ${passedTests} passed, ${failedTests} failed`);

  return NextResponse.json({
    success: passedTests > 0,
    totalTests: TEST_VIDEOS.length,
    passedTests,
    failedTests,
    results,
    environment: {
      vercelEnv: process.env.VERCEL_ENV || 'development',
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { videoUrl } = body;

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing videoUrl parameter'
      }, { status: 400 });
    }

    console.log(`🧪 Testing single video: ${videoUrl}`);
    const startTime = Date.now();

    // Get base URL for API calls
    const baseUrl = request.nextUrl.origin;

    // Call our ytdl-core extraction API
    const response = await fetch(`${baseUrl}/api/ytdl-core/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: videoUrl,
        quality: 'highestaudio'
      }),
    });

    const result = await response.json();
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: response.ok && result.success,
      executionTime,
      result,
      httpStatus: response.status,
      environment: {
        vercelEnv: process.env.VERCEL_ENV || 'development',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      environment: {
        vercelEnv: process.env.VERCEL_ENV || 'development',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}
