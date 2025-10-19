'use client';

import React, { useCallback } from 'react';
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
 * - WebP format support with PNG fallback
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
  // Auto-convert PNG sources to WebP with fallback
  const getOptimizedSrc = useCallback((originalSrc: string) => {
    // Only convert PNG files to WebP, leave SVG and other formats as-is
    if (originalSrc.endsWith('.png')) {
      return originalSrc.replace('.png', '.webp');
    }
    return originalSrc;
  }, []);

  const optimizedSrc = getOptimizedSrc(src);
  const fallbackSrc = src; // Original PNG as fallback

  const handleLoad = useCallback(() => {
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
    onError?.();
  }, [onError]);

  // Generate optimized blur data URL if not provided
  const defaultBlurDataURL = blurDataURL ||
    `data:image/svg+xml;base64,${btoa(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f3f4f6"/>
      </svg>`
    )}`;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <picture>
        {/* WebP source for modern browsers */}
        <source srcSet={optimizedSrc} type="image/webp" />
        {/* PNG fallback for older browsers */}
        <Image
          src={fallbackSrc}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          fetchPriority={fetchPriority}
          quality={quality}
          sizes={sizes}
          placeholder={placeholder}
          blurDataURL={defaultBlurDataURL}
          className="w-full h-auto object-cover"
          onLoad={handleLoad}
          onError={handleError}
          style={style}
        />
      </picture>
    </div>
  );
};

export default OptimizedImage;
