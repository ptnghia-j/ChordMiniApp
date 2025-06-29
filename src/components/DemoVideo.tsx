'use client';

import React, { useState, useRef, useEffect } from 'react';
import OptimizedImage from './OptimizedImage';

interface DemoVideoProps {
  videoSrc: string;
  videoDarkSrc?: string;
  posterSrc: string;
  posterDarkSrc?: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  theme?: 'light' | 'dark';
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

/**
 * Demo Video Component with fallback to image
 * Optimized for better browser compatibility and performance
 */
const DemoVideo: React.FC<DemoVideoProps> = ({
  videoSrc,
  videoDarkSrc,
  posterSrc,
  posterDarkSrc,
  alt,
  width = 800,
  height = 450,
  className = '',
  theme = 'light',
  autoPlay = true,
  loop = true,
  muted = true
}) => {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine which sources to use based on theme
  const currentVideoSrc = theme === 'dark' && videoDarkSrc ? videoDarkSrc : videoSrc;
  const currentPosterSrc = theme === 'dark' && posterDarkSrc ? posterDarkSrc : posterSrc;

  // Handle video load success
  const handleVideoLoad = () => {
    setIsVideoLoaded(true);
    setHasVideoError(false);
  };

  // Handle video load error
  const handleVideoError = () => {
    console.warn(`Failed to load video: ${currentVideoSrc}`);
    setHasVideoError(true);
    setIsVideoLoaded(false);
  };

  // Reset error state when video source changes
  useEffect(() => {
    setHasVideoError(false);
    setIsVideoLoaded(false);
  }, [currentVideoSrc]);

  // Attempt to play video when it's loaded and autoPlay is enabled
  useEffect(() => {
    if (isVideoLoaded && autoPlay && videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn('Auto-play was prevented:', error);
          // Auto-play was prevented, but this is not an error
          // The video will still be available for manual play
        });
      }
    }
  }, [isVideoLoaded, autoPlay]);

  // If video failed to load or is not supported, show image fallback
  if (hasVideoError) {
    return (
      <OptimizedImage
        src={currentPosterSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        priority={false}
      />
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: `${width}/${height}` }}>
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${className}`}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        poster={currentPosterSrc}
        onLoadedData={handleVideoLoad}
        onError={handleVideoError}
        preload="metadata"
      >
        {/* MP4 source - best compatibility */}
        <source 
          src={currentVideoSrc.replace(/\.(mov|webm)$/, '.mp4')} 
          type="video/mp4" 
        />
        
        {/* WebM source - better compression for modern browsers */}
        <source 
          src={currentVideoSrc.replace(/\.(mov|mp4)$/, '.webm')} 
          type="video/webm" 
        />
        
        {/* Original source if it's not MP4 or WebM */}
        {!currentVideoSrc.match(/\.(mp4|webm)$/) && (
          <source 
            src={currentVideoSrc} 
            type={`video/${currentVideoSrc.split('.').pop()}`}
          />
        )}
        
        {/* Fallback message for browsers that don't support video */}
        <OptimizedImage
          src={currentPosterSrc}
          alt={alt}
          width={width}
          height={height}
          className="w-full h-auto"
          priority={false}
        />
      </video>
      
      {/* Loading indicator */}
      {!isVideoLoaded && !hasVideoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
};

export default DemoVideo;
