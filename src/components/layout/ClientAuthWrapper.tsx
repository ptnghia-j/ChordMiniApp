'use client';

import { useEffect, useState } from 'react';
import { getCurrentAuthUser, isAuthStateReady } from '@/config/firebase';

interface ClientAuthWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-side authentication wrapper that ensures Firebase auth
 * is properly initialized before rendering children.
 * 
 * This component:
 * - Only runs on the client-side (prevents SSR issues)
 * - Waits for Firebase auth to be ready
 * - Provides loading state during auth initialization
 * - Ensures window object is available for Firebase operations
 */
export default function ClientAuthWrapper({ children, fallback }: ClientAuthWrapperProps) {
  const [isClient, setIsClient] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Mark as client-side
    setIsClient(true);

    // Initialize authentication
    const initAuth = async () => {
      try {
        // Wait for auth to be ready
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait
        
        while (!isAuthStateReady() && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }

        if (isAuthStateReady()) {
          console.log('✅ Client-side auth ready:', {
            hasUser: !!getCurrentAuthUser(),
            uid: getCurrentAuthUser()?.uid
          });
          setAuthReady(true);
        } else {
          console.warn('⚠️ Auth initialization timeout after 30 seconds');
          setAuthError('Authentication initialization timeout');
          // Still set ready to true to allow app to continue
          setAuthReady(true);
        }
      } catch (error) {
        console.error('❌ Client auth initialization error:', error);
        setAuthError(error instanceof Error ? error.message : 'Unknown auth error');
        // Set ready to true to allow app to continue even with auth errors
        setAuthReady(true);
      }
    };

    initAuth();
  }, []);

  // Show loading state during SSR or auth initialization
  if (!isClient || !authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {fallback || (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">
              {!isClient ? 'Loading...' : 'Initializing authentication...'}
            </p>
            {authError && (
              <p className="text-red-600 text-sm mt-2">
                Auth Error: {authError}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Hook to check if we're in a client-side environment
 */
export function useIsClient() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

/**
 * Hook to safely access Firebase auth on client-side only
 */
export function useClientAuth() {
  const [authState, setAuthState] = useState({
    ready: false,
    user: null as unknown,
    error: null as string | null
  });

  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;

    const checkAuth = () => {
      try {
        setAuthState({
          ready: isAuthStateReady(),
          user: getCurrentAuthUser(),
          error: null
        });
      } catch (error) {
        setAuthState({
          ready: false,
          user: null,
          error: error instanceof Error ? error.message : 'Auth check failed'
        });
      }
    };

    // Initial check
    checkAuth();

    // Set up periodic checks (every 5 seconds)
    const interval = setInterval(checkAuth, 5000);

    return () => clearInterval(interval);
  }, [isClient]);

  return authState;
}
