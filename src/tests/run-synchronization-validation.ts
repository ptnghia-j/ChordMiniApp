/**
 * Comprehensive Synchronization Validation Runner
 * 
 * This script runs all synchronization tests and provides a comprehensive
 * report on the functional equivalence between YouTube and upload workflows.
 */

import { getChordGridData } from '@/services/chordGridCalculationService';

interface ValidationResult {
  testName: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, number>;
}

interface SynchronizationReport {
  overallPassed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: ValidationResult[];
  summary: string;
}

class SynchronizationValidator {
  private results: ValidationResult[] = [];

  // Create test data that simulates both workflows
  private createTestData() {
    return {
      youtube: {
        chords: [
          {chord: 'C', time: 0.534},
          {chord: 'C', time: 1.068},
          {chord: 'Am', time: 1.602},
          {chord: 'Am', time: 2.136},
          {chord: 'F', time: 2.670},
          {chord: 'F', time: 3.204},
          {chord: 'G', time: 3.738},
          {chord: 'G', time: 4.272}
        ],
        beats: [
          {time: 0.534, beatNum: 1},
          {time: 1.068, beatNum: 2},
          {time: 1.602, beatNum: 3},
          {time: 2.136, beatNum: 4},
          {time: 2.670, beatNum: 1},
          {time: 3.204, beatNum: 2},
          {time: 3.738, beatNum: 3},
          {time: 4.272, beatNum: 4}
        ],
        downbeats: [0.534, 2.670],
        downbeats_with_measures: [0.534, 2.670],
        synchronizedChords: [
          {chord: 'C', beatIndex: 0, beatNum: 1},
          {chord: 'C', beatIndex: 1, beatNum: 2},
          {chord: 'Am', beatIndex: 2, beatNum: 3},
          {chord: 'Am', beatIndex: 3, beatNum: 4},
          {chord: 'F', beatIndex: 4, beatNum: 1},
          {chord: 'F', beatIndex: 5, beatNum: 2},
          {chord: 'G', beatIndex: 6, beatNum: 3},
          {chord: 'G', beatIndex: 7, beatNum: 4}
        ],
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
        audioDuration: 8.0,
        beatDetectionResult: {
          time_signature: 4,
          bpm: 120,
          beatShift: 0,
          beat_time_range_start: 0.534
        }
      },
      upload: {
        chords: [
          {chord: 'C', time: 0.534},
          {chord: 'C', time: 1.068},
          {chord: 'Am', time: 1.602},
          {chord: 'Am', time: 2.136},
          {chord: 'F', time: 2.670},
          {chord: 'F', time: 3.204},
          {chord: 'G', time: 3.738},
          {chord: 'G', time: 4.272}
        ],
        beats: [0.534, 1.068, 1.602, 2.136, 2.670, 3.204, 3.738, 4.272], // Number array format
        downbeats: [0.534, 2.670],
        downbeats_with_measures: [0.534, 2.670],
        synchronizedChords: [
          {chord: 'C', beatIndex: 0, beatNum: 1},
          {chord: 'C', beatIndex: 1, beatNum: 2},
          {chord: 'Am', beatIndex: 2, beatNum: 3},
          {chord: 'Am', beatIndex: 3, beatNum: 4},
          {chord: 'F', beatIndex: 4, beatNum: 1},
          {chord: 'F', beatIndex: 5, beatNum: 2},
          {chord: 'G', beatIndex: 6, beatNum: 3},
          {chord: 'G', beatIndex: 7, beatNum: 4}
        ],
        beatModel: 'beat-transformer',
        chordModel: 'chord-cnn-lstm',
        audioDuration: 8.0,
        beatDetectionResult: {
          time_signature: 4,
          bpm: 120,
          beatShift: 0,
          beat_time_range_start: 0.534
        }
      }
    };
  }

