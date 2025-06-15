import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Cache for yt-dlp path validation
let validatedYtDlpPath: string | null = null;
let lastValidationTime = 0;
const VALIDATION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get the correct yt-dlp path for different environments with runtime validation
 */
export async function getValidatedYtDlpPath(): Promise<string> {
  const now = Date.now();
  
  // Return cached path if still valid
  if (validatedYtDlpPath && (now - lastValidationTime) < VALIDATION_CACHE_DURATION) {
    return validatedYtDlpPath;
  }

  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  const possiblePaths = isServerless ? [
    './yt-dlp',                    // Project root
    '/tmp/yt-dlp',                 // Temp directory
    '/var/task/yt-dlp',           // Lambda task directory
    'yt-dlp'                       // System PATH fallback
  ] : [
    'yt-dlp',                      // System PATH (local development)
    '/usr/local/bin/yt-dlp',      // Common installation path
    '/usr/bin/yt-dlp'             // Alternative installation path
  ];

  // Test each path to find a working one
  for (const path of possiblePaths) {
    try {
      // First check if file exists (for absolute paths)
      if (path.startsWith('/') || path.startsWith('./')) {
        try {
          const stats = await fs.stat(path);
          if (!stats.isFile()) continue;
          
          // Check if executable
          const isExecutable = !!(stats.mode & parseInt('111', 8));
          if (!isExecutable) continue;
        } catch {
          continue; // File doesn't exist
        }
      }

      // Test if yt-dlp actually works
      const { stdout } = await execAsync(`${path} --version`, { timeout: 5000 });
      if (stdout && stdout.trim()) {
        console.log(`✅ Found working yt-dlp at: ${path} (version: ${stdout.trim()})`);
        validatedYtDlpPath = path;
        lastValidationTime = now;
        return path;
      }
    } catch (error) {
      console.log(`❌ yt-dlp test failed for path: ${path}`, error instanceof Error ? error.message : error);
      continue;
    }
  }

  // If no working yt-dlp found, try to download it to /tmp in serverless environment
  if (isServerless) {
    try {
      console.log('🔄 Attempting to download yt-dlp to /tmp...');
      const tmpPath = '/tmp/yt-dlp';
      
      await execAsync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${tmpPath} && chmod +x ${tmpPath}`, { timeout: 30000 });
      
      // Test the downloaded binary
      const { stdout } = await execAsync(`${tmpPath} --version`, { timeout: 5000 });
      if (stdout && stdout.trim()) {
        console.log(`✅ Successfully downloaded yt-dlp to /tmp (version: ${stdout.trim()})`);
        validatedYtDlpPath = tmpPath;
        lastValidationTime = now;
        return tmpPath;
      }
    } catch (error) {
      console.error('❌ Failed to download yt-dlp to /tmp:', error);
    }
  }

  throw new Error('yt-dlp is not available in any expected location. Please ensure yt-dlp is installed and accessible.');
}

/**
 * Execute yt-dlp command with automatic path resolution and error handling
 */
export async function executeYtDlp(args: string, timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string }> {
  const ytdlpPath = await getValidatedYtDlpPath();
  const command = `${ytdlpPath} ${args}`;
  
  console.log(`🔧 Executing: ${command}`);
  
  try {
    const result = await execAsync(command, { 
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    return result;
  } catch (error: unknown) {
    console.error(`❌ yt-dlp command failed: ${command}`);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    
    // If the error suggests yt-dlp is not found, invalidate cache and retry once
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
      console.log('🔄 yt-dlp not found, invalidating cache and retrying...');
      validatedYtDlpPath = null;
      lastValidationTime = 0;
      
      try {
        const retryYtdlpPath = await getValidatedYtDlpPath();
        const retryCommand = `${retryYtdlpPath} ${args}`;
        console.log(`🔧 Retry executing: ${retryCommand}`);
        
        return await execAsync(retryCommand, { 
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024 * 10 
        });
      } catch (retryError) {
        console.error('❌ Retry also failed:', retryError);
        throw retryError;
      }
    }
    
    throw error;
  }
}

/**
 * Check if yt-dlp is available without throwing errors
 */
export async function isYtDlpAvailable(): Promise<boolean> {
  try {
    await getValidatedYtDlpPath();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get yt-dlp version information
 */
export async function getYtDlpVersion(): Promise<string | null> {
  try {
    const { stdout } = await executeYtDlp('--version', 5000);
    return stdout.trim();
  } catch {
    return null;
  }
}
