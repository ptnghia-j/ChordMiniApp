'use client';

import { useEffect } from 'react';

/**
 * Service Worker Registration Component
 * Handles registration of the service worker for caching and offline functionality
 */
const ServiceWorkerRegistration: React.FC = () => {
  useEffect(() => {
    // Only register service worker in production and in browser environment
    if (
      typeof window !== 'undefined' && 
      'serviceWorker' in navigator && 
      process.env.NODE_ENV === 'production'
    ) {
      const registerServiceWorker = async () => {
        try {
          console.log('🔧 Registering service worker...');
          
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none' // Always check for updates
          });

          console.log('✅ Service worker registered successfully:', registration.scope);

          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              console.log('🔄 New service worker installing...');
              
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🆕 New service worker installed, refresh to update');
                  
                  // Optionally show a notification to the user
                  // You could dispatch a custom event here to show an update banner
                  window.dispatchEvent(new CustomEvent('sw-update-available'));
                }
              });
            }
          });

          // Check for existing service worker updates (with enhanced error handling)
          try {
            if (registration && typeof registration.update === 'function') {
              await registration.update();
              console.log('🔄 Service worker update check completed');
            } else {
              console.warn('⚠️ Service worker registration is null or update method unavailable');
            }
          } catch (updateError) {
            // This error is common and usually harmless - don't log it as an error
            console.debug('Service worker update check failed (this is usually harmless):', updateError);
          }

        } catch (error) {
          console.error('❌ Service worker registration failed:', error);
        }
      };

      // Register service worker after a short delay to not block initial page load
      const timeoutId = setTimeout(registerServiceWorker, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, []);

  // Handle service worker messages
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
          console.log('📦 Cache updated:', event.data.payload);
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, []);

  return null; // This component doesn't render anything
};

export default ServiceWorkerRegistration;
