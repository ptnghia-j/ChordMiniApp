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
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-191567167632.us-central1.run.app';

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
    let audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Extract filename from blob URL or use default
    const urlParts = blobUrl.split('/');
    let filename = urlParts[urlParts.length - 1] || 'audio.wav';

    console.log(`📁 Downloaded ${audioBuffer.byteLength} bytes from Vercel Blob`);

    // CRITICAL FIX: Convert audio to 44100Hz before sending to backend
    // This prevents frame rate mismatches in Beat-Transformer DBN processors
    try {
      // Dynamic import to avoid SSR issues
      const { convertAudioTo44100Hz, detectAudioSampleRate } = await import('@/utils/audioConversion');

      // Convert blob to File for processing
      const tempFile = new File([audioBlob], filename, { type: audioBlob.type });
      const originalSampleRate = await detectAudioSampleRate(tempFile);
      console.log(`🔧 CRITICAL FIX: Blob audio sample rate: ${originalSampleRate}Hz`);

      if (originalSampleRate !== 44100) {
        console.log(`🔧 CRITICAL FIX: Converting blob audio ${originalSampleRate}Hz → 44100Hz for Beat-Transformer compatibility`);
        const convertedFile = await convertAudioTo44100Hz(tempFile);
        audioBlob = new Blob([await convertedFile.arrayBuffer()], { type: 'audio/wav' });
        filename = convertedFile.name;
        console.log(`✅ CRITICAL FIX: Blob audio converted successfully for backend processing`);
      } else {
        console.log(`✅ Blob audio already at 44100Hz, no conversion needed`);
      }
    } catch (conversionError) {
      console.warn(`⚠️ Blob audio conversion failed, using original:`, conversionError);
      // Continue with original blob - backend will handle it but may have beat detection issues
    }

    console.log(`📁 Sending to Python backend as ${filename}`);

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
    // console.log(`🔍 Sending to Python backend: ${backendUrl}/api/detect-beats`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Forward the request to the Python backend's regular beat detection endpoint
    const response = await fetch(`${backendUrl}/api/detect-beats`, {
      method: 'POST',
      body: backendFormData,
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

    // CRITICAL DEBUG: Log the exact backend response to identify where beats are lost
    console.log(`🥁 BLOB BACKEND RESPONSE DEBUG:`, {
      success: result.success,
      hasBeats: !!result.beats,
      beatsType: typeof result.beats,
      beatsIsArray: Array.isArray(result.beats),
      beatsLength: result.beats?.length || 0,
      firstFewBeats: result.beats?.slice(0, 5),
      bpm: result.BPM || result.bpm,
      duration: result.duration,
      timeSignature: result.time_signature,
      model: result.model_used || result.model
    });

    // Additional validation to catch the issue
    if (result.success && result.beats && Array.isArray(result.beats)) {
      if (result.beats.length === 1) {
        console.error(`🚨 CRITICAL BUG (BLOB): Backend returned only 1 beat for what should be a longer audio file!`);
        console.error(`🚨 Expected beats for duration ${result.duration}s at ${result.BPM || result.bpm || 120} BPM: ~${Math.round((result.duration || 0) * (result.BPM || result.bpm || 120) / 60)}`);
        console.error(`🚨 Actual beats returned: ${result.beats.length}`);
        console.error(`🚨 Beat data:`, result.beats);
      } else {
        console.log(`✅ Vercel Blob beat detection completed successfully - ${result.beats.length} beats detected`);
      }
    }

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
