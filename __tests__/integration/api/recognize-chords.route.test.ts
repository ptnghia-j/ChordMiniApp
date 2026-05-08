/**
 * Integration Tests: recognize-chords API route
 *
 * Covers request validation, backend forwarding,
 * and key error handling branches.
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

import { POST } from '@/app/api/recognize-chords/route';

const fetchMock = jest.fn();

const makeFile = (size = 1024, name = 'demo.mp3', type = 'audio/mpeg') =>
  new File([new Uint8Array(size)], name, { type });

const makeRequest = (formData: FormData) =>
  ({ formData: async () => formData }) as any;

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

describe('POST /api/recognize-chords', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = fetchMock as any;
    mockCreateSafeTimeoutSignal.mockReturnValue(new AbortController().signal);
    mockGetAudioDurationFromFile.mockResolvedValue(87.4);
    mockIsLocalBackend.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 400 when the request has no audio file', async () => {
    const response = await POST(makeRequest(new FormData()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No audio file provided' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards direct multipart requests to the backend', async () => {
    const formData = new FormData();
    const file = makeFile(4_500_000, 'large.wav', 'audio/wav');
    formData.append('file', file);
    formData.append('model', 'btc-sl');

    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, jsonData: { success: true, model_used: 'btc-sl', chords: [{ chord: 'C', time: 0 }] } })
    );

    const response = await POST(makeRequest(formData));
    const forwardedBody = fetchMock.mock.calls[0][1].body as FormData;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      model_used: 'btc-sl',
      chords: [{ chord: 'C', time: 0 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5001/api/recognize-chords',
      expect.objectContaining({ method: 'POST', body: formData })
    );
    expect(forwardedBody.get('chord_dict')).toBe('large_voca');
  });

  it('appends a default chord dictionary before forwarding successful requests', async () => {
    const formData = new FormData();
    formData.append('file', makeFile());
    formData.append('model', 'btc-sl');

    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, jsonData: { success: true, chords: [] } })
    );

    const response = await POST(makeRequest(formData));
    const forwardedBody = fetchMock.mock.calls[0][1].body as FormData;

    expect(response.status).toBe(200);
    expect(forwardedBody.get('chord_dict')).toBe('large_voca');
    expect(mockCreateSafeTimeoutSignal).toHaveBeenCalledWith(800000);
  });

  it('uses default fallback when PYTHON_API_URL is not defined and continues after duration-debug failure', async () => {
    delete process.env.PYTHON_API_URL;
    // process.env.NEXT_PUBLIC_PYTHON_API_URL is no longer read by serverBackend.ts

    const formData = new FormData();
    formData.append('file', makeFile());
    mockGetAudioDurationFromFile.mockRejectedValue(new Error('Audio is not defined'));

    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, status: 200, jsonData: { success: true, chords: [{ chord: 'C', time: 0 }] } })
    );

    const response = await POST(makeRequest(formData));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5001/api/recognize-chords',
      expect.objectContaining({ method: 'POST', body: formData })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, chords: [{ chord: 'C', time: 0 }] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Could not detect audio duration for debugging'));
  });

  it('maps backend 413 responses to a user-friendly payload-too-large error', async () => {
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
      suggestion: expect.stringContaining('shorter audio clip'),
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

  it('returns 408 for timeout or abort failures thrown during processing', async () => {
    const formData = new FormData();
    formData.append('file', makeFile());

    fetchMock.mockRejectedValue(new Error('request aborted by timeout'));

    const response = await POST(makeRequest(formData));

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Chord recognition processing timeout',
    });
  });
});
