import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function GET() {
  const logs: string[] = [];
  const results: Record<string, any> = {};

  try {
    logs.push('🔧 Starting yt-dlp path testing...');
    
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    logs.push(`📍 Environment: Serverless=${!!isServerless}, Platform=${process.platform}`);

    const possiblePaths = [
      './public/yt-dlp',
      './bin/yt-dlp', 
      '/var/task/public/yt-dlp',
      '/var/task/bin/yt-dlp',
      '/tmp/yt-dlp'
    ];

    // Test each path
    for (const path of possiblePaths) {
      logs.push(`\n🔍 Testing path: ${path}`);
      const pathResult: any = { path, exists: false, isFile: false, size: 0, executable: false, works: false };

      try {
        // Check if file exists
        const stats = await fs.stat(path);
        pathResult.exists = true;
        pathResult.isFile = stats.isFile();
        pathResult.size = stats.size;
        
        logs.push(`📁 File exists: ${pathResult.exists}, isFile: ${pathResult.isFile}, size: ${pathResult.size} bytes`);

        if (stats.isFile()) {
          // Check permissions
          try {
            const isExecutable = !!(stats.mode & parseInt('111', 8));
            pathResult.executable = isExecutable;
            logs.push(`🔐 Executable: ${isExecutable} (mode: ${stats.mode.toString(8)})`);

            // Try to make executable if not
            if (!isExecutable && isServerless) {
              logs.push(`🔧 Attempting to make executable...`);
              try {
                await execAsync(`chmod +x "${path}"`, { timeout: 2000 });
                logs.push(`✅ Successfully made executable`);
                pathResult.executable = true;
              } catch (chmodError) {
                logs.push(`⚠️ chmod failed: ${chmodError instanceof Error ? chmodError.message : chmodError}`);
              }
            }
          } catch (permError) {
            logs.push(`⚠️ Permission check failed: ${permError instanceof Error ? permError.message : permError}`);
          }

          // Test execution
          try {
            logs.push(`🧪 Testing execution...`);
            const { stdout, stderr } = await execAsync(`"${path}" --version`, { timeout: 5000 });
            
            if (stdout && stdout.trim()) {
              pathResult.works = true;
              pathResult.version = stdout.trim();
              logs.push(`✅ SUCCESS! Version: ${stdout.trim()}`);
            } else {
              logs.push(`⚠️ No version output. stderr: ${stderr}`);
            }
          } catch (execError) {
            logs.push(`❌ Execution failed: ${execError instanceof Error ? execError.message : execError}`);
            pathResult.error = execError instanceof Error ? execError.message : String(execError);
          }
        }
      } catch (statError) {
        logs.push(`❌ File not found: ${statError instanceof Error ? statError.message : statError}`);
      }

      results[path] = pathResult;
    }

    // Test directory contents
    logs.push(`\n📂 Directory contents:`);
    try {
      const publicFiles = await fs.readdir('./public');
      logs.push(`Public directory: ${publicFiles.filter(f => f.includes('yt')).join(', ')}`);
      results.publicDir = publicFiles.filter(f => f.includes('yt'));
    } catch (e) {
      logs.push(`Public directory error: ${e}`);
    }

    try {
      const binFiles = await fs.readdir('./bin');
      logs.push(`Bin directory: ${binFiles.filter(f => f.includes('yt')).join(', ')}`);
      results.binDir = binFiles.filter(f => f.includes('yt'));
    } catch (e) {
      logs.push(`Bin directory error: ${e}`);
    }

    return NextResponse.json({
      success: true,
      logs,
      results,
      environment: {
        isVercel: !!process.env.VERCEL,
        platform: process.platform,
        cwd: process.cwd()
      }
    });

  } catch (error) {
    logs.push(`❌ Fatal error: ${error instanceof Error ? error.message : error}`);
    
    return NextResponse.json({
      success: false,
      logs,
      results,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
