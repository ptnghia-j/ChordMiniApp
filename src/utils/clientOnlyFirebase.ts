/**
 * Client-Only Firebase Operations
 *
 * This module provides safe wrappers for Firebase operations that
 * only run on the client-side, preventing SSR issues.
 */

/**
 * Safely execute Firebase operations only on client-side
 */
export async function executeClientOnly<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  operationName: string = 'Firebase operation'
): Promise<T> {
  // SSR Guard: Return fallback on server-side
  if (typeof window === 'undefined') {
    console.log(`🔧 ${operationName} skipped on server-side`);
    return fallbackValue;
  }

  try {
    return await operation();
  } catch (error) {
    console.error(`❌ ${operationName} failed:`, error);
    return fallbackValue;
  }
}

/**
 * Safely check if we're in a client environment
 */
export function isClientSide(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely access localStorage only on client-side
 */
export function safeLocalStorage() {
  if (typeof window === 'undefined') {
    // Return mock localStorage for SSR
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    };
  }
  return window.localStorage;
}

/**
 * Safely access sessionStorage only on client-side
 */
export function safeSessionStorage() {
  if (typeof window === 'undefined') {
    // Return mock sessionStorage for SSR
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    };
  }
  return window.sessionStorage;
}

/**
 * Dynamically import Firebase auth operations
 */
export async function importFirebaseAuth() {
  if (typeof window === 'undefined') {
    throw new Error('Firebase Auth can only be imported on client-side');
  }

  try {
    const { auth, ensureAuthReady, getCurrentAuthUser, isAuthStateReady } = await import('@/config/firebase');
    return { auth, ensureAuthReady, getCurrentAuthUser, isAuthStateReady };
  } catch (error) {
    console.error('❌ Failed to import Firebase Auth:', error);
    throw error;
  }
}

/**
 * Dynamically import Firebase storage operations
 */
export async function importFirebaseStorage() {
  if (typeof window === 'undefined') {
    throw new Error('Firebase Storage can only be imported on client-side');
  }

  try {
    const { storage, db } = await import('@/config/firebase');
    return { storage, db };
  } catch (error) {
    console.error('❌ Failed to import Firebase Storage:', error);
    throw error;
  }
}

/**
 * Safely execute authentication operations with proper error handling
 */
export async function safeAuthOperation<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  operationName: string = 'Auth operation'
): Promise<T> {
  return executeClientOnly(
    async () => {
      const { ensureAuthReady } = await importFirebaseAuth();
      
      // Ensure auth is ready before operation
      const authReady = await ensureAuthReady(10000);
      if (!authReady) {
        console.warn(`⚠️ ${operationName}: Auth not ready, using fallback`);
        return fallbackValue;
      }

      return await operation();
    },
    fallbackValue,
    operationName
  );
}

/**
 * Check if code is running on client-side
 */
export function useIsClientSide(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Additional check for document to ensure we're fully in browser environment
  return typeof document !== 'undefined';
}


