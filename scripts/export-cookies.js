#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to store cookies
const cookiesDir = path.join(__dirname, '..', 'temp', 'cookies');
const cookiesFile = path.join(cookiesDir, 'youtube_cookies.txt');

// Make sure the directory exists
if (!fs.existsSync(cookiesDir)) {
  fs.mkdirSync(cookiesDir, { recursive: true });
}

console.log('Exporting YouTube cookies from Chrome...');

try {
  // Export cookies from Chrome to the file
  // We'll use a dummy URL to make yt-dlp extract cookies but not actually download anything
  // Use --cookies parameter for output file
  execSync(
    `yt-dlp --cookies-from-browser chrome --cookies "${cookiesFile}" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --skip-download --quiet`, 
    { stdio: 'inherit' }
  );
  
  // Check if the file was created and has content
  if (fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 0) {
    console.log(`✅ Successfully exported cookies to: ${cookiesFile}`);
    console.log('You can now use the app without keychain prompts.');
  } else {
    console.error('❌ Failed to export cookies: File is empty or not created');
  }
} catch (error) {
  console.error('❌ Error exporting cookies:', error.message);
  console.log('Trying with Firefox as fallback...');
  
  try {
    execSync(
      `yt-dlp --cookies-from-browser firefox --cookies "${cookiesFile}" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --skip-download --quiet`, 
      { stdio: 'inherit' }
    );
    
    if (fs.existsSync(cookiesFile) && fs.statSync(cookiesFile).size > 0) {
      console.log(`✅ Successfully exported cookies from Firefox to: ${cookiesFile}`);
    } else {
      console.error('❌ Failed to export cookies from Firefox');
    }
  } catch (firefoxError) {
    console.error('❌ Error exporting cookies from Firefox:', firefoxError.message);
  }
} 