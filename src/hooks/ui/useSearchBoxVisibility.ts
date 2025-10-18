'use client';

import { useState, useEffect, useRef } from 'react';

export const useSearchBoxVisibility = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldShowStickySearch, setShouldShowStickySearch] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const element = elementRef.current;
      if (!element) {
        // Fallback to scroll position if element not available
        const scrollY = window.scrollY;
        const shouldShow = scrollY > 300; // Show after scrolling 300px

        if (shouldShow !== shouldShowStickySearch) {
          setShouldShowStickySearch(shouldShow);
          setIsVisible(!shouldShow);
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      // Navigation height is 48px (h-12), trigger when entire search box has scrolled past nav
      const navHeight = 48;
      const isElementHiddenUnderNav = rect.bottom < navHeight;

      if (isElementHiddenUnderNav !== shouldShowStickySearch) {
        setShouldShowStickySearch(isElementHiddenUnderNav);
        setIsVisible(!isElementHiddenUnderNav);
      }
    };

    // Initial check
    handleScroll();

    // Add scroll listener with throttling
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', throttledScroll);
    };
  }, [shouldShowStickySearch]);

  return {
    elementRef,
    isVisible,
    shouldShowStickySearch,
  };
};
