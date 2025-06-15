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
        return downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destination, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', reject);
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
    
    // Download yt-dlp binary
    console.log('📥 Downloading yt-dlp binary...');
    await downloadFile(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
      ytdlpPath
    );
    
    // Make it executable (Unix-like systems)
    if (process.platform !== 'win32') {
      console.log('🔐 Setting executable permissions...');
      fs.chmodSync(ytdlpPath, '755');
    }
    
    // Verify the binary works
    console.log('✅ Verifying yt-dlp binary...');
    try {
      const { stdout } = await execAsync(`"${ytdlpPath}" --version`);
      console.log('✅ yt-dlp binary is ready for deployment!');
      console.log(`📦 Binary location: ${ytdlpPath}`);
      
      // Get file size
      const stats = fs.statSync(ytdlpPath);
      const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`📏 Binary size: ${fileSizeInMB} MB`);
      console.log(`🔢 yt-dlp version: ${stdout.trim()}`);
      
    } catch (error) {
      console.error('❌ yt-dlp binary verification failed!');
      console.error('Error:', error.message);
      process.exit(1);
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
