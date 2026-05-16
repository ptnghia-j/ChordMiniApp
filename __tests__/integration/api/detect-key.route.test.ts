/**
 * Integration Tests: detect-key API route
 *
 * Covers request validation, missing configuration, cache hits,
 * enhanced JSON parsing, fallback parsing, and fatal route errors.
 */

class MockDetectKeyNextResponse {
  status: number;
  headers: Headers;
  private body: unknown;

  constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers ?? {});
    this.body = body;
  }

  static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
    return new MockDetectKeyNextResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: MockDetectKeyNextResponse,
}));

const mockGenerateContent = jest.fn();
const mockGoogleGenAI = jest.fn().mockImplementation(() => ({
  models: {
    generateContent: mockGenerateContent,
  },
}));
const mockGetDocumentWithAdminAccess = jest.fn();
const mockSetDocumentWithAdminAccess = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
  ThinkingLevel: {
    HIGH: 'HIGH',
  },
}));

jest.mock('@/services/firebase/firestoreAdminService', () => ({
  getDocumentWithAdminAccess: (...args: unknown[]) => mockGetDocumentWithAdminAccess(...args),
  setDocumentWithAdminAccess: (...args: unknown[]) => mockSetDocumentWithAdminAccess(...args),
}));

const makeRequest = (body: unknown) => ({ json: async () => body }) as any;

const importRoute = async () => import('@/app/api/detect-key/route');

