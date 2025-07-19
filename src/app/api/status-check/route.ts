import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * Status Check API Route
 * 
 * This route provides status checking for backend endpoints
 * and acts as a proxy to avoid CORS issues in status monitoring
 */
export async function POST(request: NextRequest) {
  try {
    const { endpoint } = await request.json();
    
    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Endpoint parameter is required' },
        { status: 400 }
      );
    }

    // Get the backend URL
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    
    let response;
    let expectedError = false;
    
    if (endpoint === '/api/detect-beats' || endpoint === '/api/recognize-chords') {
      // For file upload endpoints, test with POST request (should return 400 for missing file)
      response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        signal: createSafeTimeoutSignal(25000) // 25 second timeout
      });
      
      // These endpoints should return 400 when no file is provided - this indicates they're working
      expectedError = response.status === 400;
      
    } else if (endpoint === '/api/genius-lyrics') {
      // For genius lyrics, test with POST request (should return error for missing data)
      response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ artist: 'test', title: 'test' }),
        signal: createSafeTimeoutSignal(25000) // 25 second timeout
      });
      
      // Genius endpoint may return 500 for API key issues, but that means it's responsive
      expectedError = response.status === 500 || response.status === 400;
      
    } else {
      // For other endpoints, use GET request
      response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: createSafeTimeoutSignal(25000) // 25 second timeout
      });
    }

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { error: responseText };
    }

    // Determine if the endpoint is healthy based on expected behavior
    const isHealthy = response.ok || expectedError;
    
    return NextResponse.json({
      success: isHealthy,
      status: response.status,
      data: responseData,
      error: isHealthy ? undefined : `HTTP ${response.status}: ${responseData.error || response.statusText}`,
      expectedError
    });

  } catch (error) {
    console.error('Status check error:', error);
    
    // Check if it's a timeout error
    const isTimeout = error instanceof Error && 
      (error.name === 'AbortError' || error.message.includes('timeout'));
    
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Request timeout (backend may be cold starting)' : 
               error instanceof Error ? error.message : 'Unknown error',
        timeout: isTimeout
      },
      { status: isTimeout ? 408 : 500 }
    );
  }
}
