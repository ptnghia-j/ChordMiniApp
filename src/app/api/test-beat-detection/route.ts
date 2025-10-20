import { NextResponse } from 'next/server';
import { detectBeatsFromFirebaseUrl } from '@/services/audio/beatDetectionService';

/**
 * Test endpoint to verify the new Firebase URL beat detection approach
 */
export async function POST(request: Request) {
  try {
    const { firebaseUrl, detector = 'madmom' } = await request.json();
    
    if (!firebaseUrl) {
      return NextResponse.json(
        { error: 'Missing firebaseUrl parameter' },
        { status: 400 }
      );
    }
    
    if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
      return NextResponse.json(
        { error: 'Invalid Firebase Storage URL' },
        { status: 400 }
      );
    }
    
    console.log(`🧪 Testing beat detection for Firebase URL: ${firebaseUrl.substring(0, 100)}...`);
    
    const startTime = Date.now();
    
    // Test the new hybrid approach
    const result = await detectBeatsFromFirebaseUrl(firebaseUrl, detector);
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    return NextResponse.json({
      success: true,
      testResult: {
        approach: 'Hybrid (proxy download + mock fallback for localhost)',
        processingTime: `${processingTime.toFixed(1)} seconds`,
        beatsDetected: result.beats.length,
        bpm: result.bpm,
        duration: result.duration,
        model: result.model,
        cspIssues: 'None (uses internal API routes only)',
        backendConnectivity: result.model?.includes('mock') ? 'Mock data (Python backend not required)' : 'Via Next.js API routes',
        developmentMode: result.model?.includes('mock') ? 'Mock beat detection enabled for development' : 'Real ML processing'
      },
      beatData: {
        beats: result.beats.slice(0, 10), // First 10 beats for testing
        downbeats: result.downbeats?.slice(0, 5), // First 5 downbeats
        totalBeats: result.beats.length,
        timeSignature: result.time_signature
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL,
        approach: 'Firebase URL → /api/proxy-audio → File → vercelBlobUploadService → Python backend'
      }
    });
    
  } catch (error) {
    console.error('Beat detection test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      testResult: {
        approach: 'Hybrid (proxy download + mock fallback for localhost)',
        status: 'Failed',
        cspIssues: 'Should be resolved with this approach',
        suggestion: 'Check if /api/proxy-audio is working. Mock beat detection should work even without Python backend.'
      }
    }, { status: 500 });
  }
}

/**
 * GET endpoint to show test instructions
 */
export async function GET() {
  return NextResponse.json({
    testEndpoint: '/api/test-beat-detection',
    method: 'POST',
    description: 'Test the new Firebase URL beat detection approach that avoids CSP issues',
    requestBody: {
      firebaseUrl: 'https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o/audio%2Ffile.mp3?alt=media&token=...',
      detector: 'madmom' // optional, defaults to 'madmom'
    },
    example: {
      curl: 'curl -X POST http://localhost:3000/api/test-beat-detection -H "Content-Type: application/json" -d \'{"firebaseUrl": "YOUR_FIREBASE_URL"}\''
    },
    approach: {
      step1: 'Download Firebase Storage file via /api/proxy-audio (avoids CSP)',
      step2: 'Create File object from downloaded blob',
      step3: 'Use vercelBlobUploadService.processAudioFile() with environment detection',
      step4: 'Process via existing API infrastructure (no direct backend calls)',
      benefits: ['No CSP issues', 'Uses existing infrastructure', 'Works in localhost and production']
    }
  });
}
