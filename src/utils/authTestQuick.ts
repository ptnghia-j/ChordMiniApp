/**
 * Quick Authentication Test
 * 
 * Simple test to verify the authentication system works correctly
 * after fixing the TDZ error.
 */

export async function quickAuthTest(): Promise<boolean> {
  try {
    console.log('🧪 Running quick authentication test...');
    
    // Test 1: Import Firebase config
    const { auth, waitForAuthState, ensureAuthReady, isAuthStateReady } = await import('@/config/firebase');
    
    if (!auth) {
      console.error('❌ Firebase auth not available');
      return false;
    }
    
    console.log('✅ Firebase auth instance available');
    
    // Test 2: Check initial auth state
    const initialState = isAuthStateReady();
    console.log(`🔍 Initial auth state ready: ${initialState}`);
    
    // Test 3: Wait for auth state (with timeout)
    console.log('⏳ Waiting for auth state...');
    const authStateReady = await waitForAuthState(5000);
    console.log(`🔍 Auth state ready after wait: ${authStateReady}`);
    
    // Test 4: Ensure auth is ready
    console.log('🔐 Ensuring authentication is ready...');
    const authReady = await ensureAuthReady();
    console.log(`🔍 Authentication ensured: ${authReady}`);
    
    // Test 5: Final state check
    const finalState = isAuthStateReady();
    console.log(`🔍 Final auth state ready: ${finalState}`);
    
    if (authReady && finalState) {
      console.log('✅ Quick authentication test PASSED');
      return true;
    } else {
      console.warn('⚠️ Quick authentication test completed but auth not fully ready');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Quick authentication test FAILED:', error);
    return false;
  }
}

/**
 * Test cache operation with the new authentication system
 */
export async function quickCacheTest(): Promise<boolean> {
  try {
    console.log('🧪 Running quick cache operation test...');
    
    // Import the cache service
    const { firebaseStorageSimplified } = await import('@/services/firebaseStorageSimplified');
    
    // Test data
    const testData = {
      videoId: 'dQw4w9WgXcQ',
      audioUrl: 'https://example.com/test.mp3',
      title: 'Quick Test Audio',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      channelTitle: 'Test Channel',
      duration: 180,
      fileSize: 1024000,
      extractionService: 'quick-test',
      extractionTimestamp: Date.now()
    };
    
    // Attempt cache operation
    console.log('💾 Attempting cache operation...');
    const success = await firebaseStorageSimplified.saveAudioMetadata(testData);
    
    if (success) {
      console.log('✅ Quick cache test PASSED');
      return true;
    } else {
      console.warn('⚠️ Quick cache test completed but operation failed (this may be expected during cold starts)');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Quick cache test FAILED:', error);
    return false;
  }
}

/**
 * Run both authentication and cache tests
 */
export async function runQuickTests(): Promise<{ auth: boolean; cache: boolean }> {
  console.log('🚀 Starting quick authentication and cache tests...');
  
  const authResult = await quickAuthTest();
  const cacheResult = await quickCacheTest();
  
  console.log('📊 Quick test results:', {
    authentication: authResult ? '✅ PASSED' : '❌ FAILED',
    cache: cacheResult ? '✅ PASSED' : '⚠️ FAILED (may be expected)'
  });
  
  return {
    auth: authResult,
    cache: cacheResult
  };
}
