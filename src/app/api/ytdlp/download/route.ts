/**
 * yt-dlp Audio Download API (Development Only)
 * 
 * This endpoint provides audio download using yt-dlp for local development.
 * It uses the same filename generation algorithm as QuickTube for compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Only allow in development environment
const isDevelopment = process.env.NODE_ENV === 'development';

export async function POST(request: NextRequest) {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'yt-dlp endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const { url, filename, format = 'mp3' } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Downloading audio with yt-dlp: ${url}`);
    console.log(`📁 Target filename: ${filename}`);

    // Download audio using yt-dlp
    const downloadResult = await downloadAudio(url, filename, format);

    if (downloadResult.success) {
      console.log(`✅ Audio downloaded: ${downloadResult.filename}`);
    }

    return NextResponse.json(downloadResult);

  } catch (error) {
    console.error('❌ yt-dlp download error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Audio download failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * Download audio using yt-dlp
 */
interface DownloadResult {
  success: boolean;
  filename?: string;
  audioUrl?: string;
  fileSize?: number;
  localPath?: string;
  error?: string;
}

async function downloadAudio(url: string, targetFilename?: string, format: string = 'mp3'): Promise<DownloadResult> {
  return new Promise(async (resolve) => {
    try {
      // Create temporary directory for downloads
      const tempDir = path.join(tmpdir(), 'chordmini-ytdlp');
      await fs.mkdir(tempDir, { recursive: true });

      // Generate output filename
      const outputTemplate = targetFilename 
        ? path.join(tempDir, targetFilename.replace('.mp3', '.%(ext)s'))
        : path.join(tempDir, '%(title)s-[%(id)s].%(ext)s');

      const args = [
        '--extract-audio',
        '--audio-format', format,
        '--audio-quality', '0', // Best quality
        '--output', outputTemplate,
        '--no-warnings',
        '--restrict-filenames', // Use safe filenames
        url
      ];

      console.log(`🔧 yt-dlp command: yt-dlp ${args.join(' ')}`);

      const ytdlp = spawn('yt-dlp', args);
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        console.log(`yt-dlp stdout: ${data.toString().trim()}`);
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`yt-dlp stderr: ${data.toString().trim()}`);
      });

      ytdlp.on('close', async (code) => {
        if (code === 0) {
          try {
            // Find the downloaded file
            const files = await fs.readdir(tempDir);
            const audioFile = files.find(file => 
              file.endsWith('.mp3') || 
              file.endsWith('.wav') || 
              file.endsWith('.m4a')
            );

            if (audioFile) {
              const filePath = path.join(tempDir, audioFile);
              const stats = await fs.stat(filePath);

              // Generate URL for local file server endpoint
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
              const audioUrl = `${baseUrl}/api/serve-local-audio?filename=${encodeURIComponent(audioFile)}`;

              console.log(`✅ Audio downloaded: ${audioFile}`);
              console.log(`📁 Audio URL: ${audioUrl}`);

              resolve({
                success: true,
                filename: audioFile,
                audioUrl: audioUrl,
                fileSize: stats.size,
                localPath: filePath
              });
            } else {
              resolve({
                success: false,
                error: 'Downloaded audio file not found'
              });
            }
          } catch (fileError) {
            console.error('❌ File handling error:', fileError);
            resolve({
              success: false,
              error: 'Failed to process downloaded file'
            });
          }
        } else {
          console.error('❌ yt-dlp download failed:', stderr);
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
          error: 'yt-dlp is not installed or not available in PATH. Please install yt-dlp for development.'
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        ytdlp.kill();
        resolve({
          success: false,
          error: 'Audio download timed out (5 minutes)'
        });
      }, 300000);

    } catch (error) {
      console.error('❌ Download setup error:', error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Download setup failed'
      });
    }
  });
}