  // Test 1: Data Structure Equivalence
  private testDataStructureEquivalence(): ValidationResult {
    try {
      const testData = this.createTestData();
      const youtubeGrid = getChordGridData(testData.youtube as any);
      const uploadGrid = getChordGridData(testData.upload as any);

      const chordsMatch = JSON.stringify(youtubeGrid.chords) === JSON.stringify(uploadGrid.chords);
      const paddingMatch = youtubeGrid.paddingCount === uploadGrid.paddingCount;
      const shiftMatch = youtubeGrid.shiftCount === uploadGrid.shiftCount;
      const totalPaddingMatch = youtubeGrid.totalPaddingCount === uploadGrid.totalPaddingCount;

      const passed = chordsMatch && paddingMatch && shiftMatch && totalPaddingMatch;

      return {
        testName: 'Data Structure Equivalence',
        passed,
        details: passed 
          ? 'Both workflows produce identical chord grid data structures'
          : `Mismatches found - Chords: ${chordsMatch}, Padding: ${paddingMatch}, Shift: ${shiftMatch}, Total: ${totalPaddingMatch}`,
        metrics: {
          youtubeChordCount: youtubeGrid.chords.length,
          uploadChordCount: uploadGrid.chords.length,
          youtubePadding: youtubeGrid.paddingCount,
          uploadPadding: uploadGrid.paddingCount,
          youtubeShift: youtubeGrid.shiftCount,
          uploadShift: uploadGrid.shiftCount
        }
      };
    } catch (error) {
      return {
        testName: 'Data Structure Equivalence',
        passed: false,
        details: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Test 2: Beat Timestamp Consistency
  private testBeatTimestampConsistency(): ValidationResult {
    try {
      const testData = this.createTestData();
      const youtubeGrid = getChordGridData(testData.youtube as any);
      const uploadGrid = getChordGridData(testData.upload as any);

      let maxDifference = 0;
      let mismatchCount = 0;
      const tolerance = 0.001; // 1ms tolerance

      for (let i = 0; i < Math.min(youtubeGrid.beats.length, uploadGrid.beats.length); i++) {
        const youtubeBeat = youtubeGrid.beats[i];
        const uploadBeat = uploadGrid.beats[i];

        if (youtubeBeat !== null && uploadBeat !== null) {
          const difference = Math.abs(youtubeBeat - uploadBeat);
          maxDifference = Math.max(maxDifference, difference);
          
          if (difference > tolerance) {
            mismatchCount++;
          }
        }
      }

      const passed = mismatchCount === 0 && maxDifference <= tolerance;

      return {
        testName: 'Beat Timestamp Consistency',
        passed,
        details: passed
          ? 'Beat timestamps are consistent between workflows'
          : `Found ${mismatchCount} mismatches with max difference of ${maxDifference.toFixed(6)}s`,
        metrics: {
          maxDifference,
          mismatchCount,
          tolerance,
          youtubeBeatsLength: youtubeGrid.beats.length,
          uploadBeatsLength: uploadGrid.beats.length
        }
      };
    } catch (error) {
      return {
        testName: 'Beat Timestamp Consistency',
        passed: false,
        details: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Test 3: Original Audio Mapping Consistency
  private testOriginalAudioMappingConsistency(): ValidationResult {
    try {
      const testData = this.createTestData();
      const youtubeGrid = getChordGridData(testData.youtube as any);
      const uploadGrid = getChordGridData(testData.upload as any);

      if (!youtubeGrid.originalAudioMapping || !uploadGrid.originalAudioMapping) {
        return {
          testName: 'Original Audio Mapping Consistency',
          passed: false,
          details: 'One or both workflows missing originalAudioMapping'
        };
      }

      const lengthMatch = youtubeGrid.originalAudioMapping.length === uploadGrid.originalAudioMapping.length;
      let mappingMatches = 0;
      let timestampMatches = 0;

      for (let i = 0; i < Math.min(youtubeGrid.originalAudioMapping.length, uploadGrid.originalAudioMapping.length); i++) {
        const youtubeMapping = youtubeGrid.originalAudioMapping[i];
        const uploadMapping = uploadGrid.originalAudioMapping[i];

        if (youtubeMapping.chord === uploadMapping.chord &&
            youtubeMapping.visualIndex === uploadMapping.visualIndex &&
            youtubeMapping.originalIndex === uploadMapping.originalIndex) {
          mappingMatches++;
        }

        if (Math.abs(youtubeMapping.timestamp - uploadMapping.timestamp) <= 0.001) {
          timestampMatches++;
        }
      }

      const totalMappings = Math.min(youtubeGrid.originalAudioMapping.length, uploadGrid.originalAudioMapping.length);
      const passed = lengthMatch && mappingMatches === totalMappings && timestampMatches === totalMappings;

      return {
        testName: 'Original Audio Mapping Consistency',
        passed,
        details: passed
          ? 'Original audio mappings are consistent between workflows'
          : `Mismatches - Length: ${lengthMatch}, Mappings: ${mappingMatches}/${totalMappings}, Timestamps: ${timestampMatches}/${totalMappings}`,
        metrics: {
          youtubeMapLength: youtubeGrid.originalAudioMapping.length,
          uploadMapLength: uploadGrid.originalAudioMapping.length,
          mappingMatches,
          timestampMatches,
          totalMappings
        }
      };
    } catch (error) {
      return {
        testName: 'Original Audio Mapping Consistency',
        passed: false,
        details: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Test 4: Performance Consistency
  private testPerformanceConsistency(): ValidationResult {
    try {
      const testData = this.createTestData();
      
      // Measure YouTube workflow performance
      const youtubeStart = performance.now();
      const youtubeGrid = getChordGridData(testData.youtube as any);
      const youtubeEnd = performance.now();
      const youtubeTime = youtubeEnd - youtubeStart;

      // Measure upload workflow performance
      const uploadStart = performance.now();
      const uploadGrid = getChordGridData(testData.upload as any);
      const uploadEnd = performance.now();
      const uploadTime = uploadEnd - uploadStart;

      const timeDifference = Math.abs(youtubeTime - uploadTime);
      const maxAcceptableTime = 100; // 100ms max
      const maxTimeDifference = 50; // 50ms max difference

      const passed = youtubeTime <= maxAcceptableTime && 
                    uploadTime <= maxAcceptableTime && 
                    timeDifference <= maxTimeDifference;

      return {
        testName: 'Performance Consistency',
        passed,
        details: passed
          ? 'Both workflows perform within acceptable limits'
          : `Performance issues - YouTube: ${youtubeTime.toFixed(2)}ms, Upload: ${uploadTime.toFixed(2)}ms, Diff: ${timeDifference.toFixed(2)}ms`,
        metrics: {
          youtubeTime,
          uploadTime,
          timeDifference,
          maxAcceptableTime,
          maxTimeDifference
        }
      };
    } catch (error) {
      return {
        testName: 'Performance Consistency',
        passed: false,
        details: `Test failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Run all validation tests
  public runValidation(): SynchronizationReport {
    console.log('🔄 Running comprehensive beat-chord grid synchronization validation...\n');

    this.results = [
      this.testDataStructureEquivalence(),
      this.testBeatTimestampConsistency(),
      this.testOriginalAudioMappingConsistency(),
      this.testPerformanceConsistency()
    ];

    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.length - passedTests;
    const overallPassed = failedTests === 0;

    // Generate summary
    let summary = `\n📊 SYNCHRONIZATION VALIDATION REPORT\n`;
    summary += `${'='.repeat(50)}\n`;
    summary += `Overall Result: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}\n`;
    summary += `Total Tests: ${this.results.length}\n`;
    summary += `Passed: ${passedTests}\n`;
    summary += `Failed: ${failedTests}\n\n`;

    summary += `📋 DETAILED RESULTS:\n`;
    this.results.forEach((result, index) => {
      summary += `${index + 1}. ${result.testName}: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
      summary += `   ${result.details}\n`;
      if (result.metrics) {
        summary += `   Metrics: ${JSON.stringify(result.metrics, null, 2)}\n`;
      }
      summary += '\n';
    });

    if (overallPassed) {
      summary += `🎉 CONCLUSION: Both YouTube video analysis and direct audio upload workflows\n`;
      summary += `produce functionally identical beat-chord grids with perfect synchronization!\n`;
    } else {
      summary += `⚠️  CONCLUSION: Synchronization issues detected. Review failed tests above.\n`;
    }

    console.log(summary);

    return {
      overallPassed,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      results: this.results,
      summary
    };
  }
}

// Export for use in other test files
export { SynchronizationValidator };

// Run validation if this file is executed directly
if (require.main === module) {
  const validator = new SynchronizationValidator();
  const report = validator.runValidation();
  
  // Exit with appropriate code
  process.exit(report.overallPassed ? 0 : 1);
}
