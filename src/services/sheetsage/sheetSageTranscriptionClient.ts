import type { SheetSageResult } from '@/types/sheetSage';
import { vercelBlobUploadService } from '@/services/storage/vercelBlobUploadService';

function buildSourceFilename(sourceName: string | undefined | null): string {
  const baseName = (sourceName || 'sheetsage-input').replace(/[^\w.-]+/g, '_');
  return baseName.endsWith('.mp3') || baseName.endsWith('.wav') || baseName.endsWith('.flac') || baseName.endsWith('.ogg') || baseName.endsWith('.m4a')
    ? baseName
    : `${baseName}.mp3`;
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
    : `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}${videoId ? `&videoId=${encodeURIComponent(videoId)}` : ''}`;

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
  const sourceFile = await resolveSheetSageAudioFile(audioFile, audioUrl, videoId);

  if (vercelBlobUploadService.shouldUseBlobUpload(sourceFile.size)) {
    const blobResult = await vercelBlobUploadService.transcribeSheetSageBlobUpload(
      sourceFile,
      videoId || undefined,
    );

    if (!blobResult.success || !blobResult.data) {
      throw new Error(blobResult.error || 'Sheet Sage transcription failed');
    }

    return blobResult.data as SheetSageResult;
  }

  const formData = new FormData();
  formData.append('file', sourceFile, sourceFile.name);
  if (videoId) {
    formData.append('videoId', videoId);
  }

  const response = await fetch('/api/transcribe-sheetsage', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload?.data) {
    throw new Error(payload?.error || 'Sheet Sage transcription failed');
  }

  return payload.data as SheetSageResult;
}
