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
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T14:30:00.000Z'));
    jest.clearAllMocks();
    mockGetDocument.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes only sanitized status fields to Firestore', async () => {
    await recordStatusProbeResults([
      {
        serviceId: 'yt2mp3go',
        serviceLabel: 'YouTube Extraction',
        probeKind: 'extraction',
        status: 'outage',
        ok: false,
        latencyMs: 1234.56,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'YouTube Extraction did not pass an extraction probe.',
      },
    ]);

    expect(mockSetDocument).toHaveBeenCalledTimes(1);
    const [collectionName, _documentId, payload] = mockSetDocument.mock.calls[0];
    expect(collectionName).toBe(STATUS_REPORTS_COLLECTION);
    expect(JSON.stringify(payload)).not.toContain('http');
    expect(JSON.stringify(payload)).not.toContain('stack');
    expect(JSON.stringify(payload)).not.toContain('Authorization');
    expect(payload.services.yt2mp3go).toEqual(expect.objectContaining({
      status: 'outage',
      totalChecks: 1,
      failedChecks: 1,
      latencyMs: 1235,
    }));
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'yt2mp3go-2026-05-16',
      serviceId: 'yt2mp3go',
      severity: 'major',
      summary: 'YouTube Extraction did not pass one or more status probes.',
    }));
  });

  it('deduplicates multiple probe failures for the same service into one public incident per day', async () => {
    await recordStatusProbeResults([
      {
        serviceId: 'yt2mp3go',
        serviceLabel: 'YouTube Extraction',
        probeKind: 'metadata',
        status: 'outage',
        ok: false,
        latencyMs: 4000,
        checkedAt: '2026-05-16T14:00:00.000Z',
        sanitizedSummary: 'YouTube Extraction did not pass a metadata probe.',
      },
      {
        serviceId: 'yt2mp3go',
        serviceLabel: 'YouTube Extraction',
        probeKind: 'extraction',
        status: 'outage',
        ok: false,
        latencyMs: 9000,
        checkedAt: '2026-05-16T15:00:00.000Z',
        sanitizedSummary: 'YouTube Extraction did not pass an extraction probe.',
      },
    ]);

    const [, , payload] = mockSetDocument.mock.calls[0];
    expect(payload.incidents.filter((incident: { serviceId: string }) => incident.serviceId === 'yt2mp3go')).toHaveLength(1);
    expect(payload.incidents[0]).toEqual(expect.objectContaining({
      id: 'yt2mp3go-2026-05-16',
      title: 'YouTube Extraction outage',
      summary: 'YouTube Extraction did not pass one or more status probes.',
    }));
  });
});
