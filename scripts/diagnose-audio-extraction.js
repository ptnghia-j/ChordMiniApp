#!/usr/bin/env node

/**
 * Comprehensive Audio Extraction Diagnostic Script
 * 
 * This script tests each component of the audio extraction pipeline
 * to identify exactly where failures are occurring.
 */

const https = require('https');
const http = require('http');

// Test video ID that's failing
const TEST_VIDEO_ID = 'SlPhMPnQ58k';
const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

/**
 * Test 1: downr.org API Response
 */
async function testDownrOrgAPI() {
  console.log('🧪 Test 1: downr.org API Response');
  console.log('=' .repeat(50));
  
  return new Promise((resolve) => {
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
      
      console.log(`📡 Response Status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`📋 Response Headers:`, res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`✅ API Response Received`);
          console.log(`   Title: ${response.title || 'N/A'}`);
          console.log(`   Duration: ${response.duration || 'N/A'}`);
          console.log(`   Media Count: ${response.medias ? response.medias.length : 0}`);
          
          if (response.medias && response.medias.length > 0) {
            console.log(`📁 Available Formats:`);
            response.medias.forEach((media, index) => {
              console.log(`   ${index + 1}. ${media.type} - ${media.ext} - ${media.quality || 'N/A'}`);
              console.log(`      URL: ${media.url.substring(0, 100)}...`);
            });
          }
          
          resolve({ success: true, data: response });
        } catch (error) {
          console.log(`❌ JSON Parse Error:`, error.message);
          console.log(`📄 Raw Response:`, data.substring(0, 500));
          resolve({ success: false, error: error.message, rawData: data });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Request Error:`, error.message);
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(30000, () => {
      console.log(`❌ Request Timeout`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Test 2: Audio URL Accessibility
 */
async function testAudioURLAccess(audioUrls) {
  console.log('\n🧪 Test 2: Audio URL Accessibility');
  console.log('=' .repeat(50));
  
  if (!audioUrls || audioUrls.length === 0) {
    console.log('⚠️  No audio URLs to test');
    return { success: false, error: 'No URLs provided' };
  }
  
  const results = [];
  
  for (let i = 0; i < Math.min(audioUrls.length, 3); i++) {
    const url = audioUrls[i];
    console.log(`\n📡 Testing URL ${i + 1}: ${url.substring(0, 100)}...`);
    
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const result = await new Promise((resolve) => {
        const options = {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
            'Range': 'bytes=0-',
          }
        };

        const req = client.request(url, options, (res) => {
          console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
          console.log(`   Content-Type: ${res.headers['content-type'] || 'N/A'}`);
          console.log(`   Content-Length: ${res.headers['content-length'] || 'N/A'}`);
          
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode,
            headers: res.headers
          });
        });
        
        req.on('error', (error) => {
          console.log(`   ❌ Error: ${error.message}`);
          resolve({ success: false, error: error.message });
        });
        
        req.setTimeout(10000, () => {
          console.log(`   ❌ Timeout`);
          req.destroy();
          resolve({ success: false, error: 'Timeout' });
        });
        
        req.end();
      });
      
      results.push(result);
      
    } catch (error) {
      console.log(`   ❌ URL Parse Error: ${error.message}`);
      results.push({ success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n📊 URL Test Results: ${successCount}/${results.length} accessible`);
  
  return {
    success: successCount > 0,
    results,
    accessibleCount: successCount,
    totalCount: results.length
  };
}

/**
 * Test 3: yt-mp3-go Service
 */
async function testYtMp3GoService() {
  console.log('\n🧪 Test 3: yt-mp3-go Service');
  console.log('=' .repeat(50));
  
  // Test different possible endpoints
  const endpoints = [
    'https://yt-mp3-go.onrender.com/yt-downloader/info',
    'https://lukavukanovic.xyz/yt-downloader/info',
    'https://yt-mp3-go.onrender.com/info',
    'https://yt-mp3-go.onrender.com/api/info'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${endpoint}`);
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ChordMiniApp/1.0'
        },
        body: `url=${encodeURIComponent(TEST_VIDEO_URL)}`
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.text();
        console.log(`   ✅ Endpoint working`);
        console.log(`   Response: ${data.substring(0, 200)}...`);
        return { success: true, endpoint, data };
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n❌ All yt-mp3-go endpoints failed`);
  return { success: false, error: 'All endpoints failed' };
}

/**
 * Test 4: Firebase Storage (if available)
 */
async function testFirebaseStorage() {
  console.log('\n🧪 Test 4: Firebase Storage');
  console.log('=' .repeat(50));
  
  try {
    // Check if Firebase is configured
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    };
    
    const missingKeys = Object.entries(firebaseConfig)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (missingKeys.length > 0) {
      console.log(`❌ Missing Firebase config: ${missingKeys.join(', ')}`);
      return { success: false, error: 'Missing Firebase configuration' };
    }
    
    console.log(`✅ Firebase configuration present`);
    console.log(`   Project ID: ${firebaseConfig.projectId}`);
    console.log(`   Storage Bucket: ${firebaseConfig.storageBucket}`);
    
    return { success: true, config: firebaseConfig };
    
  } catch (error) {
    console.log(`❌ Firebase test error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log('🚀 Audio Extraction Diagnostic Tool');
  console.log('🎯 Testing video ID:', TEST_VIDEO_ID);
  console.log('🔗 Testing video URL:', TEST_VIDEO_URL);
  console.log('\n');
  
  const results = {};
  
  // Test 1: downr.org API
  results.downrOrg = await testDownrOrgAPI();
  
  // Test 2: Audio URL accessibility (if downr.org worked)
  if (results.downrOrg.success && results.downrOrg.data.medias) {
    const audioUrls = results.downrOrg.data.medias
      .filter(media => media.type === 'audio')
      .map(media => media.url);
    results.audioUrls = await testAudioURLAccess(audioUrls);
  }
  
  // Test 3: yt-mp3-go service
  results.ytMp3Go = await testYtMp3GoService();
  
  // Test 4: Firebase storage
  results.firebase = await testFirebaseStorage();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`downr.org API: ${results.downrOrg.success ? '✅ WORKING' : '❌ FAILED'}`);
  if (results.audioUrls) {
    console.log(`Audio URLs: ${results.audioUrls.success ? '✅ ACCESSIBLE' : '❌ BLOCKED'} (${results.audioUrls.accessibleCount}/${results.audioUrls.totalCount})`);
  }
  console.log(`yt-mp3-go: ${results.ytMp3Go.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`Firebase: ${results.firebase.success ? '✅ CONFIGURED' : '❌ MISSING'}`);
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  if (!results.downrOrg.success) {
    console.log('• downr.org API is failing - check service status');
  } else if (results.audioUrls && !results.audioUrls.success) {
    console.log('• downr.org API works but audio URLs are blocked (403)');
    console.log('• This is likely the source of your 403 errors');
    console.log('• Consider using yt-mp3-go as primary service');
  }
  
  if (!results.ytMp3Go.success) {
    console.log('• yt-mp3-go service is not accessible');
    console.log('• Check if service endpoints have changed');
  }
  
  if (!results.firebase.success) {
    console.log('• Firebase configuration is missing');
    console.log('• Audio caching and storage will not work');
  }
  
  return results;
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
  runDiagnostics().catch(console.error);
}

module.exports = { runDiagnostics, testDownrOrgAPI, testAudioURLAccess, testYtMp3GoService };
