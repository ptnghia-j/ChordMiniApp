import { GoogleAuth } from 'google-auth-library';
import {
  getOffloadStorageProvider,
  parseFirebaseStorageObjectFromUrl,
} from '@/utils/offloadValidation';

const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.full_control';

let authClientPromise: Promise<Awaited<ReturnType<GoogleAuth['getClient']>>> | null = null;
let resolvedProjectId: string | null = null;

function parseServiceAccountCredentials(): Record<string, string> | null {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!rawCredentials) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawCredentials) as Record<string, string>;
    if (parsed.project_id) {
      resolvedProjectId = parsed.project_id;
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
    );
  }
}

function getFirebaseProjectId(): string {
  if (resolvedProjectId) {
    return resolvedProjectId;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      'Missing Firebase project ID for storage cleanup. Set FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
    );
  }

  resolvedProjectId = projectId;
  return projectId;
}

async function getAuthClient() {
  if (authClientPromise) {
    return authClientPromise;
  }

  authClientPromise = (async () => {
    const credentials = parseServiceAccountCredentials();
    const projectId = getFirebaseProjectId();
    const auth = credentials
      ? new GoogleAuth({ credentials, scopes: [STORAGE_SCOPE] })
      : new GoogleAuth({ projectId, scopes: [STORAGE_SCOPE] });

    return auth.getClient();
  })();

  return authClientPromise;
}

async function getAccessToken(): Promise<string> {
  try {
    const client = await getAuthClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error('Google auth returned an empty access token');
    }

    return token;
  } catch (error) {
    throw new Error(
      `Failed to acquire Firebase Storage admin credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY or configure Application Default Credentials. ${error instanceof Error ? error.message : 'Unknown auth error'}`,
    );
  }
}

async function deleteFirebaseStorageUrl(url: string): Promise<{ success: boolean; alreadyDeleted?: boolean }> {
  const storageObject = parseFirebaseStorageObjectFromUrl(url);
  if (!storageObject) {
    throw new Error('Failed to parse Firebase Storage object from URL');
  }

  if (!storageObject.objectPath.startsWith('temp/')) {
    throw new Error(`Refusing to delete non-temporary Firebase Storage object: ${storageObject.objectPath}`);
  }

  // Try Firebase Storage REST delete first so permissive Storage Rules (for example
  // temp/* paths) can clean up without requiring admin credentials.
  const firebaseRestEndpoint = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageObject.bucket)}/o/${encodeURIComponent(storageObject.objectPath)}`;
  const firebaseRestResponse = await fetch(firebaseRestEndpoint, {
    method: 'DELETE',
  });

  if (firebaseRestResponse.ok) {
    return { success: true };
  }

  if (firebaseRestResponse.status === 404) {
    return { success: true, alreadyDeleted: true };
  }

  // If the rules-based delete is forbidden, try admin path as fallback.
  if (![401, 403].includes(firebaseRestResponse.status)) {
    const restErrorText = await firebaseRestResponse.text().catch(() => 'Unknown Firebase Storage REST delete error');
    throw new Error(`Firebase Storage REST delete failed (${firebaseRestResponse.status} ${firebaseRestResponse.statusText}): ${restErrorText}`);
  }

  const token = await getAccessToken();
  const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageObject.bucket)}/o/${encodeURIComponent(storageObject.objectPath)}`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.ok) {
    return { success: true };
  }

  if (response.status === 404) {
    return { success: true, alreadyDeleted: true };
  }

  const errorText = await response.text().catch(() => 'Unknown Firebase Storage delete error');
  throw new Error(`Firebase Storage delete failed (${response.status} ${response.statusText}): ${errorText}`);
}

export interface OffloadDeletionResult {
  success: boolean;
  provider: 'firebase';
  alreadyDeleted?: boolean;
}

/**
 * Delete an offloaded file URL from Firebase Storage.
 */
export async function deleteOffloadUrl(url: string): Promise<OffloadDeletionResult> {
  const provider = getOffloadStorageProvider(url);

  if (!provider || provider !== 'firebase') {
    throw new Error('Unsupported storage URL provider');
  }

  const firebaseResult = await deleteFirebaseStorageUrl(url);
  return {
    success: firebaseResult.success,
    provider,
    alreadyDeleted: firebaseResult.alreadyDeleted,
  };
}
