/**
 * Firebase Connection Manager
 * Handles Firebase connection staleness and recovery after periods of inactivity
 *
 * MIGRATION: Updated to use @/config/firebase instead of @/lib/firebase-lazy
 */

let lastActivityTime = Date.now();
let connectionHealthy = true;

/**
 * Update the last activity timestamp
 */
export const updateLastActivity = (): void => {
  lastActivityTime = Date.now();
};

/**
 * Check if Firebase connection might be stale due to inactivity
 */
export const isConnectionPotentiallyStale = (): boolean => {
  const inactivityPeriod = Date.now() - lastActivityTime;
  // Consider connection potentially stale after 5 minutes of inactivity
  return inactivityPeriod > 5 * 60 * 1000;
};

/**
 * Test Firebase connection health with a lightweight operation
 */
export const testFirebaseConnection = async (): Promise<boolean> => {
  try {
    const { getFirestoreInstance } = await import('@/config/firebase');
    const firestore = await getFirestoreInstance();

    // Simple connection test - just ensure we can get the instance
    if (!firestore) {
      throw new Error('Firestore instance not available');
    }

    // INACTIVITY FIX: Test actual connectivity with a lightweight operation
    // This will fail fast if the connection is stale
    try {
      await firestore.app.options; // Quick property access that requires active connection
    } catch (connectivityError) {
      console.warn('Firebase connectivity test failed, connection may be stale:', connectivityError);
      throw connectivityError;
    }

    connectionHealthy = true;
    updateLastActivity();
    return true;
  } catch (error) {
    console.warn('Firebase connection test failed:', error);
    connectionHealthy = false;
    return false;
  }
};

/**
 * Refresh Firebase connection if it's potentially stale
 */
export const refreshFirebaseConnectionIfNeeded = async (): Promise<boolean> => {
  if (!isConnectionPotentiallyStale() && connectionHealthy) {
    return true; // Connection is fresh and healthy
  }

  console.log('🔄 Refreshing potentially stale Firebase connection...');

  try {
    // Force re-initialization of Firebase
    const { initializeFirebaseApp } = await import('@/config/firebase');
    await initializeFirebaseApp();
    
    // Test the connection
    const isHealthy = await testFirebaseConnection();
    
    if (isHealthy) {
      console.log('✅ Firebase connection refreshed successfully');
      return true;
    } else {
      console.warn('⚠️ Firebase connection refresh failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error refreshing Firebase connection:', error);
    connectionHealthy = false;
    return false;
  }
};

/**
 * Enhanced cache operation wrapper that handles connection staleness
 */
export const withFirebaseConnectionCheck = async <T>(
  operation: () => Promise<T>,
  operationName: string = 'Firebase operation'
): Promise<T> => {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Refresh connection if needed
      const connectionReady = await refreshFirebaseConnectionIfNeeded();

      if (!connectionReady) {
        throw new Error(`Firebase connection not ready for ${operationName}`);
      }

      // Execute the operation with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} timeout after 10 seconds`)), 10000)
      );

      const result = await Promise.race([operation(), timeoutPromise]);

      // Update activity timestamp on successful operation
      updateLastActivity();

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Attempt ${attempt}/${maxRetries} failed for ${operationName}:`, lastError.message);

      // Mark connection as potentially unhealthy
      connectionHealthy = false;

      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        continue;
      }

      // All attempts failed
      throw lastError;
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error(`All attempts failed for ${operationName}`);
};

/**
 * Initialize connection monitoring
 */
export const initializeConnectionMonitoring = (): void => {
  if (typeof window === 'undefined') return;

  // Update activity on user interactions
  const updateActivity = () => updateLastActivity();
  
  window.addEventListener('click', updateActivity);
  window.addEventListener('keydown', updateActivity);
  window.addEventListener('scroll', updateActivity);
  
  // Periodic connection health check (every 2 minutes)
  setInterval(async () => {
    if (isConnectionPotentiallyStale()) {
      await testFirebaseConnection();
    }
  }, 2 * 60 * 1000);
};
