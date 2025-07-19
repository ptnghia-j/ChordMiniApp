import { NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * Health Check API Route
 * 
 * This route provides a health check for the Python backend
 * and acts as a proxy to avoid CORS issues in status monitoring
 */
export async function GET() {
  try {
    // Get the backend URL
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    
    // Make request to backend health endpoint
    const response = await fetch(`${backendUrl}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Use appropriate timeout for health checks
      signal: createSafeTimeoutSignal(25000) // 25 second timeout for cold starts
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Backend health check failed: HTTP ${response.status} ${response.statusText}`,
          status: 'unhealthy'
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      data,
      status: 'healthy'
    });

  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'unhealthy'
      },
      { status: 500 }
    );
  }
}
