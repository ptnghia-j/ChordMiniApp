import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to recognize chords in an audio file using the BTC Supervised Learning model
 * This proxies the request to the Python backend
 */
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // Forward the request to the Python backend
    const response = await fetch('http://localhost:5000/api/recognize-chords-btc-sl', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BTC SL chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse the response
    const data = await response.json();

    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error recognizing chords with BTC SL:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error recognizing chords with BTC SL',
      },
      { status: 500 }
    );
  }
}
