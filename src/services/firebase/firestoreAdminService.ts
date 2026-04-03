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

function getFirestoreDocumentUrl(collectionName: string, documentId: string): string {
  return `https://firestore.googleapis.com/v1/${getDocumentName(collectionName, documentId)}`;
}

function toTimestampString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    const record = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof record.toDate === 'function') {
      return record.toDate().toISOString();
    }

    if (typeof record.seconds === 'number') {
      const millis = record.seconds * 1000 + Math.floor((record.nanoseconds ?? 0) / 1_000_000);
      return new Date(millis).toISOString();
    }
  }

  return null;
}

function encodeFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  const timestampString = toTimestampString(value);
  if (timestampString) {
    return { timestampValue: timestampString };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => encodeFirestoreValue(entry)),
      },
    };
  }

  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) {
        return;
      }
      fields[key] = encodeFirestoreValue(entry);
    });
    return { mapValue: { fields } };
  }

  return { stringValue: String(value) };
}

function decodeFirestoreValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) {
    return null;
  }

  if ('nullValue' in value) {
    return null;
  }
  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('booleanValue' in value) {
    return value.booleanValue;
  }
  if ('integerValue' in value) {
    return Number(value.integerValue);
  }
  if ('doubleValue' in value) {
    return Number(value.doubleValue);
  }
  if ('timestampValue' in value) {
    return value.timestampValue;
  }
  if ('arrayValue' in value) {
    const arrayValue = value.arrayValue as { values?: Array<Record<string, unknown>> } | undefined;
    return (arrayValue?.values ?? []).map((entry) => decodeFirestoreValue(entry));
  }
  if ('mapValue' in value) {
    const mapValue = value.mapValue as { fields?: Record<string, Record<string, unknown>> } | undefined;
    const decoded: Record<string, unknown> = {};
    Object.entries(mapValue?.fields ?? {}).forEach(([key, entry]) => {
      decoded[key] = decodeFirestoreValue(entry);
    });
    return decoded;
  }

  return null;
}

function encodeFirestoreFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    fields[key] = encodeFirestoreValue(value);
  });
  return fields;
}

function decodeFirestoreFields(fields: Record<string, Record<string, unknown>> | undefined): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  Object.entries(fields ?? {}).forEach(([key, value]) => {
    decoded[key] = decodeFirestoreValue(value);
  });
  return decoded;
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

export async function getDocumentWithAdminAccess<T>(
  collectionName: string,
  documentId: string,
): Promise<T | null> {
  const token = await getAccessToken();
  const response = await fetch(getFirestoreDocumentUrl(collectionName, documentId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore admin get failed (${response.status} ${response.statusText}): ${errorText}`);
  }

  const payload = await response.json() as { fields?: Record<string, Record<string, unknown>> };
  return decodeFirestoreFields(payload.fields) as T;
}

export async function setDocumentWithAdminAccess(
  collectionName: string,
  documentId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(getFirestoreCommitUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: getDocumentName(collectionName, documentId),
            fields: encodeFirestoreFields(data),
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore admin set failed (${response.status} ${response.statusText}): ${errorText}`);
  }
}
