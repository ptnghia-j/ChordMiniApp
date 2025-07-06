/**
 * Test script to verify Guitar Chords tab fixes
 * Tests both chord suffix preservation and duplicate removal
 */

// Import the chord mapping service
const { ChordMappingService } = require('./src/services/chordMappingService.ts');

async function testChordSuffixPreservation() {
  console.log('🎸 Testing Chord Suffix Preservation...');
  
  const chordMappingService = ChordMappingService.getInstance();
  
  // Test cases for extended chords
  const testChords = [
    'Fm7',    // Should return F minor 7th, not F major
    'Cm7',    // Should return C minor 7th, not C major
    'Am7',    // Should return A minor 7th, not A major
    'Em7',    // Should return E minor 7th, not E major
    'Dm7',    // Should return D minor 7th, not D major
    'Gm7',    // Should return G minor 7th, not G major
    'F',      // Should return F major (control test)
    'Fm',     // Should return F minor (control test)
  ];
  
  for (const chord of testChords) {
    try {
      const chordData = await chordMappingService.getChordData(chord);
      if (chordData) {
        console.log(`✅ ${chord}: Found ${chordData.key} ${chordData.suffix}`);
        
        // Verify that m7 chords return m7, not major
        if (chord.includes('m7')) {
          if (chordData.suffix === 'm7') {
            console.log(`   ✅ Correct: ${chord} preserved as ${chordData.suffix}`);
          } else {
            console.log(`   ❌ ERROR: ${chord} should be m7 but got ${chordData.suffix}`);
          }
        }
      } else {
        console.log(`❌ ${chord}: No chord data found`);
      }
    } catch (error) {
      console.log(`❌ ${chord}: Error - ${error.message}`);
    }
  }
}

function testInversionPreprocessing() {
  console.log('\n🎸 Testing Inversion Preprocessing...');
  
  // Test the preprocessing logic directly
  const testInversions = [
    { input: 'Ab/C', expected: 'Ab' },
    { input: 'F/A', expected: 'F' },
    { input: 'C/E', expected: 'C' },
    { input: 'Dm7/F', expected: 'Dm7' },
    { input: 'G', expected: 'G' },  // No inversion
    { input: 'Am', expected: 'Am' }, // No inversion
  ];
  
  for (const test of testInversions) {
    // Simulate the preprocessing logic from GuitarChordsTab
    const inversionMatch = test.input.match(/^([^/]+)\/(.+)$/);
    const result = inversionMatch ? inversionMatch[1].trim() : test.input;
    
    if (result === test.expected) {
      console.log(`✅ ${test.input} → ${result} (correct)`);
    } else {
      console.log(`❌ ${test.input} → ${result} (expected ${test.expected})`);
    }
  }
}

function testUniquenessLogic() {
  console.log('\n🎸 Testing Uniqueness Logic...');
  
  // Simulate chord list with duplicates and inversions
  const chordList = [
    'Ab', 'Ab/C', 'C', 'F', 'Fm7', 'Fm7/Ab', 'G', 'Ab', 'C/E', 'F'
  ];
  
  // Apply preprocessing and deduplication
  const processedChords = new Set();
  
  chordList.forEach(chord => {
    // Apply inversion preprocessing
    const inversionMatch = chord.match(/^([^/]+)\/(.+)$/);
    const preprocessed = inversionMatch ? inversionMatch[1].trim() : chord;
    processedChords.add(preprocessed);
  });
  
  const uniqueChords = Array.from(processedChords).sort();
  
  console.log('Original chords:', chordList);
  console.log('Unique chords after preprocessing:', uniqueChords);
  
  // Expected result: ['Ab', 'C', 'F', 'Fm7', 'G']
  const expected = ['Ab', 'C', 'F', 'Fm7', 'G'];
  
  if (JSON.stringify(uniqueChords) === JSON.stringify(expected)) {
    console.log('✅ Uniqueness logic working correctly');
  } else {
    console.log('❌ Uniqueness logic failed');
    console.log('Expected:', expected);
    console.log('Got:', uniqueChords);
  }
}

async function runTests() {
  console.log('🎸 Guitar Chords Tab Fixes - Test Suite\n');
  
  try {
    await testChordSuffixPreservation();
    testInversionPreprocessing();
    testUniquenessLogic();
    
    console.log('\n🎸 Test suite completed!');
  } catch (error) {
    console.error('Test suite failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testChordSuffixPreservation,
  testInversionPreprocessing,
  testUniquenessLogic,
  runTests
};
