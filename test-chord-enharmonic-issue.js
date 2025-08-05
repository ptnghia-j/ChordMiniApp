/**
 * Test script to reproduce and verify the G#m/b7 enharmonic issue
 * Issue: "G#m/b7" is being converted to "G#m/Gb" instead of "G#m/F#"
 */

// Import the chord formatting functions
const path = require('path');

// Since we can't directly import ES modules in Node.js easily, 
// let's create a test that demonstrates the issue

console.log('🎵 Testing G#m/b7 Enharmonic Issue...\n');

// Simulate the problematic logic from getBassNoteFromInversion
function simulateCurrentBehavior(root, quality, inversion) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesWithFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  // Current problematic logic
  const usesFlats = root.includes('b');
  const isMinor = quality === 'm' || quality === 'min';
  const isFlatInversion = inversion.startsWith('b');
  
  // Root lookup array
  const rootNoteArray = usesFlats ? notesWithFlats : notes;
  
  // Bass note result array (this is where the bug occurs)
  const bassNoteArray = (usesFlats || isFlatInversion) ? notesWithFlats : notes;
  
  // Find root index
  let rootIndex = -1;
  for (let i = 0; i < rootNoteArray.length; i++) {
    if (rootNoteArray[i] === root) {
      rootIndex = i;
      break;
    }
  }
  
  if (rootIndex === -1) return inversion;
  
  // Calculate bass note for b7
  let bassSemitones = 11; // Natural 7th
  if (inversion === 'b7') {
    bassSemitones = 10; // Flat 7th
  }
  
  const bassIndex = (rootIndex + bassSemitones) % 12;
  const result = bassNoteArray[bassIndex];
  
  return {
    root,
    quality,
    inversion,
    rootIndex,
    rootNoteArray: rootNoteArray.join(', '),
    bassNoteArray: bassNoteArray.join(', '),
    bassSemitones,
    bassIndex,
    result,
    usesFlats,
    isFlatInversion
  };
}

// Test the problematic case
console.log('🔍 Current Behavior Analysis:');
console.log('=' .repeat(50));

const testCase = simulateCurrentBehavior('G#', 'm', 'b7');
console.log(`Input: ${testCase.root}${testCase.quality}/${testCase.inversion}`);
console.log(`Root "${testCase.root}" found at index ${testCase.rootIndex} in: [${testCase.rootNoteArray}]`);
console.log(`Bass note calculated at index ${testCase.bassIndex} in: [${testCase.bassNoteArray}]`);
console.log(`Result: ${testCase.result} ❌ (should be F#)`);
console.log(`usesFlats: ${testCase.usesFlats}, isFlatInversion: ${testCase.isFlatInversion}`);

console.log('\n🎯 The Problem:');
console.log('- Root G# is found at index 8 in the sharp array');
console.log('- Bass note calculation: (8 + 10) % 12 = 6');
console.log('- Index 6 in flat array = Gb (wrong!)');
console.log('- Index 6 in sharp array = F# (correct!)');

console.log('\n🔧 Proposed Fix:');
console.log('- Use consistent note arrays for both root lookup and bass calculation');
console.log('- OR apply proper enharmonic conversion based on key context');
console.log('- G# minor uses sharps, so bass note should also use sharps');

// Test what the correct behavior should be
function simulateCorrectBehavior(root, quality, inversion) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesWithFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  // Determine key context from root
  const usesFlats = root.includes('b');
  const useSharps = root.includes('#');
  
  // Use consistent note array based on root's accidental preference
  const noteArray = usesFlats ? notesWithFlats : notes;
  
  // Find root index
  let rootIndex = -1;
  for (let i = 0; i < noteArray.length; i++) {
    if (noteArray[i] === root) {
      rootIndex = i;
      break;
    }
  }
  
  if (rootIndex === -1) return inversion;
  
  // Calculate bass note for b7
  let bassSemitones = 10; // Flat 7th
  
  const bassIndex = (rootIndex + bassSemitones) % 12;
  const result = noteArray[bassIndex];
  
  return result;
}

console.log('\n✅ Correct Behavior:');
console.log('=' .repeat(50));
const correctResult = simulateCorrectBehavior('G#', 'm', 'b7');
console.log(`G#m/b7 should resolve to: G#m/${correctResult} ✓`);

console.log('\n🎵 Music Theory Verification:');
console.log('- G# minor scale: G#, A#, B, C#, D#, E, F#');
console.log('- Flat seventh of G# = F# (7 semitones down from G# = F#)');
console.log('- Therefore G#m/b7 = G#m/F# ✓');
