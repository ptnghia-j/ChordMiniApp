import { BROWSER_YTDLP_MAX_FINAL_BYTES } from '@/services/audio/browserYtDlpConfig';

export const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
export const BROWSER_YTDLP_CANDIDATE_PATH_PATTERN =
  /^audio-candidates\/([^/]+)\/([a-zA-Z0-9_-]{11})\/([a-f0-9]{64})\.mp3$/;

export interface BrowserAudioValidationInput {
  buffer: Buffer;
  contentType?: string;
  expectedVideoId: string;
  expectedSha256: string;
  expectedFileSize?: number;
}

export interface BrowserAudioValidationResult {
  duration: number;
  bitrate?: number;
}

export function parseBrowserYtDlpCandidatePath(candidatePath: string) {
  const match = candidatePath.match(BROWSER_YTDLP_CANDIDATE_PATH_PATTERN);
  if (!match) {
    return null;
  }

  return {
    uid: match[1],
    videoId: match[2],
    sha256: match[3],
  };
}

export function isMp3Like(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }

  const startsWithId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const startsWithMp3Frame = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;

  return startsWithId3 || startsWithMp3Frame;
}

export async function sha256Hex(buffer: Buffer): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(buffer).digest('hex');
}

export async function validateBrowserAudioCandidate(
  input: BrowserAudioValidationInput
): Promise<BrowserAudioValidationResult> {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(input.expectedVideoId)) {
    throw new Error('Invalid YouTube video ID.');
  }

  if (!input.contentType || (input.contentType !== 'audio/mpeg' && input.contentType !== 'audio/mp3')) {
    throw new Error(`Unsupported audio content type: ${input.contentType}`);
  }

  if (input.buffer.byteLength === 0) {
    throw new Error('Uploaded audio candidate is empty.');
  }

  if (input.buffer.byteLength > BROWSER_YTDLP_MAX_FINAL_BYTES) {
    throw new Error('Uploaded audio candidate exceeds the 50MB cache limit.');
  }

  if (typeof input.expectedFileSize === 'number' && input.expectedFileSize !== input.buffer.byteLength) {
    throw new Error('Uploaded audio candidate size does not match the client report.');
  }

  const actualSha256 = await sha256Hex(input.buffer);
  if (actualSha256 !== input.expectedSha256) {
    throw new Error('Uploaded audio candidate hash does not match the client report.');
  }

  if (!isMp3Like(input.buffer)) {
    throw new Error('Uploaded audio candidate is not an MP3 file.');
  }

  const { parseBuffer } = await import('music-metadata');
  const metadata = await parseBuffer(input.buffer, 'audio/mpeg', { duration: true });
  const duration = metadata.format.duration || 0;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Uploaded audio candidate does not contain a valid audio duration.');
  }

  return {
    duration,
    bitrate: metadata.format.bitrate,
  };
}
