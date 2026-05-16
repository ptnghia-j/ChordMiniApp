import { canRunStatusProbes, canRunYtExtractionProbe, getStatusConfig } from '@/services/status/statusConfig';

describe('statusConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STATUS_PROBES_ENABLED;
    delete process.env.STATUS_PROBE_ALLOW_LOCAL;
    delete process.env.PYTHON_API_URL;
    delete process.env.SHEETSAGE_API_URL;
    delete process.env.YT_MP3_GO_BASE_URL;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps probes disabled by default for local clones without private env', () => {
    const config = getStatusConfig();

    expect(config.probesEnabled).toBe(false);
    expect(config.storageEnabled).toBe(false);
    expect(canRunStatusProbes(config)).toBe(false);
    expect(canRunYtExtractionProbe(config)).toBe(false);
  });

  it('requires explicit private env before any status probe can run', () => {
    process.env.STATUS_PROBES_ENABLED = '1';
    process.env.STATUS_PROBE_ALLOW_LOCAL = '1';
    process.env.PYTHON_API_URL = 'https://python.private.test';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.private.test';
    process.env.FIREBASE_PROJECT_ID = 'project';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id":"project"}';

    let config = getStatusConfig();
    expect(canRunStatusProbes(config)).toBe(true);
    expect(canRunYtExtractionProbe(config)).toBe(false);

    process.env.YT_MP3_GO_BASE_URL = 'https://yt.private.test';
    config = getStatusConfig();
    expect(canRunYtExtractionProbe(config)).toBe(true);
  });
});
