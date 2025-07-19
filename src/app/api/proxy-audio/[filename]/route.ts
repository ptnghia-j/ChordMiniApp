import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

// Define the public audio directory
const PUBLIC_AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

/**
 * Proxy server for audio files
 * This endpoint serves audio files from the local filesystem with CORS headers
 * to make them accessible to external services like Music.ai
 *
 * @param request The request object
 * @param params The route parameters
 * @returns The audio file with appropriate headers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    // Await params as it's now a Promise in Next.js 15+
    const { filename } = await params;

    if (!filename) {
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }

    // Sanitize the filename to prevent directory traversal attacks
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(PUBLIC_AUDIO_DIR, sanitizedFilename);

    // Check if the file exists
    try {
      await fs.access(filePath);
    } catch {
      console.error(`File not found: ${filePath}`);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = await fs.readFile(filePath);

    // Determine the content type based on the file extension
    let contentType = 'application/octet-stream';
    if (sanitizedFilename.endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    } else if (sanitizedFilename.endsWith('.mp4')) {
      contentType = 'video/mp4';
    } else if (sanitizedFilename.endsWith('.wav')) {
      contentType = 'audio/wav';
    }

    // Create a response with the file content and appropriate headers
    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Access-Control-Allow-Origin': '*', // Allow cross-origin requests
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });

    return response;
  } catch (error) {
    console.error('Error serving audio file:', error);
    return NextResponse.json(
      { error: 'Failed to serve audio file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
