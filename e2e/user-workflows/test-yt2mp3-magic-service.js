#!/usr/bin/env node

/**
 * Comprehensive YT2MP3 Magic Service Test
 * 
 * This script tests the yt2mp3-magic.onrender.com service discovered from browser analysis:
 * - Conversion Endpoint: POST https://yt2mp3-magic.onrender.com/convert-mp3
 * - Direct download response with MP3 file
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const TEST_VIDEOS = [
  { 
    id: 'Ocm3Hhfw9nA', 
    title: 'Let It Be - Piano Version (PROBLEMATIC)', 
    url: 'https://www.youtube.com/watch?v=Ocm3Hhfw9nA',
    description: 'Our most problematic video that fails on other services'
  },
  { 
    id: 'dQw4w9WgXcQ', 
    title: 'Rick Astley - Never Gonna Give You Up (CONTROL)', 
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Classic control video for testing'
  },
  { 
    id: 'kJQP7kiw5Fk', 
    title: 'Luis Fonsi - Despacito (POPULAR)', 
    url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    description: 'Popular video to test with high-traffic content'
  },
  { 
    id: '9bZkp7q19f0', 
    title: 'PSY - Gangnam Style (VIRAL)', 
    url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    description: 'Viral video with billions of views'
  }
];

// Service configuration
const SERVICE_CONFIG = {
  name: 'YT2MP3 Magic',
  baseUrl: 'https://yt2mp3-magic.onrender.com',
  convertEndpoint: '/convert-mp3',
  downloadDir: path.join(__dirname, 'downloads'),
  timeout: 120000, // 2 minutes timeout for conversion
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

let fetch;

async function testYt2mp3MagicService() {
  // Initialize fetch
  const { default: nodeFetch } = await import('node-fetch');
  fetch = nodeFetch;

  // Create download directory if it doesn't exist
  if (!fs.existsSync(SERVICE_CONFIG.downloadDir)) {
    fs.mkdirSync(SERVICE_CONFIG.downloadDir, { recursive: true });
  }

  console.log('🧪 Testing YT2MP3 Magic Service');
  console.log('===============================');
  console.log(`🌐 Service URL: ${SERVICE_CONFIG.baseUrl}`);
  console.log(`🔗 Conversion Endpoint: ${SERVICE_CONFIG.convertEndpoint}`);
  console.log(`📁 Download Directory: ${SERVICE_CONFIG.downloadDir}`);
  console.log('');

  const results = [];

  // Test each video
  for (const video of TEST_VIDEOS) {
    console.log(`📹 Testing Video: ${video.title}`);
    console.log(`🔗 URL: ${video.url}`);
    console.log(`📝 Description: ${video.description}`);
    console.log('─'.repeat(70));
    
    const result = await testSingleVideo(video);
    results.push({ ...video, ...result });
    
    console.log('');
  }

  // Summary
  console.log('📊 TEST SUMMARY');
  console.log('==============');
  
  const successful = results.filter(r => r.success);
  console.log(`✅ Successful Conversions: ${successful.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('');
    console.log('✅ SUCCESSFUL CONVERSIONS:');
    successful.forEach(result => {
      console.log(`   • ${result.title}`);
      console.log(`     File: ${result.filePath}`);
      console.log(`     Size: ${result.fileSize}`);
      console.log(`     Type: ${result.fileType}`);
      console.log(`     Time: ${result.conversionTime}ms`);
      console.log('');
    });
  }
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('');
    console.log('❌ FAILED CONVERSIONS:');
    failed.forEach(result => {
      console.log(`   • ${result.title}: ${result.error}`);
    });
  }

  // Calculate average conversion time
  if (successful.length > 0) {
    const avgTime = successful.reduce((sum, r) => sum + r.conversionTime, 0) / successful.length;
    console.log('');
    console.log(`⏱️ Average Conversion Time: ${Math.round(avgTime)}ms (${(avgTime/1000).toFixed(1)} seconds)`);
  }

  return results;
}

async function testSingleVideo(video) {
  try {
    console.log('1️⃣ Initiating conversion...');
    const startTime = Date.now();
    
    // Create form data
    const formData = new URLSearchParams();
    formData.append('url', video.url);
    
    console.log(`   📡 POST ${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.convertEndpoint}`);
    
    const response = await fetch(`${SERVICE_CONFIG.baseUrl}${SERVICE_CONFIG.convertEndpoint}`, {
      method: 'POST',
      headers: {
        'User-Agent': SERVICE_CONFIG.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': SERVICE_CONFIG.baseUrl,
        'Referer': SERVICE_CONFIG.baseUrl + '/'
      },
      body: formData.toString(),
      redirect: 'follow',
      timeout: SERVICE_CONFIG.timeout
    });
    
    console.log(`   📊 Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Conversion failed: ${errorText.substring(0, 200)}`);
      return { 
        success: false, 
        error: `HTTP ${response.status}: ${response.statusText}`,
        conversionTime: Date.now() - startTime
      };
    }
    
    // Check content type to see if it's an MP3 file
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    const contentLength = response.headers.get('content-length');
    
    console.log(`   📊 Content Type: ${contentType}`);
    if (contentDisposition) console.log(`   📊 Content Disposition: ${contentDisposition}`);
    if (contentLength) console.log(`   📊 Content Length: ${formatFileSize(parseInt(contentLength))}`);
    
    // Extract filename from content-disposition or create one
    let filename = extractFilename(contentDisposition) || `${video.id}.mp3`;
    
    // Ensure filename is safe
    filename = sanitizeFilename(filename);
    
    // Save the file
    const filePath = path.join(SERVICE_CONFIG.downloadDir, filename);
    console.log(`   💾 Saving to: ${filePath}`);
    
    await pipeline(
      response.body,
      fs.createWriteStream(filePath)
    );
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = formatFileSize(stats.size);
    
    // Verify file is an MP3
    const fileType = await verifyMp3File(filePath);
    
    const conversionTime = Date.now() - startTime;
    console.log(`   ✅ Conversion completed in ${conversionTime}ms (${(conversionTime/1000).toFixed(1)} seconds)`);
    console.log(`   📊 File size: ${fileSize}`);
    console.log(`   🎵 File type: ${fileType}`);
    
    return {
      success: true,
      filePath,
      fileSize,
      fileType,
      conversionTime,
      contentType,
      contentDisposition
    };
    
  } catch (error) {
    console.log(`   ❌ Conversion error: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
      conversionTime: 0
    };
  }
}

function extractFilename(contentDisposition) {
  if (!contentDisposition) return null;
  
  // Try to extract filename from content-disposition header
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (filenameMatch && filenameMatch[1]) {
    let filename = filenameMatch[1].replace(/['"]/g, '');
    return decodeURIComponent(filename);
  }
  
  return null;
}

function sanitizeFilename(filename) {
  // Replace invalid characters with underscores
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

async function verifyMp3File(filePath) {
  try {
    // Read first 4 bytes to check for MP3 header
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    
    // Check for MP3 signatures
    // ID3v2 tag: "ID3"
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return 'MP3 (with ID3v2 tag)';
    }
    
    // MP3 frame sync: 0xFF followed by 0xE0, 0xF0, 0xFA, or 0xFB
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
      return 'MP3 (raw)';
    }
    
    // If no MP3 signature found, check file extension
    if (filePath.toLowerCase().endsWith('.mp3')) {
      return 'MP3 (by extension)';
    }
    
    return 'Unknown audio format';
    
  } catch (error) {
    console.log(`   ⚠️ File verification error: ${error.message}`);
    return 'Verification failed';
  }
}

// Test individual video function for external use
async function testSingleVideoById(videoId) {
  if (!fetch) {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
  }
  
  const video = TEST_VIDEOS.find(v => v.id === videoId) || {
    id: videoId,
    title: 'Custom Video',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    description: 'Custom test video'
  };
  
  console.log(`🧪 Testing single video: ${video.title}`);
  return await testSingleVideo(video);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    testYt2mp3MagicService, 
    testSingleVideoById,
    SERVICE_CONFIG,
    TEST_VIDEOS
  };
}

// Run the test if called directly
if (require.main === module) {
  console.log('🚀 Starting YT2MP3 Magic Service Test');
  console.log('');

  testYt2mp3MagicService().then(() => {
    console.log('🏁 YT2MP3 Magic service test completed');
  }).catch(error => {
    console.error('💥 Test crashed:', error);
  });
}
