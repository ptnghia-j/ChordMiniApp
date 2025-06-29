#!/usr/bin/env node

/**
 * Rate Limiting Test Script
 * 
 * This script tests the rate limiting functionality of the ChordMini backend API.
 * It tests various endpoints with different rate limits and verifies proper behavior.
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = 'https://chordmini-backend-full-191567167632.us-central1.run.app';
const LOCAL_URL = 'http://localhost:5000';

// Test configuration
const TESTS = [
  {
    name: 'Health Check Rate Limit Test',
    endpoint: '/',
    method: 'GET',
    expectedLimit: 30, // 30 requests per minute
    testCount: 35, // Test with more than the limit
    description: 'Tests the health check endpoint rate limiting (30/min)'
  },
  {
    name: 'Model Info Rate Limit Test',
    endpoint: '/api/model-info',
    method: 'GET',
    expectedLimit: 20, // 20 requests per minute
    testCount: 25, // Test with more than the limit
    description: 'Tests the model info endpoint rate limiting (20/min)'
  },
  {
    name: 'Beat Detection Rate Limit Test',
    endpoint: '/api/detect-beats',
    method: 'POST',
    expectedLimit: 5, // 5 requests per minute
    testCount: 7, // Test with more than the limit
    description: 'Tests the beat detection endpoint rate limiting (5/min)',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}) // Empty body to trigger 400 error (expected)
  },
  {
    name: 'Chord Recognition Rate Limit Test',
    endpoint: '/api/recognize-chords',
    method: 'POST',
    expectedLimit: 5, // 5 requests per minute
    testCount: 7, // Test with more than the limit
    description: 'Tests the chord recognition endpoint rate limiting (5/min)',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}) // Empty body to trigger 400 error (expected)
  },
  {
    name: 'Genius Lyrics Rate Limit Test',
    endpoint: '/api/genius-lyrics',
    method: 'POST',
    expectedLimit: 10, // 10 requests per minute
    testCount: 12, // Test with more than the limit
    description: 'Tests the Genius lyrics endpoint rate limiting (10/min)',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist: 'test', title: 'test' })
  }
];

/**
 * Make an HTTP request and return response details
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          responseTime: Date.now() - startTime
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    const startTime = Date.now();
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Test rate limiting for a specific endpoint
 */
async function testEndpointRateLimit(test, baseUrl) {
  console.log(`\n🧪 ${test.name}`);
  console.log(`📝 ${test.description}`);
  console.log(`🎯 Testing ${test.method} ${test.endpoint}`);
  console.log(`📊 Expected limit: ${test.expectedLimit}/min, Testing with: ${test.testCount} requests`);
  
  const results = [];
  const url = `${baseUrl}${test.endpoint}`;
  
  // Make rapid requests
  for (let i = 1; i <= test.testCount; i++) {
    try {
      const response = await makeRequest(url, {
        method: test.method,
        headers: test.headers,
        body: test.body
      });
      
      results.push({
        requestNumber: i,
        statusCode: response.statusCode,
        responseTime: response.responseTime,
        rateLimitHeaders: {
          limit: response.headers['x-ratelimit-limit'],
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset'],
          retryAfter: response.headers['retry-after']
        }
      });
      
      // Log progress every 5 requests
      if (i % 5 === 0 || response.statusCode === 429) {
        console.log(`  Request ${i}: ${response.statusCode} (${response.responseTime}ms)`);
        
        if (response.headers['x-ratelimit-remaining']) {
          console.log(`    Rate limit remaining: ${response.headers['x-ratelimit-remaining']}`);
        }
        
        if (response.statusCode === 429) {
          console.log(`    🚫 Rate limited! Retry-After: ${response.headers['retry-after'] || 'not specified'}`);
          break; // Stop testing once rate limited
        }
      }
      
      // Small delay between requests to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`  Request ${i}: ERROR - ${error.message}`);
      results.push({
        requestNumber: i,
        error: error.message
      });
    }
  }
  
  // Analyze results
  const successfulRequests = results.filter(r => r.statusCode && r.statusCode < 400);
  const rateLimitedRequests = results.filter(r => r.statusCode === 429);
  const errorRequests = results.filter(r => r.statusCode && r.statusCode >= 400 && r.statusCode !== 429);
  
  console.log(`\n📈 Results Summary:`);
  console.log(`  ✅ Successful requests: ${successfulRequests.length}`);
  console.log(`  🚫 Rate limited requests: ${rateLimitedRequests.length}`);
  console.log(`  ❌ Error requests: ${errorRequests.length}`);
  
  // Check if rate limiting is working
  if (rateLimitedRequests.length > 0) {
    console.log(`  ✅ Rate limiting is WORKING - got 429 responses`);
    
    // Check for rate limit headers
    const firstRateLimited = rateLimitedRequests[0];
    if (firstRateLimited.rateLimitHeaders.limit) {
      console.log(`  📊 Rate limit headers found:`);
      console.log(`    Limit: ${firstRateLimited.rateLimitHeaders.limit}`);
      console.log(`    Remaining: ${firstRateLimited.rateLimitHeaders.remaining}`);
      console.log(`    Reset: ${firstRateLimited.rateLimitHeaders.reset}`);
      console.log(`    Retry-After: ${firstRateLimited.rateLimitHeaders.retryAfter || 'not set'}`);
    } else {
      console.log(`  ⚠️  Rate limit headers missing`);
    }
  } else {
    console.log(`  ❌ Rate limiting NOT working - no 429 responses received`);
  }
  
  return {
    test: test.name,
    totalRequests: results.length,
    successfulRequests: successfulRequests.length,
    rateLimitedRequests: rateLimitedRequests.length,
    errorRequests: errorRequests.length,
    rateLimitingWorking: rateLimitedRequests.length > 0,
    hasRateLimitHeaders: rateLimitedRequests.length > 0 && rateLimitedRequests[0].rateLimitHeaders.limit !== undefined
  };
}

