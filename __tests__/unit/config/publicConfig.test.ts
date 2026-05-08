import {
  clearConfigCache,
  getCachedConfig,
  getConfigValue,
  getConfigValueSync,
  getFirebaseConfig,
  getFirebaseConfigSync,
  isConfigLoaded,
  loadPublicConfig,
  preloadConfig,
} from '@/config/publicConfig';

describe('publicConfig', () => {
  const originalEnv = process.env;
  const fetchMock = global.fetch as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearConfigCache();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_BASE_URL: 'http://env.example',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'env-api-key',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'env-project',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
    clearConfigCache();
  });

  it('loads runtime config on the client and caches the result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        NEXT_PUBLIC_BASE_URL: 'http://runtime.example',
        NEXT_PUBLIC_FIREBASE_API_KEY: 'runtime-api-key',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'runtime-project',
      }),
    });

    const first = await loadPublicConfig();
    const second = await loadPublicConfig();

    expect(first).toEqual({
      NEXT_PUBLIC_BASE_URL: 'http://runtime.example',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'runtime-api-key',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'runtime-project',
    });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isConfigLoaded()).toBe(true);
    expect(getCachedConfig()).toEqual(first);
  });

  it('falls back to process.env when runtime config fetch fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('config unavailable'));

    await expect(loadPublicConfig()).resolves.toMatchObject({
      NEXT_PUBLIC_BASE_URL: 'http://env.example',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'env-api-key',
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[publicConfig] Failed to load runtime config, falling back to process.env:',
      expect.any(Error)
    );
  });

  it('deduplicates concurrent config requests using the in-flight promise', async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const firstPromise = loadPublicConfig();
    const secondPromise = loadPublicConfig();

    resolveFetch({
      ok: true,
      json: async () => ({ NEXT_PUBLIC_BASE_URL: 'http://runtime.example' }),
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns async config values and Firebase config from the loaded cache', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        NEXT_PUBLIC_BASE_URL: 'http://runtime.example',
        NEXT_PUBLIC_FIREBASE_API_KEY: 'runtime-api-key',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'runtime-auth',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'runtime-project',
      }),
    });

    await preloadConfig();

    await expect(getConfigValue('NEXT_PUBLIC_BASE_URL', 'fallback')).resolves.toBe('http://runtime.example');
    await expect(getConfigValue('MISSING_KEY', 'fallback')).resolves.toBe('fallback');
    await expect(getFirebaseConfig()).resolves.toEqual({
      apiKey: 'runtime-api-key',
      authDomain: 'runtime-auth',
      projectId: 'runtime-project',
      storageBucket: undefined,
      messagingSenderId: undefined,
      appId: undefined,
      measurementId: undefined,
    });
  });

  it('warns for sync access on the client and reads directly from process.env', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getConfigValueSync('NEXT_PUBLIC_BASE_URL', 'fallback')).toBe('http://env.example');
    expect(getConfigValueSync('MISSING_KEY', 'fallback')).toBe('fallback');
    expect(getFirebaseConfigSync()).toEqual(expect.objectContaining({
      apiKey: 'env-api-key',
      projectId: 'env-project',
    }));
    expect(warnSpy).toHaveBeenCalled();
  });
});
