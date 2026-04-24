import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { validateOffloadUrl } from '@/utils/blobValidation';
import { getPythonApiUrl } from '@/config/serverBackend';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';
import { verifyAppCheckRequest } from '@/utils/serverAppCheck';

export const maxDuration = 300;

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

    const model = formData.get('model') as string | null;
    const detector = (formData.get('detector') as string | null) || model || null;
    const chordDict = (model === 'btc-sl' || model === 'btc-pl') ? 'large_voca' : 'full';
    const backendFormData = new FormData();
    backendFormData.append('firebase_url', offloadUrl);
    if (model) backendFormData.append('model', model);
    if (detector) backendFormData.append('detector', detector);
    backendFormData.append('chord_dict', chordDict);

    const response = await fetch(`${backendUrl}/api/recognize-chords-firebase`, {
      method: 'POST',
      body: backendFormData,
      signal: createSafeTimeoutSignal(800000),
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { error: `Backend processing failed: ${response.status} ${response.statusText}`, details },
        { status: response.status },
      );
    }

    const result = await response.json();
    if (shouldDeleteOffload) {
      try {
        await deleteOffloadUrl(offloadUrl);
      } catch (err) {
        console.warn('⚠️ Non-critical: failed to delete offload file after backend chord processing:', err);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Offload chord recognition API error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Chord recognition timed out. The file may be too large or complex for processing.' },
        { status: 408 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred during offload chord recognition' },
      { status: 500 },
    );
  }
}