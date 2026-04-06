import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { audioMetadataService } from '@/services/audio/audioMetadataService';
import { validateBlobUrl } from '@/utils/blobValidation';
import { getPythonApiUrl } from '@/config/serverBackend';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';

/**
 * API route to detect beats using offload storage URL
 * This bypasses Vercel's 4.5MB limit by processing files already uploaded to offload storage
 */

// Configure Vercel function timeout (max 300 seconds for Vercel Hobby/Pro plan)
export const maxDuration = 300; // 5 minutes for ML processing

/**
 * Calculate dynamic timeout based on audio duration
 * Uses 75% of audio duration + base processing time
 */
function calculateProcessingTimeout(audioDuration: number): number {
  // Base timeout for model loading and setup (30 seconds)
  const baseTimeout = 30000;

  // 75% of audio duration for processing (in milliseconds)
  const processingTime = Math.ceil(audioDuration * 0.75 * 1000);

  // Minimum timeout of 2 minutes, maximum of 5 minutes (to stay within Vercel 300s limit)
  const minTimeout = 120000; // 2 minutes
  const maxTimeout = 290000; // ~5 minutes (slightly less than maxDuration of 300s)

  const calculatedTimeout = baseTimeout + processingTime;
  const finalTimeout = Math.max(minTimeout, Math.min(maxTimeout, calculatedTimeout));

  console.log(`⏱️ Blob timeout calculation: duration=${audioDuration}s, calculated=${calculatedTimeout}ms, final=${finalTimeout}ms`);

  return finalTimeout;
}

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

    console.log(`🥁 Processing offload-storage beat detection request`);

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

    // Extract filename from blob URL or use default
    const urlParts = blobUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'audio.wav';

    console.log(`📁 Downloaded ${audioBuffer.byteLength} bytes, sending to Python backend as ${filename}`);

    // Get audio duration for timeout calculation from the in-memory buffer
    // (must happen before blob deletion since the URL would no longer be valid)
    let audioDuration = 180; // Default 3 minutes
    try {
      console.log(`⏱️ Extracting audio duration for timeout calculation...`);
      const metadata = await audioMetadataService.extractMetadataFromBlob(audioBlob);
      if (metadata && metadata.duration > 0) {
        audioDuration = metadata.duration;
        console.log(`⏱️ Audio duration detected: ${audioDuration} seconds`);
      } else {
        console.warn(`⚠️ Could not detect audio duration, using default: ${audioDuration} seconds`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to get audio duration, using default: ${error}`);
    }

    // Cleanup: delete the blob now that we have the data in memory and metadata
    // extraction is complete. When delete_blob=0 this route keeps the blob for
    // another processor and external cleanup.
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

    // Calculate dynamic timeout based on audio duration
    const timeoutValue = calculateProcessingTimeout(audioDuration);

    // Create new FormData for the Python backend
    const backendFormData = new FormData();
    backendFormData.append('file', audioBlob, filename);

    // Add detector parameter if provided
    const detector = (formData.get('detector') as string) || 'madmom';
    backendFormData.append('detector', detector);

    // Forward 'force' parameter if provided (used to allow Beat-Transformer on larger files)
    const force = formData.get('force') as string | null;
    if (force) backendFormData.append('force', force);

    console.log(`🔍 Sending to Python backend: ${backendUrl}/api/detect-beats (timeout: ${timeoutValue}ms)`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Helper to call backend
    async function callBackend(det: string) {
      const fd = new FormData();
      for (const [k, v] of backendFormData.entries()) {
        if (k === 'detector') continue;
        if (typeof v === 'string') {
          fd.append(k, v);
        } else {
          // v is File (extends Blob) or Blob
          const fileVal = v as File;
          // Preserve filename if available
          const name = typeof fileVal.name === 'string' ? fileVal.name : undefined;
          if (name) {
            fd.append(k, fileVal, name);
          } else {
            fd.append(k, fileVal);
          }
        }
      }
      fd.append('detector', det);
      return fetch(`${backendUrl}/api/detect-beats`, {
        method: 'POST',
        body: fd,
        headers: {},
        signal: abortSignal,
      });
    }

    // First attempt with requested detector
    let response = await callBackend(detector);

    // On specific Beat-Transformer load errors, retry with madmom as fallback
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend error: ${response.status} ${response.statusText} - ${errorText}`);

      const isCheckpointError = errorText.includes("Can't load save_path") || errorText.includes('Beat Transformer is not available');
      if (detector === 'beat-transformer' && isCheckpointError) {
        console.warn('⚠️ Beat-Transformer checkpoint unavailable. Retrying with madmom...');
        response = await callBackend('madmom');
      }

      if (!response.ok) {
        const err2 = await response.text();
        return NextResponse.json(
          {
            error: `Backend processing failed: ${response.status} ${response.statusText}`,
            details: err2
          },
          { status: response.status }
        );
      }
    }

    const result = await response.json();
    console.log(`✅ Offload-storage beat detection completed successfully`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Offload-storage beat detection API error:', error);

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
      { error: 'Unknown error occurred during offload-storage beat detection' },
      { status: 500 }
    );
  }
}
