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

const mockValidateSegmentationAccessCode = jest.fn();
const mockGetSegmentationAccessMissingConfigurationMessage = jest.fn(() => 'Missing access configuration');
const mockBuildSegmentationRequestHash = jest.fn(() => 'request-hash');
const mockCreateSegmentationJob = jest.fn();
const mockDeleteNonCompletedSegmentationJobsByRequestHash = jest.fn();
const mockFindActiveSegmentationJobByRequestHash = jest.fn();
const mockFindCompletedSegmentationJobByRequestHash = jest.fn();

jest.mock('@/config/api', () => ({
  BACKEND_URLS: {
    SONGFORMER_BACKEND: 'https://songformer.example',
  },
}));

jest.mock('@/services/api/segmentationAccessService', () => ({
  validateSegmentationAccessCode: (...args: unknown[]) => mockValidateSegmentationAccessCode(...args),
  getSegmentationAccessMissingConfigurationMessage: () => mockGetSegmentationAccessMissingConfigurationMessage(),
}));

jest.mock('@/services/firebase/segmentationJobService', () => ({
  buildSegmentationRequestHash: (...args: unknown[]) => mockBuildSegmentationRequestHash(...args),
  createSegmentationJob: (...args: unknown[]) => mockCreateSegmentationJob(...args),
  deleteNonCompletedSegmentationJobsByRequestHash: (...args: unknown[]) => mockDeleteNonCompletedSegmentationJobsByRequestHash(...args),
  findActiveSegmentationJobByRequestHash: (...args: unknown[]) => mockFindActiveSegmentationJobByRequestHash(...args),
  findCompletedSegmentationJobByRequestHash: (...args: unknown[]) => mockFindCompletedSegmentationJobByRequestHash(...args),
}));

const makeRequest = (body: unknown, origin: string = 'https://app.example') => ({
  json: async () => body,
  nextUrl: { origin },
}) as any;

const baseSongContext = {
  title: 'Song',
  artist: 'Artist',
  audioUrl: 'https://cdn.example/song.mp3',
  beats: [0, 1, 2],
  chords: [{ chord: 'C', time: 0 }],
};

const importRoute = async () => import('@/app/api/segmentation/jobs/route');

describe('POST /api/segmentation/jobs', () => {
  const originalCallbackBase = process.env.SONGFORMER_CALLBACK_BASE_URL;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SONGFORMER_CALLBACK_BASE_URL;
    mockFindCompletedSegmentationJobByRequestHash.mockResolvedValue(null);
    mockFindActiveSegmentationJobByRequestHash.mockResolvedValue(null);
    mockValidateSegmentationAccessCode.mockReturnValue({ isValid: true });
    mockCreateSegmentationJob.mockResolvedValue({ jobId: 'job-123', updateToken: 'token-abc' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.SONGFORMER_CALLBACK_BASE_URL = originalCallbackBase;
  });

  it('returns cached completed jobs before validating access or creating a new job', async () => {
    mockFindCompletedSegmentationJobByRequestHash.mockResolvedValue({
      jobId: 'job-cached',
      result: { segments: [{ label: 'Verse' }] },
    });

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ songContext: baseSongContext, accessCode: 'secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      jobId: 'job-cached',
      status: 'completed',
      data: { segments: [{ label: 'Verse' }] },
      cached: true,
    });
    expect(mockValidateSegmentationAccessCode).not.toHaveBeenCalled();
    expect(mockCreateSegmentationJob).not.toHaveBeenCalled();
  });

  it('reuses active jobs for the same request hash', async () => {
    mockFindActiveSegmentationJobByRequestHash.mockResolvedValue({
      jobId: 'job-active',
      status: 'processing',
    });

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ songContext: baseSongContext, accessCode: 'secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      jobId: 'job-active',
      status: 'processing',
      reused: true,
    });
    expect(mockValidateSegmentationAccessCode).not.toHaveBeenCalled();
    expect(mockCreateSegmentationJob).not.toHaveBeenCalled();
  });

  it('returns 503 when segmentation access is not configured', async () => {
    mockValidateSegmentationAccessCode.mockReturnValue({
      isValid: false,
      error: 'Missing access configuration',
    });

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ songContext: baseSongContext }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Missing access configuration',
    });
    expect(mockDeleteNonCompletedSegmentationJobsByRequestHash).not.toHaveBeenCalled();
    expect(mockCreateSegmentationJob).not.toHaveBeenCalled();
  });

  it('creates a new job with resolved audio and callback URLs', async () => {
    process.env.SONGFORMER_CALLBACK_BASE_URL = 'https://callbacks.example/';

    const songContext = {
      ...baseSongContext,
      audioUrl: '/audio/generated/song.mp3',
    };

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ songContext, accessCode: 'secret' }, 'https://app.example'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      jobId: 'job-123',
      status: 'created',
      updateToken: 'token-abc',
      workerRequest: {
        endpointUrl: 'https://songformer.example/api/songformer/segment',
        audioUrl: 'https://app.example/audio/generated/song.mp3',
        callbackUrl: 'https://callbacks.example/api/segmentation/jobs/job-123',
      },
    });
    expect(mockBuildSegmentationRequestHash).toHaveBeenCalledWith(songContext, 'https://app.example/audio/generated/song.mp3');
    expect(mockDeleteNonCompletedSegmentationJobsByRequestHash).toHaveBeenCalledWith('request-hash');
    expect(mockCreateSegmentationJob).toHaveBeenCalledWith(songContext, 'https://app.example/audio/generated/song.mp3');
  });
});