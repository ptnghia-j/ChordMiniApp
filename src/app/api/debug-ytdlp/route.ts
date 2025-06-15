import { NextRequest, NextResponse } from 'next/server';
import { getValidatedYtDlpPath, isYtDlpAvailable, getYtDlpVersion, executeYtDlp } from '@/utils/ytdlp-utils';
import fs from 'fs/promises';

export async function GET(request: NextRequest) {
  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      environment: {
        isVercel: !!process.env.VERCEL,
        isAWSLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
      },
      tests: {}
    };

    // Test 1: Check if yt-dlp is available using enhanced utility
    try {
      const available = await isYtDlpAvailable();
      diagnostics.tests.ytdlpAvailable = {
        success: available,
        message: available ? 'yt-dlp is available' : 'yt-dlp is not available'
      };
    } catch (error: any) {
      diagnostics.tests.ytdlpAvailable = {
        success: false,
        error: error.message
      };
    }

    // Test 2: Get validated yt-dlp path
    try {
      const validatedPath = await getValidatedYtDlpPath();
      diagnostics.tests.validatedPath = {
        success: true,
        path: validatedPath
      };
    } catch (error: any) {
      diagnostics.tests.validatedPath = {
        success: false,
        error: error.message
      };
    }

    // Test 3: Get yt-dlp version
    try {
      const version = await getYtDlpVersion();
      diagnostics.tests.versionCheck = {
        success: !!version,
        version: version || null
      };
    } catch (error: any) {
      diagnostics.tests.versionCheck = {
        success: false,
        error: error.message
      };
    }

    // Test 4: Check current directory contents
    try {
      const files = await fs.readdir('.');
      diagnostics.tests.directoryContents = {
        success: true,
        files: files.filter(f => f.includes('yt') || f.includes('dlp') || f === 'yt-dlp')
      };
    } catch (error: any) {
      diagnostics.tests.directoryContents = {
        success: false,
        error: error.message
      };
    }

    // Test 5: Try a simple yt-dlp command
    try {
      const { stdout } = await executeYtDlp('--help', 5000);
      diagnostics.tests.commandExecution = {
        success: true,
        helpOutput: stdout.substring(0, 200) + '...' // First 200 chars
      };
    } catch (error: any) {
      diagnostics.tests.commandExecution = {
        success: false,
        error: error.message
      };
    }

    return NextResponse.json(diagnostics, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
