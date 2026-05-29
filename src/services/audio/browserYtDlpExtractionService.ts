import { getAppCheckTokenForApi, getCurrentAuthUser, ensureAuthReady, getStorageInstance } from '@/config/firebase';
import { loadPublicConfig } from '@/config/publicConfig';
import {
  BROWSER_YTDLP_MAX_FINAL_BYTES,
  BROWSER_YTDLP_OUTPUT_FORMAT,
  BROWSER_YTDLP_WORKER_PATH,
  getBrowserYtDlpFfmpegArgs,
} from '@/services/audio/browserYtDlpConfig';

export class BrowserExtractionQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserExtractionQueueError';
  }
}

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
  method: 'browser-ytdlp' | 'native-ytdlp-fallback' | 'dltkk-temporary-fallback';
}

interface WorkerExtractedData {
  streamUrl: string;
  streamHeaders?: Record<string, string>;
  ext?: string;
  title?: string;
  duration?: number;
}

type ProgressStage = 'initializing' | 'extracting' | 'downloading' | 'converting' | 'uploading' | 'finalizing';
export type BrowserYtDlpQueueStatus = 'queued' | 'active' | 'released' | 'cancelled' | 'expired';

const PROXY_LEASE_HEARTBEAT_INTERVAL_MS = 10_000;

export interface BrowserYtDlpQueueState {
  status: BrowserYtDlpQueueStatus;
  leaseId: string;
  queuePosition: number;
  estimatedWaitSeconds: number;
  retryAfterSeconds?: number;
  leaseExpiresAt?: number | null;
}

interface BrowserYtDlpOptions {
  abortSignal?: AbortSignal;
  onProgress?: (stage: ProgressStage, message: string, progress?: number) => void;
  onQueueState?: (state: BrowserYtDlpQueueState) => void;
}

let ffmpegInstancePromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null;

const PROXY_HEADER_SKIP = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'te',
  'trailer',
  'upgrade',
  'accept-encoding',
  'cookie',
]);

function assertBrowserRuntime(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    throw new Error('Browser yt-dlp extraction can only run in a browser.');
  }
}

function sanitizeInputExtension(ext: string | undefined): string {
  const normalized = (ext || 'm4a').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return normalized || 'm4a';
}

function isExternalProxyUrl(proxyUrl: string): boolean {
  return /^https?:\/\//i.test(proxyUrl);
}

const ULTIMA_PROXY_URL = 'https://ytpultimadownloader.robertpetersonkyle2.workers.dev/';
const DLTKK_DOWNLOAD_URL = 'https://dltkk.to/api/download';

function isUltimaProxy(proxyUrl: string): boolean {
  return proxyUrl.includes('robertpetersonkyle2.workers.dev') || proxyUrl.includes('ultimadownloader.xyz');
}

function isDltkkTemporaryFallbackEnabled(config: Awaited<ReturnType<typeof loadPublicConfig>>): boolean {
  return String(config.NEXT_PUBLIC_ENABLE_DLTKK_TEMP_FALLBACK ?? '1') !== '0';
}

function buildProxyUrl(proxyUrl: string, targetUrl: string): string {
  return `${proxyUrl}${proxyUrl.includes('?') ? '&' : '?'}url=${encodeURIComponent(targetUrl)}`;
}

function buildProxyRequestHeaders(headers: Record<string, string> | undefined, leaseId?: string | null): HeadersInit {
  const proxyHeaders = new Headers();

  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (!value || PROXY_HEADER_SKIP.has(lower)) {
      continue;
    }

    if (lower === 'referer') {
      proxyHeaders.set('X-Override-Referer', value);
    } else if (lower === 'origin') {
      proxyHeaders.set('X-Override-Origin', value);
    } else if (lower === 'user-agent') {
      proxyHeaders.set('X-Override-User-Agent', value);
    } else if (lower === 'range') {
      proxyHeaders.set('X-Override-Range', value);
    } else {
      proxyHeaders.set(key, value);
    }
  }

  proxyHeaders.set('X-Skip-YouTube-Auth', '1');
  if (leaseId) {
    proxyHeaders.set('X-YouTube-Proxy-Lease', leaseId);
  }
  return proxyHeaders;
}

