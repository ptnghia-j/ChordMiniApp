jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: class MockNextResponse {
    status: number;
    headers: Headers;
    private body: unknown;

    constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers ?? {});
      this.body = body;
    }

    static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
      return new this(body, init);
    }

    async json() {
      return this.body;
    }
  },
}));

const mockRunStandardStatusProbes = jest.fn();
const mockRecordStatusProbeResults = jest.fn();

jest.mock('@/services/status/statusProbes', () => ({
  runStandardStatusProbes: (...args: unknown[]) => mockRunStandardStatusProbes(...args),
}));

jest.mock('@/services/status/statusReportService', () => ({
  recordStatusProbeResults: (...args: unknown[]) => mockRecordStatusProbeResults(...args),
}));

import { GET as statusProbeGet } from '@/app/api/cron/status-probe/route';

const makeCronRequest = (authorization?: string) => ({
  headers: {
    get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization || null : null),
  },
});

describe('status cron routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CRON_SECRET;
    delete process.env.STATUS_PROBES_ENABLED;
    delete process.env.STATUS_PROBE_ALLOW_LOCAL;
    delete process.env.PYTHON_API_URL;
    delete process.env.SHEETSAGE_API_URL;
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

  it('requires cron authorization and skips local disabled probes without endpoint calls', async () => {
    process.env.CRON_SECRET = 'secret';

    const unauthorized = await statusProbeGet(makeCronRequest('Bearer wrong') as any);
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ success: false, error: 'Unauthorized' });

    const disabled = await statusProbeGet(makeCronRequest('Bearer secret') as any);
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toMatchObject({ success: false, skipped: true });
    expect(mockRunStandardStatusProbes).not.toHaveBeenCalled();
    expect(mockRecordStatusProbeResults).not.toHaveBeenCalled();
  });
});
