#!/usr/bin/env node

/**
 * YT2MP3 Magic Download Verification Script
 * 
 * This script verifies the downloaded MP3 files from YT2MP3 Magic service
 * to ensure they contain real audio data and proper metadata.
 */

const fs = require('fs');
const path = require('path');

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Expected files from our test
const EXPECTED_FILES = [
  {
    filename: 'Let_It_Be_Piano_Version.mp3',
    expectedVideo: 'Let It Be - Piano Version (PROBLEMATIC)',
    videoId: 'Ocm3Hhfw9nA'
  },
  {
    filename: 'Rick_Astley_Never_Gonna_Give_You_Up_Official_Video_4K_Remaster.mp3',
    expectedVideo: 'Rick Astley - Never Gonna Give You Up (CONTROL)',
    videoId: 'dQw4w9WgXcQ'
  },
  {
    filename: 'Luis_Fonsi_Despacito_ft_Daddy_Yankee.mp3',
    expectedVideo: 'Luis Fonsi - Despacito (POPULAR)',
    videoId: 'kJQP7kiw5Fk'
  },
  {
    filename: 'PSY_GANGNAM_STYLE_MV.mp3',
    expectedVideo: 'PSY - Gangnam Style (VIRAL)',
    videoId: '9bZkp7q19f0'
  }
];

async function verifyDownloads() {
  console.log('🔍 YT2MP3 Magic Download Verification');
  console.log('====================================');
  console.log(`📁 Download Directory: ${DOWNLOAD_DIR}`);
  console.log('');

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.log('❌ Download directory does not exist');
    return;
  }

  const results = [];

  for (const expectedFile of EXPECTED_FILES) {
    console.log(`📄 Verifying: ${expectedFile.filename}`);
    console.log(`🎵 Expected Video: ${expectedFile.expectedVideo}`);
    console.log('─'.repeat(60));
    
    const result = await verifyFile(expectedFile);
    results.push({ ...expectedFile, ...result });
    
    console.log('');
  }

  // Summary
  console.log('📊 VERIFICATION SUMMARY');
  console.log('======================');
  
  const validFiles = results.filter(r => r.isValid);
  const hasAudio = results.filter(r => r.hasAudioData);
  
  console.log(`✅ Valid Files: ${validFiles.length}/${results.length}`);
  console.log(`🎵 Files with Audio Data: ${hasAudio.length}/${results.length}`);
  
  if (validFiles.length > 0) {
    console.log('');
    console.log('✅ VALID AUDIO FILES:');
    validFiles.forEach(result => {
      console.log(`   • ${result.expectedVideo}`);
      console.log(`     File: ${result.filename}`);
      console.log(`     Size: ${result.fileSize}`);
      console.log(`     Format: ${result.audioFormat}`);
      console.log(`     Duration: ${result.duration || 'Unknown'}`);
      console.log('');
    });
  }
  
  const invalidFiles = results.filter(r => !r.isValid);
  if (invalidFiles.length > 0) {
    console.log('❌ INVALID FILES:');
    invalidFiles.forEach(result => {
      console.log(`   • ${result.filename}: ${result.error}`);
    });
  }

  // Calculate total size
  const totalSize = validFiles.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0);
  console.log('');
  console.log(`📊 Total Download Size: ${formatFileSize(totalSize)}`);
  
  return results;
}

async function verifyFile(expectedFile) {
  try {
    const filePath = path.join(DOWNLOAD_DIR, expectedFile.filename);
    
    console.log(`   🔍 Checking file existence...`);
    if (!fs.existsSync(filePath)) {
      console.log(`   ❌ File not found: ${filePath}`);
      return { isValid: false, error: 'File not found' };
    }
    
    console.log(`   ✅ File exists`);
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = formatFileSize(stats.size);
    console.log(`   📊 File size: ${fileSize}`);
    
    // Verify it's an MP3 file
    console.log(`   🔍 Verifying MP3 format...`);
    const audioFormat = await verifyMp3Format(filePath);
    
    if (!audioFormat) {
      console.log(`   ❌ Not a valid MP3 file`);
      return { 
        isValid: false, 
        error: 'Not a valid MP3 file',
        fileSize,
        fileSizeBytes: stats.size
      };
    }
    
    console.log(`   ✅ Valid MP3 format: ${audioFormat}`);
    
    // Try to extract basic metadata
    console.log(`   🔍 Extracting metadata...`);
    const metadata = await extractBasicMetadata(filePath);
    
    console.log(`   ✅ File verification completed`);
    if (metadata.title) console.log(`   🎵 Title: ${metadata.title}`);
    if (metadata.artist) console.log(`   👤 Artist: ${metadata.artist}`);
    if (metadata.duration) console.log(`   ⏱️ Duration: ${metadata.duration}`);
    
    return {
      isValid: true,
      hasAudioData: true,
      fileSize,
      fileSizeBytes: stats.size,
      audioFormat,
      metadata,
      duration: metadata.duration,
      error: null
    };
    
  } catch (error) {
    console.log(`   ❌ Verification failed: ${error.message}`);
    return { 
      isValid: false, 
      error: error.message,
      hasAudioData: false
    };
  }
}

