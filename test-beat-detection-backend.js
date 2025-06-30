/**
 * Test Script to Debug Beat Detection Backend Issue
 * 
 * This script directly tests the Python backend to see if the issue
 * is in the backend or in our frontend processing.
 */

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testBeatDetectionBackend() {
  try {
    console.log('🧪 Testing Beat Detection Backend Directly...');
    
    // Backend URL
    const backendUrl = 'https://chordmini-backend-full-191567167632.us-central1.run.app';
    
    // Create a simple test audio file (you can replace this with an actual audio file)
    // For now, let's test with a small WAV file if available
    const testAudioPath = './test-audio.wav'; // You'll need to provide this
    
    if (!fs.existsSync(testAudioPath)) {
      console.log('❌ Test audio file not found. Please provide a test audio file at:', testAudioPath);
      console.log('💡 You can download a short audio file and place it in the project root for testing.');
      return;
    }
    
    // Read the test audio file
    const audioBuffer = fs.readFileSync(testAudioPath);
    console.log(`📁 Test audio file size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'test-audio.wav',
      contentType: 'audio/wav'
    });
    formData.append('detector', 'beat-transformer');
    formData.append('force', 'true');
    
    console.log('🚀 Sending request to Python backend...');
    console.log(`📡 URL: ${backendUrl}/api/detect-beats`);
    
    // Send request to Python backend
    const response = await fetch(`${backendUrl}/api/detect-beats`, {
      method: 'POST',
      body: formData,
      timeout: 600000 // 10 minutes
    });
    
    console.log(`📊 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend error: ${errorText}`);
      return;
    }
    
    // Parse response
    const result = await response.json();
    
    console.log('\n🔍 BACKEND RESPONSE ANALYSIS:');
    console.log('================================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`🥁 Has beats: ${!!result.beats}`);
    console.log(`📊 Beats type: ${typeof result.beats}`);
    console.log(`📊 Beats is array: ${Array.isArray(result.beats)}`);
    console.log(`📊 Beats length: ${result.beats?.length || 0}`);
    console.log(`🎵 BPM: ${result.BPM || result.bpm || 'N/A'}`);
    console.log(`⏱️ Duration: ${result.duration || 'N/A'} seconds`);
    console.log(`🎼 Time signature: ${result.time_signature || 'N/A'}`);
    console.log(`🤖 Model used: ${result.model_used || result.model || 'N/A'}`);
    
    if (result.beats && Array.isArray(result.beats)) {
      console.log(`\n🥁 BEAT ANALYSIS:`);
      console.log(`First 10 beats: [${result.beats.slice(0, 10).join(', ')}]`);
      
      if (result.beats.length === 1) {
        console.log('\n🚨 CRITICAL BUG DETECTED:');
        console.log(`❌ Backend returned only 1 beat: ${result.beats[0]}`);
        console.log(`❌ Expected beats for ${result.duration}s at ${result.BPM || result.bpm || 120} BPM: ~${Math.round((result.duration || 0) * (result.BPM || result.bpm || 120) / 60)}`);
        console.log('❌ This confirms the issue is in the Python backend, not the frontend!');
      } else {
        console.log(`✅ Beat detection appears to be working correctly with ${result.beats.length} beats`);
      }
    }
    
    console.log('\n📋 FULL RESPONSE:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testBeatDetectionBackend();
