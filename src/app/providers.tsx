'use client';

import React from 'react';
import { HeroUIProvider } from '@heroui/react';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import { ThemeProvider } from '../contexts/ThemeContext';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <HeroUIProvider>
      <ProcessingProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </ProcessingProvider>
    </HeroUIProvider>
  );
}
