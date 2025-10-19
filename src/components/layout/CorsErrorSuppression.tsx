'use client';

import { useEffect } from 'react';
import { initializeCorsErrorSuppression } from '@/utils/corsErrorSuppression';

/**
 * Client-side component that initializes CORS error suppression
 * This component should be included once in the root layout
 */
export default function CorsErrorSuppression() {
  useEffect(() => {
    // Initialize CORS error suppression on the client side
    initializeCorsErrorSuppression();
  }, []);

  // This component doesn't render anything
  return null;
}
