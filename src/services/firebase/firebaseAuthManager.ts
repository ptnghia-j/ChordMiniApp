/**
 * Firebase Authentication Manager
 * 
 * Handles Firebase authentication state during cold starts and inactivity periods
 * to prevent permission denied errors during cache operations.
 */

import { auth } from '@/config/firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

export class FirebaseAuthManager {
  private static instance: FirebaseAuthManager;
  private authStateReady = false;
  private authStatePromise: Promise<void> | null = null;
  private currentUser: User | null = null;
  private authStateListeners: Array<(user: User | null) => void> = [];

  private constructor() {
    this.initializeAuthStateListener();
  }

  public static getInstance(): FirebaseAuthManager {
    if (!FirebaseAuthManager.instance) {
      FirebaseAuthManager.instance = new FirebaseAuthManager();
    }
    return FirebaseAuthManager.instance;
  }

  /**
   * Initialize authentication state listener
   */
  private initializeAuthStateListener(): void {
    if (!auth) {
      console.warn('Firebase auth not available');
      return;
    }

    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.authStateReady = true;

      // Notify listeners
      this.authStateListeners.forEach(listener => {
        try {
          listener(user);
        } catch (error) {
          console.error('Error in auth state listener:', error);
        }
      });
    });
  }

  /**
   * Ensure user is authenticated (sign in anonymously if needed)
   */
  async ensureAuthenticated(): Promise<boolean> {
    if (!auth) {
      console.warn('Firebase auth not available');
      return false;
    }

    // If we already have an auth state promise, wait for it
    if (this.authStatePromise) {
      await this.authStatePromise;
    }

    // If already authenticated, return true
    if (this.currentUser) {
      return true;
    }

    // Create a new authentication promise
    this.authStatePromise = this.performAuthentication();
    
    try {
      await this.authStatePromise;
      return this.currentUser !== null;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    } finally {
      this.authStatePromise = null;
    }
  }

  /**
   * Perform anonymous authentication
   */
  private async performAuthentication(): Promise<void> {
    try {
      console.log('🔐 Attempting anonymous authentication...');
      const userCredential = await signInAnonymously(auth!);
      this.currentUser = userCredential.user;
      console.log('✅ Anonymous authentication successful');
    } catch (error) {
      console.error('❌ Anonymous authentication failed:', error);
      throw error;
    }
  }

  /**
   * Wait for authentication state to be ready
   */
  async waitForAuthState(timeoutMs: number = 5000): Promise<boolean> {
    if (this.authStateReady) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ Auth state timeout reached');
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.addAuthStateListener(() => {
        clearTimeout(timeout);
        resolve(true);
      });

      // Clean up listener after timeout
      setTimeout(() => {
        unsubscribe();
      }, timeoutMs + 100);
    });
  }

  /**
   * Add authentication state listener
   */
  addAuthStateListener(listener: (user: User | null) => void): () => void {
    this.authStateListeners.push(listener);
    
    // If auth state is already ready, call listener immediately
    if (this.authStateReady) {
      setTimeout(() => listener(this.currentUser), 0);
    }

    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(listener);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current authentication state
   */
  getAuthState(): { ready: boolean; authenticated: boolean; user: User | null } {
    return {
      ready: this.authStateReady,
      authenticated: this.currentUser !== null,
      user: this.currentUser
    };
  }

  /**
   * Force refresh authentication token
   */
  async refreshAuthToken(): Promise<boolean> {
    if (!this.currentUser) {
      return await this.ensureAuthenticated();
    }

    try {
      await this.currentUser.getIdToken(true); // Force refresh
      console.log('🔄 Auth token refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to refresh auth token:', error);
      // Try to re-authenticate
      this.currentUser = null;
      return await this.ensureAuthenticated();
    }
  }

  /**
   * Check if current error is authentication-related
   */
  isAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const authErrorPatterns = [
      'permission-denied',
      'PERMISSION_DENIED',
      'Missing or insufficient permissions',
      'auth',
      'authentication',
      'unauthenticated'
    ];

    return authErrorPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Execute operation with authentication retry
   */
  async executeWithAuthRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure authentication before operation
        if (attempt === 1) {
          await this.ensureAuthenticated();
        }

        return await operation();
      } catch (error) {
        if (this.isAuthError(error) && attempt < maxRetries) {
          console.warn(`⚠️ Auth error on attempt ${attempt}/${maxRetries}, retrying...`);
          
          // Wait and refresh authentication
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          await this.refreshAuthToken();
          
          continue;
        }

        // If not an auth error or we've exhausted retries, throw the error
        throw error;
      }
    }

    throw new Error('Should never reach here');
  }
}

// Export singleton instance
export const firebaseAuthManager = FirebaseAuthManager.getInstance();
