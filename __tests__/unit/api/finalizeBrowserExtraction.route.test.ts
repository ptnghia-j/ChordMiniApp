class MockNextResponse {
  status: number;
  headers: Headers;
  private body: unknown;

  constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers ?? {});
    this.body = body;
  }

  static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
    return new MockNextResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: MockNextResponse,
}));

const mockVerifyAppCheckRequest = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetFirebaseAdminAuth = jest.fn();
const mockGetFirebaseAdminStorageBucket = jest.fn();
const mockValidateBrowserAudioCandidate = jest.fn();

jest.mock('@/utils/serverAppCheck', () => ({
  verifyAppCheckRequest: (...args: unknown[]) => mockVerifyAppCheckRequest(...args),
}));

jest.mock('@/utils/firebaseAdmin', () => ({
  getFirebaseAdminAuth: (...args: unknown[]) => mockGetFirebaseAdminAuth(...args),
  getFirebaseAdminStorageBucket: (...args: unknown[]) => mockGetFirebaseAdminStorageBucket(...args),
}));

jest.mock('@/utils/browserAudioValidation', () => {
  const actual = jest.requireActual('@/utils/browserAudioValidation');
  return {
    ...actual,
    validateBrowserAudioCandidate: (...args: unknown[]) => mockValidateBrowserAudioCandidate(...args),
  };
});

const hash = 'a'.repeat(64);
const candidatePath = `audio-candidates/user123/abc123def45/${hash}.mp3`;

function makeRequest(body: unknown, headers: HeadersInit = {}) {
  return {
    json: async () => body,
    headers: new Headers(headers),
    nextUrl: { pathname: '/api/audio/finalize-browser-extraction' },
  } as any;
}

function makeBucket() {
  const sourceFile = {
    exists: jest.fn().mockResolvedValue([true]),
    getMetadata: jest.fn().mockResolvedValue([{ contentType: 'audio/mpeg', size: '6' }]),
    download: jest.fn().mockResolvedValue([Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x01])]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const finalFile = {
    save: jest.fn().mockResolvedValue(undefined),
  };
  const bucket = {
    name: 'bucket.example',
    file: jest.fn((path: string) => path.startsWith('audio-candidates/') ? sourceFile : finalFile),
  };
  return { bucket, sourceFile, finalFile };
}

describe('POST /api/audio/finalize-browser-extraction', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockVerifyAppCheckRequest.mockResolvedValue({ ok: true });
    mockVerifyIdToken.mockResolvedValue({ uid: 'user123' });
    mockGetFirebaseAdminAuth.mockResolvedValue({ verifyIdToken: mockVerifyIdToken });
    mockValidateBrowserAudioCandidate.mockResolvedValue({ duration: 42, bitrate: 192000 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects malformed candidate paths before touching storage', async () => {
    const { POST } = await import('@/app/api/audio/finalize-browser-extraction/route');
    const response = await POST(makeRequest({
      videoId: 'abc123def45',
      candidatePath: 'audio/bad.mp3',
      sha256: hash,
      fileSize: 6,
    }, { authorization: 'Bearer token' }));

    expect(response.status).toBe(400);
    expect(mockGetFirebaseAdminStorageBucket).not.toHaveBeenCalled();
  });

  it('rejects candidates owned by another authenticated user', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'other-user' });
    const { POST } = await import('@/app/api/audio/finalize-browser-extraction/route');

    const response = await POST(makeRequest({
      videoId: 'abc123def45',
      candidatePath,
      sha256: hash,
      fileSize: 6,
    }, { authorization: 'Bearer token' }));

    expect(response.status).toBe(403);
  });

  it('promotes validated candidates to public cached audio', async () => {
    const { bucket, sourceFile, finalFile } = makeBucket();
    mockGetFirebaseAdminStorageBucket.mockResolvedValue(bucket);
    const { POST } = await import('@/app/api/audio/finalize-browser-extraction/route');

    const response = await POST(makeRequest({
      videoId: 'abc123def45',
      candidatePath,
      sha256: hash,
      fileSize: 6,
      title: 'Song',
    }, { authorization: 'Bearer token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      success: true,
      title: 'Song',
      duration: 42,
      isStreamUrl: false,
      method: 'browser-ytdlp',
    }));
    expect(finalFile.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({
          contentType: 'audio/mpeg',
          metadata: expect.objectContaining({
            bitrate: '192k',
            source: 'browser-ytdlp',
          }),
        }),
      })
    );
    expect(sourceFile.delete).toHaveBeenCalled();
  });
});
