/**
 * Local Audio File Server (Development Only)
 * 
 * This endpoint serves locally downloaded audio files from yt-dlp for development.
 * It's only available in development environment and provides secure access
 * to audio files downloaded by yt-dlp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { tmpdir } from 'os';

// Only allow in development environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Define the allowed directory for audio files
const YTDLP_TEMP_DIR = join(tmpdir(), 'chordmini-ytdlp');

export async function GET(request: NextRequest) {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Local audio serving is only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }

    // Security: Only allow files with safe names and mp3 extension
    const safeFilename = basename(filename);
    if (!safeFilename.endsWith('.mp3') || safeFilename.includes('..') || safeFilename.includes('/')) {
      return NextResponse.json(
        { error: 'Invalid filename format' },
        { status: 400 }
      );
    }

    // Construct the full file path
    const filePath = resolve(join(YTDLP_TEMP_DIR, safeFilename));
    
    // Security: Ensure the resolved path is within the allowed directory
    if (!filePath.startsWith(resolve(YTDLP_TEMP_DIR))) {
      return NextResponse.json(
        { error: 'File path not allowed' },
        { status: 403 }
      );
    }

    try {
      // Check if file exists and get stats
      const fileStats = await stat(filePath);
      
      if (!fileStats.isFile()) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }

      // Read the file
      const fileBuffer = await readFile(filePath);

      // Return the audio file with appropriate headers
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fileStats.size.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Content-Disposition': `inline; filename="${safeFilename}"`,
          // CORS headers for development
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        },
      });

    } catch (fileError) {
      console.error('Error reading local audio file:', fileError);
      return NextResponse.json(
        { error: 'File not found or cannot be read' },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('❌ Local audio serving error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Server error' 
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  if (!isDevelopment) {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
