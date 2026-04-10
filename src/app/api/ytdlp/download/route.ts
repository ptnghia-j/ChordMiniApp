/**
 * yt-dlp Audio Download API (Development Only)
 * 
 * This endpoint provides audio download using yt-dlp for local development.
 * It uses the same filename generation algorithm as QuickTube for compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import {
  buildLocalAudioServeUrl,
  ensureLocalAudioWriteDir,
  findExistingLocalAudioFile,
  matchesLocalAudioVideoId,
} from '@/services/storage/localAudioStorageService';

export const maxDuration = 300;

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
    const { url, filename, videoId, format = 'mp3' } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Downloading audio with yt-dlp: ${url}`);
    console.log(`📁 Target filename: ${filename}`);

    // Download audio using yt-dlp
    const downloadResult = await downloadAudio(url, filename, videoId, format);

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

async function downloadAudio(
  url: string,
  targetFilename?: string,
  requestedVideoId?: string,
  format: string = 'mp3'
): Promise<DownloadResult> {
  return new Promise(async (resolve) => {
    try {
      // Reuse an existing local file before invoking yt-dlp again.
      if (requestedVideoId) {
        const existingFile = await findExistingLocalAudioFile(requestedVideoId);
        if (existingFile) {
          console.log(`♻️ Reusing existing local audio file for ${requestedVideoId}: ${existingFile.filename}`);
          resolve({
            success: true,
            filename: existingFile.filename,
            audioUrl: existingFile.audioUrl,
            fileSize: existingFile.fileSize,
            localPath: existingFile.filePath,
          });
          return;
        }
      }

      // Create local temp directory for downloads
      const tempDir = await ensureLocalAudioWriteDir();

      // Use a simpler, more predictable output template
      // This ensures we can find the file after download
      const outputTemplate = path.join(tempDir, '%(title)s-[%(id)s].%(ext)s');

      const args = [
        '--extract-audio',
        '--audio-format', format,
        '--audio-quality', '0', // Best quality
        '--output', outputTemplate,
        '--no-warnings',
        '--restrict-filenames', // Use safe filenames
        '--print', 'after_move:filepath', // Print the final file path
        url
      ];

      console.log(`🔧 yt-dlp command: yt-dlp ${args.join(' ')}`);
      console.log(`📁 Output template: ${outputTemplate}`);

      const ytdlp = spawn('yt-dlp', args);
      let stderr = '';
      let stdout = '';
      let finalFilePath = '';

      ytdlp.stdout.on('data', (data) => {
        const output = data.toString().trim();
        stdout += output + '\n';
        console.log(`yt-dlp stdout: ${output}`);

        // Capture the final file path from yt-dlp output
        if (output.includes(tempDir) && (output.endsWith('.mp3') || output.endsWith('.wav') || output.endsWith('.m4a'))) {
          finalFilePath = output;
        }
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`yt-dlp stderr: ${data.toString().trim()}`);
      });

      ytdlp.on('close', async (code) => {
        if (code === 0) {
          try {
            let audioFile = '';
            let filePath = '';

            // Method 1: Use the captured file path from yt-dlp output
            if (finalFilePath && await fs.access(finalFilePath).then(() => true).catch(() => false)) {
              filePath = finalFilePath;
              audioFile = path.basename(finalFilePath);
              console.log(`✅ Found file using yt-dlp output: ${audioFile}`);
            } else {
              // Method 2: Scan directory for audio files (fallback)
              console.log(`🔍 Scanning directory for audio files: ${tempDir}`);
              const files = await fs.readdir(tempDir);
              console.log(`📁 Files in temp directory: ${files.join(', ')}`);

              audioFile = files.find((file) => {
                const hasSupportedExtension =
                  file.endsWith('.mp3') ||
                  file.endsWith('.wav') ||
                  file.endsWith('.m4a') ||
                  file.endsWith('.opus') ||
                  file.endsWith('.webm');

                if (!hasSupportedExtension) {
                  return false;
                }

                if (requestedVideoId) {
                  return matchesLocalAudioVideoId(file, requestedVideoId);
                }

                return true;
              }) || '';

              if (audioFile) {
                filePath = path.join(tempDir, audioFile);
                console.log(`✅ Found file using directory scan: ${audioFile}`);
              }
            }

            if (audioFile && filePath) {
              const stats = await fs.stat(filePath);

              // Generate URL for local file server endpoint
              const audioUrl = buildLocalAudioServeUrl(audioFile);

              console.log(`✅ Audio downloaded successfully:`);
              console.log(`   📁 File: ${audioFile}`);
              console.log(`   📍 Path: ${filePath}`);
              console.log(`   🔗 URL: ${audioUrl}`);
              console.log(`   📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

              resolve({
                success: true,
                filename: audioFile,
                audioUrl: audioUrl,
                fileSize: stats.size,
                localPath: filePath
              });
            } else {
              console.error(`❌ No audio file found in ${tempDir}`);
              console.error(`📁 Available files: ${(await fs.readdir(tempDir)).join(', ')}`);
              console.error(`📝 yt-dlp stdout: ${stdout}`);

              // Run debugging utilities
              try {
                const { troubleshootYtdlp } = await import('@/utils/ytdlpDebugger');
                await troubleshootYtdlp(url, targetFilename, stdout);
              } catch (debugError) {
                console.error(`❌ Debug utilities failed: ${debugError}`);
              }

              resolve({
                success: false,
                error: 'Downloaded audio file not found. Check yt-dlp output and debug information above.'
              });
            }
          } catch (fileError) {
            console.error('❌ File handling error:', fileError);
            resolve({
              success: false,
              error: `Failed to process downloaded file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`
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
