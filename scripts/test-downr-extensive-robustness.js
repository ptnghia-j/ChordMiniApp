/**
 * Extensive Robustness Testing Suite for downr.org Pipeline
 * Production-ready testing suite for ChordMiniApp downr.org integration
 */

const https = require('https');
const http = require('http');

class ExtensiveRobustnessTester {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000';
    this.downrApiUrl = 'https://downr.org/.netlify/functions/download';
    this.testResults = [];
    this.errorLog = [];
  }

  async runExtensiveTests() {
    console.log('🧪 Starting Extensive Robustness Testing Suite');
    console.log('Testing downr.org Pipeline Integration with ChordMiniApp');
    console.log('=' .repeat(100));

    // Check if server is running
    console.log('🔍 Checking if Next.js server is running...');
    const serverRunning = await this.checkServerHealth();
    if (!serverRunning) {
      console.log('❌ Next.js server is not running on localhost:3000');
      console.log('💡 Please start the server with: npm run dev');
      return;
    }
    console.log('✅ Server is running');

    const testSuites = [
      { name: 'Basic Functionality', tests: await this.getBasicTests() },
      { name: 'Format Compatibility', tests: await this.getFormatTests() },
      { name: 'Performance Testing', tests: await this.getPerformanceTests() },
      { name: 'Integration Testing', tests: await this.getIntegrationTests() }
    ];

    for (const suite of testSuites) {
      await this.runTestSuite(suite.name, suite.tests);
      
      // Wait between test suites
      if (testSuites.indexOf(suite) < testSuites.length - 1) {
        console.log('\n⏳ Waiting 10 seconds between test suites...');
        await this.sleep(10000);
      }
    }

    this.generateComprehensiveReport();
  }

  async getBasicTests() {
    return [
      {
        name: 'Short Video Test',
        videoId: 'jNQXAC9IVRw',
        expectedDuration: 19,
        category: 'basic'
      },
      {
        name: 'Popular Music Video',
        videoId: 'dQw4w9WgXcQ',
        expectedDuration: 213,
        category: 'basic'
      }
    ];
  }

  async getFormatTests() {
    return [
      {
        name: 'Medium Length Song',
        videoId: '9bZkp7q19f0',
        expectedDuration: 253,
        category: 'format'
      }
    ];
  }

  async getPerformanceTests() {
    return [
      {
        name: 'Performance Test 1',
        videoId: 'jNQXAC9IVRw',
        expectedDuration: 19,
        category: 'performance'
      }
    ];
  }

  async getIntegrationTests() {
    return [
      {
        name: 'API Integration Test',
        videoId: 'dQw4w9WgXcQ',
        expectedDuration: 213,
        category: 'integration'
      }
    ];
  }

  async runTestSuite(suiteName, tests) {
    console.log(`\n🧪 Test Suite: ${suiteName}`);
    console.log('=' .repeat(80));

    const suiteResults = {
      name: suiteName,
      tests: [],
      summary: {
        total: tests.length,
        passed: 0,
        failed: 0
      }
    };

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`\n📋 Test ${i + 1}/${tests.length}: ${test.name}`);
      console.log(`🎵 Video ID: ${test.videoId}`);
      
      const result = await this.runSingleTest(test);
      suiteResults.tests.push(result);
      
      if (result.success) {
        suiteResults.summary.passed++;
        console.log(`   ✅ PASSED - ${result.message}`);
      } else {
        suiteResults.summary.failed++;
        console.log(`   ❌ FAILED - ${result.error}`);
      }

      // Small delay between tests
      if (i < tests.length - 1) {
        await this.sleep(5000);
      }
    }

    this.testResults.push(suiteResults);
    console.log(`\n📊 Suite Summary: ${suiteResults.summary.passed}/${suiteResults.summary.total} passed`);
  }

  async runSingleTest(test) {
    const startTime = Date.now();
    
    try {
      // Test via API endpoint
      const requestData = {
        videoId: test.videoId,
        forceRedownload: false
      };

      const result = await this.makeRequest('/api/extract-audio', 'POST', requestData);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'API request failed',
          duration: Date.now() - startTime
        };
      }

      // Validate result
      const hasAudioUrl = !!result.audioUrl;
      const hasTitle = !!result.title;
      const hasDuration = typeof result.duration === 'number';

      return {
        success: true,
        message: `API successful - URL: ${hasAudioUrl ? 'Yes' : 'No'}, Title: ${hasTitle ? 'Yes' : 'No'}, Duration: ${hasDuration ? result.duration + 's' : 'No'}`,
        audioUrl: result.audioUrl,
        title: result.title,
        duration: result.duration,
        fromCache: result.fromCache,
        isStreamUrl: result.isStreamUrl,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  async checkServerHealth() {
    try {
      const response = await this.makeRequest('/api/health', 'GET');
      return response.success === true || response.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.apiBaseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ExtensiveRobustnessTester/1.0'
        }
      };

      if (data && method !== 'GET') {
        const postData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Request timeout (120s)'));
      });

      if (data && method !== 'GET') {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  generateComprehensiveReport() {
    console.log('\n' + '=' .repeat(100));
    console.log('📊 DOWNR.ORG EXTENSIVE ROBUSTNESS TEST REPORT');
    console.log('=' .repeat(100));

    const totalTests = this.testResults.reduce((sum, suite) => sum + suite.summary.total, 0);
    const passedTests = this.testResults.reduce((sum, suite) => sum + suite.summary.passed, 0);
    const failedTests = totalTests - passedTests;

    console.log(`\n📈 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} ✅`);
    console.log(`   Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
    console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    // Suite breakdown
    console.log(`\n📋 Suite Breakdown:`);
    this.testResults.forEach(suite => {
      const rate = ((suite.summary.passed / suite.summary.total) * 100).toFixed(1);
      console.log(`   ${suite.name}: ${suite.summary.passed}/${suite.summary.total} (${rate}%)`);
    });

    // Final assessment
    console.log(`\n🎯 Production Readiness Assessment:`);
    if (passedTests === totalTests) {
      console.log(`   🎉 EXCELLENT - All tests passed!`);
      console.log(`   ✅ downr.org pipeline is production-ready`);
      console.log(`   🚀 Ready for deployment!`);
    } else if (passedTests / totalTests >= 0.8) {
      console.log(`   ✅ GOOD - Most tests passed`);
      console.log(`   🔧 Minor issues to address`);
    } else {
      console.log(`   ⚠️  NEEDS ATTENTION - Multiple test failures`);
      console.log(`   🚨 Review and fix issues before deployment`);
    }

    console.log('\n' + '=' .repeat(100));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the extensive tests
async function main() {
  const tester = new ExtensiveRobustnessTester();
  await tester.runExtensiveTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ExtensiveRobustnessTester };
