/**
 * Chord Diagram Test Utility
 * 
 * This utility helps verify that chord diagrams are rendering correctly
 * by checking the chord data format and identifying potential issues.
 */

interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
  midi?: number[];
}

interface ChordData {
  key: string;
  suffix: string;
  positions: ChordPosition[];
}

/**
 * Validate a single chord position for correct format
 */
export function validateChordPosition(position: ChordPosition, chordName: string, positionIndex: number): string[] {
  const errors: string[] = [];
  
  // Check frets array length
  if (position.frets.length !== 6) {
    errors.push(`${chordName} position ${positionIndex + 1}: frets array should have 6 elements, has ${position.frets.length}`);
  }
  
  // Check fingers array length
  if (position.fingers.length !== 6) {
    errors.push(`${chordName} position ${positionIndex + 1}: fingers array should have 6 elements, has ${position.fingers.length}`);
  }
  
  // Check baseFret value
  if (position.baseFret < 1 || position.baseFret > 15) {
    errors.push(`${chordName} position ${positionIndex + 1}: baseFret should be between 1-15, is ${position.baseFret}`);
  }
  
  // Check fret values relative to baseFret
  for (let i = 0; i < position.frets.length; i++) {
    const fret = position.frets[i];
    if (fret !== -1 && fret !== 0) { // -1 = muted, 0 = open
      if (position.baseFret === 1) {
        // For baseFret 1, fret numbers should be absolute positions (1-15)
        if (fret < 1 || fret > 15) {
          errors.push(`${chordName} position ${positionIndex + 1}: fret ${i + 1} value ${fret} is out of range for baseFret 1`);
        }
      } else {
        // For baseFret > 1, fret numbers should be relative (1-4 typically)
        if (fret < 1 || fret > 6) {
          errors.push(`${chordName} position ${positionIndex + 1}: fret ${i + 1} value ${fret} should be relative (1-6) for baseFret ${position.baseFret}`);
        }
      }
    }
  }
  
  // Check finger values
  for (let i = 0; i < position.fingers.length; i++) {
    const finger = position.fingers[i];
    if (finger < 0 || finger > 4) {
      errors.push(`${chordName} position ${positionIndex + 1}: finger ${i + 1} value ${finger} should be 0-4`);
    }
  }
  
  // Check barres array
  for (const barre of position.barres) {
    if (position.baseFret === 1) {
      if (barre < 1 || barre > 15) {
        errors.push(`${chordName} position ${positionIndex + 1}: barre fret ${barre} is out of range for baseFret 1`);
      }
    } else {
      if (barre < 1 || barre > 6) {
        errors.push(`${chordName} position ${positionIndex + 1}: barre fret ${barre} should be relative (1-6) for baseFret ${position.baseFret}`);
      }
    }
  }
  
  return errors;
}

/**
 * Validate all positions for a chord
 */
export function validateChordData(chordData: ChordData): string[] {
  const errors: string[] = [];
  const chordName = `${chordData.key}${chordData.suffix === 'major' ? '' : chordData.suffix}`;
  
  if (!chordData.positions || chordData.positions.length === 0) {
    errors.push(`${chordName}: No positions defined`);
    return errors;
  }
  
  for (let i = 0; i < chordData.positions.length; i++) {
    const positionErrors = validateChordPosition(chordData.positions[i], chordName, i);
    errors.push(...positionErrors);
  }
  
  return errors;
}

/**
 * Test specific problematic chords that were mentioned in the issue
 */
export function testProblematicChords(): { chord: string; position: number; errors: string[] }[] {
  const problematicChords = [
    { key: 'A♭', suffix: 'major' },
    { key: 'G', suffix: 'minor' },
    { key: 'B', suffix: 'major' },
    { key: 'E♭', suffix: 'major' }
  ];
  
  const results: { chord: string; position: number; errors: string[] }[] = [];
  
  // This would need to be connected to the actual chord mapping service
  // For now, we'll return a placeholder
  console.log('Testing problematic chords:', problematicChords);
  
  return results;
}

/**
 * Generate a summary report of chord validation
 */
export function generateChordValidationReport(allChordData: ChordData[]): {
  totalChords: number;
  totalPositions: number;
  errorCount: number;
  errors: string[];
  summary: string;
} {
  let totalPositions = 0;
  const allErrors: string[] = [];
  
  for (const chordData of allChordData) {
    totalPositions += chordData.positions.length;
    const errors = validateChordData(chordData);
    allErrors.push(...errors);
  }
  
  const summary = `
Chord Validation Report:
- Total chords: ${allChordData.length}
- Total positions: ${totalPositions}
- Errors found: ${allErrors.length}
${allErrors.length === 0 ? '✅ All chord positions are valid!' : '❌ Issues found - see errors below'}
  `.trim();
  
  return {
    totalChords: allChordData.length,
    totalPositions,
    errorCount: allErrors.length,
    errors: allErrors,
    summary
  };
}

