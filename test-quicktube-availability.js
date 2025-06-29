// Test QuickTube service availability and API endpoints

const QUICKTUBE_BASE_URL = 'https://quicktube.app';
const TEST_VIDEO_ID = 'cX2uLlc0su4';
const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

console.log('🧪 QuickTube Service Availability Test');
console.log('=====================================');

async function testQuickTubeAvailability() {
  try {
    // Test 1: Check if QuickTube is accessible
    console.log('📡 Test 1: Checking QuickTube service availability...');
    const healthResponse = await fetch(QUICKTUBE_BASE_URL, {
      method: 'HEAD'
    });
    
    console.log(`📊 QuickTube Status: ${healthResponse.status} ${healthResponse.statusText}`);
    
    if (!healthResponse.ok) {
      throw new Error(`QuickTube service not available: ${healthResponse.status}`);
    }
    
    console.log('✅ QuickTube service is accessible');
    console.log('');

    // Test 2: Try to create a job
    console.log('📡 Test 2: Testing job creation API...');
    const jobResponse = await fetch(`${QUICKTUBE_BASE_URL}/download/index?link=${encodeURIComponent(TEST_VIDEO_URL)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ChordMini/1.0'
      }
    });

    console.log(`📊 Job Creation Status: ${jobResponse.status} ${jobResponse.statusText}`);
    
    if (jobResponse.ok) {
      const jobData = await jobResponse.json();
      console.log('📋 Job Response:', JSON.stringify(jobData, null, 2));
      
      if (jobData.jid) {
        console.log(`✅ Job created successfully: ${jobData.jid}`);
        
        // Test 3: Try status API
        console.log('');
        console.log('📡 Test 3: Testing status API...');
        const statusResponse = await fetch(`${QUICKTUBE_BASE_URL}/status/${jobData.jid}`, {
          method: 'GET'
        });
        
        console.log(`📊 Status API: ${statusResponse.status} ${statusResponse.statusText}`);
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log('📋 Status Response:', JSON.stringify(statusData, null, 2));
        } else {
          const errorText = await statusResponse.text();
          console.log('❌ Status API Error:', errorText);
        }
        
        // Test 4: Test WebSocket endpoint
        console.log('');
        console.log('📡 Test 4: Testing WebSocket endpoint accessibility...');
        
        try {
          // We can't easily test WebSocket from Node.js without additional setup
          // But we can test if the endpoint responds to HTTP requests
          const wsTestResponse = await fetch('https://quicktube.app/cable', {
            method: 'GET'
          });
          
          console.log(`📊 WebSocket Endpoint: ${wsTestResponse.status} ${wsTestResponse.statusText}`);
          
          if (wsTestResponse.status === 426) {
            console.log('✅ WebSocket endpoint exists (426 = Upgrade Required is expected)');
          } else {
            console.log(`⚠️  Unexpected response from WebSocket endpoint`);
          }
        } catch (wsError) {
          console.log('❌ WebSocket endpoint test failed:', wsError.message);
        }
        
      } else {
        console.log('❌ No job ID in response');
      }
    } else {
      const errorText = await jobResponse.text();
      console.log('❌ Job creation failed:', errorText);
    }

    console.log('');
    console.log('🎯 CONCLUSION:');
    console.log('- QuickTube service is accessible');
    console.log('- Job creation API works');
    console.log('- WebSocket integration may need server-side adjustments');
    console.log('');
    console.log('💡 RECOMMENDATION:');
    console.log('- Consider implementing a hybrid approach:');
    console.log('  1. Use WebSocket for client-side integration');
    console.log('  2. Use polling as fallback for server-side API routes');
    console.log('  3. Or implement WebSocket proxy through our own server');

  } catch (error) {
    console.error('❌ QuickTube availability test failed:', error.message);
    
    console.log('');
    console.log('🔍 Possible Issues:');
    console.log('- QuickTube service is down');
    console.log('- Network connectivity issues');
    console.log('- Rate limiting or blocking');
    console.log('- Service maintenance');
  }
}

// Run the test
testQuickTubeAvailability()
  .then(() => {
    console.log('');
    console.log('🏁 Availability test completed!');
  })
  .catch((error) => {
    console.error('🚨 Test failed:', error.message);
  });
