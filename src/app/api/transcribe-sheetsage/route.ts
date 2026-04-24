import { NextRequest, NextResponse } from 'next/server';
import { getSheetSageApiUrl } from '@/config/serverBackend';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import type { SheetSageResult } from '@/types/sheetSage';
import { setDocumentWithAdminAccess } from '@/services/firebase/firestoreAdminService';
import { validateOffloadUrl } from '@/utils/offloadValidation';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';
import { verifyAppCheckRequest } from '@/utils/serverAppCheck';

export const maxDuration = 300;

const DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_SHEETSAGE_HEALTH_TIMEOUT_MS = 20 * 1000;
const parsedSheetSageBackendTimeoutMs = Number(
  process.env.SHEETSAGE_BACKEND_TIMEOUT_MS || DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS,
);
const SHEETSAGE_BACKEND_TIMEOUT_MS = (
  Number.isFinite(parsedSheetSageBackendTimeoutMs)
    && parsedSheetSageBackendTimeoutMs > 0
)
  ? Math.floor(parsedSheetSageBackendTimeoutMs)
  : DEFAULT_SHEETSAGE_BACKEND_TIMEOUT_MS;

function buildBackendUnavailableMessage(message: string): string {
  if (message.toLowerCase().includes('required upstream assets') || message.toLowerCase().includes('asset host')) {
    return 'Sheet Sage backend unavailable: missing upstream assets.';
  }

  return message;
}

function isValidVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function shouldDeleteOffloadAfterProcessing(formData: FormData): boolean {
  const raw = formData.get('delete_offload') ?? formData.get('delete_blob');
  if (typeof raw !== 'string') return true;

  const normalized = raw.trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'no');
}

async function resolveAudioFileFromRequest(formData: FormData): Promise<File> {
  const file = formData.get('file');
  if (file instanceof File) {
    return file;
  }

  const offloadUrlEntry = formData.get('offload_url') ?? formData.get('blob_url');
  if (typeof offloadUrlEntry !== 'string') {
    throw new Error('No audio file provided');
  }

  const offloadUrl = validateOffloadUrl(offloadUrlEntry);
  const shouldDeleteOffload = shouldDeleteOffloadAfterProcessing(formData);

  const offloadResponse = await fetch(offloadUrl);
  if (!offloadResponse.ok) {
    throw new Error(`Failed to download audio from offload storage: ${offloadResponse.status} ${offloadResponse.statusText}`);
  }

  const audioBuffer = await offloadResponse.arrayBuffer();
  const contentType = offloadResponse.headers.get('content-type') || 'audio/mpeg';
  const audioBlob = new Blob([audioBuffer], { type: contentType });

  const urlParts = offloadUrl.split('/');
  const fileName = urlParts[urlParts.length - 1] || 'audio-upload';

  if (shouldDeleteOffload) {
    try {
      const deletion = await deleteOffloadUrl(offloadUrl);
      console.log(`🗑️ [SheetSage] Offload file deleted after download (provider=${deletion.provider}, alreadyDeleted=${deletion.alreadyDeleted === true}): ${offloadUrl.substring(0, 80)}...`);
    } catch (error) {
      console.warn('⚠️ [SheetSage] Non-critical: failed to delete offload file after download:', error);
    }
  } else {
    console.log('ℹ️ [SheetSage] Skipping offload file deletion after download (delete_offload=0)');
  }

  return new File([audioBlob], fileName, { type: contentType });
}

function normalizeMelodyResultForCache(videoId: string, result: SheetSageResult) {
  const noteEvents = Array.isArray(result.noteEvents)
    ? [...result.noteEvents]
      .filter((note) => (
        typeof note?.onset === 'number'
        && Number.isFinite(note.onset)
        && typeof note?.offset === 'number'
        && Number.isFinite(note.offset)
        && typeof note?.pitch === 'number'
        && Number.isFinite(note.pitch)
        && typeof note?.velocity === 'number'
        && Number.isFinite(note.velocity)
      ))
      .sort((left, right) => (
        left.onset - right.onset
        || left.pitch - right.pitch
        || left.offset - right.offset
      ))
      .map((note) => ({
        onset: note.onset,
        offset: Math.max(note.offset, note.onset),
        pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
        velocity: Math.max(0, Math.min(127, Math.round(note.velocity))),
      }))
    : [];

  return {
    ...result,
    source: 'sheetsage' as const,
    videoId,
    model: 'sheetsage-v0.2-handcrafted-melody-transformer',
    createdAt: new Date().toISOString(),
    noteEvents,
    noteEventCount: noteEvents.length,
    beatTimes: Array.isArray(result.beatTimes)
      ? result.beatTimes.filter((beatTime) => typeof beatTime === 'number' && Number.isFinite(beatTime))
      : [],
    beatsPerMeasure:
      typeof result.beatsPerMeasure === 'number' && Number.isFinite(result.beatsPerMeasure) && result.beatsPerMeasure > 0
        ? result.beatsPerMeasure
        : 4,
    tempoBpm:
      typeof result.tempoBpm === 'number' && Number.isFinite(result.tempoBpm) && result.tempoBpm > 0
        ? result.tempoBpm
        : 120,
  };
}