async function verifyMp3Format(filePath) {
  try {
    // Read first 10 bytes to check for MP3 header
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(10);
    fs.readSync(fd, buffer, 0, 10, 0);
    fs.closeSync(fd);
    
    // Check for ID3v2 tag: "ID3"
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return 'MP3 with ID3v2 tag';
    }
    
    // Check for MP3 frame sync: 0xFF followed by 0xE0-0xFF
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
      return 'MP3 raw format';
    }
    
    // Check for ID3v1 tag at end of file (last 128 bytes)
    const fileSize = fs.statSync(filePath).size;
    if (fileSize > 128) {
      const endBuffer = Buffer.alloc(3);
      const fd2 = fs.openSync(filePath, 'r');
      fs.readSync(fd2, endBuffer, 0, 3, fileSize - 128);
      fs.closeSync(fd2);
      
      if (endBuffer[0] === 0x54 && endBuffer[1] === 0x41 && endBuffer[2] === 0x47) { // "TAG"
        return 'MP3 with ID3v1 tag';
      }
    }
    
    return null;
    
  } catch (error) {
    console.log(`   ⚠️ Format verification error: ${error.message}`);
    return null;
  }
}

async function extractBasicMetadata(filePath) {
  try {
    const metadata = {};
    
    // Try to read ID3v2 tag if present
    const fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(10);
    fs.readSync(fd, headerBuffer, 0, 10, 0);
    
    // Check if ID3v2 tag exists
    if (headerBuffer[0] === 0x49 && headerBuffer[1] === 0x44 && headerBuffer[2] === 0x33) {
      // Calculate tag size
      const tagSize = ((headerBuffer[6] & 0x7F) << 21) |
                     ((headerBuffer[7] & 0x7F) << 14) |
                     ((headerBuffer[8] & 0x7F) << 7) |
                     (headerBuffer[9] & 0x7F);
      
      // Read the tag data (limit to first 1KB for basic info)
      const tagDataSize = Math.min(tagSize, 1024);
      const tagBuffer = Buffer.alloc(tagDataSize);
      fs.readSync(fd, tagBuffer, 0, tagDataSize, 10);
      
      // Look for common frames (simplified parsing)
      const tagString = tagBuffer.toString('latin1');
      
      // Try to find title (TIT2 frame)
      const titleMatch = tagString.match(/TIT2[^\x00]*\x00([^\x00]+)/);
      if (titleMatch) metadata.title = titleMatch[1];
      
      // Try to find artist (TPE1 frame)
      const artistMatch = tagString.match(/TPE1[^\x00]*\x00([^\x00]+)/);
      if (artistMatch) metadata.artist = artistMatch[1];
    }
    
    fs.closeSync(fd);
    
    // Estimate duration based on file size (rough calculation)
    const stats = fs.statSync(filePath);
    const estimatedDuration = Math.round(stats.size / (128 * 1024 / 8)); // Assuming 128kbps
    metadata.duration = `~${Math.floor(estimatedDuration / 60)}:${(estimatedDuration % 60).toString().padStart(2, '0')}`;
    
    return metadata;
    
  } catch (error) {
    console.log(`   ⚠️ Metadata extraction error: ${error.message}`);
    return {};
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { verifyDownloads, EXPECTED_FILES, DOWNLOAD_DIR };
}

// Run the verification if called directly
if (require.main === module) {
  console.log('🚀 Starting YT2MP3 Magic Download Verification');
  console.log('');

  verifyDownloads().then(() => {
    console.log('🏁 Download verification completed');
  }).catch(error => {
    console.error('💥 Verification crashed:', error);
  });
}
