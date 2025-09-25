/**
 * Complete Robustness Suite Orchestrator
 * Runs all production-ready robustness tests for ChordMiniApp downr.org pipeline
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class CompleteRobustnessSuite {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  async runCompleteSuite() {
    console.log('🚀 Starting Complete Robustness Suite');
    console.log('Running all production-ready tests for downr.org pipeline');
    console.log('=' .repeat(100));

    const testSuites = [
      {
        name: 'Extensive Robustness Testing',
        script: 'scripts/test-downr-extensive-robustness.js',
        description: 'Main robustness testing suite with comprehensive coverage'
      },
      {
        name: 'Concurrent Stress Testing',
        script: 'scripts/test-downr-concurrent-stress.js',
        description: 'Concurrent request handling and stress testing'
      },
      {
        name: 'Production Pipeline Testing',
        script: 'scripts/test-downr-production-pipeline.js',
        description: 'Production pipeline validation and performance testing'
      },
      {
        name: 'Integration Testing',
        script: 'scripts/testing/test-downr-integration.js',
        description: 'API endpoint integration testing'
      }
    ];

    for (let i = 0; i < testSuites.length; i++) {
      const suite = testSuites[i];
      console.log(`\n📋 Running Suite ${i + 1}/${testSuites.length}: ${suite.name}`);
      console.log(`📄 Description: ${suite.description}`);
      console.log(`🔧 Script: ${suite.script}`);
      
      const result = await this.runTestSuite(suite);
      this.results.push(result);
      
      if (result.success) {
        console.log(`   ✅ COMPLETED - ${suite.name}`);
      } else {
        console.log(`   ❌ FAILED - ${suite.name}: ${result.error}`);
      }

      // Wait between suites
      if (i < testSuites.length - 1) {
        console.log('   ⏳ Waiting 15 seconds before next suite...');
        await this.sleep(15000);
      }
    }

    this.generateFinalReport();
  }

  async runTestSuite(suite) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Check if script exists
      if (!fs.existsSync(suite.script)) {
        resolve({
          success: false,
          error: `Script not found: ${suite.script}`,
          duration: Date.now() - startTime,
          suite: suite.name
        });
        return;
      }

      console.log(`   🚀 Starting ${suite.name}...`);
      
      const child = spawn('node', [suite.script], {
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Show real-time output with prefix
        process.stdout.write(`   │ ${output.replace(/\n/g, '\n   │ ')}`);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(`   ⚠ ${output.replace(/\n/g, '\n   ⚠ ')}`);
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          resolve({
            success: true,
            suite: suite.name,
            duration,
            stdout,
            stderr
          });
        } else {
          resolve({
            success: false,
            error: `Process exited with code ${code}`,
            suite: suite.name,
            duration,
            stdout,
            stderr
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          suite: suite.name,
          duration: Date.now() - startTime,
          stdout,
          stderr
        });
      });

      // Set timeout for long-running tests
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          resolve({
            success: false,
            error: 'Test suite timeout (10 minutes)',
            suite: suite.name,
            duration: Date.now() - startTime,
            stdout,
            stderr
          });
        }
      }, 600000); // 10 minutes timeout
    });
  }

  generateFinalReport() {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\n' + '=' .repeat(100));
    console.log('📊 COMPLETE ROBUSTNESS SUITE FINAL REPORT');
    console.log('=' .repeat(100));

    const totalSuites = this.results.length;
    const passedSuites = this.results.filter(r => r.success).length;
    const failedSuites = totalSuites - passedSuites;

    console.log(`\n📈 Overall Results:`);
    console.log(`   Total Test Suites: ${totalSuites}`);
    console.log(`   Passed Suites: ${passedSuites} ✅`);
    console.log(`   Failed Suites: ${failedSuites} ${failedSuites > 0 ? '❌' : '✅'}`);
    console.log(`   Success Rate: ${((passedSuites / totalSuites) * 100).toFixed(1)}%`);
    console.log(`   Total Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);

    console.log(`\n📋 Suite Results:`);
    this.results.forEach((result, index) => {
      const duration = (result.duration / 1000).toFixed(1);
      if (result.success) {
        console.log(`   ${index + 1}. ✅ ${result.suite} (${duration}s)`);
      } else {
        console.log(`   ${index + 1}. ❌ ${result.suite} (${duration}s)`);
        console.log(`      Error: ${result.error}`);
      }
    });

    // Production readiness assessment
    console.log(`\n🎯 Production Readiness Assessment:`);
    if (passedSuites === totalSuites) {
      console.log(`   🎉 EXCELLENT - All test suites passed!`);
      console.log(`   ✅ downr.org pipeline is fully validated`);
      console.log(`   ✅ All integration points are working`);
      console.log(`   ✅ Performance and stress tests passed`);
      console.log(`   🚀 READY FOR PRODUCTION DEPLOYMENT!`);
    } else if (passedSuites / totalSuites >= 0.75) {
      console.log(`   ✅ GOOD - Most test suites passed`);
      console.log(`   🔧 Minor issues to address before deployment`);
      console.log(`   📋 Review failed suites and fix issues`);
    } else {
      console.log(`   ⚠️  NEEDS ATTENTION - Multiple suite failures`);
      console.log(`   🚨 Critical issues need resolution`);
      console.log(`   🔧 Review and fix all failed suites before deployment`);
    }

    // Save detailed report
    this.saveDetailedReport();

    console.log('\n' + '=' .repeat(100));
    console.log(`📄 Detailed report saved to: complete-robustness-report-${Date.now()}.json`);
    console.log('🎯 Complete Robustness Suite finished!');
  }

  saveDetailedReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Date.now() - this.startTime,
      summary: {
        totalSuites: this.results.length,
        passedSuites: this.results.filter(r => r.success).length,
        failedSuites: this.results.filter(r => !r.success).length,
        successRate: (this.results.filter(r => r.success).length / this.results.length * 100).toFixed(1)
      },
      results: this.results.map(result => ({
        suite: result.suite,
        success: result.success,
        duration: result.duration,
        error: result.error || null
      }))
    };

    const filename = `complete-robustness-report-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the complete suite
async function main() {
  const suite = new CompleteRobustnessSuite();
  await suite.runCompleteSuite();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { CompleteRobustnessSuite };