describe('POST /api/detect-key', () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'server-gemini-key';
    mockGetDocumentWithAdminAccess.mockResolvedValue(null);
    mockSetDocumentWithAdminAccess.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
  });

  it('returns 400 for an invalid or empty chord payload', async () => {
    const { POST } = await importRoute();
    const response = await POST(makeRequest({ chords: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid chord progression data' });
  });

  it('returns a heuristic fallback when no server Gemini key is configured and BYOK is not provided', async () => {
    delete process.env.GEMINI_API_KEY;

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ chords: [{ chord: 'Bb', time: 0 }, { chord: 'F', time: 1 }] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primaryKey: 'F major',
      modulation: null,
      fromHeuristicFallback: true,
      originalChords: undefined,
      correctedChords: undefined,
      corrections: undefined,
      sequenceCorrections: null,
      romanNumerals: null,
      rawResponse: undefined,
    });
    expect(mockSetDocumentWithAdminAccess).not.toHaveBeenCalled();
  });

  it('returns cached results and backfills expected enhanced fields', async () => {
    mockGetDocumentWithAdminAccess.mockResolvedValue({
      primaryKey: 'G major',
      modulation: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'G', time: 0 }, { chord: 'D', time: 1 }],
        includeEnharmonicCorrection: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primaryKey: 'G major',
      modulation: null,
      originalChords: ['G', 'D'],
      correctedChords: ['G', 'D'],
      corrections: {},
      sequenceCorrections: null,
      romanNumerals: null,
      fromCache: true,
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockGoogleGenAI).not.toHaveBeenCalled();
    expect(mockSetDocumentWithAdminAccess).not.toHaveBeenCalled();
  });

  it('returns cached results before requiring Gemini configuration', async () => {
    delete process.env.GEMINI_API_KEY;
    mockGetDocumentWithAdminAccess.mockResolvedValue({
      primaryKey: 'C major',
      modulation: null,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'C', time: 0 }, { chord: 'G', time: 1 }],
        includeEnharmonicCorrection: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primaryKey: 'C major',
      modulation: null,
      originalChords: ['C', 'G'],
      correctedChords: ['C', 'G'],
      corrections: {},
      sequenceCorrections: null,
      romanNumerals: null,
      fromCache: true,
    });
    expect(mockGoogleGenAI).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockSetDocumentWithAdminAccess).not.toHaveBeenCalled();
  });

  it('parses enhanced JSON responses and saves a normalized cache entry', async () => {
    mockGenerateContent.mockResolvedValue({
      text: `\`\`\`json
{"primaryKey":"C major","modulation":"A minor","sequenceCorrections":{"originalSequence":["Db","Ab"],"correctedSequence":["C#","G#"],"keyAnalysis":{"sections":[{"startIndex":0,"endIndex":1,"key":"C major","chords":["C#","G#"]}],"modulations":[{"fromKey":"C major","toKey":"A minor","atIndex":1}]}},"romanNumerals":{"analysis":["I","V7|vi"],"keyContext":"C major","temporalShifts":[{"chordIndex":1,"targetKey":"A minor","romanNumeral":"V7|vi"}]}}
\`\`\``,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'Db', time: 0 }, { chord: 'Ab', time: 1 }],
        includeEnharmonicCorrection: true,
        includeRomanNumerals: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      primaryKey: 'C major',
      modulation: 'A minor',
      originalChords: ['Db', 'Ab'],
      correctedChords: ['C#', 'G#'],
      corrections: { Db: 'C#', Ab: 'G#' },
      sequenceCorrections: expect.objectContaining({ correctedSequence: ['C#', 'G#'] }),
      romanNumerals: expect.objectContaining({ analysis: ['I', 'V7|vi'] }),
    });
    expect(mockSetDocumentWithAdminAccess).toHaveBeenCalledWith(
      'keyDetections',
      expect.any(String),
      expect.objectContaining({
        primaryKey: 'C major',
        modulation: 'A minor',
        corrections: { Db: 'C#', Ab: 'G#' },
        sequenceCorrections: expect.objectContaining({ correctedSequence: ['C#', 'G#'] }),
        romanNumerals: expect.objectContaining({ analysis: ['I', 'V7|vi'] }),
      })
    );
  });

  it('strips undefined fields before saving key detection cache entries', async () => {
    mockGenerateContent.mockResolvedValue({
      text: `{"primaryKey":"C major","modulation":null,"sequenceCorrections":{"originalSequence":["C","G"],"correctedSequence":["C","G"]}}`,
    });

    const { POST } = await importRoute();
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'C', time: 0 }, { chord: 'G', time: 1 }],
        includeEnharmonicCorrection: true,
      })
    );

    expect(response.status).toBe(200);
    expect(mockSetDocumentWithAdminAccess).toHaveBeenCalledTimes(1);
    const savedPayload = mockSetDocumentWithAdminAccess.mock.calls[0][2];
    expect(JSON.stringify(savedPayload)).not.toContain('undefined');
    expect(savedPayload.sequenceCorrections).toEqual({
      originalSequence: ['C', 'G'],
      correctedSequence: ['C', 'G'],
    });
    expect(savedPayload.sequenceCorrections).not.toHaveProperty('keyAnalysis');
  });

  it('falls back to legacy text parsing when enhanced JSON parsing fails', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Primary Key: **B♭ major**\nPossible Tonal Modulation: **None**',
    });

    const { POST } = await importRoute();
    const response = await POST(
      makeRequest({
        chords: [{ chord: 'Bb', time: 0 }, { chord: 'F', time: 1 }],
        includeEnharmonicCorrection: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primaryKey: 'B♭ major',
      modulation: null,
      originalChords: ['Bb', 'F'],
      correctedChords: ['Bb', 'F'],
      corrections: {},
      romanNumerals: null,
      rawResponse: 'Primary Key: **B♭ major**\nPossible Tonal Modulation: **None**',
    });
  });

  it('returns a heuristic fallback when Gemini generation throws an unexpected error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('gemini unavailable'));

    const { POST } = await importRoute();
    const response = await POST(makeRequest({ chords: [{ chord: 'C', time: 0 }], bypassCache: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      primaryKey: 'C major',
      modulation: null,
      fromHeuristicFallback: true,
      originalChords: undefined,
      correctedChords: undefined,
      corrections: undefined,
      sequenceCorrections: null,
      romanNumerals: null,
      rawResponse: undefined,
    });
    expect(mockSetDocumentWithAdminAccess).not.toHaveBeenCalled();
  });
});
