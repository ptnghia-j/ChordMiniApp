/**
 * Integration tests for Next.js offload BFF routes.
 * Verifies the BFF forwards only firebase_url + metadata to the backend,
 * never re-sending uploaded audio bytes.
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

const fetchMock = jest.fn();
const mockCreateSafeTimeoutSignal = jest.fn();
const mockValidateOffloadUrl = jest.fn();
const mockGetPythonApiUrl = jest.fn();
const mockDeleteOffloadUrl = jest.fn();

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: (...args: unknown[]) => mockCreateSafeTimeoutSignal(...args),
}));

jest.mock('@/utils/blobValidation', () => ({
  validateOffloadUrl: (...args: unknown[]) => mockValidateOffloadUrl(...args),
}));

jest.mock('@/config/serverBackend', () => ({
  getPythonApiUrl: (...args: unknown[]) => mockGetPythonApiUrl(...args),
}));

jest.mock('@/services/storage/offloadCleanupService', () => ({
  deleteOffloadUrl: (...args: unknown[]) => mockDeleteOffloadUrl(...args),
}));

import { POST as detectBeatsOffload } from '@/app/api/detect-beats-offload/route';
import { POST as recognizeChordsOffload } from '@/app/api/recognize-chords-offload/route';

const makeRequest = (formData: FormData) => ({ formData: async () => formData }) as any;
const makeFile = (size = 128, name = 'demo.mp3', type = 'audio/mpeg') =>
  new File([new Uint8Array(size)], name, { type });

const makeResponse = (jsonData: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => jsonData,
  text: async () => JSON.stringify(jsonData),
});

describe('offload BFF routes', () => {
  const firebaseUrl = 'https://firebasestorage.googleapis.com/v0/b/demo/o/temp%2Fsong.mp3?alt=media&token=abc';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;
    mockCreateSafeTimeoutSignal.mockReturnValue(new AbortController().signal);
    mockValidateOffloadUrl.mockImplementation((url: string) => url);
    mockGetPythonApiUrl.mockReturnValue('https://python-backend.example');
    mockDeleteOffloadUrl.mockResolvedValue({ success: true, provider: 'firebase' });
  });

  it('detect-beats-offload forwards only firebase_url + metadata, not file bytes', async () => {
    const formData = new FormData();
    formData.append('offload_url', firebaseUrl);
    formData.append('detector', 'madmom');
    formData.append('force', 'true');
    formData.append('audio_duration', '123.4');
    formData.append('file', makeFile());

    fetchMock.mockResolvedValue(makeResponse({ success: true, beats: [0, 1] }));

    const response = await detectBeatsOffload(makeRequest(formData));
    const forwardedBody = fetchMock.mock.calls[0][1].body as FormData;

    expect(fetchMock).toHaveBeenCalledWith(
      'https://python-backend.example/api/detect-beats-firebase',
      expect.objectContaining({ method: 'POST', body: forwardedBody })
    );
    expect(forwardedBody.get('firebase_url')).toBe(firebaseUrl);
    expect(forwardedBody.get('detector')).toBe('madmom');
    expect(forwardedBody.get('force')).toBe('true');
    expect(forwardedBody.get('file')).toBeNull();
    expect(mockDeleteOffloadUrl).toHaveBeenCalledWith(firebaseUrl);
    await expect(response.json()).resolves.toEqual({ success: true, beats: [0, 1] });
  });

  it('recognize-chords-offload forwards only firebase_url + metadata, not file bytes', async () => {
    const formData = new FormData();
    formData.append('offload_url', firebaseUrl);
    formData.append('model', 'chord-cnn-lstm');
    formData.append('detector', 'chord-cnn-lstm');
    formData.append('file', makeFile());

    fetchMock.mockResolvedValue(makeResponse({ success: true, chords: [{ chord: 'C:maj', start: 0, end: 1 }] }));

    const response = await recognizeChordsOffload(makeRequest(formData));
    const forwardedBody = fetchMock.mock.calls[0][1].body as FormData;

    expect(fetchMock).toHaveBeenCalledWith(
      'https://python-backend.example/api/recognize-chords-firebase',
      expect.objectContaining({ method: 'POST', body: forwardedBody })
    );
    expect(forwardedBody.get('firebase_url')).toBe(firebaseUrl);
    expect(forwardedBody.get('model')).toBe('chord-cnn-lstm');
    expect(forwardedBody.get('detector')).toBe('chord-cnn-lstm');
    expect(forwardedBody.get('chord_dict')).toBe('full');
    expect(forwardedBody.get('file')).toBeNull();
    expect(mockDeleteOffloadUrl).toHaveBeenCalledWith(firebaseUrl);
    await expect(response.json()).resolves.toEqual({ success: true, chords: [{ chord: 'C:maj', start: 0, end: 1 }] });
  });
});