export async function POST(request: NextRequest) {
  const backendUrl = getSheetSageApiUrl();

  try {
    // Verify App Check token
    const appCheck = await verifyAppCheckRequest(request);
    if (!appCheck.ok) {
      return NextResponse.json({ success: false, error: appCheck.error }, { status: appCheck.status || 403 });
    }

    const formData = await request.formData();
    const videoIdField = formData.get('videoId');
    const videoId = typeof videoIdField === 'string' ? videoIdField.trim() : '';

    let file: File;
    try {
      file = await resolveAudioFileFromRequest(formData);
    } catch (resolveError) {
      return NextResponse.json(
        {
          success: false,
          error: resolveError instanceof Error ? resolveError.message : 'No audio file provided',
        },
        { status: 400 },
      );
    }

    const backendFormData = new FormData();
    backendFormData.append('file', file, file.name || 'audio-upload');

    const response = await fetch(`${backendUrl}/transcribe`, {
      method: 'POST',
      body: backendFormData,
      signal: createSafeTimeoutSignal(SHEETSAGE_BACKEND_TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error || `Sheet Sage backend failed: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    if (videoId && isValidVideoId(videoId) && payload?.data) {
      try {
        const sanitizedData = normalizeMelodyResultForCache(videoId, payload.data as SheetSageResult);
        await setDocumentWithAdminAccess('melody', videoId, sanitizedData);
        console.log(`🎻 [API] Cached Sheet Sage melody for ${videoId} (${sanitizedData.noteEventCount} notes)`);
      } catch (cacheError) {
        console.error('❌ [API] Failed to persist Sheet Sage melody cache:', cacheError);
      }
    }

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Sheet Sage error';
    const isFetchFailure = message.toLowerCase().includes('fetch failed');
    const isTimeoutFailure = message.toLowerCase().includes('aborted')
      || message.toLowerCase().includes('timeout');

    return NextResponse.json(
      {
        success: false,
        error: isFetchFailure
          ? 'Could not reach the Sheet Sage backend. Please try again later or contact support if the issue persists.'
          : isTimeoutFailure
            ? `Sheet Sage exceeded the ${Math.round(SHEETSAGE_BACKEND_TIMEOUT_MS / 1000)}s proxy timeout. Increase SHEETSAGE_BACKEND_TIMEOUT_MS or try a shorter audio segment.`
            : message,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const healthRequested = request.nextUrl.searchParams.get('health');
  if (healthRequested === '1' || healthRequested === 'true') {
    const backendUrl = getSheetSageApiUrl();

    try {
      const response = await fetch(`${backendUrl}/health?warmup=true`, {
        method: 'GET',
        signal: createSafeTimeoutSignal(DEFAULT_SHEETSAGE_HEALTH_TIMEOUT_MS),
      });

      const payload = await response.json().catch(() => null);
      const backendError = payload?.error || `Sheet Sage backend health check failed: ${response.status} ${response.statusText}`;
      const normalizedError = buildBackendUnavailableMessage(backendError);

      return NextResponse.json(
        {
          success: response.ok,
          available: response.ok && payload?.assetUnavailable !== true,
          initialized: Boolean(payload?.initialized),
          assetUnavailable: Boolean(payload?.assetUnavailable),
          error: response.ok ? null : normalizedError,
          statusCode: response.status,
          runtime: payload?.runtime ?? null,
        },
        { status: 200 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Sheet Sage health error';
      const isFetchFailure = message.toLowerCase().includes('fetch failed');
      const isTimeoutFailure = message.toLowerCase().includes('aborted')
        || message.toLowerCase().includes('timeout');

      return NextResponse.json(
        {
          success: false,
          available: false,
          assetUnavailable: false,
          error: isFetchFailure
            ? 'Could not reach the Sheet Sage backend.'
            : isTimeoutFailure
              ? 'Timed out while checking Sheet Sage backend readiness.'
              : message,
          statusCode: 503,
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    name: 'Sheet Sage API',
    description: 'Proxies uploaded audio to the standalone Sheet Sage melody backend.',
    endpoint: 'POST /api/transcribe-sheetsage',
  });
}
