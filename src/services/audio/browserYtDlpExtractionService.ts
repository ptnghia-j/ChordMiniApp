import { getAppCheckTokenForApi, getCurrentAuthUser, ensureAuthReady, getStorageInstance } from '@/config/firebase';
import {
  BROWSER_YTDLP_MAX_FINAL_BYTES,
  BROWSER_YTDLP_OUTPUT_FORMAT,
  BROWSER_YTDLP_WORKER_PATH,
  getBrowserYtDlpFfmpegArgs,
} from '@/services/audio/browserYtDlpConfig';

export interface BrowserYtDlpMetadata {
  videoId: string;
  title?: string | null;
  duration?: string | number | null;
  channelTitle?: string | null;
  thumbnail?: string | null;
}

export interface BrowserYtDlpExtractionResult {
  success: true;
  audioUrl: string;
  title: string;
  duration: number;
  fileSize: number;
  fromCache: false;
  isStreamUrl: false;
  method: 'browser-ytdlp' | 'native-ytdlp-fallback';
}

interface WorkerExtractedData {
  streamUrl: string;
  streamHeaders?: Record<string, string>;
  ext?: string;
  title?: string;
  duration?: number;
}

type ProgressStage = 'initializing' | 'extracting' | 'downloading' | 'converting' | 'uploading' | 'finalizing';

interface BrowserYtDlpOptions {
  abortSignal?: AbortSignal;
  onProgress?: (stage: ProgressStage, message: string, progress?: number) => void;
}

let ffmpegInstancePromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null;

function assertBrowserRuntime(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    throw new Error('Browser yt-dlp extraction can only run in a browser.');
  }
}

function sanitizeInputExtension(ext: string | undefined): string {
  const normalized = (ext || 'm4a').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return normalized || 'm4a';
}

async function waitForWorkerExtraction(
  videoUrl: string,
  options: BrowserYtDlpOptions
): Promise<WorkerExtractedData> {
  assertBrowserRuntime();

  return new Promise((resolve, reject) => {
    const worker = new Worker(BROWSER_YTDLP_WORKER_PATH);
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      options.abortSignal?.removeEventListener('abort', abortHandler);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const abortHandler = () => fail(new DOMException('Browser extraction aborted', 'AbortError'));
    options.abortSignal?.addEventListener('abort', abortHandler, { once: true });

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; message?: string; data?: WorkerExtractedData };

      if (data.type === 'status' && data.message) {
        options.onProgress?.('extracting', data.message);
        return;
      }

      if (data.type === 'extracted' && data.data?.streamUrl) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(data.data);
        return;
      }

      if (data.type === 'error') {
        fail(new Error(data.message || 'Browser yt-dlp extraction failed'));
      }
    };

    worker.onerror = (event) => {
      fail(new Error(event.message || 'Browser yt-dlp worker failed'));
    };

    worker.postMessage({ type: 'extract', url: videoUrl });
  });
}

async function fetchAudioBytesViaProxy(
  streamUrl: string,
  headers: Record<string, string> | undefined,
  abortSignal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch('/api/youtube-media-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: streamUrl, headers: headers || {} }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not download YouTube audio stream (${response.status}): ${detail || response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function getFfmpegInstance(onProgress?: BrowserYtDlpOptions['onProgress']) {
  if (ffmpegInstancePromise) {
    return ffmpegInstancePromise;
  }

  ffmpegInstancePromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);

    const ffmpeg = new FFmpeg();
    const baseUrl = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.('converting', 'Converting audio to medium-quality MP3...', Math.round((progress || 0) * 100));
    });

    await ffmpeg.load({
      classWorkerURL: `${window.location.origin}/api/ffmpeg-worker/worker.js`,
      coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  })();

  return ffmpegInstancePromise;
}

async function convertToMediumMp3(
  inputBytes: Uint8Array,
  inputExt: string,
  options: BrowserYtDlpOptions
): Promise<Uint8Array<ArrayBuffer>> {
  options.onProgress?.('converting', 'Converting audio to medium-quality MP3...');

  const ffmpeg = await getFfmpegInstance(options.onProgress);
  const inputName = `input.${sanitizeInputExtension(inputExt)}`;
  const outputName = `output-${Date.now()}.${BROWSER_YTDLP_OUTPUT_FORMAT}`;

  await ffmpeg.writeFile(inputName, inputBytes);
  const exitCode = await ffmpeg.exec(getBrowserYtDlpFfmpegArgs(inputName, outputName));
  if (exitCode !== 0) {
    throw new Error(`ffmpeg conversion failed with exit code ${exitCode}`);
  }

  const output = await ffmpeg.readFile(outputName);
  await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);

  if (typeof output === 'string') {
    throw new Error('ffmpeg returned text output instead of MP3 bytes.');
  }

  const bytes = new Uint8Array(output.byteLength);
  bytes.set(output);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function uploadCandidate(videoId: string, mp3Bytes: Uint8Array<ArrayBuffer>, hash: string): Promise<{ candidatePath: string; idToken: string }> {
  const { ref, uploadBytesResumable } = await import('firebase/storage');

  const authReady = await ensureAuthReady(15000);
  const user = getCurrentAuthUser();
  if (!authReady || !user) {
    throw new Error('Firebase authentication is required before uploading extracted audio.');
  }

  const idToken = await user.getIdToken();
  const storage = await getStorageInstance();
  const candidatePath = `audio-candidates/${user.uid}/${videoId}/${hash}.mp3`;
  const storageRef = ref(storage, candidatePath);

  const blob = new Blob([mp3Bytes], { type: 'audio/mpeg' });
  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType: 'audio/mpeg',
    customMetadata: {
      source: 'browser-ytdlp',
      videoId,
      sha256: hash,
      bitrate: '192k',
    },
  });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on('state_changed', undefined, reject, () => resolve());
  });

  return { candidatePath, idToken };
}

