const mockCollection = jest.fn((...args: unknown[]) => ({ type: 'collection', args }));
const mockDoc = jest.fn((...args: unknown[]) => ({ type: 'doc', args }));
const mockDeleteDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockQuery = jest.fn((...args: unknown[]) => ({ type: 'query', args }));
const mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
const mockSetDoc = jest.fn();
const mockWhere = jest.fn((...args: unknown[]) => ({ type: 'where', args }));
const mockDeleteDocumentsWithAdminAccess = jest.fn();

jest.mock('@/config/firebase', () => ({
  SEGMENTATION_JOBS_COLLECTION: 'segmentationJobs',
  getFirestoreInstance: jest.fn().mockResolvedValue({ __type: 'mock-firestore-db' }),
}));

jest.mock('@/services/firebase/firestoreAdminService', () => ({
  deleteDocumentsWithAdminAccess: (...args: unknown[]) => mockDeleteDocumentsWithAdminAccess(...args),
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  serverTimestamp: (...args: unknown[]) => mockServerTimestamp(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  where: (...args: unknown[]) => mockWhere(...args),
}));

function makeSnapshot(jobs: Array<Record<string, unknown>>) {
  return {
    forEach: (callback: (docSnap: { data: () => Record<string, unknown> }) => void) => {
      jobs.forEach((job) => callback({ data: () => job }));
    },
    docs: jobs.map((job) => ({ data: () => job })),
  };
}

describe('segmentationJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_773_114_835_172);
    mockDeleteDocumentsWithAdminAccess.mockResolvedValue(0);
    mockSetDoc.mockResolvedValue(undefined);
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

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        status: 'completed',
        error: null,
        updatedAt: 'SERVER_TIMESTAMP',
        completedAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true },
    );
  });

  it('uses admin-backed deletion for stale cleanup on the server', async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeSnapshot([
        {
          jobId: 'stale-created',
          status: 'created',
          createdAtMs: 100,
          updatedAtMs: 100,
          staleAtMs: 200,
        },
      ]))
      .mockResolvedValueOnce(makeSnapshot([
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
      ]));
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
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});