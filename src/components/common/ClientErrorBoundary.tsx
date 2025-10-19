'use client';

import React from 'react';
import GlobalErrorBoundary from './GlobalErrorBoundary';

/**
 * Client-side wrapper for the GlobalErrorBoundary component
 * This is needed because error boundaries can only be used in client components
 */
export default function ClientErrorBoundary({ children }: { children: React.ReactNode }) {
  return <GlobalErrorBoundary>{children}</GlobalErrorBoundary>;
}
