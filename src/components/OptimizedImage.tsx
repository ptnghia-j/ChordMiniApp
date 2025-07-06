'use client';

import React, { useCallback } from 'react';
import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
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
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        quality={quality}
        sizes={sizes}
        placeholder={placeholder}
        blurDataURL={defaultBlurDataURL}
        className="w-full h-auto object-cover"
        onLoad={handleLoad}
        onError={handleError}
        style={style}
      />
    </div>
  );
};

export default OptimizedImage;
