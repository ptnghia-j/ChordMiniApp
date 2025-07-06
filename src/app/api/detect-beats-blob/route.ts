import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * API route to detect beats using Vercel Blob URL
 * This bypasses Vercel's 4.5MB limit by processing files already uploaded to Vercel Blob
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
export const maxDuration = 800; // 13+ minutes for ML processing

export async function POST(request: NextRequest) {
  try {
    // Get the backend URL
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';

    console.log(`🥁 Processing Vercel Blob beat detection request`);

    // Get the form data from the request
    const formData = await request.formData();

    // Validate that we have a Blob URL
    const blobUrl = formData.get('blob_url') as string;
    if (!blobUrl) {
      return NextResponse.json(
        { error: 'No Vercel Blob URL provided' },
        { status: 400 }
      );
    }

    // Validate Blob URL format (Vercel Blob URLs contain specific domains)
    if (!blobUrl.includes('vercel-storage.com') && !blobUrl.includes('blob.vercel-storage.com')) {
      return NextResponse.json(
        { error: 'Invalid Vercel Blob URL format' },
        { status: 400 }
      );
    }

    console.log(`📁 Downloading audio from Vercel Blob: ${blobUrl.substring(0, 100)}...`);

    // Download the audio file from Vercel Blob
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download audio from Vercel Blob: ${blobResponse.status} ${blobResponse.statusText}` },
        { status: 400 }
      );
    }

    const audioBuffer = await blobResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Extract filename from blob URL or use default
    const urlParts = blobUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'audio.wav';

    console.log(`📁 Downloaded ${audioBuffer.byteLength} bytes, sending to Python backend as ${filename}`);

    // Create new FormData for the Python backend
    const backendFormData = new FormData();
    backendFormData.append('file', audioBlob, filename);

    // Add detector parameter if provided
    const detector = formData.get('detector');
    if (detector) {
      backendFormData.append('detector', detector as string);
    }

    // Create a safe timeout signal that works across environments
    const timeoutValue = 800000; // 13+ minutes timeout to match backend
    // // console.log(`🔍 Sending to Python backend: ${backendUrl}/api/detect-beats`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Forward the request to the Python backend's regular beat detection endpoint
    const response = await fetch(`${backendUrl}/api/detect-beats`, {
      method: 'POST',
      body: backendFormData,
      headers: {
        // Don't set Content-Type - let the browser set it with boundary for FormData
      },
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend error: ${response.status} ${response.statusText} - ${errorText}`);
      
      return NextResponse.json(
        { 
          error: `Backend processing failed: ${response.status} ${response.statusText}`,
          details: errorText
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log(`✅ Vercel Blob beat detection completed successfully`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Vercel Blob beat detection API error:', error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Beat detection timed out. The file may be too large or complex for processing.' },
          { status: 408 }
        );
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Unknown error occurred during Vercel Blob beat detection' },
      { status: 500 }
    );
  }
}
