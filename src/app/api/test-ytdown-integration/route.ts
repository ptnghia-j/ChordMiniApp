import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified } from '@/services/audio/audioExtractionSimplified';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Test API endpoint for ytdown.io integration with the main audio extraction pipeline
 * 
 * This endpoint tests the complete integration of ytdown.io service
 * with the existing audio extraction pipeline, including Firebase Storage
 * and caching mechanisms.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      videoUrl, 
      forceRedownload = false,
      testCaching = true 
    } = body;

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: videoUrl'
      }, { status: 400 });
    }

    // Extract video ID from URL
    const videoIdMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      return NextResponse.json({
        success: false,
        error: 'Invalid YouTube URL format'
      }, { status: 400 });
    }

    const videoId = videoIdMatch[1];
    console.log(`[test-ytdown-integration] Testing integration for: ${videoId}`);

    // Create video metadata (minimal required for testing)
    const videoMetadata = {
      id: videoId,
      title: `Test Video ${videoId}`,
      duration: '3:15', // Default duration for testing
      url: videoUrl
    };

    let firstExtractionResult = null;
    let secondExtractionResult = null;
    let cacheTestResult = null;

    // Test 1: First extraction (should use ytdown.io)
    console.log(`[test-ytdown-integration] Running first extraction (ytdown.io)...`);
    firstExtractionResult = await audioExtractionServiceSimplified.extractAudio(videoMetadata, forceRedownload);
    
    // Test 2: Cache test (if enabled)
    if (testCaching && firstExtractionResult.success) {
      console.log(`[test-ytdown-integration] Testing cache functionality...`);
      
      // Check if audio is cached
      const isCached = await audioExtractionServiceSimplified.isAudioCached(videoId);
      const cachedData = await audioExtractionServiceSimplified.getCachedAudio(videoId);
      
      cacheTestResult = {
        isCached,
        cachedData: cachedData ? {
          videoId: cachedData.videoId,
          title: cachedData.title,
          duration: cachedData.duration,
          fileSize: cachedData.fileSize,
          extractionService: cachedData.extractionService,
          isStreamUrl: cachedData.isStreamUrl
        } : null
      };

      // Test 3: Second extraction (should use cache)
      console.log(`[test-ytdown-integration] Running second extraction (should use cache)...`);
      secondExtractionResult = await audioExtractionServiceSimplified.extractAudio(videoMetadata, false);
    }

    const totalExecutionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      executionTime: totalExecutionTime,
      service: 'ytdown.io-integration',
      videoId,
      videoUrl,
      tests: {
        firstExtraction: {
          ...firstExtractionResult,
          // Don't return full audio URL in response for security
          audioUrl: firstExtractionResult.audioUrl ? 'present' : undefined
        },
        cacheTest: cacheTestResult,
        secondExtraction: secondExtractionResult ? {
          ...secondExtractionResult,
          audioUrl: secondExtractionResult.audioUrl ? 'present' : undefined
        } : null
      },
      integration: {
        ytdownIoWorking: firstExtractionResult?.success || false,
        cachingWorking: cacheTestResult?.isCached || false,
        cacheHitWorking: secondExtractionResult?.fromCache || false,
        firebaseStorageWorking: firstExtractionResult?.isStreamUrl === false || false
      },
      performance: {
        firstExtractionTime: firstExtractionResult?.success ? 'measured' : 'failed',
        cacheRetrievalTime: secondExtractionResult?.fromCache ? 'fast' : 'not_cached'
      }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[test-ytdown-integration] Error:', error);

    return NextResponse.json({
      success: false,
      executionTime,
      service: 'ytdown.io-integration',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET endpoint for API documentation
 */
export async function GET() {
  return NextResponse.json({
    service: 'YTDown.io Integration Test',
    description: 'Test endpoint for ytdown.io integration with main audio extraction pipeline',
    endpoint: '/api/test-ytdown-integration',
    methods: ['POST'],
    parameters: {
      videoUrl: {
        type: 'string',
        required: true,
        description: 'YouTube video URL',
        example: 'https://www.youtube.com/watch?v=SlPhMPnQ58k'
      },
      forceRedownload: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Force redownload even if cached'
      },
      testCaching: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Test caching functionality'
      }
    },
    testScenarios: {
      basicIntegrationTest: {
        description: 'Test basic ytdown.io integration',
        request: {
          videoUrl: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
          forceRedownload: false,
          testCaching: true
        }
      },
      forceRedownloadTest: {
        description: 'Test forced redownload bypassing cache',
        request: {
          videoUrl: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
          forceRedownload: true,
          testCaching: false
        }
      }
    },
    integrationFeatures: [
      'ytdown.io service integration',
      'Firebase Storage upload',
      'Firestore metadata caching',
      'Cache hit/miss testing',
      'Performance measurement'
    ],
    expectedBehavior: {
      firstRun: 'Uses ytdown.io → uploads to Firebase → caches metadata',
      secondRun: 'Uses cached data (fast response)',
      forceRedownload: 'Bypasses cache → fresh extraction'
    }
  });
}
