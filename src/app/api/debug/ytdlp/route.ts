/**
 * yt-dlp Debug API (Development Only)
 * 
 * This endpoint provides debugging information for yt-dlp issues.
 * It helps diagnose file path problems, naming issues, and Firebase integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { troubleshootYtdlp, debugYtdlpDownload, testLocalFileServing } from '@/utils/ytdlpDebugger';
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
        error: 'Debug endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const { action, videoUrl, filename, ytdlpOutput } = await request.json();

    console.log(`🔧 Debug request: action=${action}, videoUrl=${videoUrl}, filename=${filename}`);

    switch (action) {
      case 'troubleshoot':
        if (!videoUrl) {
          return NextResponse.json(
            { success: false, error: 'videoUrl is required for troubleshooting' },
            { status: 400 }
          );
        }

        // Run troubleshooting and capture console output
        const originalConsoleLog = console.log;
        const logs: string[] = [];
        console.log = (...args) => {
          logs.push(args.join(' '));
          originalConsoleLog(...args);
        };

        try {
          await troubleshootYtdlp(videoUrl, filename, ytdlpOutput);
        } finally {
          console.log = originalConsoleLog;
        }

        return NextResponse.json({
          success: true,
          action: 'troubleshoot',
          logs,
          timestamp: new Date().toISOString()
        });

      case 'debug-download':
        if (!videoUrl) {
          return NextResponse.json(
            { success: false, error: 'videoUrl is required for debug-download' },
            { status: 400 }
          );
        }

        const debugInfo = await debugYtdlpDownload(videoUrl, filename, ytdlpOutput);
        return NextResponse.json({
          success: true,
          action: 'debug-download',
          debugInfo,
          timestamp: new Date().toISOString()
        });

      case 'test-serving':
        if (!filename) {
          return NextResponse.json(
            { success: false, error: 'filename is required for test-serving' },
            { status: 400 }
          );
        }

        const servingTest = await testLocalFileServing(filename);
        return NextResponse.json({
          success: true,
          action: 'test-serving',
          servingTest,
          timestamp: new Date().toISOString()
        });

      case 'list-temp-files':
        const tempDir = path.join(tmpdir(), 'chordmini-ytdlp');
        try {
          const files = await fs.readdir(tempDir);
          const fileDetails = [];

          for (const file of files) {
            try {
              const filePath = path.join(tempDir, file);
              const stats = await fs.stat(filePath);
              fileDetails.push({
                name: file,
                size: stats.size,
                sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)}MB`,
                modified: stats.mtime.toISOString(),
                isAudio: /\.(mp3|wav|m4a|opus|webm)$/i.test(file)
              });
            } catch (error) {
              fileDetails.push({
                name: file,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          return NextResponse.json({
            success: true,
            action: 'list-temp-files',
            tempDir,
            files: fileDetails,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'list-temp-files',
            error: error instanceof Error ? error.message : 'Failed to list temp files',
            tempDir
          });
        }

      case 'clean-temp':
        const cleanTempDir = path.join(tmpdir(), 'chordmini-ytdlp');
        try {
          const files = await fs.readdir(cleanTempDir);
          const deletedFiles = [];

          for (const file of files) {
            try {
              const filePath = path.join(cleanTempDir, file);
              await fs.unlink(filePath);
              deletedFiles.push(file);
            } catch (error) {
              console.error(`Failed to delete ${file}:`, error);
            }
          }

          return NextResponse.json({
            success: true,
            action: 'clean-temp',
            deletedFiles,
            count: deletedFiles.length,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'clean-temp',
            error: error instanceof Error ? error.message : 'Failed to clean temp directory'
          });
        }

      default:
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid action. Available actions: troubleshoot, debug-download, test-serving, list-temp-files, clean-temp' 
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ Debug API error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Debug API failed' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Debug endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  // Return debug API documentation
  return NextResponse.json({
    success: true,
    message: 'yt-dlp Debug API',
    availableActions: [
      {
        action: 'troubleshoot',
        method: 'POST',
        description: 'Run comprehensive troubleshooting for a video URL',
        requiredParams: ['videoUrl'],
        optionalParams: ['filename', 'ytdlpOutput']
      },
      {
        action: 'debug-download',
        method: 'POST',
        description: 'Debug download issues and analyze temp directory',
        requiredParams: ['videoUrl'],
        optionalParams: ['filename', 'ytdlpOutput']
      },
      {
        action: 'test-serving',
        method: 'POST',
        description: 'Test local file serving for a specific filename',
        requiredParams: ['filename']
      },
      {
        action: 'list-temp-files',
        method: 'POST',
        description: 'List all files in the yt-dlp temp directory',
        requiredParams: []
      },
      {
        action: 'clean-temp',
        method: 'POST',
        description: 'Clean all files from the yt-dlp temp directory',
        requiredParams: []
      }
    ],
    examples: [
      {
        description: 'Troubleshoot a video URL',
        request: {
          action: 'troubleshoot',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          filename: 'Rick_Astley_Never_Gonna_Give_You_Up-dQw4w9WgXcQ.mp3'
        }
      },
      {
        description: 'List temp files',
        request: {
          action: 'list-temp-files'
        }
      }
    ]
  });
}
