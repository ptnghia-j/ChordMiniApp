#!/usr/bin/env node

/**
 * Simple runner script for the regeneration process
 * This compiles and runs the TypeScript regeneration script
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting synchronized chords regeneration...');
console.log('=' .repeat(80));

// Run the TypeScript script using ts-node
const scriptPath = path.join(__dirname, 'regenerate-synchronized-chords.ts');

const child = spawn('npx', ['ts-node', '--esm', scriptPath], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, NODE_ENV: 'development' }
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Regeneration script completed successfully');
  } else {
    console.log(`\n❌ Regeneration script failed with exit code ${code}`);
  }
  process.exit(code);
});

child.on('error', (error) => {
  console.error('❌ Failed to start regeneration script:', error);
  process.exit(1);
});
