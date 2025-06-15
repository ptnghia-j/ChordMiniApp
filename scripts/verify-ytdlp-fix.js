#!/usr/bin/env node

/**
 * Verification script to test the yt-dlp fix for Vercel deployment
 * This script tests both local and deployed endpoints
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.method === 'POST' && options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testLocalBinary() {
  console.log('🔍 Testing local yt-dlp binary...');
  
  const binaryPath = path.join(process.cwd(), 'bin', 'yt-dlp');
  
  if (!fs.existsSync(binaryPath)) {
    console.log('❌ Local binary not found. Run: npm run prepare-ytdlp');
    return false;
  }
  
  console.log('✅ Local binary exists');
  console.log(`📏 Size: ${(fs.statSync(binaryPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  return true;
}

async function testDeployedEndpoint(baseUrl) {
  console.log(`\n🌐 Testing deployed endpoints at: ${baseUrl}`);
  
  try {
    // Test diagnostic endpoint
    console.log('🔧 Testing diagnostic endpoint...');
    const diagnostic = await makeRequest(`${baseUrl}/api/debug-ytdlp`);
    
    if (diagnostic.status === 200) {
      const tests = diagnostic.data.tests;
      
      if (tests.ytdlpAvailable?.success) {
        console.log('✅ yt-dlp is available in deployment');
        console.log(`📍 Path: ${tests.validatedPath?.path || 'Unknown'}`);
      } else {
        console.log('❌ yt-dlp is NOT available in deployment');
        console.log('Error:', tests.ytdlpAvailable?.error || tests.validatedPath?.error);
        return false;
      }
    } else {
      console.log(`❌ Diagnostic endpoint failed: ${diagnostic.status}`);
      return false;
    }
    
    // Test search endpoint
    console.log('🔍 Testing search endpoint...');
    const searchTest = await makeRequest(`${baseUrl}/api/search-youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    });
    
    if (searchTest.status === 200 && searchTest.data.success) {
      console.log('✅ YouTube search is working');
      console.log(`📊 Found ${searchTest.data.results?.length || 0} results`);
    } else {
      console.log('❌ YouTube search failed');
      console.log('Error:', searchTest.data.error || searchTest.data.details);
      return false;
    }
    
    // Test extract-audio endpoint (with streamOnly to avoid long processing)
    console.log('🎵 Testing audio extraction endpoint...');
    const audioTest = await makeRequest(`${baseUrl}/api/extract-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'dQw4w9WgXcQ', streamOnly: true })
    });
    
    if (audioTest.status === 200 && audioTest.data.success) {
      console.log('✅ Audio extraction is working');
      console.log('🔗 Stream URL obtained successfully');
    } else {
      console.log('❌ Audio extraction failed');
      console.log('Error:', audioTest.data.error || audioTest.data.details);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.log('❌ Network error testing deployed endpoints:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 yt-dlp Deployment Fix Verification\n');
  
  // Test local setup
  const localOk = await testLocalBinary();
  
  if (!localOk) {
    console.log('\n❌ Local setup verification failed');
    process.exit(1);
  }
  
  // Test deployed endpoints
  const deploymentUrl = process.argv[2] || 'https://chord-mini-app.vercel.app';
  const deployedOk = await testDeployedEndpoint(deploymentUrl);
  
  if (deployedOk) {
    console.log('\n🎉 All tests passed! yt-dlp fix is working correctly.');
  } else {
    console.log('\n❌ Deployment tests failed. Check the deployment logs.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testLocalBinary, testDeployedEndpoint };
