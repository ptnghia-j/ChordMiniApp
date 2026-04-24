import { NextRequest, NextResponse } from 'next/server';
import { validateOffloadUrl } from '@/utils/offloadValidation';
import { deleteOffloadUrl } from '@/services/storage/offloadCleanupService';

/**
 * API route for deleting temporary offload files after processing.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  let url: string;
  try {
    url = validateOffloadUrl(body?.url);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

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