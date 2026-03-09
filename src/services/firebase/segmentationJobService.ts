import crypto from 'crypto';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { getFirestoreInstance, SEGMENTATION_JOBS_COLLECTION } from '@/config/firebase';
import { SegmentationResult, SongContext } from '@/types/chatbotTypes';

export type SegmentationJobStatus = 'created' | 'processing' | 'completed' | 'failed';

const DEFAULT_CREATED_JOB_TTL_MS = parsePositiveIntegerEnv('SEGMENTATION_JOB_CREATED_TTL_MS', 15 * 60 * 1000);
const DEFAULT_PROCESSING_JOB_TTL_MS = parsePositiveIntegerEnv('SEGMENTATION_JOB_PROCESSING_TTL_MS', 30 * 60 * 1000);

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export interface SegmentationJobDocument {
  jobId: string;
  requestHash: string;
  status: SegmentationJobStatus;
  title?: string;
  videoId?: string;
  uploadId?: string;
  audioUrl: string;
  result?: SegmentationResult;
  error?: string;
  model?: string;
  updateTokenHash: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  staleAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
}

export interface SegmentationJobCreateResult {
  jobId: string;
  updateToken: string;
  job: SegmentationJobDocument;
}

export interface SegmentationJobCleanupResult {
  scannedCount: number;
  deletedCount: number;
  staleJobIds: string[];
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function buildJobId(): string {
  return `seg_${Date.now()}_${crypto.randomUUID()}`;
}

function buildTokenHash(updateToken: string): string {
  return crypto.createHash('sha256').update(updateToken).digest('hex');
}

function getRequestHashInput(songContext: SongContext, audioUrl: string) {
  return JSON.stringify({
    videoId: songContext.videoId || null,
    uploadId: songContext.uploadId || null,
    audioUrl,
    duration: songContext.duration || null,
  });
}

export function buildSegmentationRequestHash(songContext: SongContext, audioUrl: string): string {
  return crypto
    .createHash('sha256')
    .update(getRequestHashInput(songContext, audioUrl))
    .digest('hex');
}

export function getSegmentationJobTtlMs(status: SegmentationJobStatus): number | null {
  switch (status) {
    case 'created':
      return DEFAULT_CREATED_JOB_TTL_MS;
    case 'processing':
      return DEFAULT_PROCESSING_JOB_TTL_MS;
    default:
      return null;
  }
}

export function getSegmentationJobStaleAtMs(
  status: SegmentationJobStatus,
  baseTimeMs: number,
): number | undefined {
  const ttlMs = getSegmentationJobTtlMs(status);
  return ttlMs ? baseTimeMs + ttlMs : undefined;
}

export function isSegmentationJobStale(
  job: Pick<SegmentationJobDocument, 'status' | 'createdAtMs' | 'updatedAtMs' | 'staleAtMs'>,
  nowMs: number = Date.now(),
): boolean {
  if (!['created', 'processing'].includes(job.status)) {
    return false;
  }

  const fallbackBaseTimeMs = job.updatedAtMs || job.createdAtMs || nowMs;
  const staleAtMs = typeof job.staleAtMs === 'number'
    ? job.staleAtMs
    : getSegmentationJobStaleAtMs(job.status, fallbackBaseTimeMs);

  return typeof staleAtMs === 'number' && staleAtMs <= nowMs;
}

export async function createSegmentationJob(
  songContext: SongContext,
  audioUrl: string,
): Promise<SegmentationJobCreateResult> {
  const firestore = await getFirestoreInstance();
  const jobId = buildJobId();
  const updateToken = crypto.randomUUID();
  const now = Date.now();
  const requestHash = buildSegmentationRequestHash(songContext, audioUrl);

  const job: SegmentationJobDocument = {
    jobId,
    requestHash,
    status: 'created',
    title: songContext.title,
    videoId: songContext.videoId,
    uploadId: songContext.uploadId,
    audioUrl,
    updateTokenHash: buildTokenHash(updateToken),
    staleAtMs: getSegmentationJobStaleAtMs('created', now),
    createdAtMs: now,
    updatedAtMs: now,
  };

  const jobRef = doc(collection(firestore, SEGMENTATION_JOBS_COLLECTION), jobId);
  await setDoc(jobRef, stripUndefinedFields({
    ...job,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  return { jobId, updateToken, job };
}

export async function getSegmentationJob(jobId: string): Promise<SegmentationJobDocument | null> {
  const firestore = await getFirestoreInstance();
  const jobRef = doc(collection(firestore, SEGMENTATION_JOBS_COLLECTION), jobId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) {
    return null;
  }

  return jobSnap.data() as SegmentationJobDocument;
}

export async function verifySegmentationJobUpdateToken(
  jobId: string,
  updateToken: string,
): Promise<SegmentationJobDocument | null> {
  const job = await getSegmentationJob(jobId);
  if (!job) {
    return null;
  }

  return job.updateTokenHash === buildTokenHash(updateToken) ? job : null;
}

export async function updateSegmentationJob(
  jobId: string,
  updates: Partial<SegmentationJobDocument>,
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const now = Date.now();
  const jobRef = doc(collection(firestore, SEGMENTATION_JOBS_COLLECTION), jobId);

  await setDoc(
    jobRef,
    stripUndefinedFields({
      ...updates,
      ...(updates.status ? { staleAtMs: getSegmentationJobStaleAtMs(updates.status, now) } : {}),
      updatedAt: serverTimestamp(),
      updatedAtMs: now,
      ...(updates.status === 'completed' || updates.status === 'failed'
        ? { completedAt: serverTimestamp(), completedAtMs: now }
        : {}),
    }),
    { merge: true },
  );
}

export async function findCompletedSegmentationJobByRequestHash(
  requestHash: string,
): Promise<SegmentationJobDocument | null> {
  const firestore = await getFirestoreInstance();
  const jobsRef = collection(firestore, SEGMENTATION_JOBS_COLLECTION);
  const snapshot = await getDocs(query(jobsRef, where('requestHash', '==', requestHash)));

  let bestMatch: SegmentationJobDocument | null = null;
  snapshot.forEach((docSnap) => {
    const job = docSnap.data() as SegmentationJobDocument;
    if (job.status !== 'completed' || !job.result) {
      return;
    }

    if (!bestMatch || job.updatedAtMs > bestMatch.updatedAtMs) {
      bestMatch = job;
    }
  });

  return bestMatch;
}

export async function findActiveSegmentationJobByRequestHash(
  requestHash: string,
): Promise<SegmentationJobDocument | null> {
  const firestore = await getFirestoreInstance();
  const jobsRef = collection(firestore, SEGMENTATION_JOBS_COLLECTION);
  const snapshot = await getDocs(query(jobsRef, where('requestHash', '==', requestHash)));

  let bestMatch: SegmentationJobDocument | null = null;
  snapshot.forEach((docSnap) => {
    const job = docSnap.data() as SegmentationJobDocument;
    if (!['created', 'processing'].includes(job.status)) {
      return;
    }

    if (isSegmentationJobStale(job)) {
      return;
    }

    if (!bestMatch || job.updatedAtMs > bestMatch.updatedAtMs) {
      bestMatch = job;
    }
  });

  return bestMatch;
}

export async function cleanupStaleSegmentationJobs(
  options?: { nowMs?: number; limit?: number },
): Promise<SegmentationJobCleanupResult> {
  const firestore = await getFirestoreInstance();
  const nowMs = options?.nowMs ?? Date.now();
  const limit = options?.limit && options.limit > 0 ? options.limit : undefined;
  const jobsRef = collection(firestore, SEGMENTATION_JOBS_COLLECTION);

  const [createdSnapshot, processingSnapshot] = await Promise.all([
    getDocs(query(jobsRef, where('status', '==', 'created'))),
    getDocs(query(jobsRef, where('status', '==', 'processing'))),
  ]);

  const staleJobIds: string[] = [];
  let scannedCount = 0;

  const collectStaleJobs = (snapshot: Awaited<ReturnType<typeof getDocs>>) => {
    snapshot.forEach((docSnap) => {
      if (limit && staleJobIds.length >= limit) {
        return;
      }

      scannedCount += 1;
      const job = docSnap.data() as SegmentationJobDocument;
      if (isSegmentationJobStale(job, nowMs)) {
        staleJobIds.push(job.jobId);
      }
    });
  };

  collectStaleJobs(createdSnapshot);
  collectStaleJobs(processingSnapshot);

  if (staleJobIds.length > 0) {
    await Promise.all(
      staleJobIds.map((jobId) => deleteDoc(doc(collection(firestore, SEGMENTATION_JOBS_COLLECTION), jobId))),
    );
  }

  return {
    scannedCount,
    deletedCount: staleJobIds.length,
    staleJobIds,
  };
}

export async function deleteNonCompletedSegmentationJobsByRequestHash(
  requestHash: string,
  options?: { excludeJobId?: string },
): Promise<number> {
  const firestore = await getFirestoreInstance();
  const jobsRef = collection(firestore, SEGMENTATION_JOBS_COLLECTION);
  const snapshot = await getDocs(query(jobsRef, where('requestHash', '==', requestHash)));

  let deletedCount = 0;
  const deletions: Promise<void>[] = [];
  snapshot.forEach((docSnap) => {
    const job = docSnap.data() as SegmentationJobDocument;
    if (job.status === 'completed') {
      return;
    }

    if (options?.excludeJobId && job.jobId === options.excludeJobId) {
      return;
    }

    deletions.push(deleteDoc(doc(collection(firestore, SEGMENTATION_JOBS_COLLECTION), job.jobId)));
    deletedCount += 1;
  });

  await Promise.all(deletions);
  return deletedCount;
}