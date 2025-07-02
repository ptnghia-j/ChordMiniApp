#!/usr/bin/env node

/**
 * Test runner script for the analyze page component
 * Provides different testing modes and comprehensive reporting
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper function to print colored output
const print = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

// Helper function to run shell commands
const runCommand = (command, options = {}) => {
  try {
    const result = execSync(command, {
      stdio: 'inherit',
      encoding: 'utf8',
      ...options,
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error };
  }
};

// Test modes
const TEST_MODES = {
  unit: 'Run unit tests only',
  integration: 'Run integration tests only',
  all: 'Run all tests',
  coverage: 'Run tests with coverage report',
  watch: 'Run tests in watch mode',
  debug: 'Run tests in debug mode',
  ci: 'Run tests in CI mode (no watch, with coverage)',
};

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'all';
const additionalArgs = args.slice(1);

// Validate mode
if (!TEST_MODES[mode]) {
  print('❌ Invalid test mode!', 'red');
  print('\nAvailable modes:', 'yellow');
  Object.entries(TEST_MODES).forEach(([key, description]) => {
    print(`  ${key.padEnd(12)} - ${description}`, 'cyan');
  });
  process.exit(1);
}

// Print header
print('🧪 ChordMini Analyze Page Test Suite', 'bright');
print('=====================================', 'blue');
print(`Mode: ${mode} - ${TEST_MODES[mode]}`, 'green');
print('');

// Base Jest command
const baseJestCommand = 'npx jest --config=jest.config.analyze-page.js';

// Build command based on mode
let jestCommand = baseJestCommand;
let jestArgs = [];

switch (mode) {
  case 'unit':
    jestArgs.push('--testNamePattern="Unit Tests|Utility Functions"');
    break;
    
  case 'integration':
    jestArgs.push('--testNamePattern="Integration Tests|Audio Player Integration|Chord Grid Interactions"');
    break;
    
  case 'coverage':
    jestArgs.push('--coverage');
    jestArgs.push('--coverageDirectory=coverage/analyze-page');
    break;
    
  case 'watch':
    jestArgs.push('--watch');
    jestArgs.push('--watchAll=false');
    break;
    
  case 'debug':
    jestArgs.push('--verbose');
    jestArgs.push('--no-cache');
    jestArgs.push('--runInBand');
    break;
    
  case 'ci':
    jestArgs.push('--coverage');
    jestArgs.push('--watchAll=false');
    jestArgs.push('--passWithNoTests');
    jestArgs.push('--ci');
    jestArgs.push('--maxWorkers=2');
    break;
    
  case 'all':
  default:
    // Run all tests with basic configuration
    break;
}

// Add additional arguments
jestArgs.push(...additionalArgs);

// Build final command
const finalCommand = `${jestCommand} ${jestArgs.join(' ')}`;

print(`Running command: ${finalCommand}`, 'cyan');
print('');

// Pre-test checks
print('🔍 Running pre-test checks...', 'yellow');

// Check if required files exist
const requiredFiles = [
  'src/app/analyze/[videoId]/page.tsx',
  '__tests__/analyze-page.test.tsx',
  '__tests__/analyze-page-utils.test.ts',
  '__tests__/setup.ts',
  'jest.config.analyze-page.js',
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    print(`❌ Missing required file: ${file}`, 'red');
    allFilesExist = false;
  } else {
    print(`✅ Found: ${file}`, 'green');
  }
});

if (!allFilesExist) {
  print('\n❌ Some required files are missing. Please ensure all test files are present.', 'red');
  process.exit(1);
}

print('✅ All required files found!', 'green');
print('');

// Check TypeScript compilation
print('🔧 Checking TypeScript compilation...', 'yellow');
const tscCheck = runCommand('npx tsc --noEmit --skipLibCheck', { stdio: 'pipe' });

if (!tscCheck.success) {
  print('⚠️  TypeScript compilation issues detected. Tests may fail.', 'yellow');
  print('Consider fixing TypeScript errors before running tests.', 'yellow');
} else {
  print('✅ TypeScript compilation successful!', 'green');
}

print('');

// Run the tests
print('🚀 Starting test execution...', 'bright');
print('');

const testStart = Date.now();
const testResult = runCommand(finalCommand);
const testDuration = Date.now() - testStart;

print('');
print('📊 Test Execution Summary', 'bright');
print('========================', 'blue');

if (testResult.success) {
  print('✅ Tests completed successfully!', 'green');
} else {
  print('❌ Tests failed!', 'red');
}

print(`⏱️  Duration: ${(testDuration / 1000).toFixed(2)}s`, 'cyan');

// Post-test actions
if (mode === 'coverage' || mode === 'ci') {
  print('');
  print('📈 Coverage Report Generated', 'yellow');
  
  const coverageDir = mode === 'coverage' ? 'coverage/analyze-page' : 'coverage';
  const htmlReportPath = path.join(coverageDir, 'lcov-report', 'index.html');
  
  if (fs.existsSync(htmlReportPath)) {
    print(`📄 HTML Report: ${htmlReportPath}`, 'cyan');
    print('💡 Open the HTML report in your browser to view detailed coverage information.', 'blue');
  }
  
  // Check coverage thresholds
  const coverageFile = path.join(coverageDir, 'coverage-summary.json');
  if (fs.existsSync(coverageFile)) {
    try {
      const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
      const total = coverage.total;
      
      print('');
      print('📊 Coverage Summary:', 'yellow');
      print(`   Lines:      ${total.lines.pct}%`, total.lines.pct >= 70 ? 'green' : 'red');
      print(`   Functions:  ${total.functions.pct}%`, total.functions.pct >= 70 ? 'green' : 'red');
      print(`   Branches:   ${total.branches.pct}%`, total.branches.pct >= 70 ? 'green' : 'red');
      print(`   Statements: ${total.statements.pct}%`, total.statements.pct >= 70 ? 'green' : 'red');
    } catch (error) {
      print('⚠️  Could not parse coverage summary', 'yellow');
    }
  }
}

// Exit with appropriate code
process.exit(testResult.success ? 0 : 1);