/**
 * Test frontend rate limiting handling
 */
async function testFrontendRateLimiting() {
  console.log(`\n🌐 Testing Frontend Rate Limiting Handling`);
  console.log(`📝 This tests the frontend's ability to handle rate limit responses`);
  
  // This would typically be done through the browser, but we can simulate it
  console.log(`  ℹ️  Frontend rate limiting testing should be done through the browser`);
  console.log(`  ℹ️  Check the status page and main application for rate limit error handling`);
  console.log(`  ℹ️  Look for user-friendly error messages when rate limits are hit`);
}

/**
 * Main test runner
 */
async function runRateLimitingTests() {
  console.log(`🚀 ChordMini Rate Limiting Test Suite`);
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  
  // Force testing against production server
  let testUrl = BASE_URL;
  console.log(`🌐 Testing against PRODUCTION server: ${testUrl}`);
  
  const testResults = [];
  
  // Run each test
  for (const test of TESTS) {
    try {
      const result = await testEndpointRateLimit(test, testUrl);
      testResults.push(result);
      
      // Wait between tests to avoid interference
      console.log(`⏳ Waiting 10 seconds before next test...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
      testResults.push({
        test: test.name,
        error: error.message,
        rateLimitingWorking: false
      });
    }
  }
  
  // Test frontend handling
  await testFrontendRateLimiting();
  
  // Final summary
  console.log(`\n📊 FINAL TEST SUMMARY`);
  console.log(`🕒 Completed at: ${new Date().toISOString()}`);
  console.log(`🎯 Server tested: ${testUrl}`);
  
  const workingTests = testResults.filter(r => r.rateLimitingWorking);
  const testsWithHeaders = testResults.filter(r => r.hasRateLimitHeaders);
  
  console.log(`\n✅ Rate limiting working: ${workingTests.length}/${testResults.length} endpoints`);
  console.log(`📊 Rate limit headers present: ${testsWithHeaders.length}/${testResults.length} endpoints`);
  
  testResults.forEach(result => {
    if (result.error) {
      console.log(`  ❌ ${result.test}: ERROR - ${result.error}`);
    } else {
      const status = result.rateLimitingWorking ? '✅' : '❌';
      const headers = result.hasRateLimitHeaders ? '📊' : '⚠️';
      console.log(`  ${status} ${result.test}: ${result.rateLimitedRequests}/${result.totalRequests} rate limited ${headers}`);
    }
  });
  
  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  
  if (workingTests.length === 0) {
    console.log(`  🔧 Rate limiting is not implemented or not working`);
    console.log(`  📝 Deploy the updated backend with Flask-Limiter`);
  } else if (workingTests.length < testResults.length) {
    console.log(`  🔧 Some endpoints are missing rate limiting`);
    console.log(`  📝 Check rate limiting decorators on all endpoints`);
  } else {
    console.log(`  ✅ Rate limiting is working correctly!`);
  }
  
  if (testsWithHeaders.length === 0) {
    console.log(`  📊 Rate limit headers are missing`);
    console.log(`  📝 Ensure Flask-Limiter is configured to send headers`);
  } else if (testsWithHeaders.length < workingTests.length) {
    console.log(`  📊 Some rate limited responses are missing headers`);
  } else {
    console.log(`  📊 Rate limit headers are working correctly!`);
  }
}

// Run the tests
if (require.main === module) {
  runRateLimitingTests().catch(console.error);
}

module.exports = { runRateLimitingTests, testEndpointRateLimit };
