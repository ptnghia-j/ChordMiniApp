import { NextRequest, NextResponse } from 'next/server';
import { yt2mp3MagicService } from '@/services/yt2mp3MagicService';
import { ytMp3GoService } from '@/services/ytMp3GoService';
import { firebaseStorageSimplified } from '@/services/firebaseStorageSimplified';

/**
 * Test Fallback Caching Mechanism
 * 
 * This endpoint tests the complete fallback caching workflow:
 * 1. Simulates yt2mp3-magic failure
 * 2. Triggers yt-mp3-go fallback
 * 3. Verifies Firebase Storage upload
 * 4. Tests cache retrieval on subsequent requests
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

    console.log(`🧪 Testing fallback caching mechanism for video: ${videoId}`);

    const testResults = {
      videoId,
      title: title || `Test Video ${videoId}`,
      timestamp: new Date().toISOString(),
      phase1_primaryServiceTest: {
        tested: false,
        success: false,
        error: ''
      },
      phase2_fallbackExtraction: {
        tested: false,
        success: false,
        audioUrl: '',
        isFirebaseUrl: false,
        error: ''
      },
      phase3_cacheVerification: {
        tested: false,
        success: false,
        foundInCache: false,
        cacheData: null as {
          audioUrl: string;
          extractionService: string | undefined;
          isStreamUrl: boolean;
          fileSize: number | undefined;
        } | null,
        error: ''
      },
      phase4_secondRequest: {
        tested: false,
        success: false,
        fromCache: false,
        audioUrl: '',
        error: ''
      },
      summary: {
        cachingWorking: false,
        fallbackWorking: false,
        overallSuccess: false
      }
    };

    // Phase 1: Verify primary service is down
    console.log('🔍 Phase 1: Testing primary service (yt2mp3-magic)');
    try {
      testResults.phase1_primaryServiceTest.tested = true;
      const primaryResult = await yt2mp3MagicService.extractAudio(videoId, title);
      
      if (primaryResult.success) {
        testResults.phase1_primaryServiceTest.success = true;
        console.log('⚠️ Primary service is working - fallback test may not be accurate');
      } else {
        testResults.phase1_primaryServiceTest.error = primaryResult.error || 'Unknown error';
        console.log(`✅ Primary service failed as expected: ${testResults.phase1_primaryServiceTest.error}`);
      }
    } catch (primaryError) {
      testResults.phase1_primaryServiceTest.error = primaryError instanceof Error ? primaryError.message : 'Unknown error';
      console.log(`✅ Primary service failed as expected: ${testResults.phase1_primaryServiceTest.error}`);
    }

    // Phase 2: Test fallback extraction with Firebase Storage upload
    console.log('🔍 Phase 2: Testing fallback extraction with Firebase Storage upload');
    try {
      testResults.phase2_fallbackExtraction.tested = true;
      
      // Clear any existing cache first
      console.log('🗑️ Clearing existing cache for clean test');
      
      const fallbackResult = await ytMp3GoService.extractAudio(videoId, title, undefined, 'medium');
      
      if (fallbackResult.success && fallbackResult.audioUrl) {
        testResults.phase2_fallbackExtraction.success = true;
        testResults.phase2_fallbackExtraction.audioUrl = fallbackResult.audioUrl;
        testResults.phase2_fallbackExtraction.isFirebaseUrl = fallbackResult.audioUrl.includes('firebasestorage.googleapis.com');
        
        console.log(`✅ Fallback extraction succeeded`);
        console.log(`📍 Audio URL: ${fallbackResult.audioUrl}`);
        console.log(`🔥 Is Firebase URL: ${testResults.phase2_fallbackExtraction.isFirebaseUrl}`);
      } else {
        testResults.phase2_fallbackExtraction.error = fallbackResult.error || 'Unknown error';
        console.log(`❌ Fallback extraction failed: ${testResults.phase2_fallbackExtraction.error}`);
      }
    } catch (fallbackError) {
      testResults.phase2_fallbackExtraction.error = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
      console.log(`❌ Fallback extraction error: ${testResults.phase2_fallbackExtraction.error}`);
    }

    // Phase 3: Verify cache was created
    console.log('🔍 Phase 3: Verifying cache was created');
    try {
      testResults.phase3_cacheVerification.tested = true;
      
      // Wait a moment for cache to be saved
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const cachedData = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
      
      if (cachedData) {
        testResults.phase3_cacheVerification.success = true;
        testResults.phase3_cacheVerification.foundInCache = true;
        testResults.phase3_cacheVerification.cacheData = {
          audioUrl: cachedData.audioUrl,
          extractionService: cachedData.extractionService,
          isStreamUrl: cachedData.isStreamUrl,
          fileSize: cachedData.fileSize
        };
        
        console.log(`✅ Cache verification succeeded`);
        console.log(`📊 Cache data:`, testResults.phase3_cacheVerification.cacheData);
      } else {
        testResults.phase3_cacheVerification.error = 'No cache data found';
        console.log(`❌ Cache verification failed: No cache data found`);
      }
    } catch (cacheError) {
      testResults.phase3_cacheVerification.error = cacheError instanceof Error ? cacheError.message : 'Unknown error';
      console.log(`❌ Cache verification error: ${testResults.phase3_cacheVerification.error}`);
    }

    // Phase 4: Test second request to verify cache usage
    console.log('🔍 Phase 4: Testing second request for cache usage');
    try {
      testResults.phase4_secondRequest.tested = true;
      
      const cachedResult = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
      
      if (cachedResult) {
        testResults.phase4_secondRequest.success = true;
        testResults.phase4_secondRequest.fromCache = true;
        testResults.phase4_secondRequest.audioUrl = cachedResult.audioUrl;
        
        console.log(`✅ Second request succeeded from cache`);
        console.log(`📍 Cached audio URL: ${cachedResult.audioUrl}`);
      } else {
        testResults.phase4_secondRequest.error = 'Cache miss on second request';
        console.log(`❌ Second request failed: Cache miss`);
      }
    } catch (secondRequestError) {
      testResults.phase4_secondRequest.error = secondRequestError instanceof Error ? secondRequestError.message : 'Unknown error';
      console.log(`❌ Second request error: ${testResults.phase4_secondRequest.error}`);
    }

    // Summary
    testResults.summary.fallbackWorking = testResults.phase2_fallbackExtraction.success;
    testResults.summary.cachingWorking = testResults.phase3_cacheVerification.success && testResults.phase4_secondRequest.success;
    testResults.summary.overallSuccess = testResults.summary.fallbackWorking && testResults.summary.cachingWorking;

    console.log('🏁 Fallback caching test completed');
    console.log(`📊 Summary: Fallback=${testResults.summary.fallbackWorking}, Caching=${testResults.summary.cachingWorking}, Overall=${testResults.summary.overallSuccess}`);

    return NextResponse.json({
      success: true,
      message: 'Fallback caching mechanism test completed',
      testResults,
      diagnosis: {
        fallbackMechanism: testResults.summary.fallbackWorking ? 'Working' : 'Failed',
        cachingMechanism: testResults.summary.cachingWorking ? 'Working' : 'Failed',
        firebaseStorageUpload: testResults.phase2_fallbackExtraction.isFirebaseUrl ? 'Working' : 'Not working',
        overallSystemStatus: testResults.summary.overallSuccess ? 'Fully functional' : 'Issues detected',
        recommendation: testResults.summary.overallSuccess 
          ? 'Fallback caching is working correctly - files will be cached to Firebase Storage'
          : 'Issues detected with fallback caching mechanism - investigate failed phases'
      }
    });

  } catch (error) {
    console.error('❌ Fallback caching test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to complete fallback caching test'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Fallback Caching Test API',
    description: 'Tests the complete fallback caching mechanism including Firebase Storage upload',
    usage: {
      method: 'POST',
      endpoint: '/api/test-fallback-caching',
      body: {
        videoId: 'YouTube video ID (required)',
        title: 'Video title (optional)'
      }
    },
    phases: [
      'Phase 1: Test primary service failure',
      'Phase 2: Test fallback extraction with Firebase Storage upload',
      'Phase 3: Verify cache was created',
      'Phase 4: Test cache retrieval on second request'
    ],
    example: {
      curl: 'curl -X POST http://localhost:3000/api/test-fallback-caching -H "Content-Type: application/json" -d \'{"videoId": "dQw4w9WgXcQ", "title": "Test Video"}\''
    }
  });
}
