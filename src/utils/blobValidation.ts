/**
 * Utility helpers for Firebase offload URL validation and parsing.
 *
 * Centralises strict URL parsing so every route that touches large-file offload
 * URLs uses the same allowlist instead of ad-hoc substring checks.
 */

const ALLOWED_FIREBASE_STORAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
] as const;

export type BlobStorageProvider = 'firebase';

function hostMatchesAllowlist(hostname: string, allowlist: readonly string[]): boolean {
  return allowlist.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

function detectProviderFromHostname(hostname: string): BlobStorageProvider | null {
  if (hostMatchesAllowlist(hostname, ALLOWED_FIREBASE_STORAGE_HOSTS)) {
    return 'firebase';
  }

  return null;
}

/**
 * Strictly validate that a string is a legitimate offload URL.
 *
 * Rules enforced:
 * - Must be a syntactically valid URL
 * - Must use `https:` protocol
 * - Hostname must match the Firebase Storage allowlist
 *
 * @returns The validated URL string (unchanged) on success.
 * @throws  Error with a safe, non-leaking message on failure.
 */
export function validateBlobUrl(url: unknown): string {
  if (url == null || (typeof url === 'string' && url.length === 0)) {
    throw new Error('No storage URL provided');
  }
  if (typeof url !== 'string') {
    throw new Error('Invalid storage URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid storage URL format');
  }

  if (!detectProviderFromHostname(parsed.hostname)) {
    throw new Error('Invalid storage URL format');
  }

  return url;
}

/**
 * Detect the storage provider used by a validated offload URL.
 */
export function getBlobStorageProvider(url: string): BlobStorageProvider | null {
  try {
    const parsed = new URL(url);
    return detectProviderFromHostname(parsed.hostname);
  } catch {
    return null;
  }
}

/**
 * Parse Firebase Storage bucket/object from a Firebase download URL.
 * Supports both firebasestorage.googleapis.com and storage.googleapis.com forms.
 */
export function parseFirebaseStorageObjectFromUrl(
  url: string,
): { bucket: string; objectPath: string } | null {
  try {
    const parsed = new URL(url);
    if (!hostMatchesAllowlist(parsed.hostname, ALLOWED_FIREBASE_STORAGE_HOSTS)) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);

    // Firebase download URL: /v0/b/<bucket>/o/<encoded-object>
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      if (segments.length < 5 || segments[0] !== 'v0' || segments[1] !== 'b' || segments[3] !== 'o') {
        return null;
      }

      const bucket = segments[2];
      const objectPath = decodeURIComponent(segments.slice(4).join('/'));
      if (!bucket || !objectPath) return null;

      return { bucket, objectPath };
    }

    // GCS public URL: /<bucket>/<object-path>
    if (parsed.hostname === 'storage.googleapis.com') {
      if (segments.length < 2) {
        return null;
      }

      const bucket = segments[0];
      const objectPath = decodeURIComponent(segments.slice(1).join('/'));
      if (!bucket || !objectPath) return null;

      return { bucket, objectPath };
    }

    return null;
  } catch {
    return null;
  }
}
