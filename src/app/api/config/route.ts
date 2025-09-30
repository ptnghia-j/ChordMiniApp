/**
 * Runtime Configuration API Endpoint
 * 
 * This endpoint provides runtime environment variables to the client-side application.
 * It enables "build once, run anywhere" Docker deployment by serving environment
 * variables at request time rather than baking them into the build.
 * 
 * Security: Only exposes NEXT_PUBLIC_* variables which are designed to be public.
 * Server-only secrets (GEMINI_API_KEY, GENIUS_API_KEY, etc.) are never exposed.
 * 
 * Compatibility:
 * - Works on Vercel (reads process.env at request time)
 * - Works in Docker (reads container environment variables)
 * - Works in local development (reads .env.local)
 */

// Force dynamic rendering - never cache this endpoint
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/config
 * 
 * Returns public environment variables that are safe to expose to the browser.
 * These variables are used by the client-side application for configuration.
 * 
 * @returns JSON object containing public environment variables
 */
export async function GET() {
  try {
    // Filter environment variables to only include public ones
    const publicConfig: Record<string, string> = {};

    // List of allowed environment variable prefixes/names
    const allowedPrefixes = ['NEXT_PUBLIC_'];
    const allowedNames = ['NEXT_DISABLE_DEV_OVERLAY', 'NODE_ENV'];

    // Iterate through all environment variables
    for (const [key, value] of Object.entries(process.env)) {
      // Check if the key matches allowed prefixes or names
      const isAllowed = 
        allowedPrefixes.some(prefix => key.startsWith(prefix)) ||
        allowedNames.includes(key);

      if (isAllowed && value !== undefined) {
        publicConfig[key] = value;
      }
    }

    // Log config keys for debugging (not values for security)
    console.log('[/api/config] Serving public config with keys:', Object.keys(publicConfig));

    // Return config with strict no-cache headers
    return new Response(JSON.stringify(publicConfig), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Prevent caching at all levels
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        // Security headers
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[/api/config] Error serving config:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to load configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), 
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * Prevent other HTTP methods
 */
export async function POST() {
  return new Response('Method not allowed', { status: 405 });
}

export async function PUT() {
  return new Response('Method not allowed', { status: 405 });
}

export async function DELETE() {
  return new Response('Method not allowed', { status: 405 });
}

export async function PATCH() {
  return new Response('Method not allowed', { status: 405 });
}

