jest.mock('@/config/serverBackend', () => ({
  getPythonApiUrl: jest.fn(() => 'https://python.example.com'),
  getSongformerApiUrl: jest.fn(() => 'https://songformer.example.com'),
  getSheetSageApiUrl: jest.fn(() => 'https://sheetsage.example.com'),
  getFrontendBaseUrl: jest.fn(() => 'https://frontend.example.com'),
}));

describe('config/api', () => {
  const fetchMock = global.fetch as jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('exposes backend URLs and route helpers', async () => {
    const { BACKEND_URLS, API_ROUTES, getApiUrl, isExternalBackendEndpoint } = await import('@/config/api');

    expect(BACKEND_URLS).toEqual({
      PYTHON_BACKEND: 'https://python.example.com',
      SONGFORMER_BACKEND: 'https://songformer.example.com',
      SHEETSAGE_BACKEND: 'https://sheetsage.example.com',
      VERCEL_FRONTEND: 'https://frontend.example.com',
    });
    expect(getApiUrl('RECOGNIZE_CHORDS')).toBe(API_ROUTES.RECOGNIZE_CHORDS);
    expect(isExternalBackendEndpoint('RECOGNIZE_CHORDS')).toBe(false);
    expect(getApiUrl('TRANSCRIBE_SHEETSAGE')).toBe('/api/transcribe-sheetsage');
  });

  it('uses default fetch options for internal routes', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    const { apiRequest } = await import('@/config/api');

    const response = await apiRequest('MODEL_INFO');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-info',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(response.status).toBe(200);
  });

  it('lets request-specific options override defaults', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    const { apiPost, apiGet } = await import('@/config/api');

    await apiPost('CHATBOT', { prompt: 'hi' }, {
      headers: { Authorization: 'Bearer token' },
      signal: 'mock-signal' as unknown as AbortSignal,
    });
    await apiGet('DOCS');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chatbot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'hi' }),
        headers: { Authorization: 'Bearer token' },
        signal: 'mock-signal',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/docs',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('logs non-abort HTTP failures and returns the response', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
    const { apiRequest } = await import('@/config/api');

    const response = await apiRequest('MODEL_INFO');

    expect(response.status).toBe(503);
    expect(errorSpy).toHaveBeenCalledWith('API request failed: 503 Service Unavailable');
  });

  it('rethrows fetch errors and suppresses logging for AbortError only', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { apiRequest } = await import('@/config/api');

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(apiRequest('MODEL_INFO')).rejects.toThrow('network down');
    expect(errorSpy).toHaveBeenCalledWith('API request error for /api/model-info:', expect.any(Error));

    errorSpy.mockClear();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);
    await expect(apiRequest('MODEL_INFO')).rejects.toThrow('aborted');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