/**
 * Check if a chord position would render correctly with react-chords
 * This is the critical function that identifies the "solid dots without finger numbers" issue
 */
export function checkReactChordsCompatibility(position: ChordPosition): {
  compatible: boolean;
  issues: string[];
  reactChordsFormat: ChordPosition;
  criticalIssues: string[];
} {
  const issues: string[] = [];
  const criticalIssues: string[] = [];

  // Convert to react-chords format
  const reactChordsFormat = {
    frets: position.frets,
    fingers: position.fingers,
    barres: position.barres || [],
    capo: position.capo || false,
    baseFret: position.baseFret || 1
  };

  // CRITICAL: Check for 4-fret display window violations
  if (position.baseFret > 1) {
    const invalidFrets = position.frets.filter(f => f > 4 && f !== -1 && f !== 0);
    if (invalidFrets.length > 0) {
      criticalIssues.push(`CRITICAL: Fret values ${invalidFrets.join(', ')} exceed 4-fret window for baseFret ${position.baseFret}. This causes solid dots without finger numbers.`);
    }
  }

  // Check for unrealistic high fret positions
  if (position.baseFret === 1) {
    const highFrets = position.frets.filter(f => f > 15 && f !== -1);
    if (highFrets.length > 0) {
      issues.push(`High fret numbers ${highFrets.join(', ')} are unusual for guitar chords`);
    }
  }

  // Check for baseFret + fret combinations that exceed guitar range
  const maxEffectiveFret = position.baseFret + Math.max(...position.frets.filter(f => f > 0));
  if (maxEffectiveFret > 15) {
    issues.push(`Effective fret position ${maxEffectiveFret} exceeds reasonable guitar range`);
  }

  // Check barre chord consistency
  if (position.barres.length > 0) {
    for (const barre of position.barres) {
      if (position.baseFret > 1 && barre > 4) {
        criticalIssues.push(`CRITICAL: Barre fret ${barre} exceeds 4-fret window for baseFret ${position.baseFret}`);
      }
      if (!position.frets.includes(barre)) {
        issues.push(`Barre fret ${barre} does not match any fret positions`);
      }
    }
  }

  // Check finger numbering consistency
  const nonZeroFingers = position.fingers.filter(f => f > 0);
  const uniqueFingers = new Set(nonZeroFingers);
  if (nonZeroFingers.length > 0 && uniqueFingers.size !== nonZeroFingers.length) {
    // Allow duplicate finger numbers for barre chords
    if (position.barres.length === 0) {
      issues.push('Duplicate finger numbers without barre chord indication');
    }
  }

  return {
    compatible: criticalIssues.length === 0 && issues.length === 0,
    issues,
    reactChordsFormat,
    criticalIssues
  };
}

/**
 * Comprehensive audit of all chord positions in the database
 */
export function auditAllChordPositions(chordDatabase: { chords: Record<string, ChordData[]> }): {
  totalPositions: number;
  criticalIssues: Array<{chord: string; position: number; issue: string}>;
  minorIssues: Array<{chord: string; position: number; issue: string}>;
  summary: string;
} {
  const criticalIssues: Array<{chord: string; position: number; issue: string}> = [];
  const minorIssues: Array<{chord: string; position: number; issue: string}> = [];
  let totalPositions = 0;

  // Iterate through all keys and chord types
  for (const [, chordTypes] of Object.entries(chordDatabase.chords)) {
    for (const chordData of chordTypes) {
      const chordName = `${chordData.key}${chordData.suffix === 'major' ? '' : chordData.suffix}`;

      for (let i = 0; i < chordData.positions.length; i++) {
        totalPositions++;
        const position = chordData.positions[i];
        const compatibility = checkReactChordsCompatibility(position);

        // Record critical issues (causes rendering problems)
        for (const issue of compatibility.criticalIssues) {
          criticalIssues.push({
            chord: chordName,
            position: i + 1,
            issue
          });
        }

        // Record minor issues (suboptimal but functional)
        for (const issue of compatibility.issues) {
          minorIssues.push({
            chord: chordName,
            position: i + 1,
            issue
          });
        }
      }
    }
  }

  const summary = `
CHORD DIAGRAM AUDIT REPORT
==========================
Total positions audited: ${totalPositions}
Critical issues (causes solid dots): ${criticalIssues.length}
Minor issues: ${minorIssues.length}

${criticalIssues.length === 0 ? '✅ No critical rendering issues found!' : '❌ Critical issues found - these cause solid dots without finger numbers'}
${minorIssues.length === 0 ? '✅ No minor issues found!' : '⚠️ Minor issues found - these are suboptimal but functional'}
  `.trim();

  return {
    totalPositions,
    criticalIssues,
    minorIssues,
    summary
  };
}
