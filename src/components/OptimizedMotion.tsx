'use client';

import React, { useState, useEffect, ReactNode } from 'react';

/**
 * Lightweight motion component that uses CSS animations instead of Framer Motion
 * for better performance and smaller bundle size
 */

interface OptimizedMotionProps {
  children: ReactNode;
  className?: string;
  initial?: 'hidden' | 'visible';
  animate?: 'hidden' | 'visible';
  transition?: {
    duration?: number;
    delay?: number;
    ease?: string;
  };
  style?: React.CSSProperties;
}

const OptimizedMotion: React.FC<OptimizedMotionProps> = ({
  children,
  className = '',
  initial = 'hidden',
  animate = 'visible',
  transition = { duration: 0.3, delay: 0, ease: 'ease-out' },
  style = {}
}) => {
  const [isVisible, setIsVisible] = useState(initial === 'visible');

  useEffect(() => {
    if (animate === 'visible' && !isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, (transition.delay || 0) * 1000);
      return () => clearTimeout(timer);
    } else if (animate === 'hidden' && isVisible) {
      setIsVisible(false);
    }
  }, [animate, isVisible, transition.delay]);

  const animationStyle: React.CSSProperties = {
    ...style,
    transition: `opacity ${transition.duration || 0.3}s ${transition.ease || 'ease-out'}, transform ${transition.duration || 0.3}s ${transition.ease || 'ease-out'}`,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
  };

  return (
    <div className={className} style={animationStyle}>
      {children}
    </div>
  );
};

/**
 * Fade in animation component
 */
interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 0.3
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-opacity ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transitionDuration: `${duration}s`,
        transitionTimingFunction: 'ease-out'
      }}
    >
      {children}
    </div>
  );
};

/**
 * Slide in animation component
 */
interface SlideInProps {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  duration?: number;
}

export const SlideIn: React.FC<SlideInProps> = ({
  children,
  className = '',
  direction = 'up',
  delay = 0,
  duration = 0.3
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  const getTransform = () => {
    if (isVisible) return 'translate(0, 0)';
    
    switch (direction) {
      case 'up': return 'translateY(20px)';
      case 'down': return 'translateY(-20px)';
      case 'left': return 'translateX(20px)';
      case 'right': return 'translateX(-20px)';
      default: return 'translateY(20px)';
    }
  };

  return (
    <div
      className={`transition-all ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transitionDuration: `${duration}s`,
        transitionTimingFunction: 'ease-out'
      }}
    >
      {children}
    </div>
  );
};

/**
 * Scale animation component
 */
interface ScaleInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export const ScaleIn: React.FC<ScaleInProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 0.3
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-all ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : 'scale(0.95)',
        transitionDuration: `${duration}s`,
        transitionTimingFunction: 'ease-out'
      }}
    >
      {children}
    </div>
  );
};

/**
 * Stagger children animation
 */
interface StaggerProps {
  children: ReactNode[];
  className?: string;
  delay?: number;
  staggerDelay?: number;
}

export const Stagger: React.FC<StaggerProps> = ({
  children,
  className = '',
  delay = 0,
  staggerDelay = 0.1
}) => {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <FadeIn delay={delay + (index * staggerDelay)} key={index}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
};

export default OptimizedMotion;
