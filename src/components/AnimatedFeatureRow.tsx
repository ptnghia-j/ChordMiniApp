'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedFeatureRowProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Reusable animated component for feature rows with split-text animation
 * Left side: animated title, Right side: content
 */
const AnimatedFeatureRow: React.FC<AnimatedFeatureRowProps> = ({
  title,
  children,
  className = '',
  delay = 0
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  // Split title into words for sequential animation
  const words = title.split(' ');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delay: delay,
        staggerChildren: 0.1,
        delayChildren: delay + 0.2
      }
    }
  };

  const wordVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      filter: "blur(4px)"
    },
    visible: { 
      opacity: 1, 
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    }
  };

  const contentVariants = {
    hidden: { 
      opacity: 0, 
      x: 30,
      filter: "blur(4px)"
    },
    visible: { 
      opacity: 1, 
      x: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.8,
        delay: delay + 0.4,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    }
  };

  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start ${className}`}
    >
      {/* Left Column: Animated Title */}
      <div className="lg:text-right">
        <motion.h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight">
          {words.map((word, index) => (
            <motion.span
              key={index}
              variants={wordVariants}
              className="inline-block mr-2"
            >
              {word}
            </motion.span>
          ))}
        </motion.h2>
      </div>

      {/* Right Column: Content */}
      <motion.div
        variants={contentVariants}
        className="space-y-4"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export default AnimatedFeatureRow;
