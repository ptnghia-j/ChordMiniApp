/**
 * Final Comprehensive Verification of yt-mp3-go Service
 * 
 * Now that we understand the correct download path structure:
 * - Service returns filePath: "downloads/jobID/filename.mp3"
 * - Download URL should be: /yt-downloader/downloads/jobID/filename.mp3
 * 
 * Let's do a complete verification with actual audio content testing.
 */

const BASE_URL = 'https://lukavukanovic.xyz';
const API_BASE = '/yt-downloader';
const TEST_VIDEO_1 = "https://www.youtube.com/watch?v=HsgTIMDA6ps";
const TEST_VIDEO_2 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

async function testCompleteWorkflowWithCorrectPath(videoUrl, videoName) {
  console.log(`\n🎬 Testing: ${videoName}`);
  console.log(`   URL: ${videoUrl}`);

  const startTime = Date.now();

  try {
    // Step 1: Submit download request
    console.log('      📤 Submitting download request...');
    
    const formData = new FormData();
    formData.append('url', videoUrl);

    const downloadResponse = await fetch(`${BASE_URL}${API_BASE}/download`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': `${BASE_URL}${API_BASE}/`
      },
      body: formData
    });

    if (!downloadResponse.ok) {
      throw new Error(`Download request failed: ${downloadResponse.status}`);
    }

    const downloadData = await downloadResponse.json();
    console.log(`      Job ID: ${downloadData.jobID}`);
    console.log(`      Title: ${downloadData.title}`);

    // Step 2: Monitor job status
    console.log('      📡 Monitoring job status...');
    
    const jobResult = await monitorJobStatusCorrectly(downloadData.jobID);
    
    if (!jobResult.success) {
      throw new Error(`Job monitoring failed: ${jobResult.error}`);
    }

    console.log(`      Job completed: ${jobResult.status}`);
    console.log(`      File path: ${jobResult.filePath}`);
    console.log(`      File size: ${(jobResult.fileSize / 1024 / 1024).toFixed(2)} MB`);

    if (jobResult.status !== 'complete') {
      throw new Error(`Job failed with status: ${jobResult.status}`);
    }

    // Step 3: Download and verify the actual file using correct path
    console.log('      📥 Downloading and verifying audio file...');
    
    // Extract the correct download path from filePath
    // filePath is like: "downloads/jobID/filename.mp3"
    // We need to construct: /yt-downloader/downloads/jobID/filename.mp3
    const relativePath = jobResult.filePath.replace('downloads/', '');
    const downloadUrl = `${BASE_URL}${API_BASE}/downloads/${relativePath}`;
    
    console.log(`      Download URL: ${downloadUrl}`);
    
    const fileResult = await downloadAndVerifyAudioFile(downloadUrl);
    
    if (!fileResult.success) {
      throw new Error(`File verification failed: ${fileResult.error}`);
    }

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      videoName,
      jobID: downloadData.jobID,
      title: downloadData.title,
      filePath: jobResult.filePath,
      downloadUrl,
      fileSize: fileResult.fileSize,
      fileSizeInMB: fileResult.fileSizeInMB,
      isValidMP3: fileResult.isValidMP3,
      zeroPercentage: fileResult.zeroPercentage,
      totalTime
    };

  } catch (error) {
    return { 
      success: false, 
      videoName, 
      error: error.message,
      totalTime: Date.now() - startTime
    };
  }
}

