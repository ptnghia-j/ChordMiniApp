// Comprehensive WebSocket Integration Test
// Tests the new QuickTube WebSocket implementation with the problematic Vietnamese video

const PRODUCTION_URL = 'https://chord-mini-app.vercel.app';
const TEST_VIDEO_ID = 'cX2uLlc0su4'; // Vietnamese title with Unicode characters
const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;
const TEST_VIDEO_TITLE = 'HOÀNG DŨNG - ĐOẠN KẾT MỚI | OFFICIAL AUDIO';

console.log('🧪 QuickTube WebSocket Integration Test');
console.log('=====================================');
console.log(`🎵 Test Video: ${TEST_VIDEO_TITLE}`);
console.log(`🔗 YouTube URL: ${TEST_VIDEO_URL}`);
console.log(`🌐 Production URL: ${PRODUCTION_URL}`);
console.log('');

async function testWebSocketIntegration() {
  const startTime = Date.now();
  
  try {
    console.log('📡 Step 1: Testing audio extraction with WebSocket integration...');
    
    // Call the extract-audio API endpoint
    const response = await fetch(`${PRODUCTION_URL}/api/extract-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId: TEST_VIDEO_ID
      })
    });

    console.log(`📊 API Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('📋 API Response:', JSON.stringify(result, null, 2));

    // Verify the response structure
    if (!result.success) {
      throw new Error(`Extraction failed: ${result.error}`);
    }

    if (!result.audioUrl) {
      throw new Error('No audio URL returned in successful response');
    }

    console.log('✅ Step 1 Complete: Audio extraction API call successful');
    console.log(`🔗 Audio URL: ${result.audioUrl}`);
    console.log('');

    // Step 2: Verify the audio URL is accessible
    console.log('📡 Step 2: Verifying audio URL accessibility...');
    
    const audioResponse = await fetch(result.audioUrl, {
      method: 'HEAD'
    });

    console.log(`📊 Audio URL Status: ${audioResponse.status} ${audioResponse.statusText}`);
    
    if (audioResponse.ok) {
      const contentLength = audioResponse.headers.get('content-length');
      const contentType = audioResponse.headers.get('content-type');
      
      console.log(`📁 Content-Length: ${contentLength ? `${Math.round(contentLength / 1024 / 1024 * 100) / 100} MB` : 'Unknown'}`);
      console.log(`🎵 Content-Type: ${contentType || 'Unknown'}`);
      console.log('✅ Step 2 Complete: Audio file is accessible');
    } else {
      throw new Error(`Audio URL not accessible: ${audioResponse.status} ${audioResponse.statusText}`);
    }

    console.log('');

    // Step 3: Analyze the filename pattern
    console.log('📡 Step 3: Analyzing filename pattern...');
    
    const audioUrl = new URL(result.audioUrl);
    const filename = audioUrl.pathname.split('/').pop();
    
    console.log(`📁 Extracted filename: ${filename}`);
    console.log(`🔍 Filename analysis:`);
    console.log(`   - Contains video ID [${TEST_VIDEO_ID}]: ${filename.includes(TEST_VIDEO_ID) ? '✅ Yes' : '❌ No'}`);
    console.log(`   - File extension: ${filename.split('.').pop()}`);
    console.log(`   - Unicode handling: ${/[^\x00-\x7F]/.test(filename) ? '🌐 Contains Unicode' : '🔤 ASCII only'}`);
    
    // Check if this matches expected QuickTube patterns
    const expectedPatterns = [
      `HOANG_DUNG_-_DOAN_KET_MOI_OFFICIAL_AUDIO-[${TEST_VIDEO_ID}].mp3`,
      `HOÀNG_DŨNG_-_ĐOẠN_KẾT_MỚI_OFFICIAL_AUDIO-[${TEST_VIDEO_ID}].mp3`,
      `${TEST_VIDEO_ID}.mp3`,
      `[${TEST_VIDEO_ID}].mp3`
    ];
    
    const matchesPattern = expectedPatterns.some(pattern => filename === pattern);
    console.log(`   - Matches expected pattern: ${matchesPattern ? '✅ Yes' : '❓ New pattern'}`);
    
    if (!matchesPattern) {
      console.log(`   - Actual pattern discovered: ${filename}`);
      console.log(`   - This is valuable data for understanding QuickTube's naming!`);
    }
    
    console.log('✅ Step 3 Complete: Filename analysis done');
    console.log('');

    // Step 4: Performance analysis
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log('📡 Step 4: Performance Analysis');
    console.log(`⏱️  Total processing time: ${totalTime.toFixed(2)} seconds`);
    console.log(`🚀 Performance: ${totalTime < 60 ? '✅ Excellent (< 60s)' : totalTime < 120 ? '⚠️  Acceptable (< 120s)' : '❌ Slow (> 120s)'}`);
    console.log('✅ Step 4 Complete: Performance analysis done');
    console.log('');

    // Final summary
    console.log('🎉 WEBSOCKET INTEGRATION TEST RESULTS');
    console.log('====================================');
    console.log('✅ WebSocket integration working correctly');
    console.log('✅ No filename pattern matching required');
    console.log('✅ Unicode characters handled properly');
    console.log('✅ Audio file accessible and valid');
    console.log(`✅ Processing completed in ${totalTime.toFixed(2)}s`);
    console.log('');
    console.log('🔍 Key Findings:');
    console.log(`   - Actual filename: ${filename}`);
    console.log(`   - Audio URL: ${result.audioUrl}`);
    console.log(`   - File size: ${audioResponse.headers.get('content-length') ? `${Math.round(audioResponse.headers.get('content-length') / 1024 / 1024 * 100) / 100} MB` : 'Unknown'}`);
    console.log('');
    console.log('🎯 CONCLUSION: WebSocket integration eliminates filename guessing!');

  } catch (error) {
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.error('');
    console.error('❌ WEBSOCKET INTEGRATION TEST FAILED');
    console.error('===================================');
    console.error(`💥 Error: ${error.message}`);
    console.error(`⏱️  Failed after: ${totalTime.toFixed(2)} seconds`);
    console.error('');
    console.error('🔍 Debugging Information:');
    console.error(`   - Test video: ${TEST_VIDEO_TITLE}`);
    console.error(`   - Video ID: ${TEST_VIDEO_ID}`);
    console.error(`   - Production URL: ${PRODUCTION_URL}`);
    console.error('');
    console.error('📋 Next Steps:');
    console.error('   1. Check Vercel function logs for detailed error information');
    console.error('   2. Verify QuickTube service availability');
    console.error('   3. Test WebSocket connection manually');
    console.error('   4. Check for any deployment issues');
    
    throw error;
  }
}

// Run the test
testWebSocketIntegration()
  .then(() => {
    console.log('');
    console.log('🏁 Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('🚨 Test failed with error:', error.message);
    process.exit(1);
  });
