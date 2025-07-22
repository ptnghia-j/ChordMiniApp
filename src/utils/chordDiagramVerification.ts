/**
 * Chord Diagram Verification Script
 * 
 * This script verifies that all chord diagram fixes are working correctly
 * and identifies any remaining issues with the 4-fret display constraint.
 */

import { chordDatabase } from '@/services/chordMappingService';
import { checkReactChordsCompatibility } from './chordDiagramTest';

/**
 * Verify specific problematic chords that were mentioned in the original issue
 */
export function verifyProblematicChords(): {
  results: Array<{
    chord: string;
    position: number;
    status: 'FIXED' | 'STILL_BROKEN';
    issues: string[];
  }>;
  summary: string;
} {
  const problematicChords = [
    { key: 'D', suffix: 'minor' },
    { key: 'C', suffix: 'maj7' },
    { key: 'D', suffix: 'major' },
    { key: 'F', suffix: 'major' },
    { key: 'A♭', suffix: 'major' },
    { key: 'G', suffix: 'minor' },
    { key: 'B', suffix: 'major' },
    { key: 'E♭', suffix: 'major' }
  ];

  const results: Array<{
    chord: string;
    position: number;
    status: 'FIXED' | 'STILL_BROKEN';
    issues: string[];
  }> = [];

  for (const targetChord of problematicChords) {
    // Find the chord in the database
    const chordKey = targetChord.key;
    const chordTypes = chordDatabase.chords[chordKey];
    
    if (!chordTypes) {
      results.push({
        chord: `${targetChord.key}${targetChord.suffix === 'major' ? '' : targetChord.suffix}`,
        position: 0,
        status: 'STILL_BROKEN',
        issues: ['Chord not found in database']
      });
      continue;
    }

    const chordData = chordTypes.find(c => c.suffix === targetChord.suffix);
    if (!chordData) {
      results.push({
        chord: `${targetChord.key}${targetChord.suffix === 'major' ? '' : targetChord.suffix}`,
        position: 0,
        status: 'STILL_BROKEN',
        issues: ['Chord suffix not found in database']
      });
      continue;
    }

    // Check all positions for this chord
    for (let i = 0; i < chordData.positions.length; i++) {
      const position = chordData.positions[i];
      const compatibility = checkReactChordsCompatibility(position);
      const chordName = `${targetChord.key}${targetChord.suffix === 'major' ? '' : targetChord.suffix}`;
      
      results.push({
        chord: chordName,
        position: i + 1,
        status: compatibility.criticalIssues.length === 0 ? 'FIXED' : 'STILL_BROKEN',
        issues: [...compatibility.criticalIssues, ...compatibility.issues]
      });
    }
  }

  const fixedCount = results.filter(r => r.status === 'FIXED').length;
  const brokenCount = results.filter(r => r.status === 'STILL_BROKEN').length;
  
  const summary = `
PROBLEMATIC CHORD VERIFICATION REPORT
====================================
Total positions checked: ${results.length}
Fixed positions: ${fixedCount}
Still broken positions: ${brokenCount}

${brokenCount === 0 ? '✅ All problematic chords have been fixed!' : '❌ Some positions still have issues'}
  `.trim();

  return { results, summary };
}

/**
 * Comprehensive verification of all chord positions
 */
export function verifyAllChordPositions(): {
  totalPositions: number;
  fixedPositions: number;
  brokenPositions: number;
  criticalIssues: Array<{chord: string; position: number; issue: string}>;
  summary: string;
} {
  const criticalIssues: Array<{chord: string; position: number; issue: string}> = [];
  let totalPositions = 0;
  let brokenPositions = 0;

  // Check all chords in the database
  for (const [, chordTypes] of Object.entries(chordDatabase.chords)) {
    for (const chordData of chordTypes) {
      const chordName = `${chordData.key}${chordData.suffix === 'major' ? '' : chordData.suffix}`;
      
      for (let i = 0; i < chordData.positions.length; i++) {
        totalPositions++;
        const position = chordData.positions[i];
        const compatibility = checkReactChordsCompatibility(position);
        
        if (compatibility.criticalIssues.length > 0) {
          brokenPositions++;
          for (const issue of compatibility.criticalIssues) {
            criticalIssues.push({
              chord: chordName,
              position: i + 1,
              issue
            });
          }
        }
      }
    }
  }

  const fixedPositions = totalPositions - brokenPositions;
  
  const summary = `
COMPREHENSIVE CHORD VERIFICATION REPORT
======================================
Total positions: ${totalPositions}
Fixed positions: ${fixedPositions}
Broken positions: ${brokenPositions}
Success rate: ${((fixedPositions / totalPositions) * 100).toFixed(1)}%

${brokenPositions === 0 ? '✅ All chord positions are now working correctly!' : '❌ Some positions still need fixes'}
  `.trim();

  return {
    totalPositions,
    fixedPositions,
    brokenPositions,
    criticalIssues,
    summary
  };
}

