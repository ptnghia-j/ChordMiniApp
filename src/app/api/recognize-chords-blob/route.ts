import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { validateBlobUrl } from '@/utils/blobValidation';
import { getPythonApiUrl } from '@/config/serverBackend';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';

/**
 * API route to recognize chords using offload storage URL
 * This bypasses Vercel's 4.5MB limit by processing files already uploaded to offload storage
 */

// Configure Vercel function timeout (max 300 seconds for Vercel Hobby/Pro plan)
export const maxDuration = 300; // 5 minutes for ML processing

function shouldDeleteBlobAfterProcessing(formData: FormData): boolean {
  const raw = formData.get('delete_blob');
  if (typeof raw !== 'string') return true;

  const normalized = raw.trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'no');
}

export async function POST(request: NextRequest) {
  try {
    // Get the backend URL
    const backendUrl = getPythonApiUrl();

    console.log(`🎵 Processing offload-storage chord recognition request`);

    // Get the form data from the request
    const formData = await request.formData();
    const shouldDeleteBlob = shouldDeleteBlobAfterProcessing(formData);

    // Validate that we have an offload URL
    const blobUrlEntry = formData.get('blob_url');
    if (blobUrlEntry == null) {
      return NextResponse.json(
        { error: 'No offload storage URL provided' },
        { status: 400 }
      );
    }
    if (typeof blobUrlEntry !== 'string') {
      return NextResponse.json(
        { error: 'Invalid offload storage URL: expected a string form field, but received a file upload' },
        { status: 400 }
      );
    }
    const rawBlobUrl = blobUrlEntry;

    // Strict URL validation — parse and enforce hostname allowlist
    let blobUrl: string;
    try {
      blobUrl = validateBlobUrl(rawBlobUrl);
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 400 }
      );
    }

    console.log(`📁 Downloading audio from offload storage: ${blobUrl.substring(0, 100)}...`);

    // Download the audio file from offload storage
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download audio from offload storage: ${blobResponse.status} ${blobResponse.statusText}` },
        { status: 400 }
      );
    }

    const audioBuffer = await blobResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Cleanup: delete the blob now that we have the data in memory.
    // When delete_blob=0 this route keeps the blob for another processor and
    // external cleanup.
    if (shouldDeleteBlob) {
      try {
        const deletion = await deleteOffloadUrl(blobUrl);
        console.log(`🗑️ Offload file deleted after download (provider=${deletion.provider}, alreadyDeleted=${deletion.alreadyDeleted === true}): ${blobUrl.substring(0, 80)}...`);
      } catch (err) {
        console.warn(`⚠️ Non-critical: failed to delete offload file after download:`, err);
      }
    } else {
      console.log('ℹ️ Skipping offload file deletion after download (delete_blob=0)');
    }

    // Extract filename from blob URL or use default
    const urlParts = blobUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'audio.wav';

    console.log(`📁 Downloaded ${audioBuffer.byteLength} bytes, sending to Python backend as ${filename}`);

    // Create new FormData for the Python backend
    const backendFormData = new FormData();
    backendFormData.append('file', audioBlob, filename);

    // Add model/detector parameters if provided
    const model = formData.get('model') as string | null;
    const detector = (formData.get('detector') as string | null) || model || null;
    if (model) backendFormData.append('model', model);
    if (detector) backendFormData.append('detector', detector);

    // Ensure chord_dict is set because this route forwards directly to Python (skips Next.js logic)
    const chordDict = (model === 'btc-sl' || model === 'btc-pl') ? 'large_voca' : 'full';
    backendFormData.append('chord_dict', chordDict);

    // Create a safe timeout signal that works across environments
    const timeoutValue = 800000; // 13+ minutes timeout to match backend
    // // console.log(`🔍 Sending to Python backend: ${backendUrl}/api/recognize-chords`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Forward the request to the Python backend's regular chord recognition endpoint
    const response = await fetch(`${backendUrl}/api/recognize-chords`, {
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
    console.log(`✅ Offload-storage chord recognition completed successfully`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Offload-storage chord recognition API error:', error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Chord recognition timed out. The file may be too large or complex for processing.' },
          { status: 408 }
        );
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Unknown error occurred during offload-storage chord recognition' },
      { status: 500 }
    );
  }
}
