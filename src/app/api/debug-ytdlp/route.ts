import { NextResponse } from 'next/server';
import { getValidatedYtDlpPath, isYtDlpAvailable, getYtDlpVersion, executeYtDlp } from '@/utils/ytdlp-utils';
import fs from 'fs/promises';

export async function GET() {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        isVercel: !!process.env.VERCEL,
        isAWSLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
      },
      tests: {} as Record<string, unknown>
    };

    // Test 1: Check if yt-dlp is available using enhanced utility
    try {
      const available = await isYtDlpAvailable();
      diagnostics.tests.ytdlpAvailable = {
        success: available,
        message: available ? 'yt-dlp is available' : 'yt-dlp is not available'
      };
    } catch (error: unknown) {
      diagnostics.tests.ytdlpAvailable = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 2: Get validated yt-dlp path
    try {
      const validatedPath = await getValidatedYtDlpPath();
      diagnostics.tests.validatedPath = {
        success: true,
        path: validatedPath
      };
    } catch (error: unknown) {
      diagnostics.tests.validatedPath = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 3: Get yt-dlp version
    try {
      const version = await getYtDlpVersion();
      diagnostics.tests.versionCheck = {
        success: !!version,
        version: version || null
      };
    } catch (error: unknown) {
      diagnostics.tests.versionCheck = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 4: Check bin directory contents
    try {
      const files = await fs.readdir('./bin');
      diagnostics.tests.directoryContents = {
        success: true,
        files: files
      };
    } catch (error: unknown) {
      diagnostics.tests.directoryContents = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 4.5: Check for script execution marker
    try {
      const markerContent = await fs.readFile('./bin/script-executed.marker', 'utf-8');
      const markerData = JSON.parse(markerContent);
      diagnostics.tests.scriptExecutionMarker = {
        success: true,
        marker: markerData
      };
    } catch (error: unknown) {
      diagnostics.tests.scriptExecutionMarker = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 5: Try a simple yt-dlp command
    try {
      const { stdout } = await executeYtDlp('--help', 5000);
      diagnostics.tests.commandExecution = {
        success: true,
        helpOutput: stdout.substring(0, 200) + '...' // First 200 chars
      };
    } catch (error: unknown) {
      diagnostics.tests.commandExecution = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    return NextResponse.json(diagnostics, { status: 200 });

  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
