/**
 * yt-dlp Health Check API (Development Only)
 * 
 * This endpoint checks if yt-dlp is available and working in the development environment.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

// Only allow in development environment
const isDevelopment = process.env.NODE_ENV === 'development';

export async function GET() {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        available: false, 
        error: 'yt-dlp endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const healthCheck = await checkYtDlpHealth();

    return NextResponse.json(healthCheck);

  } catch (error) {
    console.error('❌ yt-dlp health check error:', error);
    
    return NextResponse.json(
      { 
        available: false, 
        error: error instanceof Error ? error.message : 'Health check failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * Check if yt-dlp is available and working
 */
interface HealthResult {
  available: boolean;
  version?: string;
  environment?: string;
  features?: string[];
  error?: string;
  suggestion?: string;
}

async function checkYtDlpHealth(): Promise<HealthResult> {
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', ['--version']);
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
        const version = stdout.trim();
        console.log(`✅ yt-dlp is available: ${version}`);
        
        resolve({
          available: true,
          version: version,
          environment: 'development',
          features: [
            'Video info extraction',
            'Audio download',
            'QuickTube-compatible filenames'
          ]
        });
      } else {
        console.warn('⚠️ yt-dlp not available:', stderr);
        resolve({
          available: false,
          error: stderr || `yt-dlp exited with code ${code}`,
          suggestion: 'Install yt-dlp for development: pip install yt-dlp'
        });
      }
    });

    ytdlp.on('error', (error) => {
      console.warn('⚠️ yt-dlp not found:', error.message);
      resolve({
        available: false,
        error: 'yt-dlp is not installed or not available in PATH',
        suggestion: 'Install yt-dlp for development: pip install yt-dlp or brew install yt-dlp'
      });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ytdlp.kill();
      resolve({
        available: false,
        error: 'Health check timed out',
        suggestion: 'yt-dlp may be installed but not responding'
      });
    }, 10000);
  });
}
