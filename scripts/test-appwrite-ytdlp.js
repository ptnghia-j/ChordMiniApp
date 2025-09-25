#!/usr/bin/env node

/**
 * Test Script for Appwrite YT-DLP Service
 * 
 * This script tests the Appwrite yt-dlp function to check if it's working
 * and can handle YouTube bot detection issues.
 */

const { Client, Functions } = require('node-appwrite');

// Configuration
const PROJECT_ID = '68d48e41000a72457eb6';
const FUNCTION_ID = '68d49cd300092b56014f';
const ENDPOINT = 'https://sfo.cloud.appwrite.io/v1';

// Test video URLs (use different ones to test bot detection)
const TEST_VIDEOS = [
  {
    name: 'Short Test Video',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    description: 'Short video for quick testing'
  },
  {
    name: 'Popular Music Video',
    url: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
    description: 'Video that might trigger bot detection'
  },
  {
    name: 'Alternative Test',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Classic test video'
  }
];

async function testAppwriteYtDlpService() {
  console.log('🧪 Testing Appwrite YT-DLP Service');
  console.log('=====================================');
  console.log(`📍 Endpoint: ${ENDPOINT}`);
  console.log(`🆔 Project ID: ${PROJECT_ID}`);
  console.log(`⚡ Function ID: ${FUNCTION_ID}`);
  console.log('');

  // Initialize Appwrite client
  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

  const functions = new Functions(client);

  let successCount = 0;
  let totalTests = TEST_VIDEOS.length;

  for (let i = 0; i < TEST_VIDEOS.length; i++) {
    const testVideo = TEST_VIDEOS[i];
    console.log(`\n🎬 Test ${i + 1}/${totalTests}: ${testVideo.name}`);
    console.log(`📹 URL: ${testVideo.url}`);
    console.log(`📝 Description: ${testVideo.description}`);
    console.log('⏳ Testing...');

    try {
      const startTime = Date.now();

      // Execute the function
      const execution = await functions.createExecution({
        functionId: FUNCTION_ID,
        body: JSON.stringify({
          url: testVideo.url,
          format: 'bestaudio'
        })
      });

      const duration = Date.now() - startTime;

      console.log(`⏱️  Execution time: ${duration}ms`);
      console.log(`📊 Status Code: ${execution.responseStatusCode}`);

      if (execution.responseStatusCode === 200) {
        try {
          const response = JSON.parse(execution.responseBody);
          
          if (response.success) {
            console.log('✅ SUCCESS: Audio extraction completed');
            console.log(`📹 Video ID: ${response.data?.videoId || 'N/A'}`);
            console.log(`📄 Filename: ${response.data?.filename || 'N/A'}`);
            console.log(`📁 Size: ${response.data?.size ? `${(response.data.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`);
            console.log(`🎵 Format: ${response.data?.format || 'N/A'}`);
            successCount++;
          } else {
            console.log('❌ FAILED: Function returned error');
            console.log(`💥 Error: ${response.error || 'Unknown error'}`);
            
            // Check for specific bot detection error
            if (response.error && response.error.includes('Sign in to confirm you\'re not a bot')) {
              console.log('🤖 DETECTED: YouTube bot detection triggered');
              console.log('💡 This indicates YouTube is blocking the requests');
            }
          }
        } catch (parseError) {
          console.log('❌ FAILED: Could not parse response');
          console.log(`📄 Raw response: ${execution.responseBody}`);
        }
      } else {
        console.log(`❌ FAILED: HTTP ${execution.responseStatusCode}`);
        console.log(`📄 Response: ${execution.responseBody}`);
        console.log(`💥 Errors: ${execution.errors}`);
      }

    } catch (error) {
      console.log('❌ FAILED: Exception occurred');
      console.log(`💥 Error: ${error.message}`);
      
      if (error.message.includes('timeout')) {
        console.log('⏰ This might be a timeout issue - function may be taking too long');
      }
    }

    // Add delay between tests to avoid rate limiting
    if (i < TEST_VIDEOS.length - 1) {
      console.log('⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`✅ Successful: ${successCount}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - successCount}/${totalTests}`);
  console.log(`📈 Success Rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);

  if (successCount === 0) {
    console.log('\n🚨 All tests failed! Possible issues:');
    console.log('   1. YouTube bot detection is blocking all requests');
    console.log('   2. Appwrite function is not deployed or configured correctly');
    console.log('   3. yt-dlp needs to be updated with cookie support');
    console.log('   4. Function timeout is too short for video processing');
    console.log('\n💡 Recommended actions:');
    console.log('   1. Check Appwrite function logs in the console');
    console.log('   2. Update yt-dlp to latest version');
    console.log('   3. Add cookie support to bypass bot detection');
    console.log('   4. Consider using alternative extraction methods');
  } else if (successCount < totalTests) {
    console.log('\n⚠️  Some tests failed. This might indicate:');
    console.log('   1. Intermittent YouTube bot detection');
    console.log('   2. Specific videos are blocked or restricted');
    console.log('   3. Rate limiting from YouTube');
  } else {
    console.log('\n🎉 All tests passed! The service is working correctly.');
  }

  console.log('\n🔗 Useful links:');
  console.log(`   📊 Appwrite Console: https://cloud.appwrite.io/console/project-${PROJECT_ID}`);
  console.log(`   📋 Function Logs: https://cloud.appwrite.io/console/project-${PROJECT_ID}/functions/function-${FUNCTION_ID}`);
  console.log('   📖 yt-dlp Bot Detection: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp');
}

// Run the test
if (require.main === module) {
  testAppwriteYtDlpService().catch(error => {
    console.error('💥 Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testAppwriteYtDlpService };