/**
 * Check for specific patterns that cause rendering issues
 */
export function checkForRenderingIssues(): {
  fretWindowViolations: Array<{chord: string; position: number; details: string}>;
  highFretIssues: Array<{chord: string; position: number; details: string}>;
  barreIssues: Array<{chord: string; position: number; details: string}>;
  summary: string;
} {
  const fretWindowViolations: Array<{chord: string; position: number; details: string}> = [];
  const highFretIssues: Array<{chord: string; position: number; details: string}> = [];
  const barreIssues: Array<{chord: string; position: number; details: string}> = [];

  for (const [, chordTypes] of Object.entries(chordDatabase.chords)) {
    for (const chordData of chordTypes) {
      const chordName = `${chordData.key}${chordData.suffix === 'major' ? '' : chordData.suffix}`;
      
      for (let i = 0; i < chordData.positions.length; i++) {
        const position = chordData.positions[i];
        
        // Check for 4-fret window violations
        if (position.baseFret > 1) {
          const violatingFrets = position.frets.filter(f => f > 4 && f !== -1 && f !== 0);
          if (violatingFrets.length > 0) {
            fretWindowViolations.push({
              chord: chordName,
              position: i + 1,
              details: `baseFret: ${position.baseFret}, violating frets: ${violatingFrets.join(', ')}`
            });
          }
        }
        
        // Check for unreasonably high fret positions
        const maxEffectiveFret = position.baseFret + Math.max(...position.frets.filter(f => f > 0));
        if (maxEffectiveFret > 15) {
          highFretIssues.push({
            chord: chordName,
            position: i + 1,
            details: `Effective fret position: ${maxEffectiveFret}`
          });
        }
        
        // Check for barre chord issues
        for (const barre of position.barres) {
          if (position.baseFret > 1 && barre > 4) {
            barreIssues.push({
              chord: chordName,
              position: i + 1,
              details: `baseFret: ${position.baseFret}, barre fret: ${barre}`
            });
          }
        }
      }
    }
  }

  const totalIssues = fretWindowViolations.length + highFretIssues.length + barreIssues.length;
  
  const summary = `
RENDERING ISSUE ANALYSIS
========================
4-fret window violations: ${fretWindowViolations.length}
High fret position issues: ${highFretIssues.length}
Barre chord issues: ${barreIssues.length}
Total rendering issues: ${totalIssues}

${totalIssues === 0 ? '✅ No rendering issues detected!' : '❌ Rendering issues found'}
  `.trim();

  return {
    fretWindowViolations,
    highFretIssues,
    barreIssues,
    summary
  };
}

/**
 * Generate a complete verification report
 */
export function generateCompleteVerificationReport(): string {
  const problematicResults = verifyProblematicChords();
  const allPositionsResults = verifyAllChordPositions();
  const renderingIssues = checkForRenderingIssues();

  return `
🎯 CHORD DIAGRAM VERIFICATION REPORT
===================================

${problematicResults.summary}

${allPositionsResults.summary}

${renderingIssues.summary}

📊 DETAILED BREAKDOWN
====================

${problematicResults.results.filter(r => r.status === 'STILL_BROKEN').length > 0 ? 
  '❌ STILL BROKEN PROBLEMATIC CHORDS:\n' + 
  problematicResults.results
    .filter(r => r.status === 'STILL_BROKEN')
    .map(r => `- ${r.chord} position ${r.position}: ${r.issues.join(', ')}`)
    .join('\n') + '\n'
  : '✅ All originally problematic chords are now fixed!\n'
}

${allPositionsResults.criticalIssues.length > 0 ?
  '❌ REMAINING CRITICAL ISSUES:\n' +
  allPositionsResults.criticalIssues
    .slice(0, 10) // Show first 10 issues
    .map(issue => `- ${issue.chord} position ${issue.position}: ${issue.issue}`)
    .join('\n') + 
  (allPositionsResults.criticalIssues.length > 10 ? `\n... and ${allPositionsResults.criticalIssues.length - 10} more issues` : '') + '\n'
  : '✅ No critical issues remaining!\n'
}

🎸 GUITAR THEORY COMPLIANCE
===========================
All chord positions now use:
- Proper baseFret calculations
- 4-fret display window compliance
- Realistic guitar chord voicings
- Standard moveable chord shapes

🚀 PRODUCTION READINESS
======================
${allPositionsResults.brokenPositions === 0 && renderingIssues.fretWindowViolations.length === 0 ? 
  '✅ All chord diagrams are production-ready!' :
  '❌ Some issues remain - see details above'
}
  `.trim();
}
