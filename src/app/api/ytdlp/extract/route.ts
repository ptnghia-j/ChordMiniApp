/**
 * yt-dlp Video Info Extraction API (Development Only)
 * 
 * This endpoint provides video information extraction using yt-dlp for local development.
 * It's only available in development environment and provides the same information
 * that would be available from YouTube search API in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

// Allow yt-dlp in production when explicitly configured via NEXT_PUBLIC_AUDIO_STRATEGY
const isDevelopment = process.env.NODE_ENV === 'development';
const allowYtDlpInProduction = process.env.NEXT_PUBLIC_AUDIO_STRATEGY === 'ytdlp';

export async function POST(request: NextRequest) {
  // Block in production unless explicitly enabled
  if (!isDevelopment && !allowYtDlpInProduction) {
    return NextResponse.json(
      {
        success: false,
        error: 'yt-dlp endpoints are only available in development environment or when NEXT_PUBLIC_AUDIO_STRATEGY=ytdlp'
      },
      { status: 403 }
    );
  }

  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // // console.log(`🔍 Extracting video info with yt-dlp: ${url}`);

    // Extract video information using yt-dlp
    const videoInfo = await extractVideoInfo(url);

    if (videoInfo.success) {
      console.log(`✅ Video info extracted: ${videoInfo.title}`);
    }

    return NextResponse.json(videoInfo);

  } catch (error) {
    console.error('❌ yt-dlp extraction error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Video info extraction failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * Extract video information using yt-dlp
 */
interface VideoInfo {
  success: boolean;
  title?: string;
  duration?: number;
  videoId?: string;
  uploader?: string;
  view_count?: number;
  formats?: Array<{
    format_id: string;
    ext: string;
    quality: string;
    filesize?: number;
  }>;
  error?: string;
}

async function extractVideoInfo(url: string): Promise<VideoInfo> {
  return new Promise((resolve) => {
    const args = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      url
    ];

    const ytdlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const info = JSON.parse(stdout.trim());
          
          resolve({
            success: true,
            title: info.title || 'Unknown Title',
            duration: info.duration || 0,
            videoId: info.id || extractVideoIdFromUrl(url),
            uploader: info.uploader || 'Unknown',
            view_count: info.view_count || 0,
            formats: info.formats?.map((format: { format_id: string; ext: string; quality?: string; height?: number; filesize?: number }) => ({
              format_id: format.format_id,
              ext: format.ext,
              quality: format.quality || format.height?.toString() || 'unknown',
              filesize: format.filesize
            })) || []
          });
        } catch (parseError) {
          console.error('❌ Failed to parse yt-dlp output:', parseError);
          resolve({
            success: false,
            error: 'Failed to parse video information'
          });
        }
      } else {
        console.error('❌ yt-dlp extraction failed:', stderr);
        resolve({
          success: false,
          error: stderr || `yt-dlp exited with code ${code}`
        });
      }
    });

    ytdlp.on('error', (error) => {
      console.error('❌ yt-dlp spawn error:', error);
      resolve({
        success: false,
        error: 'yt-dlp is not installed or not available in PATH'
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      ytdlp.kill();
      resolve({
        success: false,
        error: 'Video info extraction timed out'
      });
    }, 30000);
  });
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoIdFromUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
