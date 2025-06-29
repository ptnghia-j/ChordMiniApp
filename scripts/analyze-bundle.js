#!/usr/bin/env node

/**
 * Bundle Analysis Script for ChordMiniApp
 * Identifies unused dependencies and optimization opportunities
 */

const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const dependencies = Object.keys(packageJson.dependencies || {});

// Potentially unused or heavy dependencies to review
const heavyDependencies = [
  'ffmpeg-static',
  'fluent-ffmpeg',
  'music-metadata',
  'play-dl',
  'ytdl-core',
  '@distube/ytdl-core',
  'crypto-browserify',
  'https-browserify',
  'stream-http',
  'url'
];

// Dependencies that might be redundant
const potentiallyRedundant = [
  'ytdl-core', // vs @distube/ytdl-core
  'axios', // vs native fetch
  'prismjs', // if not using syntax highlighting
  'react-chartjs-2', // if charts are minimal
];

console.log('🔍 ChordMiniApp Bundle Analysis\n');

console.log('📦 Heavy Dependencies (consider optimization):');
heavyDependencies.forEach(dep => {
  if (dependencies.includes(dep)) {
    console.log(`  ⚠️  ${dep}`);
  }
});

console.log('\n🔄 Potentially Redundant Dependencies:');
potentiallyRedundant.forEach(dep => {
  if (dependencies.includes(dep)) {
    console.log(`  ❓ ${dep}`);
  }
});

console.log('\n💡 Optimization Recommendations:');
console.log('  1. Replace axios with native fetch API');
console.log('  2. Use dynamic imports for ffmpeg-related packages');
console.log('  3. Consider removing unused ytdl-core variant');
console.log('  4. Evaluate if music-metadata is needed client-side');
console.log('  5. Move heavy audio processing to server-side only');

// Check for unused files
console.log('\n📁 Checking for unused files...');

const srcDir = path.join(__dirname, '..', 'src');
const unusedPatterns = [
  '*.test.ts',
  '*.test.tsx',
  '*.spec.ts',
  '*.spec.tsx',
  'unused-*',
  'temp-*'
];

function findUnusedFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      findUnusedFiles(fullPath);
    } else {
      unusedPatterns.forEach(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        if (regex.test(file.name)) {
          console.log(`  🗑️  ${fullPath.replace(process.cwd(), '.')}`);
        }
      });
    }
  });
}

try {
  findUnusedFiles(srcDir);
} catch (error) {
  console.log('  ✅ No obvious unused files found');
}

console.log('\n🎯 Next Steps:');
console.log('  1. Run: npm run analyze to see detailed bundle breakdown');
console.log('  2. Use webpack-bundle-analyzer to identify large chunks');
console.log('  3. Implement dynamic imports for heavy components');
console.log('  4. Consider code splitting by route');
