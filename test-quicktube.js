// Quick test script to investigate QuickTube API behavior
// Run with: node test-quicktube.js

const QUICKTUBE_BASE_URL = 'https://quicktube.app';

async function testQuickTubeAPI() {
  const videoId = 'cX2uLlc0su4';
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`🔍 Testing QuickTube API for video: ${videoId}`);
  console.log(`🔗 YouTube URL: ${youtubeUrl}`);
  
  try {
    // Step 1: Create job
    console.log('\n📡 Step 1: Creating QuickTube job...');
    const jobResponse = await fetch(`${QUICKTUBE_BASE_URL}/download/index?link=${encodeURIComponent(youtubeUrl)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ChordMini/1.0'
      }
    });
    
    if (!jobResponse.ok) {
      throw new Error(`Job creation failed: ${jobResponse.status} ${jobResponse.statusText}`);
    }
    
    const jobData = await jobResponse.json();
    console.log('✅ Job created:', jobData);
    
    const jid = jobData.jid;
    if (!jid) {
      throw new Error('No job ID returned');
    }
    
    // Step 2: Test status API
    console.log('\n📡 Step 2: Testing status API...');
    const statusResponse = await fetch(`${QUICKTUBE_BASE_URL}/status/${jid}`, {
      method: 'GET'
    });
    
    console.log(`Status API response: ${statusResponse.status} ${statusResponse.statusText}`);
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('Status data:', JSON.stringify(statusData, null, 2));
    } else {
      const errorText = await statusResponse.text();
      console.log('Status API error:', errorText);
    }
    
    // Step 3: Test some common file patterns
    console.log('\n📡 Step 3: Testing common file patterns...');
    const patterns = [
      `${videoId}.mp3`,
      `[${videoId}].mp3`,
      `-[${videoId}].mp3`,
      `${jid}.mp3`
    ];
    
    for (const pattern of patterns) {
      const testUrl = `${QUICKTUBE_BASE_URL}/dl/${encodeURIComponent(pattern)}`;
      console.log(`🔍 Testing: ${testUrl}`);
      
      try {
        const testResponse = await fetch(testUrl, { method: 'HEAD' });
        console.log(`   Result: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.ok) {
          console.log(`🎉 FOUND FILE: ${testUrl}`);
          break;
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testQuickTubeAPI();
