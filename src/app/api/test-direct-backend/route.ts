import { NextResponse } from 'next/server';

/**
 * Test endpoint to check direct Python backend connectivity
 */
export async function GET() {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    
    console.log(`🧪 Testing direct Python backend connectivity at: ${backendUrl}`);
    
    // Test 1: Basic health check
    let healthResult = null;
    try {
      const healthResponse = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (healthResponse.ok) {
        healthResult = {
          status: healthResponse.status,
          data: await healthResponse.json(),
          accessible: true
        };
      } else {
        healthResult = {
          status: healthResponse.status,
          error: `HTTP ${healthResponse.status} ${healthResponse.statusText}`,
          accessible: false
        };
      }
    } catch (healthError) {
      healthResult = {
        error: healthError instanceof Error ? healthError.message : 'Unknown error',
        accessible: false
      };
    }
    
    // Test 2: Check beat detection endpoint specifically
    let beatEndpointResult = null;
    try {
      const beatResponse = await fetch(`${backendUrl}/api/detect-beats`, {
        method: 'OPTIONS', // Test if endpoint exists without sending data
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      
      beatEndpointResult = {
        status: beatResponse.status,
        accessible: beatResponse.ok || beatResponse.status === 405, // 405 Method Not Allowed is OK for OPTIONS
        statusText: beatResponse.statusText
      };
    } catch (beatError) {
      beatEndpointResult = {
        error: beatError instanceof Error ? beatError.message : 'Unknown error',
        accessible: false
      };
    }
    
    // Test 3: Check if port 5000 is accessible at all
    let portTestResult = null;
    try {
      const portResponse = await fetch(`${backendUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      portTestResult = {
        status: portResponse.status,
        accessible: true,
        statusText: portResponse.statusText
      };
    } catch (portError) {
      portTestResult = {
        error: portError instanceof Error ? portError.message : 'Unknown error',
        accessible: false
      };
    }
    
    return NextResponse.json({
      backendUrl,
      tests: {
        healthEndpoint: healthResult,
        beatDetectionEndpoint: beatEndpointResult,
        portAccessibility: portTestResult
      },
      diagnosis: {
        backendRunning: healthResult?.accessible || portTestResult?.accessible,
        beatEndpointAvailable: beatEndpointResult?.accessible,
        overallStatus: (healthResult?.accessible || portTestResult?.accessible) ? 'Backend accessible' : 'Backend not accessible'
      },
      troubleshooting: {
        ifBackendNotRunning: 'Start the Python backend with: cd python_backend && python app.py',
        ifPortBlocked: 'Check if port 5000 is available and not blocked by firewall',
        ifEndpointMissing: 'Verify the Python backend has the /api/detect-beats endpoint'
      }
    });
    
  } catch (error) {
    console.error('Backend connectivity test error:', error);
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      backendUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001',
      suggestion: 'Make sure the Python backend is running at localhost:5001'
    }, { status: 500 });
  }
}
