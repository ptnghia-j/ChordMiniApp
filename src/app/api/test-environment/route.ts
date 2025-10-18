import { NextResponse } from 'next/server';
import { detectEnvironment, logEnvironmentConfig } from '@/utils/environmentDetection';
import { isLocalBackend, getBackendUrl } from '@/utils/backendConfig';
import { vercelBlobUploadService } from '@/services/storage/vercelBlobUploadService';

export async function GET() {
  try {
    // Log environment configuration
    logEnvironmentConfig();

    const env = detectEnvironment();
    const backendUrl = getBackendUrl();
    const isLocalhost = isLocalBackend();

    // Test blob upload decision for different file sizes
    const testFileSizes = [
      { size: 1 * 1024 * 1024, label: '1MB' },
      { size: 3 * 1024 * 1024, label: '3MB' },
      { size: 5 * 1024 * 1024, label: '5MB' },
      { size: 10 * 1024 * 1024, label: '10MB' },
    ];

    const blobUploadTests = testFileSizes.map(test => ({
      fileSize: test.label,
      shouldUseBlob: vercelBlobUploadService.shouldUseBlobUpload(test.size),
      processingMethod: vercelBlobUploadService.shouldUseBlobUpload(test.size)
        ? 'Vercel Blob Upload'
        : (isLocalhost ? 'Direct Python Backend' : 'Standard Vercel Proxy')
    }));

    return NextResponse.json({
      success: true,
      environment: env,
      backendConfig: {
        backendUrl,
        isLocalhost,
        pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'not set (using fallback)',
      },
      blobUploadLogic: {
        enabled: !isLocalhost,
        reason: isLocalhost
          ? 'Disabled for localhost development - files sent directly to Python backend'
          : 'Enabled for production - large files use Vercel Blob',
        testResults: blobUploadTests,
      },
      apiRoutes: {
        beatDetection: '/api/detect-beats',
        chordRecognition: '/api/recognize-chords',
        behavior: isLocalhost
          ? 'Both routes will skip blob upload and send files directly to Python backend'
          : 'Both routes will use blob upload for files >4MB, direct processing for smaller files'
      },
      expectedBehavior: {
        localhost: {
          description: 'All files processed directly by Python backend',
          beatDetection: 'No blob upload attempts regardless of file size',
          chordRecognition: 'No blob upload attempts regardless of file size',
          firebaseUrls: 'Firebase Storage URLs call Python backend /api/detect-beats-firebase directly',
          backendUrl: 'http://localhost:5001'
        },
        production: {
          description: 'Smart routing based on file size',
          smallFiles: 'Direct processing via Vercel proxy',
          largeFiles: 'Vercel Blob upload then Python backend processing',
          firebaseUrls: 'Firebase Storage URLs processed through standard flow'
        }
      },
      beatDetectionFix: {
        issue: 'Beat detection was failing with 403 Forbidden and CSP errors in localhost development',
        solution: 'Hybrid approach with mock fallback: Download Firebase Storage files via /api/proxy-audio, with mock beat detection when Python backend unavailable',
        implementation: 'detectBeatsFromFirebaseUrl() + generateMockBeatDetection() for localhost development',
        benefits: 'Avoids CSP issues, works without Python backend, enables development without ML dependencies',
        mockBeatDetection: 'Generates realistic beat data based on audio duration and standard BPM (120) for development'
      },
      chordRecognitionFix: {
        issue: 'Chord recognition was failing with 403 Forbidden errors in localhost development (same as beat detection)',
        solution: 'Applied identical mock fallback approach to chord recognition',
        implementation: 'Added 403 error handling to /api/recognize-chords and recognizeChordsWithRateLimit() + generateMockChordRecognitionService()',
        benefits: 'Consistent behavior with beat detection, enables full audio analysis without Python backend',
        mockChordRecognition: 'Generates realistic chord progressions (C, Am, F, G, etc.) with 2-second intervals'
      },
      environmentVariables: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        vercelUrl: process.env.VERCEL_URL,
        vercel: process.env.VERCEL,
        port: process.env.PORT,
        manualStrategy: process.env.NEXT_PUBLIC_AUDIO_STRATEGY
      }
    });
  } catch (error) {
    console.error('Environment test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
