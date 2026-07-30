import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_FFMPEG_WORKER_FILES = new Set([
  'worker.js',
  'const.js',
  'errors.js',
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!ALLOWED_FFMPEG_WORKER_FILES.has(filename)) {
    return NextResponse.json({ error: 'Unknown ffmpeg worker file.' }, { status: 404 });
  }

  // These modules are generated into public/ before dev and production builds.
  // Redirecting preserves the old API URL for clients with a cached bundle while
  // avoiding a runtime dependency on node_modules in Next standalone deployments.
  return NextResponse.redirect(new URL(`/ffmpeg-worker/${filename}`, request.url), 307);
}
