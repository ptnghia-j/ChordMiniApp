const mockGoogleGenAIGemini = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAIGemini,
}));

describe('config/gemini', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockGoogleGenAIGemini.mockImplementation((config) => ({ config, instanceId: Symbol('client') }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when no API key is available', async () => {
    delete process.env.GEMINI_API_KEY;

    const { createGeminiClient } = await import('@/config/gemini');

    expect(createGeminiClient()).toBeNull();
    expect(mockGoogleGenAIGemini).not.toHaveBeenCalled();
  });

  it('caches the server client by timeout when using the env API key', async () => {
    process.env.GEMINI_API_KEY = 'env-key';

    const { createGeminiClient, GEMINI_DEFAULT_TIMEOUT_MS } = await import('@/config/gemini');

    const first = createGeminiClient();
    const second = createGeminiClient();
    const third = createGeminiClient({ timeoutMs: 5000 });

    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(mockGoogleGenAIGemini).toHaveBeenCalledTimes(2);
    expect(mockGoogleGenAIGemini).toHaveBeenNthCalledWith(1, {
      apiKey: 'env-key',
      httpOptions: { timeout: GEMINI_DEFAULT_TIMEOUT_MS },
    });
    expect(mockGoogleGenAIGemini).toHaveBeenNthCalledWith(2, {
      apiKey: 'env-key',
      httpOptions: { timeout: 5000 },
    });
  });

  it('creates uncached clients for explicit API keys', async () => {
    process.env.GEMINI_API_KEY = 'env-key';

    const { createGeminiClient } = await import('@/config/gemini');

    const first = createGeminiClient({ apiKey: 'user-key', timeoutMs: 9000 });
    const second = createGeminiClient({ apiKey: 'user-key', timeoutMs: 9000 });

    expect(first).not.toBe(second);
    expect(mockGoogleGenAIGemini).toHaveBeenCalledTimes(2);
    expect(mockGoogleGenAIGemini).toHaveBeenNthCalledWith(1, {
      apiKey: 'user-key',
      httpOptions: { timeout: 9000 },
    });
  });
});