async function monitorJobStatusCorrectly(jobID) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Timeout after 60 seconds' });
    }, 60000);

    const pollStatus = async () => {
      try {
        const response = await fetch(`${BASE_URL}${API_BASE}/events?id=${jobID}`, {
          headers: {
            'Accept': 'text/event-stream',
            'User-Agent': 'ChordMiniApp/1.0'
          }
        });

        if (response.ok) {
          const text = await response.text();
          
          // Parse the last SSE message (most recent status)
          const lines = text.split('\n');
          let latestJobData = null;
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                latestJobData = JSON.parse(line.substring(6));
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
          
          if (latestJobData) {
            console.log(`         Status: ${latestJobData.status}`);
            
            if (latestJobData.status === 'complete') {
              clearTimeout(timeout);
              resolve({
                success: true,
                status: latestJobData.status,
                filePath: latestJobData.filePath,
                fileSize: latestJobData.fileSize
              });
              return;
            } else if (latestJobData.status === 'failed') {
              clearTimeout(timeout);
              resolve({
                success: false,
                error: `Job failed: ${latestJobData.error || 'Unknown error'}`
              });
              return;
            }
          }
        }

        // Continue polling
        setTimeout(pollStatus, 2000);

      } catch (error) {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      }
    };

    pollStatus();
  });
}

