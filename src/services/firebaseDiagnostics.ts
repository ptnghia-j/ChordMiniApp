/**
 * Firebase Diagnostics Service
 * 
 * Provides comprehensive diagnostics and monitoring for Firebase operations
 * to help identify and resolve cold start permission issues.
 */

import { auth, db } from '@/config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuthManager } from './firebaseAuthManager';

export interface FirebaseDiagnosticResult {
  timestamp: number;
  authState: {
    ready: boolean;
    authenticated: boolean;
    userId: string | null;
  };
  firestoreConnectivity: {
    canRead: boolean;
    canWrite: boolean;
    latency: number;
    error?: string;
  };
  coldStartIndicators: {
    isColdStart: boolean;
    timeSinceLastActivity: number;
    authTokenAge: number;
  };
  recommendations: string[];
}

export class FirebaseDiagnosticsService {
  private static instance: FirebaseDiagnosticsService;
  private lastActivityTime = Date.now();
  private diagnosticHistory: FirebaseDiagnosticResult[] = [];

  private constructor() {
    // Track activity to detect cold starts
    this.trackActivity();
  }

  public static getInstance(): FirebaseDiagnosticsService {
    if (!FirebaseDiagnosticsService.instance) {
      FirebaseDiagnosticsService.instance = new FirebaseDiagnosticsService();
    }
    return FirebaseDiagnosticsService.instance;
  }

