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

  // DIRECT FIX: In Vercel, we know the binary is in public directory
  if (isServerless) {
    const directPath = './public/yt-dlp';
    console.log(`🎯 Direct fix: Testing known Vercel path: ${directPath}`);

    try {
      // Check if file exists
      const stats = await fs.stat(directPath);
      if (stats.isFile() && stats.size > 1024 * 1024) { // At least 1MB
        console.log(`✅ Direct fix: Binary found at ${directPath}, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Try to make it executable
        try {
          await execAsync(`chmod +x "${directPath}"`, { timeout: 2000 });
          console.log(`✅ Direct fix: Made ${directPath} executable`);
        } catch (chmodError) {
          console.log(`⚠️ Direct fix: chmod failed, but continuing:`, chmodError instanceof Error ? chmodError.message : chmodError);
        }

        // Test execution with a simple approach
        try {
          const { stdout } = await execAsync(`"${directPath}" --version`, { timeout: 10000 });
          if (stdout && stdout.trim()) {
            console.log(`🎉 Direct fix SUCCESS! yt-dlp working at ${directPath}, version: ${stdout.trim()}`);
            validatedYtDlpPath = directPath;
            lastValidationTime = now;
            return directPath;
          }
        } catch (execError) {
          console.log(`⚠️ Direct fix: Execution test failed:`, execError instanceof Error ? execError.message : execError);
          // Continue to fallback logic
        }
      }
    } catch (statError) {
      console.log(`⚠️ Direct fix: File not found at ${directPath}:`, statError instanceof Error ? statError.message : statError);
    }
  }

  const possiblePaths = isServerless ? [
    './public/yt-dlp',             // Public directory (always included in Vercel)
    './bin/yt-dlp',                // Project bin directory (bundled binary)
    './yt-dlp',                    // Project root
    '/var/task/public/yt-dlp',    // Lambda task public directory
    '/var/task/bin/yt-dlp',       // Lambda task bin directory
    '/var/task/yt-dlp',           // Lambda task directory
    '/tmp/yt-dlp',                 // Temp directory
    'yt-dlp'                       // System PATH fallback
  ] : [
    './public/yt-dlp',             // Public directory (local testing)
    './bin/yt-dlp',                // Local bin directory
    'yt-dlp',                      // System PATH (local development)
    '/usr/local/bin/yt-dlp',      // Common installation path
    '/usr/bin/yt-dlp'             // Alternative installation path
  ];

  // Test each path to find a working one
  for (const path of possiblePaths) {
    try {
      console.log(`🔍 Testing yt-dlp path: ${path}`);

      // First check if file exists (for absolute paths)
      if (path.startsWith('/') || path.startsWith('./')) {
        try {
          const stats = await fs.stat(path);
          console.log(`📁 File exists at ${path}, size: ${stats.size} bytes, isFile: ${stats.isFile()}`);

          if (!stats.isFile()) {
            console.log(`⚠️ ${path} is not a file, skipping`);
            continue;
          }

          // Check if executable (but don't fail if permission check fails)
          try {
            const isExecutable = !!(stats.mode & parseInt('111', 8));
            console.log(`🔐 Executable check for ${path}: ${isExecutable} (mode: ${stats.mode.toString(8)})`);

            // In serverless environments, try to make it executable if it's not
            if (!isExecutable && isServerless) {
              console.log(`🔧 Attempting to make ${path} executable in serverless environment...`);
              try {
                await execAsync(`chmod +x "${path}"`, { timeout: 2000 });
                console.log(`✅ Successfully made ${path} executable`);
              } catch (chmodError) {
                console.log(`⚠️ Could not make ${path} executable:`, chmodError instanceof Error ? chmodError.message : chmodError);
                // Continue anyway - the file might still work
              }
            }
          } catch (permError) {
            console.log(`⚠️ Permission check failed for ${path}:`, permError instanceof Error ? permError.message : permError);
            // Continue anyway - the file might still work
          }
        } catch (statError) {
          console.log(`❌ File stat failed for ${path}:`, statError instanceof Error ? statError.message : statError);
          continue; // File doesn't exist
        }
      }

      // Test if yt-dlp actually works
      console.log(`🧪 Testing execution of ${path}...`);
      const { stdout } = await execAsync(`"${path}" --version`, { timeout: 5000 });
      if (stdout && stdout.trim()) {
        console.log(`✅ Found working yt-dlp at: ${path} (version: ${stdout.trim()})`);
        validatedYtDlpPath = path;
        lastValidationTime = now;
        return path;
      } else {
        console.log(`⚠️ ${path} executed but returned no version output`);
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
      console.error('💡 Ensure the yt-dlp binary is included in your deployment by running: npm run prepare-ytdlp');
    }
  }

  const errorMessage = isServerless
    ? 'yt-dlp is not available in this serverless environment. The binary should be included in the deployment package. Run "npm run prepare-ytdlp" before deploying.'
    : 'yt-dlp is not available in any expected location. Please ensure yt-dlp is installed and accessible.';

  throw new Error(errorMessage);
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
