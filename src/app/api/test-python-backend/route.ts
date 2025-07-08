import { NextResponse } from 'next/server';

/**
 * Test endpoint to verify Python backend connectivity
 */
export async function GET() {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    
    console.log(`🧪 Testing Python backend connectivity at: ${backendUrl}`);
    
    // Test basic connectivity
    const healthResponse = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    const healthData = await healthResponse.json();
    
    // Test beat detection endpoint specifically
    const beatTestResponse = await fetch(`${backendUrl}/api/detect-beats`, {
      method: 'OPTIONS', // Test if endpoint exists
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    return NextResponse.json({
      success: true,
      backendUrl,
      health: {
        status: healthResponse.status,
        data: healthData,
      },
      beatEndpoint: {
        status: beatTestResponse.status,
        accessible: beatTestResponse.ok,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL,
      }
    });
    
  } catch (error) {
    console.error('Python backend test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      backendUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001',
      suggestion: 'Make sure the Python backend is running at localhost:5001'
    }, { status: 500 });
  }
}
