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

  it('records beat, chord, Sheet Sage, and Gemini standard probes', async () => {
    process.env.CRON_SECRET = 'secret';
    process.env.STATUS_PROBES_ENABLED = '1';
    process.env.STATUS_PROBE_ALLOW_LOCAL = '1';
    process.env.PYTHON_API_URL = 'https://python.private.test';
    process.env.SHEETSAGE_API_URL = 'https://sheetsage.private.test';
    process.env.FIREBASE_PROJECT_ID = 'project';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"project_id":"project"}';

    const probes = [
      { serviceId: 'beat', serviceLabel: 'Beat Detection', probeKind: 'health', status: 'operational', ok: true, latencyMs: 10, checkedAt: '2026-05-16T14:00:00.000Z', sanitizedSummary: 'Beat Detection responded normally.' },
      { serviceId: 'chord', serviceLabel: 'Chord Recognition', probeKind: 'metadata', status: 'operational', ok: true, latencyMs: 11, checkedAt: '2026-05-16T14:00:00.000Z', sanitizedSummary: 'Chord Recognition responded normally.' },
      { serviceId: 'sheetsage', serviceLabel: 'Sheet Sage', probeKind: 'health', status: 'operational', ok: true, latencyMs: 12, checkedAt: '2026-05-16T14:00:00.000Z', sanitizedSummary: 'Sheet Sage responded normally.' },
      { serviceId: 'gemini', serviceLabel: 'Gemini API', probeKind: 'generation', status: 'operational', ok: true, latencyMs: 13, checkedAt: '2026-05-16T14:00:00.000Z', sanitizedSummary: 'Gemini API responded normally.' },
    ];
    mockRunStandardStatusProbes.mockResolvedValueOnce(probes);
    mockRecordStatusProbeResults.mockResolvedValueOnce({
      date: '2026-05-16',
      overallStatus: 'operational',
    });

    const response = await statusProbeGet(makeCronRequest('Bearer secret') as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      checked: 4,
      date: '2026-05-16',
      overallStatus: 'operational',
    });
    expect(mockRunStandardStatusProbes).toHaveBeenCalledTimes(1);
    expect(mockRecordStatusProbeResults).toHaveBeenCalledWith(probes);
  });
});