function buildMinimalProxyRequestHeaders(leaseId?: string | null): HeadersInit {
  const headers = new Headers();
  headers.set('X-Skip-YouTube-Auth', '1');
  if (leaseId) {
    headers.set('X-YouTube-Proxy-Lease', leaseId);
  }
  return headers;
}

async function getProxyErrorDetail(response: Response): Promise<string> {
  const retryAfter = response.headers.get('Retry-After') || response.headers.get('X-YouTube-Proxy-Retry-After');
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null) as {
      error?: string;
      message?: string;
      retryAfterSeconds?: number;
    } | null;

    if (data?.error === 'youtube_proxy_rate_limited') {
      const waitSeconds = data.retryAfterSeconds || Number(retryAfter || 0) || undefined;
      return waitSeconds
        ? `YouTube temporarily rate-limited the extraction proxy. Please retry in about ${Math.ceil(waitSeconds / 60)} minute(s).`
        : 'YouTube temporarily rate-limited the extraction proxy. Please retry later.';
    }

    if (data?.error === 'youtube_proxy_client_rate_limited') {
      return data.message || 'Too many extraction attempts. Please wait a moment and try again.';
    }

    if (data?.message || data?.error) {
      return data.message || data.error || response.statusText;
    }
  }

  const detail = await response.text().catch(() => '');
  if (response.status === 429) {
    return retryAfter
      ? `YouTube temporarily rate-limited the extraction proxy. Please retry in about ${Math.ceil(Number(retryAfter) / 60)} minute(s).`
      : 'YouTube temporarily rate-limited the extraction proxy. Please retry later.';
  }

  return detail || response.statusText;
}

function createClientRequestId(videoId: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${videoId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeQueueState(data: unknown): BrowserYtDlpQueueState {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    status: typeof record.status === 'string' ? record.status as BrowserYtDlpQueueStatus : 'expired',
    leaseId: String(record.leaseId || ''),
    queuePosition: Number(record.queuePosition || 0),
    estimatedWaitSeconds: Number(record.estimatedWaitSeconds || 0),
    retryAfterSeconds: record.retryAfterSeconds ? Number(record.retryAfterSeconds) : undefined,
    leaseExpiresAt: typeof record.leaseExpiresAt === 'number' ? record.leaseExpiresAt : null,
  };
}

function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (abortSignal?.aborted) {
    return Promise.reject(new DOMException('Browser extraction aborted', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => abortSignal?.removeEventListener('abort', abortHandler);
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abortHandler = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new DOMException('Browser extraction aborted', 'AbortError'));
    };
    abortSignal?.addEventListener('abort', abortHandler, { once: true });
  });
}

function getQueueErrorMessage(data: Record<string, unknown>, fallback: string): string {
  if (data.error === 'youtube_proxy_rate_limited') {
    const waitSeconds = Number(data.retryAfterSeconds || 0);
    return waitSeconds > 0
      ? `YouTube temporarily rate-limited the extraction proxy. Please retry in about ${Math.ceil(waitSeconds / 60)} minute(s).`
      : 'YouTube temporarily rate-limited the extraction proxy. Please retry later.';
  }

  return String(data.message || data.error || fallback);
}

async function fetchQueueJson(
  proxyUrl: string,
  path: string,
  init: RequestInit,
): Promise<BrowserYtDlpQueueState> {
  const response = await fetch(`${proxyUrl}${path}`, init);
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(getQueueErrorMessage(data, `YouTube extraction queue request failed (${response.status})`));
  }
  return normalizeQueueState(data);
}