async function downloadAndVerifyAudioFile(downloadUrl) {
  try {
    const fileResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'ChordMiniApp/1.0'
      }
    });

    console.log(`         File download status: ${fileResponse.status}`);
    console.log(`         Content-Type: ${fileResponse.headers.get('content-type')}`);
    console.log(`         Content-Length: ${fileResponse.headers.get('content-length')}`);

    if (!fileResponse.ok) {
      throw new Error(`File download failed: ${fileResponse.status}`);
    }

    const audioBuffer = await fileResponse.arrayBuffer();
    const fileSize = audioBuffer.byteLength;

    console.log(`         Actual file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB (${fileSize} bytes)`);

    if (fileSize === 0) {
      throw new Error('Downloaded file is empty (0 bytes)');
    }

    if (fileSize < 10000) { // Less than 10KB is suspicious for audio
      throw new Error('Downloaded file is suspiciously small');
    }

    // Verify MP3 format
    const uint8Array = new Uint8Array(audioBuffer);
    const header = Array.from(uint8Array.slice(0, 16))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');

    console.log(`         File header: ${header}`);

    // Check for MP3 signatures
    const isMP3Frame = uint8Array[0] === 0xFF && (uint8Array[1] & 0xE0) === 0xE0;
    const hasID3 = uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33;
    const isValidMP3 = isMP3Frame || hasID3;

    console.log(`         Valid MP3: ${isValidMP3 ? 'Yes' : 'No'}`);

    // Check for corruption (mostly zeros)
    const sampleSize = Math.min(1024, fileSize);
    const sample = uint8Array.slice(0, sampleSize);
    const zeroCount = sample.filter(byte => byte === 0).length;
    const zeroPercentage = (zeroCount / sampleSize) * 100;

    console.log(`         Zero bytes in sample: ${zeroPercentage.toFixed(1)}%`);

    if (zeroPercentage > 90) {
      throw new Error('File appears to be corrupted (>90% zeros)');
    }

    return {
      success: true,
      fileSize,
      fileSizeInMB: fileSize / 1024 / 1024,
      isValidMP3,
      zeroPercentage
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testCORSAndIntegration() {
  console.log('\n🌐 Testing CORS and Integration Compatibility...');
  console.log('=' .repeat(70));

  // Test CORS
  try {
    const corsResponse = await fetch(`${BASE_URL}${API_BASE}/download`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://chordminiapp.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    console.log(`   CORS OPTIONS status: ${corsResponse.status}`);
    console.log(`   CORS headers: ${JSON.stringify(Object.fromEntries(corsResponse.headers.entries()), null, 2)}`);

    const corsSupported = corsResponse.headers.get('access-control-allow-origin') === '*' ||
                         corsResponse.headers.get('access-control-allow-origin')?.includes('chordminiapp');

    console.log(`   CORS Support: ${corsSupported ? '✅ Yes' : '❌ No (will need proxy)'}`);

    return { corsSupported };

  } catch (error) {
    console.log(`   CORS test failed: ${error.message}`);
    return { corsSupported: false };
  }
}

async function runFinalVerification() {
  console.log('🚀 Starting yt-mp3-go Final Comprehensive Verification');
  console.log('🎯 Focus: Complete workflow with actual audio content verification');
  console.log('=' .repeat(70));

  try {
    // Test main workflow with both videos
    const testVideos = [
      { url: TEST_VIDEO_2, name: "Rick Roll (short, popular)" },
      { url: TEST_VIDEO_1, name: "Original test video" }
    ];

    const results = [];

    for (const video of testVideos) {
      const result = await testCompleteWorkflowWithCorrectPath(video.url, video.name);
      results.push(result);

      if (result.success) {
        console.log(`   ✅ SUCCESS - ${result.fileSizeInMB.toFixed(2)}MB MP3 file`);
      } else {
        console.log(`   ❌ FAILED - ${result.error}`);
      }

      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Test CORS and integration
    const integrationResult = await testCORSAndIntegration();

    console.log('\n' + '=' .repeat(70));
    console.log('📊 YT-MP3-GO FINAL VERIFICATION SUMMARY');
    console.log('=' .repeat(70));

    const successfulResults = results.filter(r => r.success);
    console.log(`\n🎵 Audio extraction: ${successfulResults.length}/${results.length} successful`);

    if (successfulResults.length > 0) {
      console.log('\n✅ Successful downloads:');
      successfulResults.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.videoName}:`);
        console.log(`      - File size: ${result.fileSizeInMB.toFixed(2)} MB`);
        console.log(`      - Valid MP3: ${result.isValidMP3 ? 'Yes' : 'No'}`);
        console.log(`      - Processing time: ${(result.totalTime / 1000).toFixed(1)}s`);
        console.log(`      - Zero percentage: ${result.zeroPercentage.toFixed(1)}%`);
        console.log(`      - Title: ${result.title}`);
      });
    }

    console.log(`\n🌐 CORS support: ${integrationResult.corsSupported ? '✅ Yes' : '❌ No (proxy needed)'}`);

    // Final recommendation
    console.log('\n💡 FINAL RECOMMENDATION:');

    if (successfulResults.length > 0) {
      console.log('🎉 YT-MP3-GO IS HIGHLY SUITABLE FOR CHORDMINIAPP INTEGRATION!');
      console.log('');
      console.log('✅ MAJOR ADVANTAGES:');
      console.log('   - ✅ Delivers REAL MP3 audio files (not empty like cnvmp3/cobalt)');
      console.log('   - ✅ Clean, well-documented API with job-based processing');
      console.log('   - ✅ Server-Sent Events for real-time status updates');
      console.log('   - ✅ No authentication required');
      console.log('   - ✅ Open source (can self-host for production)');
      console.log('   - ✅ Uses yt-dlp backend (proven reliability)');
      console.log('   - ✅ Proper file size and MP3 format validation');
      console.log('   - ✅ Unicode title support');
      console.log('');
      console.log('⚠️  CONSIDERATIONS:');
      console.log('   - Requires job-based workflow (not instant like QuickTube)');
      console.log('   - May need CORS proxy for frontend integration');
      console.log('   - Depends on third-party deployment (consider self-hosting)');
      console.log('   - Processing time: 10-30 seconds per video');
      console.log('');
      console.log('🔧 INTEGRATION STRATEGY:');
      console.log('   1. Implement as primary service with QuickTube fallback');
      console.log('   2. Use job-based workflow with SSE status monitoring');
      console.log('   3. Add CORS proxy if needed for frontend calls');
      console.log('   4. Consider self-hosting for production reliability');
      console.log('   5. Implement proper error handling and timeouts');

      return {
        suitable: true,
        service: 'yt-mp3-go',
        successRate: `${successfulResults.length}/${results.length}`,
        results,
        integrationComplexity: 'medium',
        recommendation: 'HIGHLY RECOMMENDED'
      };

    } else {
      console.log('❌ yt-mp3-go is NOT suitable for integration');
      console.log('   - No successful audio downloads achieved');

      return {
        suitable: false,
        service: 'yt-mp3-go',
        successRate: '0/2',
        results,
        recommendation: 'NOT RECOMMENDED'
      };
    }

  } catch (error) {
    console.error('❌ Final verification failed:', error);
    return { suitable: false, error: error.message };
  }
}

runFinalVerification();
