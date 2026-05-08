describe('backendConfig utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses PYTHON_API_URL for synchronous backend helpers while local browser detection remains localhost in jsdom', async () => {
    process.env.PYTHON_API_URL = 'https://python.example.com';

    const {
      getBackendUrl,
      isLocalBackend,
      isProductionBackend,
      getBackendApiUrl,
      validateBackendConfig,
    } = await import('@/utils/backendConfig');

    expect(getBackendUrl()).toBe('https://python.example.com');
    expect(isLocalBackend()).toBe(true);
    expect(isProductionBackend()).toBe(false);
    expect(getBackendApiUrl('api/detect-beats')).toBe('https://python.example.com/api/detect-beats');
    expect(validateBackendConfig()).toEqual({
      isValid: true,
      url: 'https://python.example.com',
      isLocal: true,
      isProduction: false,
      environmentVariable: 'https://python.example.com',
      fallbackUsed: false,
    });
  });

  it('uses window.location.origin for async client-side helpers', async () => {
    const {
      getBackendUrlAsync,
      getBackendConfigAsync,
      isLocalBackend,
      isProductionBackend,
    } = await import('@/utils/backendConfig');

    expect(await getBackendUrlAsync()).toBe(window.location.origin);
    expect(isLocalBackend()).toBe(true);
    expect(isProductionBackend()).toBe(false);

    await expect(getBackendConfigAsync()).resolves.toEqual({
      url: window.location.origin,
      isLocal: true,
      isProduction: false,
      getApiUrl: expect.any(Function),
      endpoints: expect.objectContaining({
        detectBeats: '/api/detect-beats',
        recognizeChords: '/api/recognize-chords',
      }),
    });
  });

  it('exposes import-time backendConfig values and only logs in development', async () => {
    process.env.PYTHON_API_URL = 'http://localhost:5001';
    process.env.NODE_ENV = 'development';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { backendConfig, logBackendConfig } = await import('@/utils/backendConfig');

    expect(backendConfig.url).toBe('http://localhost:5001');
    expect(backendConfig.isLocal).toBe(true);
    expect(backendConfig.isProduction).toBe(false);
    expect(backendConfig.endpoints.recognizeChordsBtcSl).toBe('/api/recognize-chords-btc-sl');

    logBackendConfig();
    expect(logSpy).toHaveBeenCalledWith(
      '🔧 Backend Configuration:',
      expect.objectContaining({
        url: 'http://localhost:5001',
        isLocal: true,
      })
    );

    logSpy.mockClear();
    process.env.NODE_ENV = 'test';
    logBackendConfig();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
