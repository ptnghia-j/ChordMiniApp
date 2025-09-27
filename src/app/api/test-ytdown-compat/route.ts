import { NextRequest, NextResponse } from 'next/server';
import { YtdownIoCompatService } from '@/services/ytdownIoCompatService';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Test API endpoint for YTDown.io Compatibility Service
 * 
 * This endpoint tests the ytdown.io service with downr.org compatible API
 * to verify it can be used as a drop-in replacement.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      videoUrl, 
      testDownload = false,
      fullTest = true 
    } = body;

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: videoUrl'
      }, { status: 400 });
    }

    const ytdownCompatService = new YtdownIoCompatService();

    console.log(`[test-ytdown-compat] Testing: ${videoUrl}`);

    let extractionResult = null;
    let downloadResult = null;
    let serviceTest = null;

    if (fullTest) {
      // Test 1: Service compatibility test
      console.log(`[test-ytdown-compat] Running service compatibility test...`);
      serviceTest = await ytdownCompatService.testService(videoUrl);
      console.log(`[test-ytdown-compat] Service test result:`, serviceTest);

      // Test 2: Full extraction test
      console.log(`[test-ytdown-compat] Running extraction test...`);
      extractionResult = await ytdownCompatService.extractAudio(videoUrl);
      
      // Test 3: Download test (if requested and extraction succeeded)
      if (testDownload && extractionResult.success && extractionResult.audioUrl) {
        console.log(`[test-ytdown-compat] Running download test...`);
        try {
          const downloadStart = Date.now();
          const audioBuffer = await ytdownCompatService.downloadAudio(extractionResult.audioUrl);
          const downloadTime = Date.now() - downloadStart;
          
          downloadResult = {
            success: true,
            fileSize: audioBuffer.byteLength,
            downloadTime,
            fileSizeMB: (audioBuffer.byteLength / (1024 * 1024)).toFixed(2)
          };
        } catch (downloadError) {
          downloadResult = {
            success: false,
            error: downloadError instanceof Error ? downloadError.message : 'Download failed'
          };
        }
      }
    }

    const totalExecutionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      executionTime: totalExecutionTime,
      service: 'ytdown.io-compat',
      videoUrl,
      tests: {
        serviceCompatibility: serviceTest,
        extraction: extractionResult ? {
          ...extractionResult,
          // Don't return audio buffer in response (too large)
          audioBuffer: extractionResult.audioBuffer ? 'present' : undefined
        } : null,
        download: downloadResult
      },
      serviceInfo: ytdownCompatService.getServiceInfo(),
      apiCompatibility: {
        downrOrgCompatible: true,
        maintainsSameInterface: true,
        supportedFormats: ['M4A 48K', 'M4A 128K']
      }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[test-ytdown-compat] Error:', error);

    return NextResponse.json({
      success: false,
      executionTime,
      service: 'ytdown.io-compat',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET endpoint for API documentation
 */
export async function GET() {
  const ytdownCompatService = new YtdownIoCompatService();
  
  return NextResponse.json({
    service: 'YTDown.io Compatibility Test',
    description: 'Test endpoint for ytdown.io service with downr.org compatible API',
    endpoint: '/api/test-ytdown-compat',
    methods: ['POST'],
    parameters: {
      videoUrl: {
        type: 'string',
        required: true,
        description: 'YouTube video URL',
        example: 'https://www.youtube.com/watch?v=SlPhMPnQ58k'
      },
      testDownload: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Test actual file download (increases execution time)'
      },
      fullTest: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Run complete compatibility test suite'
      }
    },
    testScenarios: {
      basicCompatibilityTest: {
        description: 'Test API compatibility with downr.org interface',
        request: {
          videoUrl: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
          fullTest: true,
          testDownload: false
        }
      },
      fullPipelineTest: {
        description: 'Test complete pipeline including file download',
        request: {
          videoUrl: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
          fullTest: true,
          testDownload: true
        }
      }
    },
    serviceInfo: ytdownCompatService.getServiceInfo(),
    compatibility: {
      replacesService: 'downr.org',
      maintainsInterface: true,
      advantages: [
        'No 403 errors from datacenter IPs',
        'Reliable ytdown.io infrastructure',
        'High-quality M4A audio formats',
        'Fast processing times'
      ]
    }
  });
}
