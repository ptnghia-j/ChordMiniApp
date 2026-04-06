import { NextRequest, NextResponse } from 'next/server';
import { validateBlobUrl } from '@/utils/blobValidation';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';

/**
 * API route for deleting temporary offload files after processing.
 * Called to clean up transient uploads that are no longer needed.
 *
 * Security notes:
 * - This app does not have user authentication, so session-based guards
 *   are not available. The endpoint is protected by:
 *   1. Strict URL validation (only HTTPS URLs from supported offload hosts are accepted)
 *   2. Provider-scoped credentials (Vercel token or Firebase admin credentials)
 *   3. Randomized offload pathnames, making URL guessing infeasible
 *   If user authentication is added in the future, this endpoint should
 *   require a valid session.
 */

export async function POST(request: NextRequest) {
  // --- Parse request body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // --- Validate offload URL ---
  let url: string;
  try {
    url = validateBlobUrl(body?.url);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  // --- Delete ---
  try {
    console.log(`🗑️ Deleting offload file: ${url.substring(0, 100)}...`);

    const deletion = await deleteOffloadUrl(url);

    console.log(`✅ Offload file deleted successfully (provider=${deletion.provider}, alreadyDeleted=${deletion.alreadyDeleted === true})`);

    return NextResponse.json({
      success: true,
      provider: deletion.provider,
      alreadyDeleted: deletion.alreadyDeleted === true,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Offload file deletion failed:', errorMessage);

    return NextResponse.json(
      { error: 'Failed to delete offload file' },
      { status: 500 }
    );
  }
}
