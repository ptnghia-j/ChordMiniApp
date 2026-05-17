const mockDeleteDocumentsWithAdminAccess = jest.fn();
const mockGetDocumentWithAdminAccess = jest.fn();
const mockQueryDocumentsByFieldWithAdminAccess = jest.fn();
const mockSetDocumentWithAdminAccess = jest.fn();
const mockUpdateDocumentFieldsWithAdminAccess = jest.fn();

jest.mock('@/services/firebase/firestoreAdminService', () => ({
  deleteDocumentsWithAdminAccess: (...args: unknown[]) => mockDeleteDocumentsWithAdminAccess(...args),
  getDocumentWithAdminAccess: (...args: unknown[]) => mockGetDocumentWithAdminAccess(...args),
  queryDocumentsByFieldWithAdminAccess: (...args: unknown[]) => mockQueryDocumentsByFieldWithAdminAccess(...args),
  setDocumentWithAdminAccess: (...args: unknown[]) => mockSetDocumentWithAdminAccess(...args),
  updateDocumentFieldsWithAdminAccess: (...args: unknown[]) => mockUpdateDocumentFieldsWithAdminAccess(...args),
}));

describe('segmentationJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_773_114_835_172);
    mockDeleteDocumentsWithAdminAccess.mockResolvedValue(0);
    mockGetDocumentWithAdminAccess.mockResolvedValue(null);
    mockQueryDocumentsByFieldWithAdminAccess.mockResolvedValue([]);
    mockSetDocumentWithAdminAccess.mockResolvedValue(undefined);
    mockUpdateDocumentFieldsWithAdminAccess.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears stale error fields when a job is marked completed', async () => {
    const { updateSegmentationJob } = await import('@/services/firebase/segmentationJobService');

    await updateSegmentationJob('seg-job-1', {
      status: 'completed',
      result: {
        segments: [{ type: 'verse', startTime: 0, endTime: 12, confidence: 0.9, label: 'Verse' }],
        analysis: { structure: 'verse', tempo: 120, timeSignature: 4 },
        metadata: { totalDuration: 12, analysisTimestamp: 123, model: 'songformer' },
      },
      error: 'Network Error',
      model: 'songformer',
    });

    expect(mockUpdateDocumentFieldsWithAdminAccess).toHaveBeenCalledWith(
      'segmentationJobs',
      'seg-job-1',
      expect.objectContaining({
        status: 'completed',
        error: null,
        updatedAt: new Date(1_773_114_835_172).toISOString(),
        completedAt: new Date(1_773_114_835_172).toISOString(),
      }),
    );
  });

  it('uses admin-backed deletion for stale cleanup on the server', async () => {
    mockQueryDocumentsByFieldWithAdminAccess
      .mockResolvedValueOnce([
        {
          jobId: 'stale-created',
          status: 'created',
          createdAtMs: 100,
          updatedAtMs: 100,
          staleAtMs: 200,
        },
      ])
      .mockResolvedValueOnce([
        {
          jobId: 'active-processing',
          status: 'processing',
          createdAtMs: 1_000,
          updatedAtMs: 1_000,
          staleAtMs: Date.now() + 60_000,
        },
        {
          jobId: 'stale-processing',
          status: 'processing',
          createdAtMs: 100,
          updatedAtMs: 100,
          staleAtMs: 200,
        },
      ]);
    mockDeleteDocumentsWithAdminAccess.mockResolvedValue(2);

    const { cleanupStaleSegmentationJobs } = await import('@/services/firebase/segmentationJobService');
    const result = await cleanupStaleSegmentationJobs({ nowMs: 500, limit: 10 });

    expect(mockDeleteDocumentsWithAdminAccess).toHaveBeenCalledWith('segmentationJobs', [
      'stale-created',
      'stale-processing',
    ]);
    expect(result).toEqual({
      scannedCount: 3,
      deletedCount: 2,
      staleJobIds: ['stale-created', 'stale-processing'],
    });
  });
});
