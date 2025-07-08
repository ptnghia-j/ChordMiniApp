'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';
import {
  SiNextdotjs,
  SiTypescript,
  SiTailwindcss,
  SiFirebase,
  SiPython,
  SiGithub,
  SiNpm
} from 'react-icons/si';
import { FaMusic, FaDatabase } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';
import { HiMail } from 'react-icons/hi';

const Footer: React.FC = () => {
  const { theme } = useTheme();

  const navigationLinks = [
    { name: 'About', href: '/about', disabled: false },
    { name: 'Changelog', href: '/changelog', disabled: false },
    { name: 'Help & Support', href: '/help', disabled: false },
    { name: 'Privacy Policy', href: '/privacy', disabled: false },
    { name: 'Terms of Service', href: '/terms', disabled: false },
  ];

  const technologies = [
    {
      name: 'Next.js',
      icon: <SiNextdotjs className="w-6 h-6" />,
    },
    {
      name: 'TypeScript',
      icon: <SiTypescript className="w-6 h-6" />,
    },
    {
      name: 'Tailwind CSS',
      icon: <SiTailwindcss className="w-6 h-6" />,
    },
    {
      name: 'Firebase',
      icon: <SiFirebase className="w-6 h-6" />,
    },
    {
      name: 'Python',
      icon: <SiPython className="w-6 h-6" />,
    },
    {
      name: 'youtube-search-api',
      icon: <SiNpm className="w-6 h-6" />,
    },
    {
      name: 'youtube-downloader',
      icon: <SiGithub className="w-6 h-6" />,
    },
    {
      name: 'Gemini AI',
      icon: <HiSparkles className="w-6 h-6" />,
    },
    {
      name: 'Music.AI',
      icon: <Image src="/musicAI.png" alt="Music.AI Logo" width={24} height={24} sizes="24px" className="w-6 h-6 object-contain" />,
    },
    {
      name: 'LRClib',
      icon: <FaDatabase className="w-6 h-6" />,
    },
    {
      name: 'Genius',
      icon: <FaMusic className="w-6 h-6" />,
    },
  ];

  return (
    <footer className="relative z-20 bg-white dark:bg-dark-bg border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Section - Logo and Navigation */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-8 lg:space-y-0">

          {/* Left Section - Logo and Title */}
          <div className="flex items-center space-x-4">
            <Image
              src={theme === 'dark' ? "/chordMiniLogo-dark.png" : "/chordMiniLogo.png"}
              alt="ChordMini Logo"
              width={48}
              height={48}
              sizes="48px"
              style={{ width: '48px', height: '48px' }}
              priority={false}
            />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                ChordMini
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                AI-Powered Chord Recognition
              </p>
            </div>
          </div>

          {/* Right Section - Navigation Links */}
          <div className="flex flex-wrap gap-6 lg:gap-8">
            {navigationLinks.map((link) => (
              <div key={link.name} className="relative">
                {link.disabled ? (
                  <span className="text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed">
                    {link.name}
                  </span>
                ) : (
                  <Link
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                  >
                    {link.name}
                  </Link>
                )}
                {link.disabled && (
                  <span className="absolute -top-1 -right-1 text-xs text-orange-500">
                    •
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Middle Section - Technology Stack */}
        <div className="mt-8">
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-4 text-center">
            Powered by
          </h4>
          <div className="flex flex-wrap justify-center gap-3">
            {technologies.map((tech) => (
              <div
                key={tech.name}
                className="flex items-center space-x-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                title={tech.name}
              >
                <div className="text-gray-600 dark:text-gray-400">
                  {tech.icon}
                </div>
                <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                  {tech.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section - Contact & Copyright */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                © 2025 ChordMini App
              </p>
              <div className="flex items-center space-x-2">
                <HiMail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <a
                  href="mailto:phantrongnghia510@gmail.com"
                  className="text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                >
                  phantrongnghia510@gmail.com
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Version 0.2.5
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;