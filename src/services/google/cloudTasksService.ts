import { GoogleAuth } from 'google-auth-library';

import { BACKEND_URLS } from '@/config/api';
import { SegmentationRequest } from '@/types/chatbotTypes';

const CLOUD_TASKS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_TASKS_LOCATION = 'us-central1';
const DEFAULT_TASKS_QUEUE = 'songformer-segmentation';
const DEFAULT_DISPATCH_DEADLINE_SECONDS = 600;
const MAX_HTTP_TASK_DISPATCH_DEADLINE_SECONDS = 30 * 60;

let authClientPromise: Promise<Awaited<ReturnType<GoogleAuth['getClient']>>> | null = null;
let parsedServiceAccount: Record<string, string> | null | undefined;

function parseServiceAccountCredentials(): Record<string, string> | null {
  if (parsedServiceAccount !== undefined) {
    return parsedServiceAccount;
  }

  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!rawCredentials) {
    parsedServiceAccount = null;
    return parsedServiceAccount;
  }

  try {
    parsedServiceAccount = JSON.parse(rawCredentials) as Record<string, string>;
    return parsedServiceAccount;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
    );
  }
}

function getProjectId(): string {
  const credentials = parseServiceAccountCredentials();
  const projectId =
    process.env.SONGFORMER_TASKS_PROJECT_ID ||
    credentials?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      'Missing Google Cloud project ID for SongFormer Cloud Tasks. Set SONGFORMER_TASKS_PROJECT_ID, FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
    );
  }

  return projectId;
}

function getDispatchDeadlineSeconds(): number {
  const parsed = Number(process.env.SONGFORMER_TASKS_DISPATCH_DEADLINE_SECONDS || DEFAULT_DISPATCH_DEADLINE_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DISPATCH_DEADLINE_SECONDS;
  }

  return Math.min(Math.floor(parsed), MAX_HTTP_TASK_DISPATCH_DEADLINE_SECONDS);
}

async function getAuthClient() {
  if (authClientPromise) {
    return authClientPromise;
  }

  authClientPromise = (async () => {
    const credentials = parseServiceAccountCredentials();
    const projectId = getProjectId();
    const auth = credentials
      ? new GoogleAuth({ credentials, scopes: [CLOUD_TASKS_SCOPE] })
      : new GoogleAuth({ projectId, scopes: [CLOUD_TASKS_SCOPE] });

    return auth.getClient();
  })();

  return authClientPromise;
}

function getQueuePath(projectId: string, location: string, queue: string): string {
  return `projects/${projectId}/locations/${location}/queues/${queue}`;
}

export interface EnqueueSongFormerSegmentationTaskParams {
  audioUrl: string;
  jobId: string;
  updateToken: string;
  callbackUrl: string;
  songContext: SegmentationRequest['songContext'];
}

export interface EnqueueSongFormerSegmentationTaskResult {
  taskName?: string | null;
}

export async function enqueueSongFormerSegmentationTask(
  params: EnqueueSongFormerSegmentationTaskParams,
): Promise<EnqueueSongFormerSegmentationTaskResult> {
  const client = await getAuthClient();
  const projectId = getProjectId();
  const location = process.env.SONGFORMER_TASKS_LOCATION || DEFAULT_TASKS_LOCATION;
  const queue = process.env.SONGFORMER_TASKS_QUEUE || DEFAULT_TASKS_QUEUE;
  const songformerUrl = `${BACKEND_URLS.SONGFORMER_BACKEND.replace(/\/$/, '')}/api/songformer/segment`;
  const parent = getQueuePath(projectId, location, queue);
  const payload = {
    audioUrl: params.audioUrl,
    asyncJob: {
      jobId: params.jobId,
      updateToken: params.updateToken,
      callbackUrl: params.callbackUrl,
      songContext: params.songContext,
    },
  };
  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: songformerUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
    dispatchDeadline: `${getDispatchDeadlineSeconds()}s`,
  };

  const response = await client.request<{ name?: string }>({
    url: `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
    method: 'POST',
    data: { task },
  });

  return { taskName: response.data.name };
}