async function acquireProxyLease(
  videoId: string,
  proxyUrl: string,
  options: BrowserYtDlpOptions,
): Promise<BrowserYtDlpQueueState> {
  if (!isExternalProxyUrl(proxyUrl) || isUltimaProxy(proxyUrl)) {
    return {
      status: 'active',
      leaseId: '',
      queuePosition: 0,
      estimatedWaitSeconds: 0,
      retryAfterSeconds: 0,
      leaseExpiresAt: null,
    };
  }

  const clientRequestId = createClientRequestId(videoId);
  let state: BrowserYtDlpQueueState | null = null;

  try {
    state = await fetchQueueJson(proxyUrl, '/queue/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, clientRequestId }),
      signal: options.abortSignal,
    });
    options.onQueueState?.(state);

    while (state.status === 'queued') {
      const waitSeconds = Math.min(10, Math.max(1, state.retryAfterSeconds || state.estimatedWaitSeconds || 3));
      options.onProgress?.(
        'initializing',
        state.queuePosition > 0
          ? `Waiting for extraction queue slot ${state.queuePosition}. Estimated wait: ${Math.ceil((state.estimatedWaitSeconds || waitSeconds) / 60)} minute(s).`
          : 'Waiting for the extraction queue...',
      );
      await delay(waitSeconds * 1000, options.abortSignal);
      state = await fetchQueueJson(proxyUrl, `/queue/status?leaseId=${encodeURIComponent(state.leaseId)}`, {
        method: 'GET',
        signal: options.abortSignal,
      });
      options.onQueueState?.(state);
    }

    if (state.status !== 'active') {
      throw new Error('The YouTube extraction queue lease expired before extraction could start.');
    }

    return state;
  } catch (error) {
    await releaseProxyLease(proxyUrl, state?.leaseId);
    throw error;
  }
}

