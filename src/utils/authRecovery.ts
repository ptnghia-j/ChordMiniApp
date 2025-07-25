/**
 * Authentication Recovery Utility
 * 
 * Handles authentication recovery after page refreshes, network failures,
 * and inactivity periods to prevent permission denied errors.
 */

import { auth, ensureAuthReady, getCurrentAuthUser, isAuthStateReady } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';

export interface AuthRecoveryOptions {
  maxRetries?: number;
  baseDelay?: number;
  timeoutMs?: number;
  enableLogging?: boolean;
}

export interface AuthRecoveryResult {
  success: boolean;
  authenticated: boolean;
  attempts: number;
  totalTime: number;
  error?: string;
  recoveryMethod?: 'existing' | 'state-listener' | 'manual-signin' | 'failed';
}

/**
 * Comprehensive authentication recovery for production environments
 */
export class AuthRecovery {
  private options: Required<AuthRecoveryOptions>;

  constructor(options: AuthRecoveryOptions = {}) {
    this.options = {
      maxRetries: 5,
      baseDelay: 1000,
      timeoutMs: 30000,
      enableLogging: true,
      ...options
    };
  }

  /**
   * Attempt to recover authentication state
   */
  async recover(): Promise<AuthRecoveryResult> {
    // SSR Guard: Return failure on server-side
    if (typeof window === 'undefined') {
      this.log('🔧 Authentication recovery called on server-side, returning failure');
      return {
        success: false,
        authenticated: false,
        attempts: 0,
        totalTime: 0,
        error: 'Server-side environment',
        recoveryMethod: 'failed'
      };
    }

    const startTime = Date.now();
    let attempts = 0;

    this.log('🔄 Starting authentication recovery...');

    // Step 1: Check if already authenticated
    if (isAuthStateReady() && getCurrentAuthUser()) {
      this.log('✅ Authentication already ready');
      return {
        success: true,
        authenticated: true,
        attempts: 0,
        totalTime: Date.now() - startTime,
        recoveryMethod: 'existing'
      };
    }

    // Step 2: Wait for auth state listener
    this.log('⏳ Waiting for authentication state...');
    const authReady = await ensureAuthReady(this.options.timeoutMs);
    
    if (authReady && getCurrentAuthUser()) {
      this.log('✅ Authentication recovered via state listener');
      return {
        success: true,
        authenticated: true,
        attempts: 1,
        totalTime: Date.now() - startTime,
        recoveryMethod: 'state-listener'
      };
    }

    // Step 3: Manual authentication with retry logic
    this.log('🔐 Attempting manual authentication recovery...');
    
    for (attempts = 1; attempts <= this.options.maxRetries; attempts++) {
      try {
        this.log(`🔐 Manual authentication attempt ${attempts}/${this.options.maxRetries}...`);
        
        if (!auth) {
          throw new Error('Firebase Auth not initialized');
        }

        const userCredential = await signInAnonymously(auth);
        
        this.log('✅ Manual authentication successful', {
          uid: userCredential.user.uid,
          isAnonymous: userCredential.user.isAnonymous
        });

        return {
          success: true,
          authenticated: true,
          attempts,
          totalTime: Date.now() - startTime,
          recoveryMethod: 'manual-signin'
        };

      } catch (error: unknown) {
        const firebaseError = error as { code?: string; message?: string };
        
        this.log(`❌ Authentication attempt ${attempts} failed:`, error);

        // Handle specific error types
        if (firebaseError.code === 'auth/operation-not-allowed') {
          this.log('🚨 Anonymous authentication is not enabled in Firebase Console!');
          return {
            success: false,
            authenticated: false,
            attempts,
            totalTime: Date.now() - startTime,
            error: 'Anonymous authentication not enabled',
            recoveryMethod: 'failed'
          };
        }

        if (firebaseError.code === 'auth/network-request-failed') {
          this.log(`🌐 Network request failed on attempt ${attempts}`);
          
          if (attempts < this.options.maxRetries) {
            // Exponential backoff with jitter for network issues
            const delay = this.options.baseDelay * Math.pow(2, attempts - 1) + Math.random() * 1000;
            this.log(`⏳ Network error - waiting ${Math.round(delay)}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // For other errors or final attempt
        if (attempts === this.options.maxRetries) {
          this.log('❌ All authentication recovery attempts failed');
          return {
            success: false,
            authenticated: false,
            attempts,
            totalTime: Date.now() - startTime,
            error: firebaseError.message || 'Authentication failed',
            recoveryMethod: 'failed'
          };
        }

        // Standard retry delay for non-network errors
        const delay = this.options.baseDelay * attempts;
        this.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should not reach here, but handle gracefully
    return {
      success: false,
      authenticated: false,
      attempts,
      totalTime: Date.now() - startTime,
      error: 'Unexpected recovery failure',
      recoveryMethod: 'failed'
    };
  }

  /**
   * Quick authentication check with minimal overhead
   */
  async quickCheck(): Promise<boolean> {
    // SSR Guard: Return false on server-side
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      // Check current state without triggering recovery
      if (isAuthStateReady() && getCurrentAuthUser()) {
        return true;
      }

      // Quick auth state wait (shorter timeout)
      const authReady = await ensureAuthReady(5000);
      return authReady && !!getCurrentAuthUser();
    } catch (error) {
      this.log('⚠️ Quick auth check failed:', error);
      return false;
    }
  }

  /**
   * Execute operation with authentication recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    // First, try the operation directly
    try {
      return await operation();
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      
      // Check if it's an authentication error
      if (this.isAuthError(firebaseError)) {
        this.log(`🔄 Authentication error in ${operationName}, attempting recovery...`);
        
        const recovery = await this.recover();
        
        if (recovery.success) {
          this.log(`✅ Authentication recovered, retrying ${operationName}...`);
          return await operation();
        } else {
          this.log(`❌ Authentication recovery failed for ${operationName}`);
          throw new Error(`Authentication recovery failed: ${recovery.error}`);
        }
      }

      // Re-throw non-auth errors
      throw error;
    }
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthError(error: { code?: string }): boolean {
    const authErrorCodes = [
      'permission-denied',
      'unauthenticated',
      'auth/user-not-found',
      'auth/invalid-user-token',
      'auth/user-token-expired',
      'auth/network-request-failed'
    ];

    return authErrorCodes.some(code => 
      error.code?.includes(code) || 
      error.code?.toLowerCase().includes('permission')
    );
  }

  /**
   * Conditional logging based on options
   */
  private log(message: string, data?: unknown): void {
    if (this.options.enableLogging) {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
  }
}

// Export singleton instance for convenience
export const authRecovery = new AuthRecovery();

// Export utility functions
export const recoverAuthentication = () => authRecovery.recover();
export const quickAuthCheck = () => authRecovery.quickCheck();
export const executeWithAuthRecovery = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => authRecovery.executeWithRecovery(operation, operationName);
