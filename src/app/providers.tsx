'use client';

import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HeroUIProvider, ToastProvider } from '@heroui/react';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { getBrowserQueryClient } from '@/lib/queryClient';

import { defaultToastClassNames } from '@/utils/toastStyles';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = React.useState(() => getBrowserQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider>
        <ToastProvider
          placement="top-center"
          toastOffset={16}
          maxVisibleToasts={3}
          toastProps={{
            color: 'default',
            variant: 'flat',
            classNames: defaultToastClassNames,
          }}
        />
        <ProcessingProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ProcessingProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  );
}
