/**
 * Firebase Authentication Diagnostics
 * 
 * Comprehensive diagnostic tool to investigate authentication failures during cold starts
 */

import { auth, db } from '@/config/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

export interface AuthDiagnosticResult {
  timestamp: number;
  testId: string;
  firebaseInitialized: boolean;
  authInstance: {
    available: boolean;
    currentUser: {
      exists: boolean;
      uid?: string;
      isAnonymous?: boolean;
      metadata?: {
        creationTime?: string;
        lastSignInTime?: string;
      };
    };
  };
  authStateListener: {
    triggered: boolean;
    userReceived: boolean;
    timeToTrigger?: number;
  };
  anonymousSignIn: {
    attempted: boolean;
    successful: boolean;
    error?: string;
    timeToComplete?: number;
  };
  firestoreWrite: {
    attempted: boolean;
    successful: boolean;
    error?: string;
    timeToComplete?: number;
  };
  browserEnvironment: {
    userAgent: string;
    cookiesEnabled: boolean;
    localStorageAvailable: boolean;
    sessionStorageAvailable: boolean;
    indexedDBAvailable: boolean;
  };
  recommendations: string[];
}

export class FirebaseAuthDiagnostics {
  private static instance: FirebaseAuthDiagnostics;

  public static getInstance(): FirebaseAuthDiagnostics {
    if (!FirebaseAuthDiagnostics.instance) {
      FirebaseAuthDiagnostics.instance = new FirebaseAuthDiagnostics();
    }
    return FirebaseAuthDiagnostics.instance;
  }

  /**
   * Run comprehensive authentication diagnostics
   */
  async runDiagnostics(): Promise<AuthDiagnosticResult> {
    const startTime = Date.now();
    const testId = `auth-test-${startTime}`;
    
    console.log(`🔍 Starting Firebase authentication diagnostics (${testId})`);

    const result: AuthDiagnosticResult = {
      timestamp: startTime,
      testId,
      firebaseInitialized: false,
      authInstance: {
        available: false,
        currentUser: {
          exists: false
        }
      },
      authStateListener: {
        triggered: false,
        userReceived: false
      },
      anonymousSignIn: {
        attempted: false,
        successful: false
      },
      firestoreWrite: {
        attempted: false,
        successful: false
      },
      browserEnvironment: this.getBrowserEnvironment(),
      recommendations: []
    };

    // Test 1: Check Firebase initialization
    result.firebaseInitialized = await this.testFirebaseInitialization();

    // Test 2: Check auth instance
    await this.testAuthInstance(result);

    // Test 3: Test auth state listener
    await this.testAuthStateListener(result);

    // Test 4: Test anonymous sign-in
    await this.testAnonymousSignIn(result);

    // Test 5: Test Firestore write with current auth state
    await this.testFirestoreWrite(result);

    // Generate recommendations
    result.recommendations = this.generateRecommendations(result);

    console.log(`📊 Authentication diagnostics completed (${Date.now() - startTime}ms)`, result);
    return result;
  }

  /**
   * Test Firebase initialization
   */
  private async testFirebaseInitialization(): Promise<boolean> {
    try {
      // Check if Firebase is properly initialized
      if (!auth || !db) {
        console.warn('❌ Firebase not initialized (auth or db is null)');
        return false;
      }

      // Test if we can access Firebase app
      const app = auth.app;
      if (!app) {
        console.warn('❌ Firebase app not available');
        return false;
      }

      console.log('✅ Firebase initialization check passed');
      return true;
    } catch (error) {
      console.error('❌ Firebase initialization test failed:', error);
      return false;
    }
  }

  /**
   * Test auth instance and current user
   */
  private async testAuthInstance(result: AuthDiagnosticResult): Promise<void> {
    try {
      if (!auth) {
        result.authInstance.available = false;
        return;
      }

      result.authInstance.available = true;

      const currentUser = auth.currentUser;
      if (currentUser) {
        result.authInstance.currentUser = {
          exists: true,
          uid: currentUser.uid,
          isAnonymous: currentUser.isAnonymous,
          metadata: {
            creationTime: currentUser.metadata.creationTime,
            lastSignInTime: currentUser.metadata.lastSignInTime
          }
        };
        console.log('✅ Current user found:', {
          uid: currentUser.uid,
          isAnonymous: currentUser.isAnonymous,
          creationTime: currentUser.metadata.creationTime,
          lastSignInTime: currentUser.metadata.lastSignInTime
        });
      } else {
        result.authInstance.currentUser.exists = false;
        console.log('⚠️ No current user found');
      }
    } catch (error) {
      console.error('❌ Auth instance test failed:', error);
      result.authInstance.available = false;
    }
  }

