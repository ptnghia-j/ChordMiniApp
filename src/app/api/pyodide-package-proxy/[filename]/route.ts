import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const YTDLP_WHEEL_FILENAME = 'yt_dlp-2026.3.17-py3-none-any.whl';
const YTDLP_WHEEL_URL = 'https://files.pythonhosted.org/packages/cd/13/5093bcb954878e50f7217fd2ab94282b53934022e4e4a03265582da83bf5/yt_dlp-2026.3.17-py3-none-any.whl';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (filename !== YTDLP_WHEEL_FILENAME) {
      return NextResponse.json({ error: 'Unknown Pyodide package.' }, { status: 404 });
    }

    const upstream = await fetch(YTDLP_WHEEL_URL, {
      cache: 'no-store',
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'ChordMini Pyodide package proxy',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: upstream.statusText }, { status: upstream.status });
    }

    const contentLength = Number(upstream.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_BYTES) {
      return NextResponse.json({ error: 'Package is too large.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_PACKAGE_BYTES) {
      return NextResponse.json({ error: 'Package is too large.' }, { status: 413 });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid package proxy request.' },
      { status: 400 }
    );
  }
}
