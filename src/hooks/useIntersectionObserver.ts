import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  root?: Element | null;
  rootMargin?: string;
  freezeOnceVisible?: boolean;
}

/**
 * Custom hook for Intersection Observer API
 * PERFORMANCE FIX #5: Lazy load components when they enter viewport
 * 
 * @param options - Intersection Observer options
 * @returns [ref, isIntersecting, entry] - Ref to attach to element, visibility state, and observer entry
 */
export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T | null>, boolean, IntersectionObserverEntry | null] {
  const {
    threshold = 0.1,
    root = null,
    rootMargin = '50px',
    freezeOnceVisible = false
  } = options;

  const elementRef = useRef<T | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  const frozen = freezeOnceVisible && isIntersecting;

  useEffect(() => {
    const element = elementRef.current;
    const hasIOSupport = !!window.IntersectionObserver;

    if (!hasIOSupport || frozen || !element) {
      return;
    }

    const observerCallback: IntersectionObserverCallback = (entries) => {
      const [entry] = entries;
      setEntry(entry);
      setIsIntersecting(entry.isIntersecting);
    };

    const observerOptions: IntersectionObserverInit = {
      threshold,
      root,
      rootMargin
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, frozen]);

  return [elementRef, isIntersecting, entry];
}

/**
 * Simplified hook that only returns visibility state
 * PERFORMANCE FIX #5: Optimized for lazy loading use case
 */
export function useIsVisible<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T | null>, boolean] {
  const [ref, isIntersecting] = useIntersectionObserver<T>(options);
  return [ref, isIntersecting];
}

