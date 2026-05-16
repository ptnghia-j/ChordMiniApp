import { getPythonApiUrl, getSheetSageApiUrl, getYtMp3GoBaseUrl, getYtMp3GoHostname } from '@/config/serverBackend';

describe('serverBackend', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers PYTHON_API_URL when set', () => {
    process.env.PYTHON_API_URL = 'https://server-backend.example';

    expect(getPythonApiUrl()).toBe('https://server-backend.example');
  });

  it('falls back to localhost when PYTHON_API_URL is not set', () => {
    delete process.env.PYTHON_API_URL;

    expect(getPythonApiUrl()).toBe('http://localhost:5001');
  });

  it('uses SHEETSAGE_API_URL in Vercel production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.example.com';

    expect(getSheetSageApiUrl()).toBe('https://sheetsage.example.com');
  });

  it('uses the local SheetSage URL outside production when it points at localhost', () => {
    delete process.env.VERCEL_ENV;
    process.env.LOCAL_SHEETSAGE_API_URL = 'http://localhost:8082';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.example.com';

    expect(getSheetSageApiUrl()).toBe('http://localhost:8082');
  });

  it('normalizes private yt-mp3-go base URL without exposing a public default', () => {
    delete process.env.YT_MP3_GO_BASE_URL;
    expect(getYtMp3GoBaseUrl()).toBeNull();

    process.env.YT_MP3_GO_BASE_URL = 'https://yt-private.example.com///';
    expect(getYtMp3GoBaseUrl()).toBe('https://yt-private.example.com');
    expect(getYtMp3GoHostname()).toBe('yt-private.example.com');
  });
});
