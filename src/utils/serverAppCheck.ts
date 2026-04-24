/**
 * Server-Side Firebase App Check Verification
 *
 * Verifies the X-Firebase-AppCheck token attached to incoming requests
 * using firebase-admin/app-check.  Designed for Next.js API route handlers.
 *
 * Behaviour:
 *  - In non-production environments (NODE_ENV !== 'production') requests are
 *    always allowed so local development works without reCAPTCHA.
 *  - When APPCHECK_ENFORCE is '0' (or unset), failures are logged but the
 *    request is still allowed (monitor mode).
 *  - When APPCHECK_ENFORCE is '1', requests with missing or invalid tokens
 *    are rejected with 401 / 403.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Lazy-initialised firebase-admin singleton
// ---------------------------------------------------------------------------

let adminAppInitialised = false;

async function getAppCheckVerifier() {
  // Dynamic imports keep firebase-admin out of the client bundle and avoid
  // top-level side-effects that would break edge runtimes.
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAppCheck } = await import('firebase-admin/app-check');

  if (!adminAppInitialised) {
    if (getApps().length === 0) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
      if (raw) {
        try {
          const serviceAccount = JSON.parse(raw);
          initializeApp({ credential: cert(serviceAccount) });
        } catch {
          // Fallback: rely on Application Default Credentials (ADC)
          initializeApp();
        }
      } else {
        // No explicit key – use ADC (works on Cloud Run / GCE)
        initializeApp();
      }
    }
    adminAppInitialised = true;
  }

  return getAppCheck();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AppCheckResult {
  /** Whether the request should be allowed through */
  ok: boolean;
  /** HTTP status code to return when `ok` is false */
  status?: number;
  /** Human-readable error message */
  error?: string;
}

/**
 * Verify the App Check token on an incoming Next.js API request.
 *
 * Usage in a route handler:
 * ```ts
 * const appCheck = await verifyAppCheckRequest(request);
 * if (!appCheck.ok) {
 *   return NextResponse.json({ error: appCheck.error }, { status: appCheck.status });
 * }
 * ```
 */
export async function verifyAppCheckRequest(
  request: NextRequest,
): Promise<AppCheckResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  const enforce = process.env.APPCHECK_ENFORCE === '1';

  // ── Skip verification entirely in non-production environments ──────────
  if (!isProduction) {
    return { ok: true };
  }

  // ── Extract the token from the request header ─────────────────────────
  const token = request.headers.get('X-Firebase-AppCheck');

  if (!token) {
    const msg = 'Missing App Check token';
    if (enforce) {
      console.warn(`🛡️ App Check BLOCKED (no token): ${request.nextUrl.pathname}`);
      return { ok: false, status: 401, error: msg };
    }
    console.warn(`🛡️ App Check MONITOR (no token): ${request.nextUrl.pathname}`);
    return { ok: true };
  }

  // ── Verify the token with firebase-admin ──────────────────────────────
  try {
    const appCheck = await getAppCheckVerifier();
    await appCheck.verifyToken(token);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const msg = `Invalid App Check token: ${detail}`;

    if (enforce) {
      console.warn(
        `🛡️ App Check BLOCKED (invalid token): ${request.nextUrl.pathname} – ${detail}`,
      );
      return { ok: false, status: 403, error: msg };
    }

    console.warn(
      `🛡️ App Check MONITOR (invalid token): ${request.nextUrl.pathname} – ${detail}`,
    );
    return { ok: true };
  }
}
