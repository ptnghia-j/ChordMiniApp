/**
 * Integration Tests: detect-beats API route
 *
 * Covers request validation, direct forwarding, checkpoint fallback,
 * key backend failures, and OPTIONS handling.
 */

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

const mockGetAudioDurationFromFile = jest.fn();
const mockCreateSafeTimeoutSignal = jest.fn();
const mockIsLocalBackend = jest.fn();

jest.mock('@/utils/audioDurationUtils', () => ({
  getAudioDurationFromFile: (...args: unknown[]) => mockGetAudioDurationFromFile(...args),
}));

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: (...args: unknown[]) => mockCreateSafeTimeoutSignal(...args),
}));

jest.mock('@/utils/backendConfig', () => ({
  isLocalBackend: () => mockIsLocalBackend(),
}));

import { OPTIONS, POST } from '@/app/api/detect-beats/route';

const fetchMock = jest.fn();

const makeFile = (size = 1024, name = 'demo.mp3', type = 'audio/mpeg') =>
  new File([new Uint8Array(size)], name, { type });

const makeRequest = (formData: FormData) => ({ formData: async () => formData }) as any;

const makeResponse = ({
  ok,
  status,
  statusText = ok ? 'OK' : 'Error',
  jsonData,
  textData = '',
  headers = {},
}: {
  ok: boolean;
  status: number;
  statusText?: string;
  jsonData?: unknown;
  textData?: string;
  headers?: Record<string, string>;
}) => ({
  ok,
  status,
  statusText,
  headers: new Headers(headers),
  json: async () => jsonData,
  text: async () => textData,
});

describe('POST /api/detect-beats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;
    mockCreateSafeTimeoutSignal.mockReturnValue(new AbortController().signal);
    mockGetAudioDurationFromFile.mockResolvedValue(42.1);
    mockIsLocalBackend.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 when the request has no audio file', async () => {
    const response = await POST(makeRequest(new FormData()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No audio file provided' });
  });

  it('forwards direct multipart requests to the backend', async () => {
    const formData = new FormData();
    const file = makeFile(4_500_000, 'large.wav', 'audio/wav');
    formData.append('file', file);
    formData.append('detector', 'madmom');

    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, jsonData: { success: true, beats: [0, 0.5], detector: 'madmom' } })
    );

    const response = await POST(makeRequest(formData));
    const forwardedBody = fetchMock.mock.calls[0][1].body as FormData;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      beats: [0, 0.5],
      detector: 'madmom',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5001/api/detect-beats',
      expect.objectContaining({ method: 'POST', body: formData })
    );
    expect(forwardedBody.get('detector')).toBe('madmom');
  });

  it('retries beat-transformer checkpoint failures with madmom and returns the fallback result', async () => {
    const formData = new FormData();
    formData.append('file', makeFile());
    formData.append('detector', 'beat-transformer');

    fetchMock
      .mockResolvedValueOnce(
        makeResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          textData: "Can't load save_path for checkpoint",
        })
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, status: 200, jsonData: { success: true, beats: [0, 1], detector: 'madmom' } })
      );

    const response = await POST(makeRequest(formData));
    const fallbackBody = fetchMock.mock.calls[1][1].body as FormData;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallbackBody.get('detector')).toBe('madmom');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, beats: [0, 1], detector: 'madmom' });
  });

  it('maps backend 413 responses to a payload-too-large error', async () => {
    const formData = new FormData();
    formData.append('file', makeFile(3_000_000, 'clip.wav', 'audio/wav'));

    fetchMock.mockResolvedValue(
      makeResponse({ ok: false, status: 413, statusText: 'Payload Too Large', textData: 'too large' })
    );

    const response = await POST(makeRequest(formData));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: 'File too large for processing',
      status: 413,
    });
  });

  it('surfaces AirTunes port conflicts as a 503 with debugging details', async () => {
    const formData = new FormData();
    formData.append('file', makeFile());

    fetchMock.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        textData: 'Forbidden',
        headers: { server: 'AirTunes/105.1' },
      })
    );

    const response = await POST(makeRequest(formData));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Port conflict with Apple AirTunes',
    });
  });

  it('returns CORS headers for OPTIONS requests', async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });
});
