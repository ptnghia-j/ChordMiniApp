/**
 * yt-dlp Debugging Utilities
 * 
 * This module provides debugging utilities for yt-dlp audio extraction issues.
 * It helps diagnose file path mismatches, naming issues, and Firebase integration problems.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { getLocalAudioSearchDirs } from '@/services/storage/localAudioStorageService';

export interface DebugInfo {
  tempDir: string;
  filesInTempDir: string[];
  expectedFilename?: string;
  actualFilename?: string;
  fileSizes: Record<string, number>;
  ytdlpOutput: string;
  errors: string[];
}

/**
 * Debug yt-dlp download issues
 */
export async function debugYtdlpDownload(
  _videoUrl: string,
  expectedFilename?: string,
  ytdlpOutput?: string
): Promise<DebugInfo> {
  const candidateDirs = getLocalAudioSearchDirs();
  const tempDir = candidateDirs[0];
  const debugInfo: DebugInfo = {
    tempDir,
    filesInTempDir: [],
    expectedFilename,
    fileSizes: {},
    ytdlpOutput: ytdlpOutput || '',
    errors: []
  };

  try {
    let foundDirectory = false;

    for (const directory of candidateDirs) {
      try {
        await fs.access(directory);
        if (!foundDirectory) {
          debugInfo.tempDir = directory;
          foundDirectory = true;
        }
        console.log(`✅ Temp directory exists: ${directory}`);
      } catch {
        debugInfo.errors.push(`Temp directory does not exist: ${directory}`);
        continue;
      }

      try {
        const files = await fs.readdir(directory);
        debugInfo.filesInTempDir.push(...files);
        console.log(`📁 Files in temp directory (${files.length}) at ${directory}:`, files);

        for (const file of files) {
          try {
            const filePath = path.join(directory, file);
            const stats = await fs.stat(filePath);
            debugInfo.fileSizes[file] = stats.size;
            console.log(`   📄 ${file}: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
          } catch (error) {
            debugInfo.errors.push(`Failed to get stats for ${file}: ${error}`);
          }
        }
      } catch (error) {
        debugInfo.errors.push(`Failed to read temp directory ${directory}: ${error}`);
      }
    }

    if (!foundDirectory) {
      return debugInfo;
    }

    const audioFiles = debugInfo.filesInTempDir.filter(file => 
      file.endsWith('.mp3') || 
      file.endsWith('.wav') || 
      file.endsWith('.m4a') ||
      file.endsWith('.opus') ||
      file.endsWith('.webm')
    );

    if (audioFiles.length > 0) {
      debugInfo.actualFilename = audioFiles[0];
      console.log(`🎵 Found audio files: ${audioFiles.join(', ')}`);
      
      if (expectedFilename && !audioFiles.includes(expectedFilename)) {
        debugInfo.errors.push(
          `Expected filename "${expectedFilename}" not found. Available: ${audioFiles.join(', ')}`
        );
      }
    } else {
      debugInfo.errors.push('No audio files found in temp directory');
    }

    // Analyze yt-dlp output for clues
    if (ytdlpOutput) {
      console.log(`📝 Analyzing yt-dlp output...`);
      
      // Look for file paths in output
      const filePathMatches = ytdlpOutput.match(/\/[^\s]+\.(mp3|wav|m4a|opus|webm)/g);
      if (filePathMatches) {
        console.log(`🔍 File paths found in yt-dlp output:`, filePathMatches);
      }

      // Look for error messages
      const errorPatterns = [
        /ERROR:/gi,
        /WARNING:/gi,
        /failed/gi,
        /not found/gi
      ];

      for (const pattern of errorPatterns) {
        const matches = ytdlpOutput.match(pattern);
        if (matches) {
          debugInfo.errors.push(`yt-dlp output contains: ${matches.join(', ')}`);
        }
      }
    }

  } catch (error) {
    debugInfo.errors.push(`Debug process failed: ${error}`);
  }

  return debugInfo;
}

/**
 * Test local file serving
 */
export async function testLocalFileServing(filename: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
  responseSize?: number;
}> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const testUrl = `${baseUrl}/api/serve-local-audio?filename=${encodeURIComponent(filename)}`;
    
    console.log(`🧪 Testing local file serving: ${testUrl}`);
    
    const response = await fetch(testUrl);
    
    if (response.ok) {
      const contentLength = response.headers.get('content-length');
      return {
        success: true,
        url: testUrl,
        responseSize: contentLength ? parseInt(contentLength) : undefined
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Comprehensive yt-dlp troubleshooting
 */
export async function troubleshootYtdlp(
  videoUrl: string,
  expectedFilename?: string,
  ytdlpOutput?: string
): Promise<void> {
  console.log(`🔧 Starting yt-dlp troubleshooting for: ${videoUrl}`);
  console.log(`📋 Expected filename: ${expectedFilename || 'Not specified'}`);
  console.log('='.repeat(60));

  // Step 1: Debug download
  const debugInfo = await debugYtdlpDownload(videoUrl, expectedFilename, ytdlpOutput);
  
  console.log(`📁 Temp directory: ${debugInfo.tempDir}`);
  console.log(`📄 Files found: ${debugInfo.filesInTempDir.length}`);
  
  if (debugInfo.errors.length > 0) {
    console.log(`❌ Errors found:`);
    debugInfo.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  // Step 2: Test file serving if files exist
  if (debugInfo.actualFilename) {
    console.log(`🧪 Testing file serving for: ${debugInfo.actualFilename}`);
    const servingTest = await testLocalFileServing(debugInfo.actualFilename);
    
    if (servingTest.success) {
      console.log(`✅ File serving works: ${servingTest.url}`);
      console.log(`📊 Response size: ${servingTest.responseSize ? (servingTest.responseSize / 1024 / 1024).toFixed(2) + 'MB' : 'Unknown'}`);
    } else {
      console.log(`❌ File serving failed: ${servingTest.error}`);
    }
  }

  // Step 3: Recommendations
  console.log(`💡 Recommendations:`);
  
  if (debugInfo.filesInTempDir.length === 0) {
    console.log(`   - Check if yt-dlp is installed and accessible`);
    console.log(`   - Verify the video URL is valid and accessible`);
    console.log(`   - Check yt-dlp output for error messages`);
  } else if (!debugInfo.actualFilename) {
    console.log(`   - No audio files found, check yt-dlp audio extraction settings`);
    console.log(`   - Try different audio formats (mp3, wav, m4a)`);
  } else if (expectedFilename && debugInfo.actualFilename !== expectedFilename) {
    console.log(`   - Filename mismatch detected`);
    console.log(`   - Expected: ${expectedFilename}`);
    console.log(`   - Actual: ${debugInfo.actualFilename}`);
    console.log(`   - Consider using the actual filename or adjusting the output template`);
  } else {
    console.log(`   - Files look good, check network connectivity and Firebase integration`);
  }

  console.log('='.repeat(60));
}