async function releaseProxyLease(proxyUrl: string, leaseId?: string | null, success = false): Promise<void> {
  if (!leaseId || !isExternalProxyUrl(proxyUrl) || isUltimaProxy(proxyUrl)) {
    return;
  }

  await fetch(`${proxyUrl}/queue/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseId, success }),
    keepalive: true,
  }).catch(() => undefined);
}

async function heartbeatProxyLease(proxyUrl: string, leaseId?: string | null): Promise<BrowserYtDlpQueueState | null> {
  if (!leaseId || !isExternalProxyUrl(proxyUrl) || isUltimaProxy(proxyUrl)) {
    return null;
  }

  return fetchQueueJson(proxyUrl, '/queue/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseId }),
    keepalive: true,
  });
}

function startProxyLeaseHeartbeat(
  proxyUrl: string,
  leaseId: string | null,
  options: BrowserYtDlpOptions,
): () => void {
  if (!leaseId || !isExternalProxyUrl(proxyUrl) || isUltimaProxy(proxyUrl) || options.abortSignal?.aborted) {
    return () => undefined;
  }

  let stopped = false;
  let inFlight = false;
  let intervalId: number | null = null;

  const pulse = () => {
    if (stopped || inFlight || options.abortSignal?.aborted) {
      return;
    }

    inFlight = true;
    void heartbeatProxyLease(proxyUrl, leaseId)
      .then((state) => {
        if (!stopped && state) {
          options.onQueueState?.(state);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };

  const stop = () => {
    stopped = true;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    options.abortSignal?.removeEventListener('abort', stop);
  };

  intervalId = window.setInterval(pulse, PROXY_LEASE_HEARTBEAT_INTERVAL_MS);
  options.abortSignal?.addEventListener('abort', stop, { once: true });
  pulse();

  return stop;
}

async function waitForWorkerExtraction(
  videoUrl: string,
  options: BrowserYtDlpOptions,
  leaseId?: string | null,
  proxyUrlOverride?: string,
): Promise<WorkerExtractedData> {
  assertBrowserRuntime();

  const config = await loadPublicConfig();
  const proxyUrl = proxyUrlOverride || config.NEXT_PUBLIC_YOUTUBE_PROXY_URL || '/api/youtube-media-proxy';

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

    worker.postMessage({ type: 'extract', url: videoUrl, proxyUrl, proxyLease: leaseId || null });
  });
}

async function fetchAudioBytesViaProxy(
  streamUrl: string,
  headers: Record<string, string> | undefined,
  abortSignal?: AbortSignal,
  leaseId?: string | null,
  proxyUrlOverride?: string,
): Promise<Uint8Array> {
  const config = await loadPublicConfig();
  const proxyUrl = proxyUrlOverride || config.NEXT_PUBLIC_YOUTUBE_PROXY_URL || '/api/youtube-media-proxy';
  const proxyHeaders = buildProxyRequestHeaders(headers, leaseId);

  const response = isExternalProxyUrl(proxyUrl)
    ? await (async () => {
      const url = buildProxyUrl(proxyUrl, streamUrl);
      const firstResponse = await fetch(url, {
        method: 'GET',
        headers: proxyHeaders,
        signal: abortSignal,
      });

      if (firstResponse.ok || ![400, 403].includes(firstResponse.status)) {
        return firstResponse;
      }

      // Some Cloudflare proxy workers only understand the target URL and reject
      // replayed override headers. Retry with the minimum header set before
      // surfacing the failure to the user.
      return fetch(url, {
        method: 'GET',
        headers: buildMinimalProxyRequestHeaders(leaseId),
        signal: abortSignal,
      });
    })()
    : await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: streamUrl, headers: headers || {}, method: 'GET' }),
        signal: abortSignal,
      });

  if (!response.ok) {
    const detail = await getProxyErrorDetail(response);
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

async function extractAudioWithDltkkTemporaryFallback(
  metadata: BrowserYtDlpMetadata,
  options: BrowserYtDlpOptions,
): Promise<BrowserYtDlpExtractionResult> {
  options.onProgress?.('downloading', 'Trying temporary audio download fallback...', 35);

  const response = await fetch(DLTKK_DOWNLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${metadata.videoId}`,
      format: BROWSER_YTDLP_OUTPUT_FORMAT,
      platform: 'youtube',
      quality: '480',
    }),
    signal: options.abortSignal,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/audio|mpeg|octet-stream/i.test(contentType)) {
    const detail = contentType.includes('application/json')
      ? ((await response.json().catch(() => null)) as { error?: string } | null)?.error
      : await response.text().catch(() => '');
    throw new Error(detail || `Temporary audio fallback failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const mp3Bytes = new Uint8Array(buffer);
  if (mp3Bytes.byteLength <= 0) {
    throw new Error('Temporary audio fallback returned an empty audio file.');
  }
  if (mp3Bytes.byteLength > BROWSER_YTDLP_MAX_FINAL_BYTES) {
    throw new Error('Temporary audio fallback returned audio larger than the 50MB Firebase cache limit.');
  }

  options.onProgress?.('uploading', 'Uploading fallback audio for validation...', 75);
  const hash = await sha256Hex(mp3Bytes);
  const { candidatePath, idToken } = await uploadCandidate(metadata.videoId, mp3Bytes, hash);

  options.onProgress?.('finalizing', 'Validating fallback audio before caching...', 92);
  const result = await finalizeCandidate({
    metadata,
    candidatePath,
    sha256: hash,
    fileSize: mp3Bytes.byteLength,
    idToken,
  });

  return {
    ...result,
    method: 'dltkk-temporary-fallback',
  };
}

function isYouTubeAccessChallenge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /sign in to confirm|not a bot|failed to extract any player response|login_required|forbidden|too many requests|rate-limited|rate limited|captcha|youtube audio stream \((403|429)\)/i.test(message);
}

export function shouldUseNativeYtDlpFallback(error: unknown): boolean {
  if (error instanceof BrowserExtractionQueueError) {
    return false;
  }
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
  const config = await loadPublicConfig();
  const ourAppProxy = config.NEXT_PUBLIC_YOUTUBE_PROXY_URL || '/api/youtube-media-proxy';
  const ultimaProxy = ULTIMA_PROXY_URL;

  const primaryProxy = ourAppProxy;
  const secondaryProxy = ultimaProxy;
  const hasDifferentProxies = ourAppProxy !== ultimaProxy;

  async function attemptExtraction(proxyUrl: string): Promise<BrowserYtDlpExtractionResult> {
    let leaseId: string | null = null;
    let stopLeaseHeartbeat: () => void = () => undefined;
    let extractionSucceeded = false;

    try {
      options.onProgress?.('initializing', `Preparing browser audio extraction (using ${isUltimaProxy(proxyUrl) ? 'Ultima' : 'primary'} proxy)...`);
      let lease;
      try {
        lease = await acquireProxyLease(metadata.videoId, proxyUrl, options);
      } catch (leaseError) {
        throw new BrowserExtractionQueueError(leaseError instanceof Error ? leaseError.message : String(leaseError));
      }
      leaseId = lease.leaseId || null;
      stopLeaseHeartbeat = startProxyLeaseHeartbeat(proxyUrl, leaseId, options);
      options.onProgress?.('initializing', 'Extraction queue slot ready. Starting browser audio extraction...');
      const extracted = await waitForWorkerExtraction(videoUrl, options, leaseId, proxyUrl);

      options.onProgress?.('downloading', 'Downloading YouTube audio stream...');
      const sourceBytes = await fetchAudioBytesViaProxy(extracted.streamUrl, extracted.streamHeaders, options.abortSignal, leaseId, proxyUrl);

      const mp3Bytes = await convertToMediumMp3(sourceBytes, extracted.ext || 'm4a', options);
      if (mp3Bytes.byteLength > BROWSER_YTDLP_MAX_FINAL_BYTES) {
        throw new Error('Extracted MP3 is larger than the 50MB Firebase cache limit.');
      }

      options.onProgress?.('uploading', 'Uploading extracted audio for validation...');
      const hash = await sha256Hex(mp3Bytes);
      const { candidatePath, idToken } = await uploadCandidate(metadata.videoId, mp3Bytes, hash);

      options.onProgress?.('finalizing', 'Validating audio before caching...');
      const result = await finalizeCandidate({
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
      extractionSucceeded = true;
      return result;
    } finally {
      stopLeaseHeartbeat();
      if (leaseId !== null) {
        await releaseProxyLease(proxyUrl, leaseId, extractionSucceeded);
      }
    }
  }

  try {
    return await attemptExtraction(primaryProxy);
  } catch (error) {
    if (options.abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }

    if (!hasDifferentProxies) {
      throw error;
    }

    console.warn(
      `Primary proxy (${primaryProxy}) failed:`,
      error instanceof Error ? error.message : String(error),
      `Retrying with fallback proxy (${secondaryProxy})...`
    );

    options.onProgress?.(
      'initializing',
      `Primary proxy failed or blocked. Falling back to alternative proxy...`
    );

    let fallbackError: unknown;
    try {
      return await attemptExtraction(secondaryProxy);
    } catch (errorFromSecondaryProxy) {
      fallbackError = errorFromSecondaryProxy;
      console.error(
        `Fallback proxy (${secondaryProxy}) also failed:`,
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      );
    }

    if (isDltkkTemporaryFallbackEnabled(config)) {
      try {
        return await extractAudioWithDltkkTemporaryFallback(metadata, options);
      } catch (dltkkError) {
        console.error(
          'Temporary dltkk audio fallback failed:',
          dltkkError instanceof Error ? dltkkError.message : String(dltkkError)
        );
        throw dltkkError;
      }
    }

    throw fallbackError;
  }
}

export const __browserYtDlpTestUtils = {
  buildProxyRequestHeaders,
  buildMinimalProxyRequestHeaders,
  normalizeQueueState,
  isUltimaProxy,
  ULTIMA_PROXY_URL,
  DLTKK_DOWNLOAD_URL,
};
