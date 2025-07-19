"use client";

import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import Image from 'next/image';

interface OptimizedVideoDemoProps {
  src: string;
  alt: string;
  className?: string;
  poster?: string;
  posterLight?: string;
  posterDark?: string;
}

export default function OptimizedVideoDemo({
  src,
  alt,
  className = "",
  poster,
  posterLight,
  posterDark
}: OptimizedVideoDemoProps) {
  const { theme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userClicked, setUserClicked] = useState(false);

  // Track when component has mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine which poster to use based on theme
  // Use light theme poster during SSR and before hydration to prevent mismatch
  const getPosterSrc = () => {
    if (poster) return poster;

    // Before hydration, always use light theme poster to match server render
    if (!mounted) {
      return posterLight || posterDark;
    }

    // After hydration, use theme-specific poster
    if (theme === 'dark' && posterDark) return posterDark;
    if (theme === 'light' && posterLight) return posterLight;
    return posterLight || posterDark; // Fallback to any available poster
  };

  const posterSrc = getPosterSrc();



  // Reset poster error and iframe loaded state when theme changes to allow re-rendering with new poster
  // Only reset after component has mounted to prevent hydration issues
  useEffect(() => {
    if (mounted) {
      setPosterError(false);
      setIframeLoaded(false);
    }
  }, [theme, posterSrc, mounted]);



  const handleLoadedData = () => {
    setIframeLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLIFrameElement, Event>) => {
    console.error('Iframe failed to load:', src, e);
  };

  const handlePosterError = () => {
    setPosterError(true);
  };

  const handlePosterClick = () => {
    setUserClicked(true);
  };

  return (
    <div
      className={`relative w-full overflow-hidden aspect-video ${className}`}
      suppressHydrationWarning // Prevent hydration warnings from theme-dependent content
    >
      {/* Poster image - visible until user clicks and iframe loads */}
      {posterSrc && !posterError && (!userClicked || !iframeLoaded) && (
        <div
          className="absolute inset-0 w-full h-full cursor-pointer group"
          style={{ zIndex: 1 }}
          onClick={handlePosterClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePosterClick();
            }
          }}
          aria-label={`Play video: ${alt}`}
        >
          <Image
            src={posterSrc}
            alt={alt}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={handlePosterError}
            loading="eager"
            priority={true}
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw"
            style={{
              objectFit: 'cover'
            }}
            suppressHydrationWarning
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 group-hover:bg-opacity-30 transition-all duration-300">
            <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
              <div className="w-0 h-0 border-l-[16px] border-l-gray-800 border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Only render iframe after user clicks */}
      {userClicked && (
        <iframe
          ref={iframeRef}
          src={src}
          title={alt}
          className="w-full h-full relative z-10"
          allowFullScreen
          loading="lazy"
          onLoad={handleLoadedData}
          onError={handleError}
          style={{
            backgroundColor: posterError || !posterSrc ? '#f3f4f6' : 'transparent',
            border: 'none',
          }}
          // Accessibility
          tabIndex={0}
          aria-label={alt}
        />
      )}

      {/* Loading indicator - only show if user clicked but iframe hasn't loaded yet */}
      {userClicked && !iframeLoaded && (posterError || !posterSrc) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
}
