#!/usr/bin/env node

/**
 * Remove Unused Dependencies Script for ChordMiniApp
 * Identifies and removes unused dependencies to reduce bundle size
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Dependencies that are likely unused or can be replaced
const potentiallyUnusedDeps = [
  'crypto-browserify',  // Can use Web Crypto API instead
  'https-browserify',   // Not needed for modern browsers
  'stream-http',        // Can use fetch API instead
  'url',                // Built into Node.js/browsers
  'axios',              // Can use fetch API instead
  'prismjs',            // If not using syntax highlighting
  'react-chartjs-2',    // If using minimal charts
  'ffmpeg-static',      // Heavy dependency, move to server-side only
  'fluent-ffmpeg',      // Heavy dependency, move to server-side only
  'music-metadata',     // Heavy dependency, consider alternatives
];

// Dependencies that should be moved to devDependencies
const shouldBeDevDeps = [
  '@types/react-syntax-highlighter',
  '@types/uuid',
];

// Heavy dependencies that should be dynamically imported
const heavyDepsToOptimize = [
  'framer-motion',
  'chart.js',
  '@music.ai/sdk',
  'firebase',
];

console.log('🔍 ChordMiniApp Dependency Cleanup\n');

// Check for unused dependencies
console.log('📦 Potentially Unused Dependencies:');
const unusedFound = [];
potentiallyUnusedDeps.forEach(dep => {
  if (packageJson.dependencies && packageJson.dependencies[dep]) {
    console.log(`  ⚠️  ${dep} - Consider removing or replacing`);
    unusedFound.push(dep);
  }
});

if (unusedFound.length === 0) {
  console.log('  ✅ No obviously unused dependencies found');
}

// Check for misplaced dependencies
console.log('\n🔄 Dependencies that should be devDependencies:');
const misplacedFound = [];
shouldBeDevDeps.forEach(dep => {
  if (packageJson.dependencies && packageJson.dependencies[dep]) {
    console.log(`  📝 ${dep} - Should be in devDependencies`);
    misplacedFound.push(dep);
  }
});

if (misplacedFound.length === 0) {
  console.log('  ✅ All type dependencies are correctly placed');
}

// Check for heavy dependencies
console.log('\n⚡ Heavy Dependencies (should be dynamically imported):');
const heavyFound = [];
heavyDepsToOptimize.forEach(dep => {
  if (packageJson.dependencies && packageJson.dependencies[dep]) {
    console.log(`  🏋️  ${dep} - Consider dynamic imports`);
    heavyFound.push(dep);
  }
});

// Analyze bundle impact
console.log('\n📊 Bundle Impact Analysis:');
try {
  // Check if bundle analyzer is available
  const analyzeCommand = 'npm run analyze 2>/dev/null';
  console.log('  📈 Run "npm run analyze" to see detailed bundle breakdown');
} catch (error) {
  console.log('  ⚠️  Bundle analyzer not available');
}

// Recommendations
console.log('\n💡 Optimization Recommendations:');

if (unusedFound.length > 0) {
  console.log('\n1. Remove unused dependencies:');
  unusedFound.forEach(dep => {
    console.log(`   npm uninstall ${dep}`);
  });
}

if (misplacedFound.length > 0) {
  console.log('\n2. Move type dependencies to devDependencies:');
  misplacedFound.forEach(dep => {
    console.log(`   npm uninstall ${dep} && npm install --save-dev ${dep}`);
  });
}

console.log('\n3. Replace heavy dependencies with lighter alternatives:');
console.log('   - Replace axios with fetch API');
console.log('   - Use Web Crypto API instead of crypto-browserify');
console.log('   - Use native URL constructor instead of url package');

console.log('\n4. Optimize heavy dependencies:');
console.log('   - Use dynamic imports for framer-motion');
console.log('   - Lazy load chart.js when charts are needed');
console.log('   - Split Firebase into modular imports');

console.log('\n5. Server-side only dependencies:');
console.log('   - Move ffmpeg-static to server-side only');
console.log('   - Move fluent-ffmpeg to server-side only');
console.log('   - Consider server-side music-metadata processing');

// Generate optimized package.json
console.log('\n🔧 Generating optimized package.json...');

const optimizedPackageJson = { ...packageJson };

// Remove unused dependencies
unusedFound.forEach(dep => {
  if (optimizedPackageJson.dependencies[dep]) {
    delete optimizedPackageJson.dependencies[dep];
    console.log(`  ❌ Removed: ${dep}`);
  }
});

// Move type dependencies to devDependencies
misplacedFound.forEach(dep => {
  if (optimizedPackageJson.dependencies[dep]) {
    const version = optimizedPackageJson.dependencies[dep];
    delete optimizedPackageJson.dependencies[dep];
    
    if (!optimizedPackageJson.devDependencies) {
      optimizedPackageJson.devDependencies = {};
    }
    optimizedPackageJson.devDependencies[dep] = version;
    console.log(`  📝 Moved to devDependencies: ${dep}`);
  }
});

// Add sideEffects configuration for better tree shaking
if (!optimizedPackageJson.sideEffects) {
  optimizedPackageJson.sideEffects = [
    "*.css",
    "*.scss",
    "./src/styles/**/*",
    "./src/app/globals.css"
  ];
  console.log('  ✅ Added sideEffects configuration for tree shaking');
}

// Write optimized package.json
const optimizedPath = path.join(__dirname, '..', 'package.optimized.json');
fs.writeFileSync(optimizedPath, JSON.stringify(optimizedPackageJson, null, 2));
console.log(`  💾 Optimized package.json saved to: package.optimized.json`);

console.log('\n✨ Optimization Summary:');
console.log(`  📦 Dependencies removed: ${unusedFound.length}`);
console.log(`  📝 Dependencies moved to devDependencies: ${misplacedFound.length}`);
console.log(`  ⚡ Heavy dependencies identified: ${heavyFound.length}`);

console.log('\n🚀 Next Steps:');
console.log('1. Review the generated package.optimized.json');
console.log('2. If satisfied, replace package.json with the optimized version');
console.log('3. Run "npm install" to update node_modules');
console.log('4. Test the application thoroughly');
console.log('5. Run "npm run analyze" to verify bundle size reduction');

console.log('\n⚠️  Important: Always test thoroughly after removing dependencies!');
