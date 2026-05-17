import { getPythonApiUrl, getSheetSageApiUrl, getYtMp3GoBaseUrl } from '@/config/serverBackend';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { ytMp3GoService } from '@/services/youtube/ytMp3GoService';
import { getStatusConfig } from '@/services/status/statusConfig';
import type { PublicServiceStatus, StatusProbeKind, StatusProbeResult, StatusServiceId } from '@/services/status/statusTypes';

const SERVICE_LABELS: Record<StatusServiceId, string> = {
  beat: 'Beat Detection',
  chord: 'Chord Recognition',
  sheetsage: 'Sheet Sage',
  yt2mp3go: 'YouTube Extraction',
};

const YT_METADATA_MAX_ATTEMPTS = 3;
const YT_EXTRACTION_MAX_ATTEMPTS = 2;
const YT_RETRY_DELAY_MS = 1_000;
const YT_QUICK_FAILURE_RETRY_WINDOW_MS = 30_000;
const STANDARD_ENDPOINT_MAX_ATTEMPTS = 3;
const STANDARD_RETRY_DELAY_MS = 1_000;
const STANDARD_FIRST_ATTEMPT_TIMEOUT_MS = 30_000;
const STANDARD_MIN_ATTEMPT_TIMEOUT_MS = 5_000;

