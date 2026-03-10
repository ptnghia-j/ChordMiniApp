import { GoogleAuth } from 'google-auth-library';

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const FIRESTORE_COMMIT_BATCH_SIZE = 500;

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

function getFirestoreProjectId(): string {
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
      'Missing Firestore project ID for admin deletion. Set FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
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
    const projectId = getFirestoreProjectId();
    const auth = credentials
      ? new GoogleAuth({ credentials, scopes: [FIRESTORE_SCOPE] })
      : new GoogleAuth({ projectId, scopes: [FIRESTORE_SCOPE] });

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
      `Failed to acquire Firestore admin credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY or configure Application Default Credentials. ${error instanceof Error ? error.message : 'Unknown auth error'}`,
    );
  }
}

function getDocumentName(collectionName: string, documentId: string): string {
  const projectId = getFirestoreProjectId();
  return `projects/${projectId}/databases/(default)/documents/${collectionName}/${documentId}`;
}

function getFirestoreCommitUrl(): string {
  const projectId = getFirestoreProjectId();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
}

async function commitDeleteBatch(documentNames: string[]): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(getFirestoreCommitUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: documentNames.map((name) => ({ delete: name })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore admin delete failed (${response.status} ${response.statusText}): ${errorText}`);
  }
}

export async function deleteDocumentsWithAdminAccess(
  collectionName: string,
  documentIds: string[],
): Promise<number> {
  if (documentIds.length === 0) {
    return 0;
  }

  for (let start = 0; start < documentIds.length; start += FIRESTORE_COMMIT_BATCH_SIZE) {
    const batch = documentIds.slice(start, start + FIRESTORE_COMMIT_BATCH_SIZE);
    await commitDeleteBatch(batch.map((documentId) => getDocumentName(collectionName, documentId)));
  }

  return documentIds.length;
}