  /**
   * Test auth state listener
   */
  private async testAuthStateListener(result: AuthDiagnosticResult): Promise<void> {
    if (!auth) return;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = setTimeout(() => {
        console.warn('⚠️ Auth state listener timeout (5 seconds)');
        resolve();
      }, 5000);

      const unsubscribe = onAuthStateChanged(auth!, (user) => {
        clearTimeout(timeout);
        result.authStateListener.triggered = true;
        result.authStateListener.timeToTrigger = Date.now() - startTime;
        
        if (user) {
          result.authStateListener.userReceived = true;
          console.log('✅ Auth state listener triggered with user:', {
            uid: user.uid,
            isAnonymous: user.isAnonymous
          });
        } else {
          result.authStateListener.userReceived = false;
          console.log('⚠️ Auth state listener triggered with no user');
        }

        unsubscribe();
        resolve();
      });
    });
  }

  /**
   * Test anonymous sign-in
   */
  private async testAnonymousSignIn(result: AuthDiagnosticResult): Promise<void> {
    if (!auth) return;

    result.anonymousSignIn.attempted = true;
    const startTime = Date.now();

    try {
      console.log('🔐 Testing anonymous sign-in...');
      const userCredential = await signInAnonymously(auth!);
      
      result.anonymousSignIn.successful = true;
      result.anonymousSignIn.timeToComplete = Date.now() - startTime;
      
      console.log('✅ Anonymous sign-in successful:', {
        uid: userCredential.user.uid,
        isAnonymous: userCredential.user.isAnonymous,
        timeToComplete: result.anonymousSignIn.timeToComplete
      });
    } catch (error) {
      result.anonymousSignIn.successful = false;
      result.anonymousSignIn.error = error instanceof Error ? error.message : 'Unknown error';
      result.anonymousSignIn.timeToComplete = Date.now() - startTime;
      
      console.error('❌ Anonymous sign-in failed:', error);
    }
  }

  /**
   * Test Firestore write operation
   */
  private async testFirestoreWrite(result: AuthDiagnosticResult): Promise<void> {
    if (!db) return;

    result.firestoreWrite.attempted = true;
    const startTime = Date.now();

    try {
      console.log('💾 Testing Firestore write operation...');
      
      const testDoc = doc(db, 'audioCache', `auth-test-${result.testId}`);
      await setDoc(testDoc, {
        videoId: 'dQw4w9WgXcQ', // Valid YouTube video ID format
        audioUrl: 'https://example.com/test.mp3',
        title: 'Authentication Test',
        duration: 180,
        fileSize: 1024,
        createdAt: serverTimestamp()
      });

      result.firestoreWrite.successful = true;
      result.firestoreWrite.timeToComplete = Date.now() - startTime;
      
      console.log('✅ Firestore write successful:', {
        timeToComplete: result.firestoreWrite.timeToComplete
      });
    } catch (error) {
      result.firestoreWrite.successful = false;
      result.firestoreWrite.error = error instanceof Error ? error.message : 'Unknown error';
      result.firestoreWrite.timeToComplete = Date.now() - startTime;
      
      console.error('❌ Firestore write failed:', error);
    }
  }

  /**
   * Get browser environment information
   */
  private getBrowserEnvironment() {
    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      cookiesEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : false,
      localStorageAvailable: this.isStorageAvailable('localStorage'),
      sessionStorageAvailable: this.isStorageAvailable('sessionStorage'),
      indexedDBAvailable: typeof indexedDB !== 'undefined'
    };
  }

  /**
   * Check if storage is available
   */
  private isStorageAvailable(type: 'localStorage' | 'sessionStorage'): boolean {
    try {
      const storage = window[type];
      const test = '__storage_test__';
      storage.setItem(test, test);
      storage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate recommendations based on diagnostic results
   */
  private generateRecommendations(result: AuthDiagnosticResult): string[] {
    const recommendations: string[] = [];

    if (!result.firebaseInitialized) {
      recommendations.push('Firebase is not properly initialized - check configuration and network connectivity');
    }

    if (!result.authInstance.available) {
      recommendations.push('Firebase Auth instance is not available - verify Firebase initialization');
    }

    if (!result.authInstance.currentUser.exists && result.anonymousSignIn.successful) {
      recommendations.push('Anonymous sign-in succeeded but currentUser is not set - possible timing issue');
    }

    if (!result.authStateListener.triggered) {
      recommendations.push('Auth state listener never triggered - possible Firebase Auth initialization issue');
    }

    if (!result.anonymousSignIn.successful) {
      if (result.anonymousSignIn.error?.includes('operation-not-allowed')) {
        recommendations.push('Anonymous authentication is not enabled in Firebase Console');
      } else if (result.anonymousSignIn.error?.includes('network')) {
        recommendations.push('Network connectivity issue preventing authentication');
      } else {
        recommendations.push('Anonymous sign-in failed - check Firebase configuration and console logs');
      }
    }

    if (!result.firestoreWrite.successful) {
      if (result.firestoreWrite.error?.includes('permission')) {
        recommendations.push('Firestore security rules are blocking writes - update rules to allow anonymous writes');
      } else if (result.firestoreWrite.error?.includes('network')) {
        recommendations.push('Network connectivity issue preventing Firestore writes');
      } else {
        recommendations.push('Firestore write failed - check security rules and data validation');
      }
    }

    if (!result.browserEnvironment.localStorageAvailable) {
      recommendations.push('Local storage not available - may affect Firebase Auth persistence');
    }

    if (!result.browserEnvironment.indexedDBAvailable) {
      recommendations.push('IndexedDB not available - may affect Firebase offline capabilities');
    }

    if (result.anonymousSignIn.timeToComplete && result.anonymousSignIn.timeToComplete > 5000) {
      recommendations.push('Anonymous sign-in is slow - consider implementing timeout handling');
    }

    return recommendations;
  }

  /**
   * Generate a comprehensive diagnostic report
   */
  async generateReport(): Promise<string> {
    const result = await this.runDiagnostics();
    
    return `
🔍 FIREBASE AUTHENTICATION DIAGNOSTIC REPORT
============================================
Test ID: ${result.testId}
Timestamp: ${new Date(result.timestamp).toISOString()}

🔧 FIREBASE INITIALIZATION:
${result.firebaseInitialized ? '✅' : '❌'} Firebase Initialized

🔐 AUTHENTICATION INSTANCE:
${result.authInstance.available ? '✅' : '❌'} Auth Instance Available
${result.authInstance.currentUser.exists ? '✅' : '❌'} Current User Exists
${result.authInstance.currentUser.exists ? `   - UID: ${result.authInstance.currentUser.uid}` : ''}
${result.authInstance.currentUser.exists ? `   - Anonymous: ${result.authInstance.currentUser.isAnonymous}` : ''}
${result.authInstance.currentUser.exists ? `   - Created: ${result.authInstance.currentUser.metadata?.creationTime}` : ''}
${result.authInstance.currentUser.exists ? `   - Last Sign In: ${result.authInstance.currentUser.metadata?.lastSignInTime}` : ''}

📡 AUTH STATE LISTENER:
${result.authStateListener.triggered ? '✅' : '❌'} Listener Triggered
${result.authStateListener.userReceived ? '✅' : '❌'} User Received
${result.authStateListener.timeToTrigger ? `   - Time to Trigger: ${result.authStateListener.timeToTrigger}ms` : ''}

🔑 ANONYMOUS SIGN-IN:
${result.anonymousSignIn.attempted ? '✅' : '❌'} Sign-in Attempted
${result.anonymousSignIn.successful ? '✅' : '❌'} Sign-in Successful
${result.anonymousSignIn.timeToComplete ? `   - Time to Complete: ${result.anonymousSignIn.timeToComplete}ms` : ''}
${result.anonymousSignIn.error ? `   - Error: ${result.anonymousSignIn.error}` : ''}

💾 FIRESTORE WRITE TEST:
${result.firestoreWrite.attempted ? '✅' : '❌'} Write Attempted
${result.firestoreWrite.successful ? '✅' : '❌'} Write Successful
${result.firestoreWrite.timeToComplete ? `   - Time to Complete: ${result.firestoreWrite.timeToComplete}ms` : ''}
${result.firestoreWrite.error ? `   - Error: ${result.firestoreWrite.error}` : ''}

🌐 BROWSER ENVIRONMENT:
- User Agent: ${result.browserEnvironment.userAgent}
- Cookies Enabled: ${result.browserEnvironment.cookiesEnabled ? '✅' : '❌'}
- Local Storage: ${result.browserEnvironment.localStorageAvailable ? '✅' : '❌'}
- Session Storage: ${result.browserEnvironment.sessionStorageAvailable ? '✅' : '❌'}
- IndexedDB: ${result.browserEnvironment.indexedDBAvailable ? '✅' : '❌'}

💡 RECOMMENDATIONS:
${result.recommendations.map(rec => `- ${rec}`).join('\n')}
    `.trim();
  }
}

// Export singleton instance
export const firebaseAuthDiagnostics = FirebaseAuthDiagnostics.getInstance();
