'use client';

import React from 'react';

interface AnimatedBorderTextProps {
  children: React.ReactNode;
  className?: string;
}

const AnimatedBorderText: React.FC<AnimatedBorderTextProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`inline-block ${className}`}>
      {/* Shooting star border container */}
      <div className="shooting-star-border">
        {/* Static content */}
        <div className="shooting-star-content px-6 py-3 transition-colors duration-300">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AnimatedBorderText;
