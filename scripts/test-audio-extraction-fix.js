#!/usr/bin/env node

/**
 * Test Script for Audio Extraction Fix
 * 
 * This script tests the audio extraction services to verify the fixes
 * for the 403 errors and fallback chain issues in Vercel environment.
 */

const https = require('https');

// Test video ID that was failing
const TEST_VIDEO_ID = 'SlPhMPnQ58k';
const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

/**
 * Test downr.org service with improved headers
 */
async function testDownrOrgService() {
  console.log('🧪 Testing downr.org service...');
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      url: TEST_VIDEO_URL,
      format: 'audio'
    });

    const options = {
      hostname: 'downr.org',
      port: 443,
      path: '/.netlify/functions/download',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://downr.org',
        'Referer': 'https://downr.org/',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log('✅ downr.org service working');
            console.log(`   Title: ${response.title || 'N/A'}`);
            console.log(`   Formats available: ${response.medias ? response.medias.length : 0}`);
            resolve({ success: true, data: response });
          } catch (error) {
            console.log('❌ downr.org response parsing failed:', error.message);
            resolve({ success: false, error: error.message });
          }
        } else {
          console.log(`❌ downr.org failed: ${res.statusCode} ${res.statusMessage}`);
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ downr.org request failed:', error.message);
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(30000, () => {
      console.log('❌ downr.org request timed out');
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Test yt-mp3-go service
 */
async function testYtMp3GoService() {
  console.log('🧪 Testing yt-mp3-go service...');
  
  try {
    // Test the info endpoint first
    const FormData = require('form-data');
    const form = new FormData();
    form.append('url', TEST_VIDEO_URL);

    const response = await fetch('https://yt-mp3-go.onrender.com/yt-downloader/info', {
      method: 'POST',
      headers: {
        'User-Agent': 'ChordMiniApp/1.0',
        'Referer': 'https://yt-mp3-go.onrender.com/yt-downloader/'
      },
      body: form
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ yt-mp3-go service working');
      console.log(`   Title: ${data.title || 'N/A'}`);
      console.log(`   Video ID: ${data.id || 'N/A'}`);
      return { success: true, data };
    } else {
      console.log(`❌ yt-mp3-go failed: ${response.status} ${response.statusText}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log('❌ yt-mp3-go request failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test the full extraction API endpoint
 */
async function testExtractionAPI() {
  console.log('🧪 Testing full extraction API...');
  
  try {
    const response = await fetch('http://localhost:3000/api/extract-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId: TEST_VIDEO_ID,
        videoMetadata: {
          id: TEST_VIDEO_ID,
          title: 'Test Video',
          duration: '3:30',
          thumbnail: '',
          channelTitle: 'Test Channel'
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Extraction API working');
      console.log(`   Success: ${data.success}`);
      console.log(`   Method: ${data.method || 'N/A'}`);
      console.log(`   Audio URL: ${data.audioUrl ? 'Available' : 'N/A'}`);
      return { success: true, data };
    } else {
      const errorData = await response.json();
      console.log(`❌ Extraction API failed: ${response.status}`);
      console.log(`   Error: ${errorData.error || 'Unknown error'}`);
      return { success: false, error: errorData.error };
    }
  } catch (error) {
    console.log('❌ Extraction API request failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting Audio Extraction Fix Tests\n');
  
  const results = {
    downrOrg: await testDownrOrgService(),
    ytMp3Go: await testYtMp3GoService(),
    extractionAPI: await testExtractionAPI()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log(`   downr.org: ${results.downrOrg.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   yt-mp3-go: ${results.ytMp3Go.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Extraction API: ${results.extractionAPI.success ? '✅ PASS' : '❌ FAIL'}`);
  
  const passCount = Object.values(results).filter(r => r.success).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passCount}/${totalCount} tests passed`);
  
  if (passCount === totalCount) {
    console.log('🎉 All tests passed! The audio extraction fixes are working.');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testDownrOrgService, testYtMp3GoService, testExtractionAPI };
