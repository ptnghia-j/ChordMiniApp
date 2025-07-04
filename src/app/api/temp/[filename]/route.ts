import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * Serve temporary files for local development
 * This route serves audio files extracted locally during development
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Security: Only allow specific file extensions and patterns
    if (!filename || !filename.match(/^[a-zA-Z0-9_-]+\.(mp3|mp4|wav|webm|m4a)$/)) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // Only serve temp files in development
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'Temp file serving only available in development' },
        { status: 403 }
      );
    }

    const tempDir = path.join(process.cwd(), 'temp');
    const filePath = path.join(tempDir, filename);

    // Security: Ensure the file is within the temp directory
    const resolvedPath = path.resolve(filePath);
    const resolvedTempDir = path.resolve(tempDir);
    
    if (!resolvedPath.startsWith(resolvedTempDir)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    try {
      // Check if file exists
      await fs.access(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);
      console.log(`Serving temp file: ${filename} (${stats.size} bytes)`);

      // Read the file
      const fileBuffer = await fs.readFile(filePath);

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';

      switch (ext) {
        case '.mp3':
          contentType = 'audio/mpeg';
          break;
        case '.mp4':
          contentType = 'video/mp4';
          break;
        case '.wav':
          contentType = 'audio/wav';
          break;
        case '.webm':
          contentType = 'audio/webm';
          break;
        case '.m4a':
          contentType = 'audio/mp4';
          break;
      }

      // Return the file with appropriate headers
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Content-Disposition': `inline; filename="${filename}"`,
          'Accept-Ranges': 'bytes'
        }
      });

    } catch (fileError) {
      console.error(`Error reading temp file ${filename}:`, fileError);

      // Try to list available files for debugging
      try {
        const tempFiles = await fs.readdir(tempDir);
        console.log('Available temp files:', tempFiles);
      } catch (listError) {
        console.error('Could not list temp directory:', listError);
      }

      return NextResponse.json(
        {
          error: 'File not found',
          details: `Could not find ${filename} in temp directory`
        },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('Error serving temp file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
