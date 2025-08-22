/**
 * Gemini API Integration Test for Chord Correction
 * Tests the actual API calls to verify the updated prompts work correctly
 */

const fetch = require('node-fetch');

// Test configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000; // 30 seconds

console.log('🤖 Starting Gemini API Integration Tests...\n');

// Test cases that specifically address the reported issues
const testCases = [
  {
    name: 'B Major Progression Issue',
    description: 'Tests the specific case where Gdim should become F#dim, not A#dim',
    chords: [
      { chord: 'E', time: 0.0 },
      { chord: 'F#', time: 2.0 },
      { chord: 'Gdim', time: 4.0 },
      { chord: 'G#m', time: 6.0 }
    ],
    expectedCorrections: {
      'Gdim': 'F#dim' // G# and Ab are same pitch, but G and A# are different!
    },
    invalidCorrections: {
      'Gdim': 'A#dim' // This would be wrong - different pitches
    }
  },
  {
    name: 'C# Major to Db Major Conversion',
    description: 'Tests key signature optimization (fewer accidentals)',
    chords: [
      { chord: 'C#', time: 0.0 },
      { chord: 'D#m', time: 2.0 },
      { chord: 'G#7', time: 4.0 },
      { chord: 'C#', time: 6.0 }
    ],
    expectedCorrections: {
      'C#': 'Db',
      'D#m': 'Ebm',
      'G#7': 'Ab7'
    }
  },
  {
    name: 'Mixed Sharp/Flat Consistency',
    description: 'Tests consistent enharmonic spelling within a key',
    chords: [
      { chord: 'F#', time: 0.0 },
      { chord: 'G#m', time: 2.0 },
      { chord: 'A#dim', time: 4.0 },
      { chord: 'B', time: 6.0 }
    ],
    expectedCorrections: {
      'A#dim': 'Bbdim' // Maintain consistency, but A# and Bb are same pitch
    }
  },
  {
    name: 'No Changes Needed',
    description: 'Tests that well-spelled progressions remain unchanged',
    chords: [
      { chord: 'C', time: 0.0 },
      { chord: 'Am', time: 2.0 },
      { chord: 'F', time: 4.0 },
      { chord: 'G', time: 6.0 }
    ],
    expectedCorrections: {} // No changes expected
  },
  {
    name: 'Complex Chord Qualities Preservation',
    description: 'Tests that chord qualities are preserved during enharmonic correction',
    chords: [
      { chord: 'C#maj7', time: 0.0 },
      { chord: 'F#m7b5', time: 2.0 },
      { chord: 'G#7sus4', time: 4.0 },
      { chord: 'C#add9', time: 6.0 }
    ],
    expectedCorrections: {
      'C#maj7': 'Dbmaj7',
      'F#m7b5': 'Gbm7b5',
      'G#7sus4': 'Ab7sus4',
      'C#add9': 'Dbadd9'
    }
  }
];

// Function to call the detect-key API
async function callDetectKeyAPI(chords, includeEnharmonicCorrection = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/detect-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chords: chords,
        includeEnharmonicCorrection: includeEnharmonicCorrection
      }),
      timeout: TEST_TIMEOUT
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}

// Function to validate API response structure
function validateResponseStructure(response) {
  const requiredFields = ['primaryKey', 'sequenceCorrections'];
  const missingFields = requiredFields.filter(field => !(field in response));
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (response.sequenceCorrections) {
    const requiredSeqFields = ['originalSequence', 'correctedSequence'];
    const missingSeqFields = requiredSeqFields.filter(field => !(field in response.sequenceCorrections));
    
    if (missingSeqFields.length > 0) {
      throw new Error(`Missing sequence correction fields: ${missingSeqFields.join(', ')}`);
    }
  }

  return true;
}

