/**
 * Jest configuration specifically for testing the analyze page component
 * This configuration ensures proper testing environment for the complex analyze page
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  
  // Test patterns
  testMatch: [
    '<rootDir>/__tests__/analyze-page*.test.{js,jsx,ts,tsx}',
  ],
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/contexts/(.*)$': '<rootDir>/src/contexts/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    // Handle CSS imports (with CSS modules)
    '\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    // Handle CSS imports (without CSS modules)
    '\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Handle image imports
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
  },
  
  // Transform configuration
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/app/analyze/[videoId]/page.tsx',
    'src/components/**/*.{ts,tsx}',
    'src/hooks/**/*.{ts,tsx}',
    'src/services/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './src/app/analyze/[videoId]/page.tsx': {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test timeout (increased for complex integration tests)
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Verbose output for debugging
  verbose: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>/'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/out/',
    '<rootDir>/build/',
  ],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    '/node_modules/(?!(react-player|@testing-library)/)',
  ],
  
  // Global setup and teardown
  globalSetup: undefined,
  globalTeardown: undefined,
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  
  // Snapshot serializers
  snapshotSerializers: [],
  
  // Custom matchers
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  

  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'analyze-page-test-results.xml',
        suiteName: 'Analyze Page Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
      },
    ],
  ],
  
  // Bail configuration
  bail: false,
  
  // Force exit
  forceExit: false,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Max workers
  maxWorkers: '50%',
  
  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Preset
  preset: undefined,
  
  // Projects (for multi-project setup)
  projects: undefined,
  
  // Runner
  runner: 'jest-runner',
  
  // Test environment options
  testEnvironmentOptions: {
    url: 'http://localhost:3000',
  },
  
  // Timing
  slowTestThreshold: 5,
  
  // Extensions to treat as ESM
  extensionsToTreatAsEsm: [],
  
  // Globals
  globals: {
    'ts-jest': {
      useESM: false,
    },
  },
};

// Create and export the Jest configuration
module.exports = createJestConfig(customJestConfig);
