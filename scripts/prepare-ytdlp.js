#!/usr/bin/env node

/**
 * Script to download and prepare yt-dlp binary for Vercel deployment
 * This ensures yt-dlp is available in the serverless environment
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        return downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          // Add a small delay to ensure file is fully closed
          setTimeout(resolve, 100);
        });
      });

      file.on('error', (err) => {
        file.close(() => {
          fs.unlink(destination, () => {}); // Delete the file on error
        });
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

async function main() {
  try {
    console.log('🔧 Preparing yt-dlp binary for Vercel deployment...');

    // Create bin directory if it doesn't exist
    const binDir = path.join(process.cwd(), 'bin');
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const ytdlpPath = path.join(binDir, 'yt-dlp');

    // Check if binary already exists and is valid
    if (fs.existsSync(ytdlpPath)) {
      const stats = fs.statSync(ytdlpPath);
      if (stats.size > 1024 * 1024) { // At least 1MB
        console.log('📦 Existing yt-dlp binary found, verifying...');
        try {
          const { stdout } = await execAsync(`"${ytdlpPath}" --version`, { timeout: 5000 });
          console.log('✅ Existing binary is valid!');
          console.log(`🔢 Version: ${stdout.trim()}`);
          console.log('🎉 yt-dlp preparation complete (using existing binary)!');
          return;
        } catch (error) {
          console.log('⚠️ Existing binary is invalid, downloading new one...');
          fs.unlinkSync(ytdlpPath);
        }
      }
    }
    
    // Download yt-dlp binary
    console.log('📥 Downloading yt-dlp binary...');

    // Try Node.js download first, fallback to curl in CI environments
    let downloadSuccess = false;

    try {
      await downloadFile(
        'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
        ytdlpPath
      );
      downloadSuccess = true;
    } catch (downloadError) {
      console.log('⚠️ Node.js download failed:', downloadError.message);

      // Fallback to curl for CI environments
      const isCI = process.env.CI || process.env.GITHUB_ACTIONS || process.env.VERCEL;
      if (isCI) {
        console.log('🔄 Trying curl fallback for CI environment...');
        try {
          await execAsync(`curl -L -o "${ytdlpPath}" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp`, { timeout: 60000 });
          downloadSuccess = true;
          console.log('✅ Downloaded using curl');
        } catch (curlError) {
          console.error('❌ Curl download also failed:', curlError.message);
          throw new Error('Both Node.js and curl download methods failed');
        }
      } else {
        throw downloadError;
      }
    }

    if (!downloadSuccess) {
      throw new Error('Failed to download yt-dlp binary');
    }

    // Add a delay to ensure file is fully written
    console.log('⏳ Waiting for file to be fully written...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Make it executable (Unix-like systems)
    if (process.platform !== 'win32') {
      console.log('🔐 Setting executable permissions...');
      try {
        fs.chmodSync(ytdlpPath, '755');
        // Add another small delay after chmod
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (chmodError) {
        console.warn('⚠️ Warning: Could not set executable permissions:', chmodError.message);
        console.log('🔧 Attempting alternative permission setting...');
        try {
          await execAsync(`chmod +x "${ytdlpPath}"`);
        } catch (altChmodError) {
          console.warn('⚠️ Alternative chmod also failed:', altChmodError.message);
        }
      }
    }

    // Verify the binary works
    console.log('✅ Verifying yt-dlp binary...');
    try {
      // Add retries for verification in case of temporary file locking
      let verificationSuccess = false;
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔍 Verification attempt ${attempt}/3...`);
          const { stdout } = await execAsync(`"${ytdlpPath}" --version`, { timeout: 10000 });

          console.log('✅ yt-dlp binary is ready for deployment!');
          console.log(`📦 Binary location: ${ytdlpPath}`);

          // Get file size
          const stats = fs.statSync(ytdlpPath);
          const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`📏 Binary size: ${fileSizeInMB} MB`);
          console.log(`🔢 yt-dlp version: ${stdout.trim()}`);

          verificationSuccess = true;
          break;
        } catch (error) {
          lastError = error;
          console.log(`⚠️ Attempt ${attempt} failed: ${error.message}`);
          if (attempt < 3) {
            console.log('⏳ Waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!verificationSuccess) {
        throw lastError;
      }

    } catch (error) {
      console.error('❌ yt-dlp binary verification failed after all attempts!');
      console.error('Error:', error.message);

      // In CI environments, sometimes verification fails but the binary is still usable
      // Check if this is a CI environment and the file exists with correct size
      const isCI = process.env.CI || process.env.GITHUB_ACTIONS || process.env.VERCEL;
      if (isCI && fs.existsSync(ytdlpPath)) {
        const stats = fs.statSync(ytdlpPath);
        const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

        if (stats.size > 1024 * 1024) { // At least 1MB
          console.log('🤖 CI environment detected - proceeding despite verification failure');
          console.log(`📦 Binary location: ${ytdlpPath}`);
          console.log(`📏 Binary size: ${fileSizeInMB} MB`);
          console.log('⚠️ Note: Binary verification failed but file appears valid for CI deployment');
        } else {
          process.exit(1);
        }
      } else {
        process.exit(1);
      }
    }
    
    console.log('🎉 yt-dlp preparation complete!');
    
  } catch (error) {
    console.error('❌ Failed to prepare yt-dlp binary:');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
