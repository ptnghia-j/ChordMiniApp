'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';

interface NavigationProps {
  className?: string;
}

interface NavigationItem {
  href: string;
  label: string;
  isScroll?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ className = '' }) => {
  const { theme } = useTheme();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Use the appropriate logo based on the current theme
  const logoSrc = theme === 'dark' ? '/chordMiniLogo_dark.png' : '/chordMiniLogo.png';

  // Navigation items configuration
  const navigationItems: NavigationItem[] = [
    { href: '/', label: 'Home' },
    { href: '/#features', label: 'Features', isScroll: true },
    { href: '/analyze', label: 'Analyze Audio' },
    { href: '/docs', label: 'API Docs' },
    { href: '/settings', label: 'Settings' },
  ];

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isMobileMenuOpen && !target.closest('.mobile-menu-container')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const isActiveRoute = (href: string) => {
    if (!pathname) return false;
    if (href === '/') {
      return pathname === '/' && (typeof window === 'undefined' || !window.location.hash);
    }
    if (href === '/#features') {
      return pathname === '/' && (typeof window !== 'undefined' && window.location.hash === '#features');
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = (href: string, isScroll?: boolean) => {
    if (isScroll && href === '/#features') {
      // If we're not on the home page, navigate there first
      if (pathname !== '/') {
        if (typeof window !== 'undefined') {
          window.location.href = '/#features';
        }
        return;
      }
      // Scroll to features section
      const featuresSection = document.getElementById('features');
      if (featuresSection) {
        featuresSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className={`sticky top-0 bg-white dark:bg-black text-gray-800 dark:text-gray-100 shadow-md block z-50 transition-colors duration-300 w-screen ${className}`}>
      <div className="w-full px-4 flex justify-between items-center h-12">
        {/* Logo and Brand */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center group">
            <Image
              src={logoSrc}
              alt="ChordMini Logo"
              width={40}
              height={40}
              className="mr-2 transition-transform duration-200 group-hover:scale-105"
            />
            <h1 className="text-xl font-bold text-primary-700 dark:text-primary-300 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              Chord Mini
            </h1>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center space-x-6">
          <nav>
            <ul className="flex space-x-6">
              {navigationItems.map((item) => (
                <li key={item.href}>
                  {item.isScroll ? (
                    <button
                      onClick={() => handleNavClick(item.href, item.isScroll)}
                      className={`relative transition-all duration-300 font-medium px-3 py-2 group inline-flex items-center ${
                        isActiveRoute(item.href)
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-primary-700 dark:text-primary-300 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      <span className="relative z-10">{item.label}</span>
                      <span className={`absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 transform transition-transform duration-300 origin-left ${
                        isActiveRoute(item.href) ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                      }`}></span>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={`relative transition-all duration-300 font-medium px-3 py-2 group inline-flex items-center ${
                        isActiveRoute(item.href)
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-primary-700 dark:text-primary-300 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      <span className="relative z-10">{item.label}</span>
                      <span className={`absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 transform transition-transform duration-300 origin-left ${
                        isActiveRoute(item.href) ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                      }`}></span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>

        {/* Mobile Navigation Controls */}
        <div className="lg:hidden flex items-center space-x-3">
          <ThemeToggle />
          <button
            onClick={toggleMobileMenu}
            className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg
              className={`w-6 h-6 transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50 transition-opacity duration-300">
          <div className="mobile-menu-container fixed top-0 right-0 h-full w-80 max-w-full bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out">
            {/* Mobile Menu Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <Image
                  src={logoSrc}
                  alt="ChordMini Logo"
                  width={32}
                  height={32}
                  className="mr-2"
                />
                <h2 className="text-lg font-bold text-primary-700 dark:text-primary-300">
                  Chord Mini
                </h2>
              </div>
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                aria-label="Close mobile menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mobile Menu Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-2">
              {navigationItems.map((item) => (
                item.isScroll ? (
                  <button
                    key={item.href}
                    onClick={() => {
                      handleNavClick(item.href, item.isScroll);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                      isActiveRoute(item.href)
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                      isActiveRoute(item.href)
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </nav>

            {/* Mobile Menu Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                ChordMini v0.1.0
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Navigation;
