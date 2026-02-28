/**
 * Utility helpers for Vercel Blob URL validation.
 *
 * Centralises strict URL parsing so every route that touches blob URLs
 * uses the same allowlist instead of ad-hoc substring checks.
 */

const ALLOWED_BLOB_HOSTS = [
  'blob.vercel-storage.com',
] as const;

/**
 * A suffix-match is required because Vercel Blob URLs use subdomains like
 * `<store-id>.public.blob.vercel-storage.com`.
 */
function hostMatchesAllowlist(hostname: string): boolean {
  return ALLOWED_BLOB_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

/**
 * Strictly validate that a string is a legitimate Vercel Blob URL.
 *
 * Rules enforced:
 * - Must be a syntactically valid URL
 * - Must use `https:` protocol
 * - Hostname must match the Vercel Blob allowlist (exact or subdomain)
 *
 * @returns The validated URL string (unchanged) on success.
 * @throws  Error with a safe, non-leaking message on failure.
 */
export function validateBlobUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('No blob URL provided');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid Vercel Blob URL format');
  }

  if (!hostMatchesAllowlist(parsed.hostname)) {
    throw new Error('Invalid Vercel Blob URL format');
  }

  return url;
}
