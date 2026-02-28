import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API route for deleting Vercel Blob files after processing
 * Called to clean up temporary blob uploads that are no longer needed
 *
 * Store: store_TRGSq1xmFVErVvno
 */

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'No blob URL provided' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!url.includes('vercel-storage.com') && !url.includes('blob.vercel-storage.com')) {
      return NextResponse.json(
        { error: 'Invalid Vercel Blob URL format' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting Vercel Blob: ${url.substring(0, 100)}...`);

    await del(url);

    console.log(`✅ Vercel Blob deleted successfully`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ Blob deletion failed:', error);

    // BlobNotFoundError means it's already deleted — treat as success
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
