import { del, BlobNotFoundError } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { validateBlobUrl } from '@/utils/blobValidation';

/**
 * API route for deleting Vercel Blob files after processing.
 * Called to clean up temporary blob uploads that are no longer needed.
 *
 * Store: store_TRGSq1xmFVErVvno
 *
 * Security notes:
 * - This app does not have user authentication, so session-based guards
 *   are not available. The endpoint is protected by:
 *   1. Strict URL validation (only HTTPS Vercel Blob URLs on *.blob.vercel-storage.com are accepted;
 *      validation does not currently enforce a specific store id)
 *   2. The BLOB_READ_WRITE_TOKEN scoped to store_TRGSq1xmFVErVvno
 *   3. Blobs use random suffixes, making URL guessing infeasible
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

  // --- Validate blob URL ---
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
    console.log(`🗑️ Deleting Vercel Blob: ${url.substring(0, 100)}...`);

    await del(url);

    console.log(`✅ Vercel Blob deleted successfully`);

    return NextResponse.json({ success: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Blob deletion failed:', errorMessage);

    // BlobNotFoundError means it's already deleted — treat as success
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    return NextResponse.json(
      { error: 'Failed to delete blob' },
      { status: 500 }
    );
  }
}