interface StandardEndpointProbe {
  probeKind: StatusProbeKind;
  url: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classify(ok: boolean, latencyMs: number, slowMs: number): PublicServiceStatus {
  if (!ok) return 'outage';
  return latencyMs > slowMs ? 'degraded' : 'operational';
}

function safeSummary(serviceLabel: string, status: PublicServiceStatus, probeKind: StatusProbeKind): string {
  if (status === 'operational') return `${serviceLabel} responded normally.`;
  if (status === 'degraded') return `${serviceLabel} responded slowly during a ${probeKind} probe.`;
  return `${serviceLabel} did not pass a ${probeKind} probe.`;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function statusRank(status: PublicServiceStatus): number {
  if (status === 'outage') return 3;
  if (status === 'degraded') return 2;
  if (status === 'operational') return 1;
  return 0;
}

function worseStatus(left: PublicServiceStatus, right: PublicServiceStatus): PublicServiceStatus {
  return statusRank(left) >= statusRank(right) ? left : right;
}

async function probeJsonEndpoint(
  serviceId: StatusServiceId,
  probeKind: StatusProbeKind,
  url: string,
  timeoutMs: number,
): Promise<StatusProbeResult> {
  const serviceLabel = SERVICE_LABELS[serviceId];
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: createSafeTimeoutSignal(timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    const status = classify(response.ok, latencyMs, Math.max(10_000, timeoutMs * 0.75));

    return {
      serviceId,
      serviceLabel,
      probeKind,
      status,
      ok: response.ok,
      latencyMs,
      checkedAt,
      sanitizedSummary: safeSummary(serviceLabel, status, probeKind),
      failureReason: response.ok ? undefined : 'http',
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      serviceId,
      serviceLabel,
      probeKind,
      status: 'outage',
      ok: false,
      latencyMs,
      checkedAt,
      sanitizedSummary: safeSummary(serviceLabel, 'outage', probeKind),
      failureReason: isTimeoutError(error) ? 'timeout' : 'network',
    };
  }
}

async function probeJsonEndpointWithRetries(
  serviceId: StatusServiceId,
  endpoint: StandardEndpointProbe,
  timeoutMs: number,
): Promise<StatusProbeResult> {
  const startedAt = Date.now();
  let bestResult: StatusProbeResult | null = null;

  for (let attempt = 1; attempt <= STANDARD_ENDPOINT_MAX_ATTEMPTS; attempt += 1) {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      break;
    }

    const remainingAttempts = STANDARD_ENDPOINT_MAX_ATTEMPTS - attempt + 1;
    const retryAttemptTimeoutMs = Math.max(
      STANDARD_MIN_ATTEMPT_TIMEOUT_MS,
      Math.floor(remainingMs / remainingAttempts),
    );
    const attemptTimeoutMs = attempt === 1
      ? Math.max(STANDARD_FIRST_ATTEMPT_TIMEOUT_MS, retryAttemptTimeoutMs)
      : retryAttemptTimeoutMs;

    const result = await probeJsonEndpoint(
      serviceId,
      endpoint.probeKind,
      endpoint.url,
      Math.min(attemptTimeoutMs, remainingMs),
    );

    if (!bestResult || statusRank(result.status) < statusRank(bestResult.status)) {
      bestResult = result;
    }

    if (result.status === 'operational') {
      return result;
    }

    const hasAttemptsLeft = attempt < STANDARD_ENDPOINT_MAX_ATTEMPTS;
    const hasRetryBudget = Date.now() - startedAt + STANDARD_RETRY_DELAY_MS < timeoutMs;
    if (!hasAttemptsLeft || !hasRetryBudget) {
      break;
    }

    await delay(STANDARD_RETRY_DELAY_MS);
  }

  return bestResult || {
    serviceId,
    serviceLabel: SERVICE_LABELS[serviceId],
    probeKind: endpoint.probeKind,
    status: 'outage',
    ok: false,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    sanitizedSummary: safeSummary(SERVICE_LABELS[serviceId], 'outage', endpoint.probeKind),
    failureReason: 'timeout',
  };
}

function softenTimeoutOutagesBehindHealthyLiveness(
  serviceId: StatusServiceId,
  results: StatusProbeResult[],
): StatusProbeResult[] {
  const healthResult = results.find((result) => result.probeKind === 'health');
  if (healthResult?.status !== 'operational') {
    return results;
  }

  const serviceLabel = SERVICE_LABELS[serviceId];
  return results.map((result) => {
    if (result.probeKind === 'health' || result.failureReason !== 'timeout') {
      return result;
    }

    return {
      ...result,
      status: 'degraded',
      ok: true,
      sanitizedSummary: safeSummary(serviceLabel, 'degraded', result.probeKind),
    };
  });
}

async function probeServiceWithAggregation(
  serviceId: StatusServiceId,
  endpoints: StandardEndpointProbe[],
  timeoutMs: number,
): Promise<StatusProbeResult> {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(
    endpoints.map((endpoint) => probeJsonEndpointWithRetries(serviceId, endpoint, timeoutMs)),
  );
  const normalizedResults = softenTimeoutOutagesBehindHealthyLiveness(serviceId, results);
  const normalizedStatus = normalizedResults.reduce<PublicServiceStatus>(
    (current, result) => worseStatus(current, result.status),
    'operational',
  );
  const failedOrSlowResult = normalizedResults
    .filter((result) => result.status !== 'operational')
    .sort((left, right) => statusRank(right.status) - statusRank(left.status))[0];
  const representative = failedOrSlowResult || normalizedResults[0];
  const latencyMs = normalizedResults.reduce<number | null>((maxLatency, result) => {
    if (result.latencyMs === null) return maxLatency;
    return maxLatency === null ? result.latencyMs : Math.max(maxLatency, result.latencyMs);
  }, null);

  return {
    serviceId,
    serviceLabel: SERVICE_LABELS[serviceId],
    probeKind: representative?.probeKind || endpoints[0]?.probeKind || 'health',
    status: normalizedStatus,
    ok: normalizedStatus !== 'outage',
    latencyMs,
    checkedAt,
    sanitizedSummary: safeSummary(SERVICE_LABELS[serviceId], normalizedStatus, representative?.probeKind || 'health'),
    failureReason: representative?.failureReason,
  };
}

async function probeYtInfo(): Promise<StatusProbeResult> {
  const config = getStatusConfig();
  const serviceId: StatusServiceId = 'yt2mp3go';
  const serviceLabel = SERVICE_LABELS[serviceId];
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const baseUrl = getYtMp3GoBaseUrl();

  if (!baseUrl) {
    return {
      serviceId,
      serviceLabel,
      probeKind: 'metadata',
      status: 'unknown',
      ok: false,
      latencyMs: null,
      checkedAt,
      sanitizedSummary: 'YouTube extraction probe is not configured.',
    };
  }

  for (let attempt = 1; attempt <= YT_METADATA_MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = Math.max(1, config.ytInfoTimeoutMs - (Date.now() - startedAt));

    try {
      const formData = new FormData();
      formData.append('url', `https://www.youtube.com/watch?v=${config.ytTestVideoId}`);
      const response = await fetch(`${baseUrl}/yt-downloader/info`, {
        method: 'POST',
        headers: {
          'User-Agent': 'ChordMiniApp/1.0',
          Referer: `${baseUrl}/yt-downloader/`,
        },
        body: formData,
        signal: createSafeTimeoutSignal(remainingMs),
      });
      const latencyMs = Date.now() - startedAt;

      if (response.ok) {
        const status = classify(true, latencyMs, Math.max(10_000, config.ytInfoTimeoutMs * 0.75));

        return {
          serviceId,
          serviceLabel,
          probeKind: 'metadata',
          status,
          ok: true,
          latencyMs,
          checkedAt,
          sanitizedSummary: safeSummary(serviceLabel, status, 'metadata'),
        };
      }
    } catch {
      // Retry transient yt2mp3go/YouTube metadata failures within the public probe window.
    }

    const hasAttemptsLeft = attempt < YT_METADATA_MAX_ATTEMPTS;
    const hasTimeForRetry = Date.now() - startedAt + YT_RETRY_DELAY_MS < config.ytInfoTimeoutMs;
    if (!hasAttemptsLeft || !hasTimeForRetry) {
      break;
    }

    await delay(YT_RETRY_DELAY_MS);
  }

  const latencyMs = Date.now() - startedAt;
  return {
    serviceId,
    serviceLabel,
    probeKind: 'metadata',
    status: 'degraded',
    ok: true,
    latencyMs,
    checkedAt,
    sanitizedSummary: `${serviceLabel} metadata probe failed, but extraction is verified by a separate extraction probe.`,
  };
}

export async function runStandardStatusProbes(): Promise<StatusProbeResult[]> {
  const config = getStatusConfig();
  const pythonBaseUrl = getPythonApiUrl();
  const sheetSageBaseUrl = getSheetSageApiUrl();

  return Promise.all([
    probeServiceWithAggregation('beat', [
      { probeKind: 'health', url: `${pythonBaseUrl}/health` },
      { probeKind: 'metadata', url: `${pythonBaseUrl}/api/model-info` },
    ], config.probeTimeoutMs),
    probeServiceWithAggregation('chord', [
      { probeKind: 'health', url: `${pythonBaseUrl}/health` },
      { probeKind: 'metadata', url: `${pythonBaseUrl}/api/chord-model-info` },
    ], config.probeTimeoutMs),
    probeServiceWithAggregation('sheetsage', [
      { probeKind: 'health', url: `${sheetSageBaseUrl}/health?warmup=true` },
    ], config.probeTimeoutMs),
    probeYtInfo(),
  ]);
}

export async function runYtExtractionStatusProbe(): Promise<StatusProbeResult> {
  const config = getStatusConfig();
  const serviceId: StatusServiceId = 'yt2mp3go';
  const serviceLabel = SERVICE_LABELS[serviceId];
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= YT_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
    let ok = false;

    try {
      const result = await ytMp3GoService.extractAudio(
        config.ytTestVideoId,
        'Status Probe',
        0,
        config.ytTestQuality,
      );
      ok = result.success === true;
      const latencyMs = Date.now() - startedAt;

      if (ok) {
        const status = classify(true, latencyMs, Math.max(30_000, config.ytExtractionTimeoutMs * 0.8));

        return {
          serviceId,
          serviceLabel,
          probeKind: 'extraction',
          status,
          ok: true,
          latencyMs,
          checkedAt,
          sanitizedSummary: safeSummary(serviceLabel, status, 'extraction'),
        };
      }
    } catch {
      ok = false;
    }

    const latencyMs = Date.now() - startedAt;
    const failedQuickly = latencyMs < YT_QUICK_FAILURE_RETRY_WINDOW_MS;
    const hasAttemptsLeft = attempt < YT_EXTRACTION_MAX_ATTEMPTS;
    const hasTimeForRetry = latencyMs + YT_RETRY_DELAY_MS + YT_QUICK_FAILURE_RETRY_WINDOW_MS < config.ytExtractionTimeoutMs;
    if (ok || !failedQuickly || !hasAttemptsLeft || !hasTimeForRetry) {
      break;
    }

    await delay(YT_RETRY_DELAY_MS);
  }

  const latencyMs = Date.now() - startedAt;
  return {
    serviceId,
    serviceLabel,
    probeKind: 'extraction',
    status: 'outage',
    ok: false,
    latencyMs,
    checkedAt,
    sanitizedSummary: safeSummary(serviceLabel, 'outage', 'extraction'),
  };
}
