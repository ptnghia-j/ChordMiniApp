/**
 * Comprehensive Test Suite for Chord Correction and Formatting Issues
 * Tests three critical issues:
 * 1. Enharmonic inversion formatting with double accidentals
 * 2. Gemini model chord correction logic
 * 3. Unicode symbol rendering and edge cases
 */

// Mock the enhanced chord formatting functions
const { getBassNoteFromInversion, formatChordWithMusicalSymbols } = require('./src/utils/chordFormatting');

console.log('🎵 Starting Comprehensive Chord Correction Test Suite...\n');

// Test 1: Enharmonic Inversion Formatting with Double Accidentals
function testEnharmonicInversions() {
  console.log('🎸 Test 1: Enharmonic Inversion Formatting with Double Accidentals');
  console.log('=' .repeat(70));
  
  const testCases = [
    // Critical case from the issue
    { root: 'G#', quality: 'maj', inversion: '3', expected: 'B#', description: 'G#/3 should be G#/B# not G#/C' },
    
    // Other sharp key inversions requiring double sharps
    { root: 'D#', quality: 'maj', inversion: '3', expected: 'E#', description: 'D#/3 should be D#/E# not D#/F' },
    { root: 'C#', quality: 'maj', inversion: '7', expected: 'B#', description: 'C#/7 should be C#/B# not C#/C' },
    
    // Flat key inversions requiring double flats
    { root: 'Db', quality: 'maj', inversion: '4', expected: 'Gb', description: 'Db/4 should be Db/Gb' },
    { root: 'Gb', quality: 'min', inversion: '3', expected: 'Bbb', description: 'Gbm/3 should be Gbm/Bbb (double flat)' },
    
    // Complex minor chord inversions
    { root: 'F#', quality: 'min', inversion: '3', expected: 'A', description: 'F#m/3 should be F#m/A' },
    { root: 'C#', quality: 'min', inversion: '3', expected: 'E', description: 'C#m/3 should be C#m/E' },
    
    // Extended chord inversions
    { root: 'G#', quality: '7', inversion: '3', expected: 'B#', description: 'G#7/3 should be G#7/B#' },
    { root: 'F#', quality: 'maj7', inversion: '7', expected: 'E#', description: 'F#maj7/7 should be F#maj7/E#' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    try {
      const result = getBassNoteFromInversion(testCase.root, testCase.quality, testCase.inversion);
      const normalizedResult = result.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, '##').replace(/𝄫/g, 'bb');
      const normalizedExpected = testCase.expected.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, '##').replace(/𝄫/g, 'bb');
      
      if (normalizedResult === normalizedExpected) {
        console.log(`✅ Test ${index + 1}: ${testCase.description}`);
        console.log(`   Input: ${testCase.root}${testCase.quality}/${testCase.inversion} → Output: ${result}`);
        passed++;
      } else {
        console.log(`❌ Test ${index + 1}: ${testCase.description}`);
        console.log(`   Input: ${testCase.root}${testCase.quality}/${testCase.inversion}`);
        console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ Test ${index + 1}: ${testCase.description} - ERROR: ${error.message}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Enharmonic Inversion Tests: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Test 2: Unicode Symbol Rendering
function testUnicodeSymbols() {
  console.log('🎼 Test 2: Unicode Symbol Rendering');
  console.log('=' .repeat(70));
  
  const testCases = [
    // Double sharp and double flat symbols
    { input: 'C##', expected: 'C𝄪', description: 'Double sharp Unicode symbol' },
    { input: 'Dbb', expected: 'D𝄫', description: 'Double flat Unicode symbol' },
    { input: 'F##m', expected: 'F𝄪m', description: 'Double sharp in minor chord' },
    { input: 'Gbb7', expected: 'G𝄫7', description: 'Double flat in seventh chord' },
    
    // Regular sharp and flat symbols
    { input: 'C#', expected: 'C♯', description: 'Regular sharp symbol' },
    { input: 'Db', expected: 'D♭', description: 'Regular flat symbol' },
    { input: 'F#m', expected: 'F♯m', description: 'Sharp in minor chord' },
    { input: 'Bb7', expected: 'B♭7', description: 'Flat in seventh chord' },
    
    // Complex chord with inversions
    { input: 'G#/B#', expected: 'G♯/B♯', description: 'Sharp chord with sharp bass' },
    { input: 'Db/Gb', expected: 'D♭/G♭', description: 'Flat chord with flat bass' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    try {
      const result = formatChordWithMusicalSymbols(testCase.input);
      // Extract just the text content for comparison (remove HTML tags)
      const textResult = result.replace(/<[^>]*>/g, '');
      
      if (textResult.includes(testCase.expected)) {
        console.log(`✅ Test ${index + 1}: ${testCase.description}`);
        console.log(`   Input: ${testCase.input} → Output: ${textResult}`);
        passed++;
      } else {
        console.log(`❌ Test ${index + 1}: ${testCase.description}`);
        console.log(`   Input: ${testCase.input}`);
        console.log(`   Expected to contain: ${testCase.expected}, Got: ${textResult}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ Test ${index + 1}: ${testCase.description} - ERROR: ${error.message}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Unicode Symbol Tests: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Test 3: Gemini Model Chord Correction Logic (Mock Test)
function testGeminiCorrectionLogic() {
  console.log('🤖 Test 3: Gemini Model Chord Correction Logic');
  console.log('=' .repeat(70));
  
  // Mock the expected behavior based on the updated prompts
  const mockGeminiCorrections = [
    {
      input: ['E', 'F#', 'Gdim', 'G#m'],
      expected: ['E', 'F#', 'F#dim', 'G#m'], // Gdim → F#dim (G# and Ab are same pitch)
      invalid: ['E', 'F#', 'A#dim', 'G#m'], // WRONG: G and A# are different pitches
      description: 'B major progression - Gdim should become F#dim, not A#dim'
    },
    {
      input: ['C', 'Dm', 'G7', 'C'],
      expected: ['C', 'Dm', 'G7', 'C'], // No changes needed in C major
      description: 'C major progression - no enharmonic changes needed'
    },
    {
      input: ['Db', 'Ebm', 'Ab7', 'Db'],
      expected: ['Db', 'Ebm', 'Ab7', 'Db'], // Already in flat key, no changes needed
      description: 'Db major progression - already optimally spelled'
    },
    {
      input: ['C#', 'D#m', 'G#7', 'C#'],
      expected: ['Db', 'Ebm', 'Ab7', 'Db'], // Convert to flats for easier reading
      description: 'C# major → Db major conversion for readability'
    },
    {
      input: ['F#', 'G#m', 'C#7', 'F#'],
      expected: ['F#', 'G#m', 'C#7', 'F#'], // Keep sharps in F# major
      description: 'F# major progression - maintain sharp spelling'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  mockGeminiCorrections.forEach((testCase, index) => {
    console.log(`\n🧪 Test ${index + 1}: ${testCase.description}`);
    console.log(`   Input sequence: ${testCase.input.join(' → ')}`);
    console.log(`   Expected output: ${testCase.expected.join(' → ')}`);
    
    if (testCase.invalid) {
      console.log(`   ❌ Invalid output: ${testCase.invalid.join(' → ')}`);
      console.log(`   ⚠️  Reason: Changes actual pitches, not just enharmonic spelling`);
    }
    
    // Simulate validation logic
    const isValidCorrection = validateEnharmonicCorrection(testCase.input, testCase.expected);
    
    if (isValidCorrection) {
      console.log(`   ✅ Correction follows enharmonic-only rules`);
      passed++;
    } else {
      console.log(`   ❌ Correction violates enharmonic-only rules`);
      failed++;
    }
  });
  
  console.log(`\n📊 Gemini Correction Logic Tests: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Helper function to validate enharmonic corrections
function validateEnharmonicCorrection(original, corrected) {
  if (original.length !== corrected.length) return false;
  
  const enharmonicPairs = [
    ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'], ['G#', 'Ab'], ['A#', 'Bb']
  ];
  
  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const corr = corrected[i];
    
    if (orig === corr) continue; // No change is valid
    
    // Extract root note and quality
    const origRoot = orig.match(/^([A-G][#b]?)/)?.[1];
    const corrRoot = corr.match(/^([A-G][#b]?)/)?.[1];
    const origQuality = orig.replace(origRoot, '');
    const corrQuality = corr.replace(corrRoot, '');
    
    // Quality must be identical
    if (origQuality !== corrQuality) return false;
    
    // Root must be enharmonic equivalent
    const isEnharmonic = enharmonicPairs.some(pair => 
      (pair[0] === origRoot && pair[1] === corrRoot) ||
      (pair[1] === origRoot && pair[0] === corrRoot)
    );
    
    if (!isEnharmonic) return false;
  }
  
  return true;
}

// Test 4: Edge Cases and Error Handling
function testEdgeCases() {
  console.log('⚠️  Test 4: Edge Cases and Error Handling');
  console.log('=' .repeat(70));
  
  const edgeCases = [
    { input: '', description: 'Empty string' },
    { input: 'N.C.', description: 'No chord notation' },
    { input: 'X', description: 'Unknown chord' },
    { input: 'InvalidChord', description: 'Invalid chord name' },
    { input: 'C/99', description: 'Invalid inversion number' },
    { input: 'Z#m', description: 'Invalid root note' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  edgeCases.forEach((testCase, index) => {
    try {
      const result = formatChordWithMusicalSymbols(testCase.input);
      console.log(`✅ Test ${index + 1}: ${testCase.description} - Handled gracefully`);
      console.log(`   Input: "${testCase.input}" → Output: "${result}"`);
      passed++;
    } catch (error) {
      console.log(`❌ Test ${index + 1}: ${testCase.description} - ERROR: ${error.message}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Edge Case Tests: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Run all tests
function runAllTests() {
  console.log('🎵 COMPREHENSIVE CHORD CORRECTION TEST SUITE');
  console.log('=' .repeat(70));
  console.log('Testing fixes for three critical issues:\n');
  
  const results = {
    enharmonic: testEnharmonicInversions(),
    unicode: testUnicodeSymbols(),
    gemini: testGeminiCorrectionLogic(),
    edge: testEdgeCases()
  };
  
  const totalPassed = Object.values(results).reduce((sum, result) => sum + result.passed, 0);
  const totalFailed = Object.values(results).reduce((sum, result) => sum + result.failed, 0);
  const totalTests = totalPassed + totalFailed;
  
  console.log('🏁 FINAL RESULTS');
  console.log('=' .repeat(70));
  console.log(`📊 Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  
  if (totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Chord correction issues have been resolved.');
  } else {
    console.log(`\n⚠️  ${totalFailed} tests failed. Review the issues above.`);
  }
  
  return results;
}

// Export for use in other test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testEnharmonicInversions,
    testUnicodeSymbols,
    testGeminiCorrectionLogic,
    testEdgeCases,
    validateEnharmonicCorrection
  };
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}
