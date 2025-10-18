'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseScrollDirectionOptions {
  threshold?: number;
  debounceMs?: number;
}

interface ScrollState {
  scrollY: number;
  scrollDirection: 'up' | 'down' | null;
  isScrollingUp: boolean;
  isScrollingDown: boolean;
  isAtTop: boolean;
}

export const useScrollDirection = (options: UseScrollDirectionOptions = {}): ScrollState => {
  const { threshold = 10, debounceMs = 100 } = options;
  
  const [scrollState, setScrollState] = useState<ScrollState>({
    scrollY: 0,
    scrollDirection: null,
    isScrollingUp: false,
    isScrollingDown: false,
    isAtTop: true,
  });

  const updateScrollDirection = useCallback(() => {
    const scrollY = window.scrollY;
    const direction = scrollY > scrollState.scrollY ? 'down' : 'up';
    const isAtTop = scrollY < threshold;
    
    // Only update if scroll direction changed significantly
    if (Math.abs(scrollY - scrollState.scrollY) > threshold) {
      setScrollState({
        scrollY,
        scrollDirection: direction,
        isScrollingUp: direction === 'up',
        isScrollingDown: direction === 'down',
        isAtTop,
      });
    }
  }, [scrollState.scrollY, threshold]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateScrollDirection, debounceMs);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [updateScrollDirection, debounceMs]);

  return scrollState;
};
