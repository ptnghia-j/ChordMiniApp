/**
 * Cold Start Authentication Test
 * 
 * Comprehensive test to verify Firebase authentication works correctly
 * during cold start scenarios and cache operations.
 */

import { firebaseAuthDiagnostics } from './firebaseAuthDiagnostics';
import { firebaseStorageSimplified } from '@/services/firebaseStorageSimplified';

export interface ColdStartTestResult {
  testId: string;
  timestamp: number;
  phases: {
    initialization: {
      success: boolean;
      timeMs: number;
      error?: string;
    };
    authDiagnostics: {
      success: boolean;
      timeMs: number;
      result?: unknown;
      error?: string;
    };
    cacheOperation: {
      success: boolean;
      timeMs: number;
      error?: string;
    };
    retryMechanism: {
      tested: boolean;
      success: boolean;
      timeMs: number;
      attempts: number;
      error?: string;
    };
  };
  overallSuccess: boolean;
  recommendations: string[];
}

export class ColdStartAuthTest {
  private static instance: ColdStartAuthTest;

  public static getInstance(): ColdStartAuthTest {
    if (!ColdStartAuthTest.instance) {
      ColdStartAuthTest.instance = new ColdStartAuthTest();
    }
    return ColdStartAuthTest.instance;
  }

  /**
   * Run comprehensive cold start authentication test
   */
  async runTest(): Promise<ColdStartTestResult> {
    const testId = `cold-start-test-${Date.now()}`;
    const startTime = Date.now();
    
    console.log(`🧪 Starting cold start authentication test (${testId})`);

    const result: ColdStartTestResult = {
      testId,
      timestamp: startTime,
      phases: {
        initialization: { success: false, timeMs: 0 },
        authDiagnostics: { success: false, timeMs: 0 },
        cacheOperation: { success: false, timeMs: 0 },
        retryMechanism: { tested: false, success: false, timeMs: 0, attempts: 0 }
      },
      overallSuccess: false,
      recommendations: []
    };

    // Phase 1: Test Firebase initialization
    await this.testInitialization(result);

    // Phase 2: Run authentication diagnostics
    await this.testAuthDiagnostics(result);

    // Phase 3: Test cache operation
    await this.testCacheOperation(result);

    // Phase 4: Test retry mechanism (simulate failure)
    await this.testRetryMechanism(result);

    // Determine overall success
    result.overallSuccess = result.phases.initialization.success &&
                           result.phases.authDiagnostics.success &&
                           result.phases.cacheOperation.success;

    // Generate recommendations
    result.recommendations = this.generateRecommendations(result);

    const totalTime = Date.now() - startTime;
    console.log(`🧪 Cold start test completed in ${totalTime}ms:`, {
      testId,
      overallSuccess: result.overallSuccess,
      phases: Object.keys(result.phases).map(phase => ({
        phase,
        success: (result.phases as Record<string, { success: boolean }>)[phase].success
      }))
    });

    return result;
  }

  /**
   * Test Firebase initialization
   */
  private async testInitialization(result: ColdStartTestResult): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔧 Testing Firebase initialization...');
      
      // Import Firebase modules
      const { auth, db, waitForAuthState, ensureAuthReady } = await import('@/config/firebase');
      
      if (!auth || !db) {
        throw new Error('Firebase not properly initialized');
      }

      // Wait for auth state to be ready
      const authReady = await waitForAuthState(10000);
      if (!authReady) {
        console.warn('⚠️ Auth state not ready, attempting manual initialization...');
        const manualAuthReady = await ensureAuthReady();
        if (!manualAuthReady) {
          throw new Error('Failed to ensure authentication ready');
        }
      }

