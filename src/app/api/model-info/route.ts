import { NextResponse } from 'next/server';

/**
 * API route to get information about available models
 * This proxies the request to the Python backend
 */
export async function GET() {
  try {
    // Call the Python backend API
    const response = await fetch('http://localhost:5000/api/model-info', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch model info: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const data = await response.json();

    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching model info:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching model info',
      },
      { status: 500 }
    );
  }
}
