import type { SheetSageResult } from '@/types/sheetSage';
import { offloadUploadService } from '@/services/storage/offloadUploadService';
import { getCachedSheetSageMelody } from '@/services/sheetsage/sheetSageCacheClient';
import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';
import { isLocalBackend } from '@/utils/backendConfig';
import { isFirebaseStorageUrl } from '@/utils/urlValidationUtils';
import { getAppCheckTokenForApi } from '@/config/firebase';

const SHEETSAGE_CACHE_RECOVERY_ATTEMPTS = 30;
const SHEETSAGE_CACHE_RECOVERY_DELAY_MS = 3000;

function buildSourceFilename(sourceName: string | undefined | null): string {
  const baseName = (sourceName || 'sheetsage-input').replace(/[^\w.-]+/g, '_');
  return baseName.endsWith('.mp3') || baseName.endsWith('.wav') || baseName.endsWith('.flac') || baseName.endsWith('.ogg') || baseName.endsWith('.m4a')
    ? baseName
    : `${baseName}.mp3`;
}

async function buildSheetSageRequestHeaders(contentType?: string): Promise<HeadersInit> {
  const appCheckToken = await getAppCheckTokenForApi();
  const headers: HeadersInit = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken;
  }
  return headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecoverableSheetSageDisconnect(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('network connection was lost')
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
    || message.includes('terminated')
    || message.includes('aborted')
    || message.includes('timeout')
  );
}

async function recoverSheetSageResultFromCache(
  videoId: string | null | undefined,
  originalError: unknown,
): Promise<SheetSageResult> {
  const normalizedVideoId = videoId?.trim();

  if (!normalizedVideoId || !isRecoverableSheetSageDisconnect(originalError)) {
    throw originalError;
  }

  let lastCacheError: unknown = null;

  for (let attempt = 0; attempt < SHEETSAGE_CACHE_RECOVERY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await delay(SHEETSAGE_CACHE_RECOVERY_DELAY_MS);
    }

    try {
      const cachedResult = await getCachedSheetSageMelody(normalizedVideoId);
      if (cachedResult) {
        return cachedResult;
      }
    } catch (cacheError) {
      lastCacheError = cacheError;
    }
  }

  if (lastCacheError) {
    console.warn('Sheet Sage cache recovery did not find a completed result:', lastCacheError);
  }

  throw originalError;
}

export async function resolveSheetSageAudioFile(
  audioFile: File | null | undefined,
  audioUrl: string | null | undefined,
  videoId?: string | null,
): Promise<File> {
  if (audioFile) {
    return audioFile;
  }

  if (!audioUrl) {
    throw new Error('No audio source available for Sheet Sage');
  }

  const fetchUrl = audioUrl.startsWith('blob:')
    ? audioUrl
    : buildAudioProxyUrl(audioUrl, { videoId });

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio source: ${response.status} ${response.statusText}`);
  }

  const audioBlob = await response.blob();
  const filename = buildSourceFilename(audioUrl.split('/').pop());
  return new File([audioBlob], filename, {
    type: audioBlob.type || 'audio/mpeg',
  });
}

export async function requestSheetSageTranscription(
  audioFile: File | null | undefined,
  audioUrl: string | null | undefined,
  videoId?: string | null,
): Promise<SheetSageResult> {
  try {
    const shouldUseDirectFirebaseUrl = (
      !audioFile
      && typeof audioUrl === 'string'
      && isFirebaseStorageUrl(audioUrl)
      && !isLocalBackend()
    );

    if (shouldUseDirectFirebaseUrl) {
      const response = await fetch('/api/transcribe-sheetsage', {
        method: 'POST',
        headers: await buildSheetSageRequestHeaders('application/json'),
        body: JSON.stringify({
          audioUrl,
          videoId: videoId || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.data) {
        throw new Error(payload?.error || 'Sheet Sage transcription failed');
      }

      return payload.data as SheetSageResult;
    }

    const sourceFile = await resolveSheetSageAudioFile(audioFile, audioUrl, videoId);

    if (offloadUploadService.shouldUseOffloadUpload(sourceFile.size)) {
      const offloadResult = await offloadUploadService.transcribeSheetSageOffloadUpload(
        sourceFile,
        videoId || undefined,
      );

      if (!offloadResult.success || !offloadResult.data) {
        throw new Error(offloadResult.error || 'Sheet Sage transcription failed');
      }

      return offloadResult.data as SheetSageResult;
    }

    const formData = new FormData();
    formData.append('file', sourceFile, sourceFile.name);
    if (videoId) {
      formData.append('videoId', videoId);
    }

    const response = await fetch('/api/transcribe-sheetsage', {
      method: 'POST',
      headers: await buildSheetSageRequestHeaders(),
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.data) {
      throw new Error(payload?.error || 'Sheet Sage transcription failed');
    }

    return payload.data as SheetSageResult;
  } catch (error) {
    return recoverSheetSageResultFromCache(videoId, error);
  }
}
