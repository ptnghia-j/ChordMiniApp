'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
  sizes?: string;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  style?: React.CSSProperties;
  'data-lcp-image'?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Optimized Image component with performance enhancements
 * - WebP format support with fallback
 * - Responsive sizing
 * - Lazy loading optimization
 * - Error handling with fallback
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  priority = false,
  fetchPriority = 'auto',
  className = '',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  quality = 85,
  placeholder = 'blur',
  blurDataURL,
  style,
  'data-lcp-image': dataLcpImage,
  onLoad,
  onError
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);

    // Optimize LCP for critical images
    if (dataLcpImage && priority) {
      // Mark LCP completion for performance monitoring
      if (typeof window !== 'undefined' && 'performance' in window && 'mark' in performance) {
        performance.mark('lcp-image-loaded');
      }
    }

    onLoad?.();
  }, [onLoad, dataLcpImage, priority]);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Generate optimized blur data URL if not provided
  const defaultBlurDataURL = blurDataURL ||
    `data:image/svg+xml;base64,${btoa(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f3f4f6"/>
      </svg>`
    )}`;

  // Error fallback
  if (hasError) {
    return (
      <div 
        className={`bg-gray-200 dark:bg-gray-700 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <span className="text-gray-500 text-sm">Image unavailable</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        fetchPriority={fetchPriority}
        quality={quality}
        sizes={sizes}
        placeholder={placeholder}
        blurDataURL={defaultBlurDataURL}
        className={`transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={handleLoad}
        onError={handleError}
        data-lcp-image={dataLcpImage}
        style={{
          objectFit: 'cover',
          width: '100%',
          height: 'auto',
          ...style
        }}
      />
      
      {/* Loading skeleton */}
      {!isLoaded && !hasError && (
        <div 
          className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse"
          style={{ width, height }}
        />
      )}
    </div>
  );
};

export default OptimizedImage;
