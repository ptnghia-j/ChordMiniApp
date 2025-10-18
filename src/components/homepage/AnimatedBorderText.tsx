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
      <div className="shooting-star-border w-full">
        {/* Static content */}
        <div className="shooting-star-content px-2 py-1 transition-colors duration-300 w-full">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AnimatedBorderText;
