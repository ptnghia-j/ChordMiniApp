import {
  canRunStatusProbes,
  getStatusConfig,
} from '@/services/status/statusConfig';

describe('statusConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STATUS_PROBES_ENABLED;
    delete process.env.STATUS_PROBE_ALLOW_LOCAL;
    delete process.env.STATUS_PROBE_TIMEOUT_MS;
    delete process.env.PYTHON_API_URL;
    delete process.env.SHEETSAGE_API_URL;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps probes disabled by default for local clones without private env', () => {
    const config = getStatusConfig();

    expect(config.probesEnabled).toBe(false);
    expect(config.storageEnabled).toBe(false);
    expect(config.geminiConfigured).toBe(false);
    expect(config.probeTimeoutMs).toBe(45_000);
    expect(config.endpointsConfigured).toEqual({
      python: false,
      sheetsage: false,
    });
    expect(canRunStatusProbes(config)).toBe(false);
  });

  it('requires explicit private env before standard status probes can run', () => {
    process.env.STATUS_PROBES_ENABLED = '1';
    process.env.STATUS_PROBE_ALLOW_LOCAL = '1';
    process.env.PYTHON_API_URL = 'https://python.private.test';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.private.test';
    process.env.FIREBASE_PROJECT_ID = 'project';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id":"project"}';
    process.env.GEMINI_API_KEY = 'gemini-key';

    const config = getStatusConfig();

    expect(config.storageEnabled).toBe(true);
    expect(config.geminiConfigured).toBe(true);
    expect(config.endpointsConfigured).toEqual({
      python: true,
      sheetsage: true,
    });
    expect(canRunStatusProbes(config)).toBe(true);
  });

  it('tracks Gemini configuration separately from backend endpoint readiness', () => {
    process.env.STATUS_PROBES_ENABLED = '1';
    process.env.STATUS_PROBE_ALLOW_LOCAL = '1';
    process.env.PYTHON_API_URL = 'https://python.private.test';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.private.test';
    process.env.FIREBASE_PROJECT_ID = 'project';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id":"project"}';

    const withoutGemini = getStatusConfig();
    expect(withoutGemini.geminiConfigured).toBe(false);
    expect(canRunStatusProbes(withoutGemini)).toBe(true);

    process.env.GEMINI_API_KEY = 'gemini-key';
    const withGemini = getStatusConfig();
    expect(withGemini.geminiConfigured).toBe(true);
  });
});
