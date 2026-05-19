import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_FFMPEG_WORKER_FILES = new Set([
  'worker.js',
  'const.js',
  'errors.js',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (!ALLOWED_FFMPEG_WORKER_FILES.has(filename)) {
      return NextResponse.json({ error: 'Unknown ffmpeg worker file.' }, { status: 404 });
    }

    const filePath = path.join(
      process.cwd(),
      'node_modules',
      '@ffmpeg',
      'ffmpeg',
      'dist',
      'esm',
      filename
    );
    const source = await fs.readFile(filePath, 'utf8');

    return new Response(source, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ffmpeg worker file.' },
      { status: 500 }
    );
  }
}
