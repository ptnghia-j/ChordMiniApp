import { getYtMp3GoBaseUrl } from '@/config/serverBackend';

const DEFAULT_STATUS_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_PROBE_TIMEOUT_MS = 45_000;
const DEFAULT_YT_INFO_TIMEOUT_MS = 45_000;
const DEFAULT_YT_EXTRACTION_TIMEOUT_MS = 250_000;
const DEFAULT_YT_TEST_VIDEO_IDS = [
  'el3E4MbxRqQ',
  '_b-2C3KPAM0',
];
const DEFAULT_YT_TEST_VIDEO_ID = DEFAULT_YT_TEST_VIDEO_IDS[0] || 'el3E4MbxRqQ';
const DEFAULT_YT_TEST_QUALITY = 'low';
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const KNOWN_BAD_YT_TEST_VIDEO_IDS = new Set([
  'CizitNpshbM',
  'jNQXAC9IVRw',
  '2NUZ8W2llS4',
  'gHKT4uU8Zng',
  'tjjjtzRLHvA',
  'mzZzzBU6lrM',
]);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parseYtTestVideoIds(value: string | undefined, fallback: string[]): string[] {
  const parsed = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => YOUTUBE_VIDEO_ID_PATTERN.test(entry) && !KNOWN_BAD_YT_TEST_VIDEO_IDS.has(entry));

  return parsed && parsed.length > 0 ? [...new Set(parsed)] : fallback;
}

export function selectRandomYtTestVideoId(videoIds: string[], random = Math.random): string {
  if (videoIds.length === 0) {
    return DEFAULT_YT_TEST_VIDEO_ID;
  }

  const randomValue = random();
  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999999999)
    : 0;
  const index = Math.floor(boundedRandom * videoIds.length);
  return videoIds[index] || DEFAULT_YT_TEST_VIDEO_ID;
}

function hasPrivateFirestoreConfig(): boolean {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
      && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT),
  );
}

export interface StatusConfig {
  probesEnabled: boolean;
  storageEnabled: boolean;
  localProbeAllowed: boolean;
  isLocalRuntime: boolean;
  timezone: string;
  retentionDays: number;
  probeTimeoutMs: number;
  ytInfoTimeoutMs: number;
  ytExtractionTimeoutMs: number;
  ytTestVideoId: string;
  ytTestVideoIds: string[];
  ytTestQuality: string;
  cronSecretConfigured: boolean;
  geminiConfigured: boolean;
  endpointsConfigured: {
    python: boolean;
    sheetsage: boolean;
    ytMp3Go: boolean;
  };
}

export function getStatusConfig(): StatusConfig {
  const isLocalRuntime = process.env.NODE_ENV !== 'production';
  const endpointsConfigured = {
    python: Boolean(process.env.PYTHON_API_URL?.trim()),
    sheetsage: Boolean(process.env.SHEETSAGE_API_URL?.trim()),
    ytMp3Go: Boolean(getYtMp3GoBaseUrl()),
  };
  const ytTestVideoIds = parseYtTestVideoIds(
    process.env.STATUS_YT2MP3GO_TEST_VIDEO_IDS || process.env.STATUS_YT2MP3GO_TEST_VIDEO_ID,
    DEFAULT_YT_TEST_VIDEO_IDS,
  );

  return {
    probesEnabled: isEnabled(process.env.STATUS_PROBES_ENABLED),
    storageEnabled: hasPrivateFirestoreConfig(),
    localProbeAllowed: isEnabled(process.env.STATUS_PROBE_ALLOW_LOCAL),
    isLocalRuntime,
    timezone: process.env.STATUS_REPORT_TIMEZONE || DEFAULT_STATUS_TIMEZONE,
    retentionDays: parsePositiveInt(process.env.STATUS_REPORT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    probeTimeoutMs: parsePositiveInt(process.env.STATUS_PROBE_TIMEOUT_MS, DEFAULT_PROBE_TIMEOUT_MS),
    ytInfoTimeoutMs: parsePositiveInt(process.env.STATUS_YT2MP3GO_INFO_TIMEOUT_MS, DEFAULT_YT_INFO_TIMEOUT_MS),
    ytExtractionTimeoutMs: parsePositiveInt(process.env.STATUS_YT2MP3GO_EXTRACTION_TIMEOUT_MS, DEFAULT_YT_EXTRACTION_TIMEOUT_MS),
    ytTestVideoId: selectRandomYtTestVideoId(ytTestVideoIds),
    ytTestVideoIds,
    ytTestQuality: process.env.STATUS_YT2MP3GO_TEST_QUALITY || DEFAULT_YT_TEST_QUALITY,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    endpointsConfigured,
  };
}

export function canRunStatusProbes(config = getStatusConfig()): boolean {
  if (!config.probesEnabled || !config.storageEnabled) {
    return false;
  }

  if (config.isLocalRuntime && !config.localProbeAllowed) {
    return false;
  }

  return config.endpointsConfigured.python && config.endpointsConfigured.sheetsage;
}

export function canRunYtExtractionProbe(config = getStatusConfig()): boolean {
  return canRunStatusProbes(config) && config.endpointsConfigured.ytMp3Go;
}

export function getStatusDisabledReason(config = getStatusConfig()): string {
  if (!config.probesEnabled) return 'Status probes are disabled.';
  if (!config.storageEnabled) return 'Status storage is not configured.';
  if (config.isLocalRuntime && !config.localProbeAllowed) return 'Status probes are disabled in local development.';
  if (!config.endpointsConfigured.python || !config.endpointsConfigured.sheetsage) return 'Backend endpoints are not configured.';
  if (!config.endpointsConfigured.ytMp3Go) return 'yt-mp3-go endpoint is not configured.';
  return 'Status probes are unavailable.';
}