  /**
   * Track user activity to detect cold start scenarios
   */
  private trackActivity(): void {
    // Update activity time on various events
    const events = ['click', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivityTime = Date.now();
      }, { passive: true });
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.lastActivityTime = Date.now();
      }
    });
  }

  /**
   * Run comprehensive Firebase diagnostics
   */
  async runDiagnostics(): Promise<FirebaseDiagnosticResult> {
    const startTime = Date.now();
    console.log('🔍 Running Firebase diagnostics...');

    // Check authentication state
    const authState = firebaseAuthManager.getAuthState();
    
    // Check Firestore connectivity
    const firestoreResult = await this.testFirestoreConnectivity();
    
    // Analyze cold start indicators
    const coldStartIndicators = this.analyzeColdStartIndicators();
    
    // Prepare auth state for result
    const authStateForResult = {
      ready: authState.ready,
      authenticated: authState.authenticated,
      userId: authState.user?.uid || null
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(authStateForResult, firestoreResult, coldStartIndicators);

    const result: FirebaseDiagnosticResult = {
      timestamp: startTime,
      authState: authStateForResult,
      firestoreConnectivity: firestoreResult,
      coldStartIndicators,
      recommendations
    };

    // Store in history
    this.diagnosticHistory.push(result);
    if (this.diagnosticHistory.length > 10) {
      this.diagnosticHistory.shift(); // Keep only last 10 results
    }

    console.log('📊 Firebase diagnostics completed:', result);
    return result;
  }

  /**
   * Test Firestore connectivity and permissions
   */
  private async testFirestoreConnectivity(): Promise<FirebaseDiagnosticResult['firestoreConnectivity']> {
    const startTime = Date.now();
    
    try {
      if (!db) {
        return {
          canRead: false,
          canWrite: false,
          latency: 0,
          error: 'Firebase not initialized'
        };
      }

      // Test read operation
      const testDocRef = doc(db, 'diagnostics', 'connectivity-test');
      let canRead = false;
      let readError: string | undefined;

      try {
        await getDoc(testDocRef);
        canRead = true;
      } catch (error) {
        readError = error instanceof Error ? error.message : 'Unknown read error';
      }

      // Test write operation
      let canWrite = false;
      let writeError: string | undefined;

      try {
        await setDoc(testDocRef, {
          timestamp: serverTimestamp(),
          test: true
        });
        canWrite = true;
      } catch (error) {
        writeError = error instanceof Error ? error.message : 'Unknown write error';
      }

      const latency = Date.now() - startTime;
      const error = readError || writeError;

      return {
        canRead,
        canWrite,
        latency,
        ...(error && { error })
      };

    } catch (error) {
      return {
        canRead: false,
        canWrite: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown connectivity error'
      };
    }
  }

  /**
   * Analyze indicators of cold start scenarios
   */
  private analyzeColdStartIndicators(): FirebaseDiagnosticResult['coldStartIndicators'] {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    // Consider it a cold start if more than 30 minutes of inactivity
    const isColdStart = timeSinceLastActivity > 30 * 60 * 1000;
    
    // Estimate auth token age (Firebase tokens typically last 1 hour)
    const authTokenAge = auth?.currentUser ? 
      now - (auth.currentUser.metadata.lastSignInTime ? 
        new Date(auth.currentUser.metadata.lastSignInTime).getTime() : now) : 0;

    return {
      isColdStart,
      timeSinceLastActivity,
      authTokenAge
    };
  }

  /**
   * Generate recommendations based on diagnostic results
   */
  private generateRecommendations(
    authState: FirebaseDiagnosticResult['authState'],
    firestoreResult: FirebaseDiagnosticResult['firestoreConnectivity'],
    coldStartIndicators: FirebaseDiagnosticResult['coldStartIndicators']
  ): string[] {
    const recommendations: string[] = [];

    // Authentication recommendations
    if (!authState.ready) {
      recommendations.push('Wait for Firebase authentication to initialize');
    }
    
    if (!authState.authenticated) {
      recommendations.push('Sign in anonymously to enable cache operations');
    }

    // Firestore connectivity recommendations
    if (!firestoreResult.canRead) {
      recommendations.push('Check Firestore security rules for read permissions');
    }
    
    if (!firestoreResult.canWrite) {
      if (firestoreResult.error?.includes('permission')) {
        recommendations.push('Update Firestore security rules to handle cold start scenarios');
        recommendations.push('Consider implementing retry logic with authentication refresh');
      } else {
        recommendations.push('Check network connectivity and Firestore configuration');
      }
    }

    // Cold start recommendations
    if (coldStartIndicators.isColdStart) {
      recommendations.push('Detected cold start scenario - implement non-blocking cache operations');
      recommendations.push('Use background cache saves to avoid blocking audio extraction');
    }

    if (coldStartIndicators.authTokenAge > 50 * 60 * 1000) { // 50 minutes
      recommendations.push('Authentication token is near expiration - refresh proactively');
    }

    // Performance recommendations
    if (firestoreResult.latency > 5000) {
      recommendations.push('High Firestore latency detected - consider timeout handling');
    }

    return recommendations;
  }

  /**
   * Get diagnostic history
   */
  getDiagnosticHistory(): FirebaseDiagnosticResult[] {
    return [...this.diagnosticHistory];
  }

  /**
   * Check if current conditions indicate a cold start scenario
   */
  isColdStartScenario(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    return timeSinceLastActivity > 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Monitor Firebase operations and log issues
   */
  async monitorOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Monitoring Firebase operation: ${operationName}`);
      
      // Run diagnostics if this might be a cold start
      if (this.isColdStartScenario()) {
        console.log('⚠️ Cold start scenario detected, running diagnostics...');
        await this.runDiagnostics();
      }

      const result = await operation();
      const duration = Date.now() - startTime;
      
      console.log(`✅ Firebase operation completed: ${operationName} (${duration}ms)`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Firebase operation failed: ${operationName} (${duration}ms)`, error);
      
      // Run diagnostics on failure
      const diagnostics = await this.runDiagnostics();
      console.log('🔧 Diagnostic recommendations:', diagnostics.recommendations);
      
      throw error;
    }
  }

  /**
   * Generate a comprehensive diagnostic report
   */
  async generateDiagnosticReport(): Promise<string> {
    const diagnostics = await this.runDiagnostics();
    
    return `
🔍 FIREBASE DIAGNOSTIC REPORT
============================
Timestamp: ${new Date(diagnostics.timestamp).toISOString()}

🔐 AUTHENTICATION STATE:
- Ready: ${diagnostics.authState.ready ? '✅' : '❌'}
- Authenticated: ${diagnostics.authState.authenticated ? '✅' : '❌'}
- User ID: ${diagnostics.authState.userId || 'None'}

🗄️ FIRESTORE CONNECTIVITY:
- Can Read: ${diagnostics.firestoreConnectivity.canRead ? '✅' : '❌'}
- Can Write: ${diagnostics.firestoreConnectivity.canWrite ? '✅' : '❌'}
- Latency: ${diagnostics.firestoreConnectivity.latency}ms
${diagnostics.firestoreConnectivity.error ? `- Error: ${diagnostics.firestoreConnectivity.error}` : ''}

❄️ COLD START ANALYSIS:
- Is Cold Start: ${diagnostics.coldStartIndicators.isColdStart ? '⚠️ YES' : '✅ NO'}
- Time Since Activity: ${Math.round(diagnostics.coldStartIndicators.timeSinceLastActivity / 1000)}s
- Auth Token Age: ${Math.round(diagnostics.coldStartIndicators.authTokenAge / 1000)}s

💡 RECOMMENDATIONS:
${diagnostics.recommendations.map(rec => `- ${rec}`).join('\n')}

📊 DIAGNOSTIC HISTORY:
${this.diagnosticHistory.length} previous diagnostic runs available
    `.trim();
  }
}

// Export singleton instance
export const firebaseDiagnostics = FirebaseDiagnosticsService.getInstance();
