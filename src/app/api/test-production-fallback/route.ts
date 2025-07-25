import { NextRequest, NextResponse } from 'next/server';
import { yt2mp3MagicService } from '@/services/yt2mp3MagicService';
import { ytMp3GoService } from '@/services/ytMp3GoService';

/**
 * Test Production Fallback Mechanism
 * 
 * This endpoint simulates the production environment where:
 * 1. yt2mp3-magic service fails (currently returning 500 errors)
 * 2. Our fallback mechanism should trigger yt-mp3-go
 * 3. We can verify the complete fallback flow
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

    console.log(`🧪 Testing production fallback mechanism for video: ${videoId}`);
    console.log(`📋 Simulating production environment (yt2mp3-magic strategy)`);

    const testResults = {
      videoId,
      title: title || `Test Video ${videoId}`,
      timestamp: new Date().toISOString(),
      primaryService: {
        name: 'yt2mp3-magic',
        tested: false,
        success: false,
        error: '',
        duration: 0
      },
      fallbackService: {
        name: 'yt-mp3-go',
        tested: false,
        success: false,
        error: '',
        audioUrl: '',
        duration: 0
      },
      overallResult: {
        success: false,
        finalAudioUrl: '',
        serviceUsed: '',
        error: ''
      }
    };

    // Step 1: Test yt2mp3-magic service (primary)
    console.log('1️⃣ Testing primary service: yt2mp3-magic');
    const primaryStartTime = Date.now();
    
    try {
      testResults.primaryService.tested = true;
      const primaryResult = await yt2mp3MagicService.extractAudio(videoId, title);
      testResults.primaryService.duration = Date.now() - primaryStartTime;
      
      if (primaryResult.success) {
        console.log('✅ Primary service (yt2mp3-magic) succeeded');
        testResults.primaryService.success = true;
        testResults.overallResult.success = true;
        testResults.overallResult.serviceUsed = 'yt2mp3-magic';
        testResults.overallResult.finalAudioUrl = 'Stream would be uploaded to Firebase';
      } else {
        console.log(`❌ Primary service (yt2mp3-magic) failed: ${primaryResult.error}`);
        testResults.primaryService.error = primaryResult.error || 'Unknown error';
      }
    } catch (primaryError) {
      testResults.primaryService.duration = Date.now() - primaryStartTime;
      testResults.primaryService.error = primaryError instanceof Error ? primaryError.message : 'Unknown error';
      console.log(`❌ Primary service (yt2mp3-magic) exception: ${testResults.primaryService.error}`);
    }

    // Step 2: If primary failed, test fallback service
    if (!testResults.primaryService.success) {
      console.log('2️⃣ Primary service failed, testing fallback: yt-mp3-go');
      const fallbackStartTime = Date.now();
      
      try {
        testResults.fallbackService.tested = true;
        const fallbackResult = await ytMp3GoService.extractAudio(videoId, title, undefined, 'medium');
        testResults.fallbackService.duration = Date.now() - fallbackStartTime;
        
        if (fallbackResult.success && fallbackResult.audioUrl) {
          console.log('✅ Fallback service (yt-mp3-go) succeeded');
          testResults.fallbackService.success = true;
          testResults.fallbackService.audioUrl = fallbackResult.audioUrl;
          testResults.overallResult.success = true;
          testResults.overallResult.serviceUsed = 'yt-mp3-go-fallback';
          testResults.overallResult.finalAudioUrl = fallbackResult.audioUrl;
        } else {
          console.log(`❌ Fallback service (yt-mp3-go) failed: ${fallbackResult.error}`);
          testResults.fallbackService.error = fallbackResult.error || 'Unknown error';
        }
      } catch (fallbackError) {
        testResults.fallbackService.duration = Date.now() - fallbackStartTime;
        testResults.fallbackService.error = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        console.log(`❌ Fallback service (yt-mp3-go) exception: ${testResults.fallbackService.error}`);
      }
    }

    // Step 3: Determine overall result
    if (!testResults.overallResult.success) {
      testResults.overallResult.error = `Both services failed. Primary: ${testResults.primaryService.error}, Fallback: ${testResults.fallbackService.error}`;
    }

    // Step 4: Test audio URL accessibility (if we have one)
    if (testResults.overallResult.finalAudioUrl && testResults.fallbackService.success) {
      console.log('3️⃣ Testing audio URL accessibility');
      try {
        const audioResponse = await fetch(testResults.overallResult.finalAudioUrl, { method: 'HEAD' });
        console.log(`📡 Audio URL status: ${audioResponse.status}`);
        
        if (audioResponse.status === 403) {
          console.log('❌ Audio URL returned 403 Forbidden - this explains the frontend error!');
          testResults.overallResult.error = 'Audio URL accessible but may have CORS or permission issues';
        } else if (audioResponse.status === 200) {
          console.log('✅ Audio URL is accessible');
        }
      } catch (urlError) {
        console.log(`⚠️ Could not test audio URL: ${urlError instanceof Error ? urlError.message : 'Unknown error'}`);
      }
    }

    console.log('🏁 Production fallback test completed');

    return NextResponse.json({
      success: true,
      message: 'Production fallback mechanism test completed',
      testResults,
      diagnosis: {
        primaryServiceStatus: testResults.primaryService.success ? 'Working' : 'Failed',
        fallbackServiceStatus: testResults.fallbackService.success ? 'Working' : 'Failed',
        fallbackTriggered: testResults.fallbackService.tested,
        overallSystemStatus: testResults.overallResult.success ? 'Working with fallback' : 'Both services failed',
        recommendation: testResults.overallResult.success 
          ? 'System is working correctly with fallback mechanism'
          : 'Both primary and fallback services are failing - investigate service availability'
      }
    });

  } catch (error) {
    console.error('❌ Production fallback test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to complete production fallback test'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Production Fallback Test API',
    description: 'Tests the complete fallback mechanism from yt2mp3-magic to yt-mp3-go',
    usage: {
      method: 'POST',
      endpoint: '/api/test-production-fallback',
      body: {
        videoId: 'YouTube video ID (required)',
        title: 'Video title (optional)'
      }
    },
    example: {
      curl: 'curl -X POST http://localhost:3000/api/test-production-fallback -H "Content-Type: application/json" -d \'{"videoId": "dQw4w9WgXcQ", "title": "Test Video"}\''
    }
  });
}
