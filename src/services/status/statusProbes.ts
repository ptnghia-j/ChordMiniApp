import { GEMINI_MODEL_NAME, createGeminiClient } from '@/config/gemini';
import { getPythonApiUrl, getSheetSageApiUrl } from '@/config/serverBackend';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { getStatusConfig } from '@/services/status/statusConfig';
import { STATUS_SERVICE_LABELS } from '@/services/status/statusConstants';
import type { PublicServiceStatus, PublicStatusProbeDetail, StatusProbeKind, StatusProbeResult, StatusServiceId } from '@/services/status/statusTypes';

const STANDARD_ENDPOINT_MAX_ATTEMPTS = 3;
const STANDARD_RETRY_BASE_DELAY_MS = 4_000;
const STANDARD_FIRST_ATTEMPT_TIMEOUT_MS = 45_000;
const STANDARD_MIN_ATTEMPT_TIMEOUT_MS = 8_000;
const GEMINI_SLOW_RESPONSE_MS = 15_000;

interface StandardEndpointProbe {
  probeKind: StatusProbeKind;
  endpointId: string;
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

function isGeminiOverloadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\b(429|503|quota|rate limit|resource exhausted|overload|overloaded|unavailable)\b/i.test(message);
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

function cloneProbeResultForService(result: StatusProbeResult, serviceId: StatusServiceId): StatusProbeResult {
  const serviceLabel = STATUS_SERVICE_LABELS[serviceId];
  return {
    ...result,
    serviceId,
    serviceLabel,
    sanitizedSummary: safeSummary(serviceLabel, result.status, result.probeKind),
  };
}

function toProbeDetail(result: StatusProbeResult): PublicStatusProbeDetail {
  return {
    serviceId: result.serviceId,
    serviceLabel: result.serviceLabel,
    probeKind: result.probeKind,
    endpointId: result.endpointId,
    status: result.status,
    ok: result.ok,
    latencyMs: result.latencyMs,
    checkedAt: result.checkedAt,
    failureReason: result.failureReason,
    httpStatus: result.httpStatus,
    attempts: result.attempts,
    timeoutMs: result.timeoutMs,
  };
}

async function probeJsonEndpoint(
  serviceId: StatusServiceId,
  endpoint: StandardEndpointProbe,
  timeoutMs: number,
): Promise<StatusProbeResult> {
  const serviceLabel = STATUS_SERVICE_LABELS[serviceId];
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(endpoint.url, {
      method: 'GET',
      signal: createSafeTimeoutSignal(timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    const status = classify(response.ok, latencyMs, Math.max(30_000, timeoutMs * 0.75));

    return {
      serviceId,
      serviceLabel,
      probeKind: endpoint.probeKind,
      endpointId: endpoint.endpointId,
      status,
      ok: response.ok,
      latencyMs,
      checkedAt,
      sanitizedSummary: safeSummary(serviceLabel, status, endpoint.probeKind),
      failureReason: response.ok ? undefined : 'http',
      httpStatus: response.status,
      timeoutMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      serviceId,
      serviceLabel,
      probeKind: endpoint.probeKind,
      endpointId: endpoint.endpointId,
      status: 'outage',
      ok: false,
      latencyMs,
      checkedAt,
      sanitizedSummary: safeSummary(serviceLabel, 'outage', endpoint.probeKind),
      failureReason: isTimeoutError(error) ? 'timeout' : 'network',
      timeoutMs,
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
      endpoint,
      Math.min(attemptTimeoutMs, remainingMs),
    );
    result.attempts = attempt;

    if (!bestResult || statusRank(result.status) < statusRank(bestResult.status)) {
      bestResult = result;
    }

    if (result.status === 'operational') {
      return result;
    }

    const hasAttemptsLeft = attempt < STANDARD_ENDPOINT_MAX_ATTEMPTS;
    const retryDelayMs = STANDARD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const hasRetryBudget = Date.now() - startedAt + retryDelayMs < timeoutMs;
    if (!hasAttemptsLeft || !hasRetryBudget) {
      break;
    }

    await delay(retryDelayMs);
  }

  return bestResult || {
    serviceId,
    serviceLabel: STATUS_SERVICE_LABELS[serviceId],
    probeKind: endpoint.probeKind,
    endpointId: endpoint.endpointId,
    status: 'outage',
    ok: false,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    sanitizedSummary: safeSummary(STATUS_SERVICE_LABELS[serviceId], 'outage', endpoint.probeKind),
    failureReason: 'timeout',
    attempts: 0,
    timeoutMs,
  };
}

async function probeServiceBehindKnownHealth(
  serviceId: StatusServiceId,
  healthResult: StatusProbeResult,
  endpoints: StandardEndpointProbe[],
  timeoutMs: number,
): Promise<StatusProbeResult> {
  const checkedAt = new Date().toISOString();
  const serviceHealthResult = cloneProbeResultForService(healthResult, serviceId);
  const metadataEndpoints = endpoints.filter((ep) => ep.probeKind !== 'health');
  const results: StatusProbeResult[] = [serviceHealthResult];

  if (serviceHealthResult.status === 'operational' && metadataEndpoints.length > 0) {
    const metadataResults = await Promise.all(
      metadataEndpoints.map((ep) => probeJsonEndpointWithRetries(serviceId, ep, timeoutMs)),
    );
    results.push(...metadataResults);
  }

  const normalizedResults = softenOutagesBehindHealthyLiveness(serviceId, results);
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
    serviceLabel: STATUS_SERVICE_LABELS[serviceId],
    probeKind: representative?.probeKind || endpoints[0]?.probeKind || 'health',
    status: normalizedStatus,
    ok: normalizedStatus !== 'outage',
    latencyMs,
    checkedAt,
    sanitizedSummary: safeSummary(STATUS_SERVICE_LABELS[serviceId], normalizedStatus, representative?.probeKind || 'health'),
    failureReason: representative?.failureReason,
    endpointId: representative?.endpointId,
    httpStatus: representative?.httpStatus,
    attempts: representative?.attempts,
    timeoutMs: representative?.timeoutMs,
    componentResults: normalizedResults.map(toProbeDetail),
  };
}

function softenOutagesBehindHealthyLiveness(
  serviceId: StatusServiceId,
  results: StatusProbeResult[],
): StatusProbeResult[] {
  const healthResult = results.find((result) => result.probeKind === 'health');
  if (healthResult?.status !== 'operational') {
    return results;
  }

  const serviceLabel = STATUS_SERVICE_LABELS[serviceId];
  return results.map((result) => {
    if (result.probeKind === 'health' || result.status === 'operational') {
      return result;
    }

    // Health is operational, so the container is alive.
    // Downgrade any non-health probe failures to 'degraded' instead of 'outage'.
    return {
      ...result,
      status: 'degraded' as PublicServiceStatus,
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
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  // Separate health (liveness) probes from heavier metadata probes.
  const healthEndpoints = endpoints.filter((ep) => ep.probeKind === 'health');
  const metadataEndpoints = endpoints.filter((ep) => ep.probeKind !== 'health');

  const results: StatusProbeResult[] = [];

  // Phase 1: Probe health endpoint(s) first. This wakes up cold containers.
  if (healthEndpoints.length > 0) {
    const healthResults = await Promise.all(
      healthEndpoints.map((ep) => probeJsonEndpointWithRetries(serviceId, ep, timeoutMs)),
    );
    results.push(...healthResults);

    const healthPassed = healthResults.some((r) => r.status === 'operational');

    // Phase 2: Only probe metadata if the container is confirmed alive.
    // This avoids wasting budget on endpoints that will definitely fail during cold starts.
    if (healthPassed && metadataEndpoints.length > 0) {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(STANDARD_MIN_ATTEMPT_TIMEOUT_MS, timeoutMs - elapsedMs);
      const metadataResults = await Promise.all(
        metadataEndpoints.map((ep) => probeJsonEndpointWithRetries(serviceId, ep, remainingMs)),
      );
      results.push(...metadataResults);
    }
  } else {
    // No health endpoint — probe all endpoints in parallel (fallback for services like Gemini).
    const allResults = await Promise.all(
      endpoints.map((ep) => probeJsonEndpointWithRetries(serviceId, ep, timeoutMs)),
    );
    results.push(...allResults);
  }

  const normalizedResults = softenOutagesBehindHealthyLiveness(serviceId, results);
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
    serviceLabel: STATUS_SERVICE_LABELS[serviceId],
    probeKind: representative?.probeKind || endpoints[0]?.probeKind || 'health',
    status: normalizedStatus,
    ok: normalizedStatus !== 'outage',
    latencyMs,
    checkedAt,
    sanitizedSummary: safeSummary(STATUS_SERVICE_LABELS[serviceId], normalizedStatus, representative?.probeKind || 'health'),
    failureReason: representative?.failureReason,
    endpointId: representative?.endpointId,
    httpStatus: representative?.httpStatus,
    attempts: representative?.attempts,
    timeoutMs: representative?.timeoutMs,
    componentResults: normalizedResults.map(toProbeDetail),
  };
}

async function probePythonModelServices(pythonBaseUrl: string, timeoutMs: number): Promise<[StatusProbeResult, StatusProbeResult]> {
  const startedAt = Date.now();
  const sharedHealthResult = await probeJsonEndpointWithRetries('beat', {
    probeKind: 'health',
    endpointId: 'python-health',
    url: `${pythonBaseUrl}/health`,
  }, timeoutMs);
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = Math.max(STANDARD_MIN_ATTEMPT_TIMEOUT_MS, timeoutMs - elapsedMs);

  return Promise.all([
    probeServiceBehindKnownHealth('beat', sharedHealthResult, [
      { probeKind: 'metadata', endpointId: 'python-beat-model-info', url: `${pythonBaseUrl}/api/model-info` },
    ], remainingMs),
    probeServiceBehindKnownHealth('chord', sharedHealthResult, [
      { probeKind: 'metadata', endpointId: 'python-chord-model-info', url: `${pythonBaseUrl}/api/chord-model-info` },
    ], remainingMs),
  ]);
}

export async function probeGeminiGeneration(): Promise<StatusProbeResult> {
  const config = getStatusConfig();
  const serviceId: StatusServiceId = 'gemini';
  const serviceLabel = STATUS_SERVICE_LABELS[serviceId];
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  if (!config.geminiConfigured) {
    return {
      serviceId,
      serviceLabel,
      probeKind: 'generation',
      status: 'unknown',
      ok: false,
      latencyMs: null,
      checkedAt,
      sanitizedSummary: 'Gemini API probe is not configured.',
      endpointId: 'gemini-generation',
    };
  }

  const gemini = createGeminiClient({ timeoutMs: config.probeTimeoutMs });
  if (!gemini) {
    return {
      serviceId,
      serviceLabel,
      probeKind: 'generation',
      status: 'unknown',
      ok: false,
      latencyMs: null,
      checkedAt,
      sanitizedSummary: 'Gemini API probe is not configured.',
      endpointId: 'gemini-generation',
    };
  }

  try {
    await gemini.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: 'Reply with exactly: ok',
      config: {
        maxOutputTokens: 4,
        temperature: 0,
      },
    });

    const latencyMs = Date.now() - startedAt;
    const status = classify(true, latencyMs, GEMINI_SLOW_RESPONSE_MS);
    return {
      serviceId,
      serviceLabel,
      probeKind: 'generation',
      status,
      ok: true,
      latencyMs,
      checkedAt,
      sanitizedSummary: safeSummary(serviceLabel, status, 'generation'),
      endpointId: 'gemini-generation',
      attempts: 1,
      timeoutMs: config.probeTimeoutMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const overloaded = isGeminiOverloadError(error);
    const status: PublicServiceStatus = overloaded ? 'degraded' : 'outage';
    return {
      serviceId,
      serviceLabel,
      probeKind: 'generation',
      status,
      ok: overloaded,
      latencyMs,
      checkedAt,
      sanitizedSummary: overloaded
        ? 'Gemini API reported overload or rate limiting during a generation probe.'
        : safeSummary(serviceLabel, 'outage', 'generation'),
      failureReason: overloaded ? 'http' : isTimeoutError(error) ? 'timeout' : 'network',
      endpointId: 'gemini-generation',
      attempts: 1,
      timeoutMs: config.probeTimeoutMs,
    };
  }
}

export async function runStandardStatusProbes(): Promise<StatusProbeResult[]> {
  const config = getStatusConfig();
  const pythonBaseUrl = getPythonApiUrl();
  const sheetSageBaseUrl = getSheetSageApiUrl();

  const [pythonResults, sheetSageProbe, geminiProbe] = await Promise.all([
    probePythonModelServices(pythonBaseUrl, config.probeTimeoutMs),
    probeServiceWithAggregation('sheetsage', [
      { probeKind: 'health', endpointId: 'sheetsage-health-warmup', url: `${sheetSageBaseUrl}/health?warmup=true` },
    ], config.probeTimeoutMs),
    probeGeminiGeneration(),
  ]);

  return [
    ...pythonResults,
    sheetSageProbe,
    geminiProbe,
  ];
}
