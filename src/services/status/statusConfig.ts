const DEFAULT_STATUS_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_PROBE_TIMEOUT_MS = 55_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
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
  cronSecretConfigured: boolean;
  geminiConfigured: boolean;
  endpointsConfigured: {
    python: boolean;
    sheetsage: boolean;
  };
}

export function getStatusConfig(): StatusConfig {
  const isLocalRuntime = process.env.NODE_ENV !== 'production';
  const endpointsConfigured = {
    python: Boolean(process.env.PYTHON_API_URL?.trim()),
    sheetsage: Boolean(process.env.SHEETSAGE_API_URL?.trim()),
  };

  return {
    probesEnabled: isEnabled(process.env.STATUS_PROBES_ENABLED),
    storageEnabled: hasPrivateFirestoreConfig(),
    localProbeAllowed: isEnabled(process.env.STATUS_PROBE_ALLOW_LOCAL),
    isLocalRuntime,
    timezone: process.env.STATUS_REPORT_TIMEZONE || DEFAULT_STATUS_TIMEZONE,
    retentionDays: parsePositiveInt(process.env.STATUS_REPORT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    probeTimeoutMs: parsePositiveInt(process.env.STATUS_PROBE_TIMEOUT_MS, DEFAULT_PROBE_TIMEOUT_MS),
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

export function getStatusDisabledReason(config = getStatusConfig()): string {
  if (!config.probesEnabled) return 'Status probes are disabled.';
  if (!config.storageEnabled) return 'Status storage is not configured.';
  if (config.isLocalRuntime && !config.localProbeAllowed) return 'Status probes are disabled in local development.';
  if (!config.endpointsConfigured.python || !config.endpointsConfigured.sheetsage) return 'Backend endpoints are not configured.';
  return 'Status probes are unavailable.';
}
