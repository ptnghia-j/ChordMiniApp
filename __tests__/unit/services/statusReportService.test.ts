const mockGetDocument = jest.fn();
const mockSetDocument = jest.fn();
const mockListDocuments = jest.fn();
const mockDeleteDocuments = jest.fn();

jest.mock('@/services/firebase/firestoreAdminService', () => ({
  getDocumentWithAdminAccess: (...args: unknown[]) => mockGetDocument(...args),
  setDocumentWithAdminAccess: (...args: unknown[]) => mockSetDocument(...args),
  listDocumentsWithAdminAccess: (...args: unknown[]) => mockListDocuments(...args),
  deleteDocumentsWithAdminAccess: (...args: unknown[]) => mockDeleteDocuments(...args),
}));

import { recordStatusProbeResults, STATUS_REPORTS_COLLECTION } from '@/services/status/statusReportService';

describe('statusReportService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T14:30:00.000Z'));
    jest.clearAllMocks();
    mockGetDocument.mockResolvedValue(null);
    process.env = { ...originalEnv };
    delete process.env.STATUS_OUTAGE_CONFIRMATION_CHECKS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('writes only sanitized status fields to Firestore and softens a first outage probe', async () => {
    await recordStatusProbeResults([
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'outage',
        ok: false,
        latencyMs: 1234.56,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Gemini API did not pass a generation probe.',
        failureReason: 'timeout',
        endpointId: 'gemini-generation',
        attempts: 1,
        timeoutMs: 30000,
      },
    ]);

    expect(mockSetDocument).toHaveBeenCalledTimes(1);
    const [collectionName, _documentId, payload] = mockSetDocument.mock.calls[0];
    expect(collectionName).toBe(STATUS_REPORTS_COLLECTION);
    expect(JSON.stringify(payload)).not.toContain('http');
    expect(JSON.stringify(payload)).not.toContain('stack');
    expect(JSON.stringify(payload)).not.toContain('Authorization');
    expect(payload.services.gemini).toEqual(expect.objectContaining({
      status: 'degraded',
      totalChecks: 1,
      failedChecks: 1,
      consecutiveFailedChecks: 1,
      latencyMs: 1235,
      lastProbe: expect.objectContaining({
        serviceId: 'gemini',
        endpointId: 'gemini-generation',
        status: 'degraded',
        failureReason: 'timeout',
        attempts: 1,
        timeoutMs: 30000,
      }),
      recentProbes: [
        expect.objectContaining({
          serviceId: 'gemini',
          endpointId: 'gemini-generation',
          status: 'degraded',
        }),
      ],
    }));
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'gemini-2026-05-16-1400',
      serviceId: 'gemini',
      severity: 'minor',
      status: 'investigating',
      endedAt: null,
      summary: 'Gemini API showed degraded performance during status probing.',
    }));
  });

  it('confirms consecutive failures and keeps them in one open public incident', async () => {
    await recordStatusProbeResults([
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'outage',
        ok: false,
        latencyMs: 4000,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Gemini API did not pass a generation probe.',
      },
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'outage',
        ok: false,
        latencyMs: 9000,
        checkedAt: '2026-05-16T15:00:00.000Z',
        sanitizedSummary: 'Gemini API did not pass a generation probe.',
      },
    ]);

    const [, , payload] = mockSetDocument.mock.calls[0];
    expect(payload.incidents.filter((incident: { serviceId: string }) => incident.serviceId === 'gemini')).toHaveLength(1);
    expect(payload.services.gemini).toEqual(expect.objectContaining({
      status: 'outage',
      failedChecks: 2,
      consecutiveFailedChecks: 2,
    }));
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'gemini-2026-05-16-1400',
      title: 'Gemini API outage',
      startedAt: '2026-05-16T14:00:00.000Z',
      endedAt: null,
      status: 'investigating',
      summary: 'Gemini API did not pass one or more status probes.',
    }));
  });

  it('does not count shared beat and chord backend failures as a major outage by themselves', async () => {
    process.env.STATUS_OUTAGE_CONFIRMATION_CHECKS = '1';

    await recordStatusProbeResults([
      {
        serviceId: 'beat',
        serviceLabel: 'Beat Detection',
        probeKind: 'health',
        status: 'outage',
        ok: false,
        latencyMs: 1000,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Beat Detection did not pass a health probe.',
      },
      {
        serviceId: 'chord',
        serviceLabel: 'Chord Recognition',
        probeKind: 'health',
        status: 'outage',
        ok: false,
        latencyMs: 1000,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Chord Recognition did not pass a health probe.',
      },
      {
        serviceId: 'sheetsage',
        serviceLabel: 'Sheet Sage',
        probeKind: 'health',
        status: 'operational',
        ok: true,
        latencyMs: 10,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Sheet Sage responded normally.',
      },
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'operational',
        ok: true,
        latencyMs: 10,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'Gemini API responded normally.',
      },
    ]);

    const [, , payload] = mockSetDocument.mock.calls[0];
    expect(payload.overallStatus).toBe('partial_outage');
  });

  it('resolves an open incident when a later probe succeeds', async () => {
    mockGetDocument.mockResolvedValue({
      date: '2026-05-16',
      updatedAt: '2026-05-16T14:30:00.000Z',
      overallStatus: 'partial_outage',
      services: {
        gemini: {
          id: 'gemini',
          label: 'Gemini API',
          status: 'outage',
          uptimePct: 0,
          totalChecks: 1,
          successfulChecks: 0,
          degradedChecks: 0,
          failedChecks: 1,
          lastCheckedAt: '2026-05-16T14:00:00.000Z',
          latencyMs: 4000,
        },
      },
      incidents: [
        {
          id: 'gemini-2026-05-16-1400',
          serviceId: 'gemini',
          serviceLabel: 'Gemini API',
          severity: 'major',
          status: 'investigating',
          title: 'Gemini API outage',
          summary: 'Gemini API did not pass one or more status probes.',
          startedAt: '2026-05-16T14:00:00.000Z',
          endedAt: null,
          durationMinutes: null,
          probeKind: 'generation',
        },
      ],
      analysis: {
        status: 'pending',
        summary: null,
        patternNotes: null,
        generatedAt: null,
        attempts: 0,
        model: null,
      },
      expiresAtMs: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });

    await recordStatusProbeResults([
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'operational',
        ok: true,
        latencyMs: 5000,
        checkedAt: '2026-05-16T14:10:00.000Z',
        sanitizedSummary: 'Gemini API responded normally.',
      },
    ]);

    const [, , payload] = mockSetDocument.mock.calls[0];
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'gemini-2026-05-16-1400',
      status: 'resolved',
      startedAt: '2026-05-16T14:00:00.000Z',
      endedAt: '2026-05-16T14:10:00.000Z',
      durationMinutes: 10,
      summary: 'A later successful status probe confirmed Gemini API was responding normally.',
    }));
  });

  it('correctly handles legacy incidents with custom summaries and recovered status', async () => {
    mockGetDocument.mockResolvedValue({
      date: '2026-05-16',
      updatedAt: '2026-05-16T14:30:00.000Z',
      overallStatus: 'operational',
      services: {},
      incidents: [
        {
          id: 'yt2mp3go-2026-05-19-1203',
          serviceId: 'yt2mp3go',
          serviceLabel: 'Youtube Extraction',
          severity: 'major',
          status: 'recovered',
          title: 'YouTube Extraction outage',
          summary: 'Audio extraction has migrated to client services',
          startedAt: '2026-05-19T12:03:44.313Z',
          endedAt: null,
          durationMinutes: null,
          probeKind: 'extraction',
        },
      ],
      analysis: {
        status: 'pending',
        summary: null,
        patternNotes: null,
        generatedAt: null,
        attempts: 0,
        model: null,
      },
      expiresAtMs: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });

    await recordStatusProbeResults([
      {
        serviceId: 'gemini',
        serviceLabel: 'Gemini API',
        probeKind: 'generation',
        status: 'operational',
        ok: true,
        latencyMs: 10,
        checkedAt: '2026-05-16T14:40:00.000Z',
        sanitizedSummary: 'Gemini API responded normally.',
      },
    ]);

    const [, , payload] = mockSetDocument.mock.calls[0];
    expect(payload.incidents).toHaveLength(1);
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'yt2mp3go-2026-05-19-1203',
      serviceId: 'yt2mp3go',
      serviceLabel: 'Youtube Extraction',
      status: 'resolved',
      summary: 'Audio extraction has migrated to client services',
    }));
  });
});
