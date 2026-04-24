import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { validateOffloadUrl } from '@/utils/blobValidation';
import { getPythonApiUrl } from '@/config/serverBackend';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';
import { verifyAppCheckRequest } from '@/utils/serverAppCheck';

export const maxDuration = 300;

function calculateProcessingTimeout(audioDuration: number): number {
  const baseTimeout = 30000;
  const processingTime = Math.ceil(audioDuration * 0.75 * 1000);
  const minTimeout = 120000;
  const maxTimeout = 290000;
  return Math.max(minTimeout, Math.min(maxTimeout, baseTimeout + processingTime));
}

function parseRequestedAudioDuration(formData: FormData): number | null {
  const raw = formData.get('audio_duration');
  if (typeof raw !== 'string') return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function shouldDeleteOffloadAfterProcessing(formData: FormData): boolean {
  const raw = formData.get('delete_offload') ?? formData.get('delete_blob');
  if (typeof raw !== 'string') return true;
  const normalized = raw.trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'no');
}

function getRequestedOffloadUrl(formData: FormData): string | null {
  const value = formData.get('offload_url') ?? formData.get('blob_url');
  return typeof value === 'string' ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    // Verify App Check token
    const appCheck = await verifyAppCheckRequest(request);
    if (!appCheck.ok) {
      return NextResponse.json({ success: false, error: appCheck.error }, { status: appCheck.status || 403 });
    }

    const backendUrl = getPythonApiUrl();
    const formData = await request.formData();
    const shouldDeleteOffload = shouldDeleteOffloadAfterProcessing(formData);
    const rawOffloadUrl = getRequestedOffloadUrl(formData);

    if (!rawOffloadUrl) {
      return NextResponse.json({ error: 'No offload storage URL provided' }, { status: 400 });
    }

    let offloadUrl: string;
    try {
      offloadUrl = validateOffloadUrl(rawOffloadUrl);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }

    const requestedAudioDuration = parseRequestedAudioDuration(formData) ?? 180;
    const timeoutValue = calculateProcessingTimeout(requestedAudioDuration);
    const detector = (formData.get('detector') as string) || 'madmom';
    const force = formData.get('force') as string | null;
    const abortSignal = createSafeTimeoutSignal(timeoutValue);
    let shouldAttemptDeletion = false;

    async function callBackend(requestedDetector: string) {
      const backendFormData = new FormData();
      backendFormData.append('firebase_url', offloadUrl);
      backendFormData.append('detector', requestedDetector);
      if (force) backendFormData.append('force', force);

      const response = await fetch(`${backendUrl}/api/detect-beats-firebase`, {
        method: 'POST',
        body: backendFormData,
        signal: abortSignal,
      });
      shouldAttemptDeletion = true;
      return response;
    }

    let response = await callBackend(detector);
    if (!response.ok) {
      const errorText = await response.text();
      const isCheckpointError = errorText.includes("Can't load save_path") || errorText.includes('Beat Transformer is not available');
      if (detector === 'beat-transformer' && isCheckpointError) {
        response = await callBackend('madmom');
      }

      if (!response.ok) {
        const details = await response.text();
        return NextResponse.json(
          { error: `Backend processing failed: ${response.status} ${response.statusText}`, details },
          { status: response.status },
        );
      }
    }

    const result = await response.json();

    if (shouldDeleteOffload && shouldAttemptDeletion) {
      try {
        await deleteOffloadUrl(offloadUrl);
      } catch (err) {
        console.warn('⚠️ Non-critical: failed to delete offload file after backend beat processing:', err);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Offload beat detection API error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Beat detection timed out. The file may be too large or complex for processing.' },
        { status: 408 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred during offload beat detection' },
      { status: 500 },
    );
  }
}