/**
 * Test file for chord formatting functionality
 * Run this to test the new scale degree inversion translation
 */

import { formatChordWithMusicalSymbols } from './chordFormatting';

// Test cases for unusual inversions
const testCases = [
  // Standard inversions (should work as before)
  'C:maj/3',
  'Am:min/5',
  'G:maj/7',
  
  // Unusual scale degree inversions (new functionality)
  'F:maj/2',    // Should become F/E (2nd degree of F major)
  'Am:min/b7',  // Should become Am/G (flat 7th of A minor)
  'C:maj/6',    // Should become C/A (6th degree of C major)
  'Dm:min/4',   // Should become Dm/G (4th degree of D minor)
  'G:maj/b3',   // Should become G/Bb (flat 3rd of G major)
  'E:maj/#4',   // Should become E/A# (sharp 4th of E major)
  
  // Edge cases
  'Bb:maj/2',   // Should become Bb/C (2nd degree of Bb major)
  'F#:min/b7',  // Should become F#m/E (flat 7th of F# minor)
];

export function testChordFormatting() {
  console.log('=== CHORD FORMATTING TESTS ===');
  
  testCases.forEach(chord => {
    const formatted = formatChordWithMusicalSymbols(chord);
    console.log(`${chord} → ${formatted}`);
  });
  
  console.log('=== END TESTS ===');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).testChordFormatting = testChordFormatting;
}
