const mockGetPythonApiUrl = jest.fn(() => 'https://python.private.test');
const mockGetSheetSageApiUrl = jest.fn(() => 'https://sheetsage.private.test');
const mockCreateSafeTimeoutSignal = jest.fn(() => new AbortController().signal);
const mockGenerateContent = jest.fn();
const mockCreateGeminiClient = jest.fn(() => ({
  models: {
    generateContent: mockGenerateContent,
  },
}));

jest.mock('@/config/serverBackend', () => ({
  getPythonApiUrl: () => mockGetPythonApiUrl(),
  getSheetSageApiUrl: () => mockGetSheetSageApiUrl(),
}));

jest.mock('@/config/gemini', () => ({
  GEMINI_MODEL_NAME: 'gemini-test-model',
  createGeminiClient: (...args: unknown[]) => mockCreateGeminiClient(...args),
}));

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: (timeoutMs: number) => mockCreateSafeTimeoutSignal(timeoutMs),
}));

import { probeGeminiGeneration, runStandardStatusProbes } from '@/services/status/statusProbes';

describe('statusProbes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateGeminiClient.mockReturnValue({
      models: {
        generateContent: mockGenerateContent,
      },
    });
    mockGenerateContent.mockResolvedValue({ text: 'ok' });
    process.env = {
      ...originalEnv,
      STATUS_PROBE_TIMEOUT_MS: '30000',
      GEMINI_API_KEY: 'gemini-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('aggregates standard endpoint probes and Gemini into one result per service', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
    }) as Response);

    const probes = await runStandardStatusProbes();

    expect(probes.map((probe) => probe.serviceId)).toEqual(['beat', 'chord', 'sheetsage', 'gemini']);
    expect(probes.filter((probe) => probe.serviceId === 'beat')).toHaveLength(1);
    expect(probes.filter((probe) => probe.serviceId === 'chord')).toHaveLength(1);
    expect(probes.filter((probe) => probe.serviceId === 'sheetsage')).toHaveLength(1);
    expect(probes.find((probe) => probe.serviceId === 'gemini')).toMatchObject({
      probeKind: 'generation',
      status: 'operational',
      ok: true,
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-test-model',
      contents: 'Reply with exactly: ok',
    }));
  });

  it('retries transient standard endpoint failures and reports operational recovery', async () => {
    const attemptsByUrl = new Map<string, number>();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const attempts = (attemptsByUrl.get(url) || 0) + 1;
      attemptsByUrl.set(url, attempts);

      if (url === 'https://python.private.test/api/chord-model-info' && attempts === 1) {
        return {
          ok: false,
          status: 503,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();
    const chordProbe = probes.find((probe) => probe.serviceId === 'chord');

    expect(attemptsByUrl.get('https://python.private.test/api/chord-model-info')).toBe(2);
    expect(chordProbe).toMatchObject({
      serviceId: 'chord',
      status: 'operational',
      ok: true,
    });
  });

  it('reuses one shared Python health probe for beat and chord model checks', async () => {
    const attemptsByUrl = new Map<string, number>();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      attemptsByUrl.set(url, (attemptsByUrl.get(url) || 0) + 1);

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();

    expect(attemptsByUrl.get('https://python.private.test/health')).toBe(1);
    expect(attemptsByUrl.get('https://python.private.test/api/model-info')).toBe(1);
    expect(attemptsByUrl.get('https://python.private.test/api/chord-model-info')).toBe(1);
    expect(probes.find((probe) => probe.serviceId === 'beat')).toMatchObject({
      serviceId: 'beat',
      status: 'operational',
    });
    expect(probes.find((probe) => probe.serviceId === 'chord')).toMatchObject({
      serviceId: 'chord',
      status: 'operational',
    });
  });

  it('does not probe Python model metadata when shared health fails', async () => {
    process.env.STATUS_PROBE_TIMEOUT_MS = '1000';
    const attemptsByUrl = new Map<string, number>();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      attemptsByUrl.set(url, (attemptsByUrl.get(url) || 0) + 1);

      if (url === 'https://python.private.test/health') {
        return {
          ok: false,
          status: 503,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();

    expect(attemptsByUrl.get('https://python.private.test/health')).toBe(1);
    expect(attemptsByUrl.get('https://python.private.test/api/model-info')).toBeUndefined();
    expect(attemptsByUrl.get('https://python.private.test/api/chord-model-info')).toBeUndefined();
    expect(probes.find((probe) => probe.serviceId === 'beat')).toMatchObject({
      serviceId: 'beat',
      probeKind: 'health',
      status: 'outage',
    });
    expect(probes.find((probe) => probe.serviceId === 'chord')).toMatchObject({
      serviceId: 'chord',
      probeKind: 'health',
      status: 'outage',
    });
  });

  it('reports metadata timeouts as degraded when the shared backend health check passes', async () => {
    process.env.STATUS_PROBE_TIMEOUT_MS = '1';
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://python.private.test/api/chord-model-info') {
        throw Object.assign(new Error('probe timed out'), { name: 'AbortError' });
      }

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();
    const chordProbe = probes.find((probe) => probe.serviceId === 'chord');

    expect(chordProbe).toMatchObject({
      serviceId: 'chord',
      probeKind: 'metadata',
      status: 'degraded',
      ok: true,
    });
  });

  it('marks Gemini overload and rate limiting as degraded', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'));

    const probe = await probeGeminiGeneration();

    expect(probe).toMatchObject({
      serviceId: 'gemini',
      probeKind: 'generation',
      status: 'degraded',
      ok: true,
      failureReason: 'http',
    });
  });

  it('marks Gemini timeout failures as an outage', async () => {
    const timeoutError = Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
    mockGenerateContent.mockRejectedValueOnce(timeoutError);

    const probe = await probeGeminiGeneration();

    expect(probe).toMatchObject({
      serviceId: 'gemini',
      probeKind: 'generation',
      status: 'outage',
      ok: false,
      failureReason: 'timeout',
    });
  });

  it('reports missing Gemini API key as unknown', async () => {
    delete process.env.GEMINI_API_KEY;

    const probe = await probeGeminiGeneration();

    expect(mockCreateGeminiClient).not.toHaveBeenCalled();
    expect(probe).toMatchObject({
      serviceId: 'gemini',
      probeKind: 'generation',
      status: 'unknown',
      ok: false,
      latencyMs: null,
    });
  });
});
