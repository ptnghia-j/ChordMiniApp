jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: class MockNextResponse {
    status: number;
    headers: Headers;
    private body: unknown;

    constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers ?? {});
      this.body = body;
    }

    static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
      return new this(body, init);
    }

    async json() {
      return this.body;
    }
  },
}));

const mockCreateSafeTimeoutSignal = jest.fn();
const mockGetPythonApiUrl = jest.fn();

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: (...args: unknown[]) => mockCreateSafeTimeoutSignal(...args),
}));

jest.mock('@/config/serverBackend', () => ({
  getPythonApiUrl: () => mockGetPythonApiUrl(),
}));

import { GET as healthGet } from '@/app/api/health/route';
import { POST as statusPost } from '@/app/api/status-check/route';
import { POST as validateMusicAiKeyPost } from '@/app/api/validate-music-ai-key/route';
import { makeFetchResponse, makeJsonRequest } from '../../fixtures/builders';

const fetchMock = jest.fn();

describe('health/status/API-key route behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;
    mockCreateSafeTimeoutSignal.mockReturnValue(new AbortController().signal);
    mockGetPythonApiUrl.mockReturnValue('http://python.test');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('proxies backend health success and failure without exposing CORS details to callers', async () => {
    fetchMock.mockResolvedValueOnce(makeFetchResponse({
      ok: true,
      status: 200,
      jsonData: { service: 'ready' },
    }));

    const healthy = await healthGet();
    expect(healthy.status).toBe(200);
    await expect(healthy.json()).resolves.toEqual({
      success: true,
      data: { service: 'ready' },
      status: 'healthy',
    });
    expect(fetchMock).toHaveBeenCalledWith('http://python.test/', expect.objectContaining({
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }));

    fetchMock.mockResolvedValueOnce(makeFetchResponse({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      jsonData: { error: 'cold' },
    }));

    const unhealthy = await healthGet();
    expect(unhealthy.status).toBe(503);
    await expect(unhealthy.json()).resolves.toMatchObject({
      success: false,
      status: 'unhealthy',
      error: 'Backend health check failed: HTTP 503 Service Unavailable',
    });
  });

  it('treats expected missing-file backend responses as responsive endpoint health', async () => {
    fetchMock.mockResolvedValue(makeFetchResponse({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      textData: '{"error":"No audio file provided"}',
    }));

    const response = await statusPost(makeJsonRequest({ endpoint: '/api/detect-beats' }) as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 400,
      data: { error: 'No audio file provided' },
      error: undefined,
      expectedError: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('http://python.test/api/detect-beats', expect.objectContaining({
      method: 'POST',
      headers: { Accept: 'application/json' },
    }));
  });

  it('validates status-check input and maps timeout failures to a cold-start response', async () => {
    const missingEndpoint = await statusPost(makeJsonRequest({}) as any);
    expect(missingEndpoint.status).toBe(400);
    await expect(missingEndpoint.json()).resolves.toEqual({
      success: false,
      error: 'Endpoint parameter is required',
    });

    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout while waiting'), { name: 'AbortError' }));
    const timeout = await statusPost(makeJsonRequest({ endpoint: '/api/model-info' }) as any);

    expect(timeout.status).toBe(408);
    await expect(timeout.json()).resolves.toEqual({
      success: false,
      error: 'Request timeout (backend may be cold starting)',
      timeout: true,
    });
  });

  it('validates Music.ai key format before network calls and maps auth responses to user-facing errors', async () => {
    const missing = await validateMusicAiKeyPost(makeJsonRequest({}) as any);
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ valid: false, error: 'API key is required' });

    const malformed = await validateMusicAiKeyPost(makeJsonRequest({ apiKey: 'not-a-uuid' }) as any);
    expect(malformed.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(malformed.json()).resolves.toMatchObject({ valid: false });

    fetchMock.mockResolvedValueOnce(makeFetchResponse({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      textData: 'nope',
    }));
    const unauthorized = await validateMusicAiKeyPost(makeJsonRequest({
      apiKey: '2677ee02-6013-41d0-9fed-ed59ba8b0fb1',
    }) as any);
    expect(unauthorized.status).toBe(400);
    await expect(unauthorized.json()).resolves.toEqual({
      valid: false,
      error: 'Invalid API key - authentication failed',
    });

    fetchMock.mockResolvedValueOnce(makeFetchResponse({
      ok: true,
      status: 200,
      jsonData: { id: 'app-1' },
    }));
    const valid = await validateMusicAiKeyPost(makeJsonRequest({
      apiKey: '2677ee02-6013-41d0-9fed-ed59ba8b0fb1',
    }) as any);
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({
      valid: true,
      message: 'API key is valid',
      applicationInfo: { id: 'app-1' },
    });
  });
});