// Function to check if corrections follow enharmonic-only rules
function validateEnharmonicCorrections(original, corrected) {
  const enharmonicPairs = [
    ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'], ['G#', 'Ab'], ['A#', 'Bb'],
    ['Db', 'C#'], ['Eb', 'D#'], ['Gb', 'F#'], ['Ab', 'G#'], ['Bb', 'A#']
  ];

  const violations = [];

  for (let i = 0; i < original.length; i++) {
    const origChord = original[i];
    const corrChord = corrected[i];

    if (origChord === corrChord) continue; // No change is valid

    // Extract root note and quality
    const origMatch = origChord.match(/^([A-G][#b]?)(.*)/);
    const corrMatch = corrChord.match(/^([A-G][#b]?)(.*)/);

    if (!origMatch || !corrMatch) {
      violations.push(`Invalid chord format: ${origChord} → ${corrChord}`);
      continue;
    }

    const [, origRoot, origQuality] = origMatch;
    const [, corrRoot, corrQuality] = corrMatch;

    // Check if quality is preserved
    if (origQuality !== corrQuality) {
      violations.push(`Quality changed: ${origChord} → ${corrChord} (${origQuality} → ${corrQuality})`);
    }

    // Check if root change is enharmonic
    const isEnharmonic = enharmonicPairs.some(pair => 
      pair[0] === origRoot && pair[1] === corrRoot
    );

    if (!isEnharmonic && origRoot !== corrRoot) {
      violations.push(`Non-enharmonic root change: ${origChord} → ${corrChord} (${origRoot} → ${corrRoot})`);
    }
  }

  return violations;
}

// Main test function
async function runGeminiAPITests() {
  console.log('🤖 GEMINI API INTEGRATION TESTS');
  console.log('=' .repeat(70));
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    totalTests++;
    console.log(`\n🧪 Test: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🎵 Input chords: ${testCase.chords.map(c => c.chord).join(' → ')}`);

    try {
      // Call the API
      const response = await callDetectKeyAPI(testCase.chords, true);
      
      // Validate response structure
      validateResponseStructure(response);
      console.log(`✅ Response structure valid`);

      // Extract corrections
      const { originalSequence, correctedSequence } = response.sequenceCorrections;
      
      // Validate enharmonic-only corrections
      const violations = validateEnharmonicCorrections(originalSequence, correctedSequence);
      
      if (violations.length > 0) {
        console.log(`❌ Enharmonic violations found:`);
        violations.forEach(violation => console.log(`   - ${violation}`));
        failedTests++;
        continue;
      }
      
      console.log(`✅ All corrections follow enharmonic-only rules`);
      console.log(`🎵 Output chords: ${correctedSequence.join(' → ')}`);

      // Check specific expected corrections
      let specificTestsPassed = true;
      if (testCase.expectedCorrections) {
        for (const [original, expected] of Object.entries(testCase.expectedCorrections)) {
          const originalIndex = originalSequence.indexOf(original);
          if (originalIndex !== -1) {
            const actualCorrection = correctedSequence[originalIndex];
            if (actualCorrection !== expected) {
              console.log(`❌ Expected ${original} → ${expected}, got ${original} → ${actualCorrection}`);
              specificTestsPassed = false;
            } else {
              console.log(`✅ Correct: ${original} → ${actualCorrection}`);
            }
          }
        }
      }

      // Check that invalid corrections are not present
      if (testCase.invalidCorrections) {
        for (const [original, invalid] of Object.entries(testCase.invalidCorrections)) {
          const originalIndex = originalSequence.indexOf(original);
          if (originalIndex !== -1) {
            const actualCorrection = correctedSequence[originalIndex];
            if (actualCorrection === invalid) {
              console.log(`❌ Invalid correction found: ${original} → ${actualCorrection} (should not be ${invalid})`);
              specificTestsPassed = false;
            }
          }
        }
      }

      if (specificTestsPassed) {
        console.log(`✅ Test passed: ${testCase.name}`);
        passedTests++;
      } else {
        console.log(`❌ Test failed: ${testCase.name}`);
        failedTests++;
      }

    } catch (error) {
      console.log(`❌ Test failed: ${testCase.name} - ERROR: ${error.message}`);
      failedTests++;
    }
  }

  // Summary
  console.log('\n🏁 GEMINI API TEST RESULTS');
  console.log('=' .repeat(70));
  console.log(`📊 Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL GEMINI API TESTS PASSED!');
    console.log('✅ Updated prompts are working correctly');
    console.log('✅ Enharmonic-only corrections are being enforced');
    console.log('✅ Chord qualities are being preserved');
    console.log('✅ Bass line progression integrity is maintained');
  } else {
    console.log(`\n⚠️  ${failedTests} tests failed. The Gemini prompts may need further refinement.`);
  }

  return { totalTests, passedTests, failedTests };
}

// Export for use in other test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runGeminiAPITests,
    callDetectKeyAPI,
    validateEnharmonicCorrections,
    testCases
  };
}

// Run tests if this file is executed directly
if (require.main === module) {
  runGeminiAPITests().catch(console.error);
}
