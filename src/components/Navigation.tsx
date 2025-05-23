'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';

interface NavigationProps {
  className?: string;
}

const Navigation: React.FC<NavigationProps> = ({ className = '' }) => {
  const { theme } = useTheme();

  // Use the appropriate logo based on the current theme
  const logoSrc = theme === 'dark' ? '/chordMiniLogo_dark.png' : '/chordMiniLogo.png';

  return (
    <div className={`sticky top-0 bg-white dark:bg-black text-gray-800 dark:text-gray-100 p-3 shadow-md block z-50 transition-colors duration-300 ${className}`}>
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Image
            src={logoSrc}
            alt="ChordMini Logo"
            width={48}
            height={48}
            className="mr-2"
          />
          <h1 className="text-xl font-bold text-primary-700 dark:text-primary-300">Chord Mini</h1>
        </div>
        <div className="flex items-center space-x-6">
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link
                  href="/"
                  className="text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200 transition-colors font-medium"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/features"
                  className="text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200 transition-colors font-medium"
                >
                  Features
                </Link>
              </li>
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};

export default Navigation;