async function finalizeCandidate(params: {
  metadata: BrowserYtDlpMetadata;
  candidatePath: string;
  sha256: string;
  fileSize: number;
  idToken: string;
}): Promise<BrowserYtDlpExtractionResult> {
  const appCheckToken = await getAppCheckTokenForApi();
  const response = await fetch('/api/audio/finalize-browser-extraction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
      ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
    },
    body: JSON.stringify({
      videoId: params.metadata.videoId,
      title: params.metadata.title,
      duration: params.metadata.duration,
      channelTitle: params.metadata.channelTitle,
      thumbnail: params.metadata.thumbnail,
      candidatePath: params.candidatePath,
      sha256: params.sha256,
      fileSize: params.fileSize,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.audioUrl) {
    throw new Error(data.error || `Audio finalization failed (${response.status})`);
  }

  return {
    success: true,
    audioUrl: data.audioUrl,
    title: data.title || params.metadata.title || `YouTube Video ${params.metadata.videoId}`,
    duration: data.duration || 0,
    fileSize: data.fileSize || params.fileSize,
    fromCache: false,
    isStreamUrl: false,
    method: 'browser-ytdlp',
  };
}

function isYouTubeAccessChallenge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /sign in to confirm|not a bot|failed to extract any player response|login_required|forbidden|youtube audio stream \(403\)/i.test(message);
}

export function shouldUseNativeYtDlpFallback(error: unknown): boolean {
  return isYouTubeAccessChallenge(error);
}

export async function extractAudioWithNativeYtDlpFallback(
  metadata: BrowserYtDlpMetadata,
  options: BrowserYtDlpOptions = {}
): Promise<BrowserYtDlpExtractionResult> {
  assertBrowserRuntime();

  if (!/^[a-zA-Z0-9_-]{11}$/.test(metadata.videoId)) {
    throw new Error(`Invalid YouTube video ID: ${metadata.videoId}`);
  }

  options.onProgress?.('extracting', 'Retrying extraction with native yt-dlp fallback...', 20);

  const authReady = await ensureAuthReady(15000);
  const user = getCurrentAuthUser();
  if (!authReady || !user) {
    throw new Error('Firebase authentication is required before retrying native extraction.');
  }

  const [idToken, appCheckToken] = await Promise.all([
    user.getIdToken(),
    getAppCheckTokenForApi(),
  ]);

  const response = await fetch('/api/audio/native-ytdlp-fallback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
    },
    body: JSON.stringify({
      videoId: metadata.videoId,
      title: metadata.title,
      duration: metadata.duration,
      channelTitle: metadata.channelTitle,
      thumbnail: metadata.thumbnail,
    }),
    signal: options.abortSignal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.audioUrl) {
    throw new Error(data.error || `Native yt-dlp fallback failed (${response.status})`);
  }

  options.onProgress?.('finalizing', 'Audio cached successfully.', 95);

  return {
    success: true,
    audioUrl: data.audioUrl,
    title: data.title || metadata.title || `YouTube Video ${metadata.videoId}`,
    duration: data.duration || 0,
    fileSize: data.fileSize || 0,
    fromCache: false,
    isStreamUrl: false,
    method: 'native-ytdlp-fallback',
  };
}

export async function extractAudioWithBrowserYtDlp(
  metadata: BrowserYtDlpMetadata,
  options: BrowserYtDlpOptions = {}
): Promise<BrowserYtDlpExtractionResult> {
  assertBrowserRuntime();

  if (!/^[a-zA-Z0-9_-]{11}$/.test(metadata.videoId)) {
    throw new Error(`Invalid YouTube video ID: ${metadata.videoId}`);
  }

  const videoUrl = `https://www.youtube.com/watch?v=${metadata.videoId}`;

  options.onProgress?.('initializing', 'Preparing browser audio extraction...');
  const extracted = await waitForWorkerExtraction(videoUrl, options);

  options.onProgress?.('downloading', 'Downloading YouTube audio stream...');
  const sourceBytes = await fetchAudioBytesViaProxy(extracted.streamUrl, extracted.streamHeaders, options.abortSignal);

  const mp3Bytes = await convertToMediumMp3(sourceBytes, extracted.ext || 'm4a', options);
  if (mp3Bytes.byteLength > BROWSER_YTDLP_MAX_FINAL_BYTES) {
    throw new Error('Extracted MP3 is larger than the 50MB Firebase cache limit.');
  }

  options.onProgress?.('uploading', 'Uploading extracted audio for validation...');
  const hash = await sha256Hex(mp3Bytes);
  const { candidatePath, idToken } = await uploadCandidate(metadata.videoId, mp3Bytes, hash);

  options.onProgress?.('finalizing', 'Validating audio before caching...');
  return finalizeCandidate({
    metadata: {
      ...metadata,
      title: metadata.title || extracted.title,
      duration: metadata.duration || extracted.duration,
    },
    candidatePath,
    sha256: hash,
    fileSize: mp3Bytes.byteLength,
    idToken,
  });
}