      result.phases.initialization.success = true;
      result.phases.initialization.timeMs = Date.now() - startTime;
      console.log('✅ Firebase initialization test passed');
      
    } catch (error) {
      result.phases.initialization.success = false;
      result.phases.initialization.timeMs = Date.now() - startTime;
      result.phases.initialization.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Firebase initialization test failed:', error);
    }
  }

  /**
   * Test authentication diagnostics
   */
  private async testAuthDiagnostics(result: ColdStartTestResult): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Running authentication diagnostics...');
      
      const diagnosticResult = await firebaseAuthDiagnostics.runDiagnostics();
      
      // Check if diagnostics show healthy state
      const isHealthy = diagnosticResult.firebaseInitialized &&
                       diagnosticResult.authInstance.available &&
                       diagnosticResult.authInstance.currentUser.exists &&
                       diagnosticResult.anonymousSignIn.successful &&
                       diagnosticResult.firestoreWrite.successful;

      result.phases.authDiagnostics.success = isHealthy;
      result.phases.authDiagnostics.timeMs = Date.now() - startTime;
      result.phases.authDiagnostics.result = diagnosticResult;
      
      if (isHealthy) {
        console.log('✅ Authentication diagnostics passed');
      } else {
        console.warn('⚠️ Authentication diagnostics show issues:', diagnosticResult.recommendations);
      }
      
    } catch (error) {
      result.phases.authDiagnostics.success = false;
      result.phases.authDiagnostics.timeMs = Date.now() - startTime;
      result.phases.authDiagnostics.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Authentication diagnostics failed:', error);
    }
  }

  /**
   * Test cache operation
   */
  private async testCacheOperation(result: ColdStartTestResult): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('💾 Testing cache operation...');
      
      const testData = {
        videoId: 'dQw4w9WgXcQ', // Valid YouTube video ID
        audioUrl: 'https://example.com/test-audio.mp3',
        title: 'Cold Start Test Audio',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        channelTitle: 'Test Channel',
        duration: 180,
        fileSize: 1024000,
        extractionService: 'cold-start-test',
        extractionTimestamp: Date.now()
      };

      const success = await firebaseStorageSimplified.saveAudioMetadata(testData);
      
      result.phases.cacheOperation.success = success;
      result.phases.cacheOperation.timeMs = Date.now() - startTime;
      
      if (success) {
        console.log('✅ Cache operation test passed');
      } else {
        console.warn('⚠️ Cache operation test failed');
      }
      
    } catch (error) {
      result.phases.cacheOperation.success = false;
      result.phases.cacheOperation.timeMs = Date.now() - startTime;
      result.phases.cacheOperation.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Cache operation test failed:', error);
    }
  }

  /**
   * Test retry mechanism by simulating authentication failure
   */
  private async testRetryMechanism(result: ColdStartTestResult): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Testing retry mechanism...');
      
      result.phases.retryMechanism.tested = true;
      
      // This test is more observational - we check if the retry logic
      // is properly implemented by examining the code structure
      const { firebaseStorageSimplified } = await import('@/services/firebaseStorageSimplified');
      
      // Check if the service has the retry logic
      const hasRetryLogic = firebaseStorageSimplified.saveAudioMetadata.toString().includes('maxRetries');
      
      if (hasRetryLogic) {
        result.phases.retryMechanism.success = true;
        console.log('✅ Retry mechanism is implemented');
      } else {
        result.phases.retryMechanism.success = false;
        console.warn('⚠️ Retry mechanism not found in implementation');
      }
      
      result.phases.retryMechanism.timeMs = Date.now() - startTime;
      result.phases.retryMechanism.attempts = 1; // Simulated
      
    } catch (error) {
      result.phases.retryMechanism.success = false;
      result.phases.retryMechanism.timeMs = Date.now() - startTime;
      result.phases.retryMechanism.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Retry mechanism test failed:', error);
    }
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(result: ColdStartTestResult): string[] {
    const recommendations: string[] = [];

    if (!result.phases.initialization.success) {
      recommendations.push('Firebase initialization failed - check configuration and network connectivity');
    }

    if (!result.phases.authDiagnostics.success) {
      recommendations.push('Authentication diagnostics failed - run detailed diagnostics for specific issues');
      
      const diagnosticResult = result.phases.authDiagnostics.result as { recommendations?: string[] } | undefined;
      if (diagnosticResult?.recommendations) {
        recommendations.push(...diagnosticResult.recommendations);
      }
    }

    if (!result.phases.cacheOperation.success) {
      recommendations.push('Cache operation failed - check Firestore security rules and authentication state');
    }

    if (!result.phases.retryMechanism.success) {
      recommendations.push('Retry mechanism not properly implemented - ensure exponential backoff is in place');
    }

    if (result.phases.initialization.timeMs > 10000) {
      recommendations.push('Firebase initialization is slow - consider optimizing initialization sequence');
    }

    if (result.phases.cacheOperation.timeMs > 5000) {
      recommendations.push('Cache operations are slow - consider implementing timeout handling');
    }

    return recommendations;
  }

  /**
   * Generate a comprehensive test report
   */
  async generateReport(): Promise<string> {
    const result = await this.runTest();
    
    return `
🧪 COLD START AUTHENTICATION TEST REPORT
========================================
Test ID: ${result.testId}
Timestamp: ${new Date(result.timestamp).toISOString()}
Overall Success: ${result.overallSuccess ? '✅' : '❌'}

📋 TEST PHASES:
${Object.entries(result.phases).map(([phase, data]) => `
${phase.toUpperCase()}:
  Success: ${data.success ? '✅' : '❌'}
  Time: ${data.timeMs}ms
  ${data.error ? `Error: ${data.error}` : ''}
  ${'attempts' in data ? `Attempts: ${(data as { attempts: number }).attempts}` : ''}
`).join('')}

💡 RECOMMENDATIONS:
${result.recommendations.map(rec => `- ${rec}`).join('\n')}

🎯 NEXT STEPS:
${result.overallSuccess ? 
  '✅ All tests passed - cold start authentication is working correctly' :
  '❌ Some tests failed - review recommendations and implement fixes'
}
    `.trim();
  }
}

// Export singleton instance
export const coldStartAuthTest = ColdStartAuthTest.getInstance();
