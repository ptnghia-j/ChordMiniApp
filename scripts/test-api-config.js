#!/usr/bin/env node

/**
 * Test script to verify API configuration and connectivity
 * Run with: node scripts/test-api-config.js
 */

const https = require('https');
const http = require('http');

// API endpoints to test
const endpoints = [
  {
    name: 'Backend Service',
    url: 'https://chordmini-backend-full-191567167632.us-central1.run.app/',
    expected: 'beat_model'
  }
];

/**
 * Test a single endpoint
 */
function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.url);
    const client = url.protocol === 'https:' ? https : http;
    
    console.log(`\n🔍 Testing ${endpoint.name}...`);
    console.log(`   URL: ${endpoint.url}`);
    
    const req = client.get(endpoint.url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode === 200) {
            if (response[endpoint.expected]) {
              console.log(`   ✅ Status: ${res.statusCode} OK`);
              console.log(`   ✅ Response contains expected field: ${endpoint.expected}`);
              console.log(`   📊 Response preview:`, JSON.stringify(response, null, 2).substring(0, 200) + '...');
              resolve({ success: true, endpoint: endpoint.name, response });
            } else {
              console.log(`   ⚠️  Status: ${res.statusCode} OK but missing expected field: ${endpoint.expected}`);
              console.log(`   📊 Response:`, JSON.stringify(response, null, 2));
              resolve({ success: false, endpoint: endpoint.name, error: `Missing ${endpoint.expected}` });
            }
          } else {
            console.log(`   ❌ Status: ${res.statusCode}`);
            console.log(`   📊 Response:`, JSON.stringify(response, null, 2));
            resolve({ success: false, endpoint: endpoint.name, error: `HTTP ${res.statusCode}` });
          }
        } catch (parseError) {
          console.log(`   ❌ Failed to parse JSON response`);
          console.log(`   📊 Raw response:`, data.substring(0, 200));
          resolve({ success: false, endpoint: endpoint.name, error: 'Invalid JSON' });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Connection failed: ${error.message}`);
      resolve({ success: false, endpoint: endpoint.name, error: error.message });
    });
    
    req.setTimeout(10000, () => {
      console.log(`   ❌ Request timeout (10s)`);
      req.destroy();
      resolve({ success: false, endpoint: endpoint.name, error: 'Timeout' });
    });
  });
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 ChordMini API Configuration Test');
  console.log('=====================================');
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
  }
  
  // Summary
  console.log('\n📋 Test Summary');
  console.log('================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n✅ Working Services:');
    successful.forEach(result => {
      console.log(`   - ${result.endpoint}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Services:');
    failed.forEach(result => {
      console.log(`   - ${result.endpoint}: ${result.error}`);
    });
  }
  
  // Configuration recommendations
  console.log('\n🔧 Configuration Recommendations');
  console.log('=================================');
  
  if (successful.length === endpoints.length) {
    console.log('✅ All services are operational!');
    console.log('✅ Your frontend can use this endpoint:');
    console.log('   NEXT_PUBLIC_PYTHON_API_URL=https://chordmini-backend-full-191567167632.us-central1.run.app');
  } else if (successful.length > 0) {
    console.log('⚠️  Backend service is available:');
    console.log('   Use backend service: NEXT_PUBLIC_PYTHON_API_URL=https://chordmini-backend-full-191567167632.us-central1.run.app');
  } else {
    console.log('❌ No services are available. Check your deployment or use local development:');
    console.log('   NEXT_PUBLIC_PYTHON_API_URL=http://localhost:5000');
  }
  
  console.log('\n📚 For more information, see:');
  console.log('   - PROJECT_DOCUMENTATION.md');
  console.log('   - API_STATUS.md');
  console.log('   - DEPLOYMENT_GUIDE.md');
  
  process.exit(failed.length > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(console.error);
