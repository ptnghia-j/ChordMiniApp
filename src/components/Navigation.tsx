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
    <div className={`sticky top-0 bg-white dark:bg-black text-gray-800 dark:text-gray-100 shadow-md block z-50 transition-colors duration-300 w-screen ${className}`}>
      <div className="w-full px-4 flex justify-between items-center h-16">
        <div className="flex items-center">
          <Link href="/" className="flex items-center group">
            <Image
              src={logoSrc}
              alt="ChordMini Logo"
              width={48}
              height={48}
              className="mr-2 transition-transform duration-200 group-hover:scale-105"
            />
            <h1 className="text-xl font-bold text-primary-700 dark:text-primary-300 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              Chord Mini
            </h1>
          </Link>
        </div>
        <div className="flex items-center space-x-6">
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link
                  href="/"
                  className="relative text-primary-700 dark:text-primary-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 font-medium px-3 py-2 group"
                >
                  <span className="relative z-10">Home</span>
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 origin-left"></span>
                </Link>
              </li>
              <li>
                <Link
                  href="/features"
                  className="relative text-primary-700 dark:text-primary-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 font-medium px-3 py-2 group"
                >
                  <span className="relative z-10">Features</span>
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 origin-left"></span>
                </Link>
              </li>
              <li>
                <Link
                  href="/analyze"
                  className="relative text-primary-700 dark:text-primary-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 font-medium px-3 py-2 group"
                >
                  <span className="relative z-10">Analyze Audio</span>
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 origin-left"></span>
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
