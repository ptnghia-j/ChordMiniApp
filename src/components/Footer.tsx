'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';
import { HiMail, HiHeart } from 'react-icons/hi';
import { SiGithub } from 'react-icons/si';
import { FaExternalLinkAlt } from 'react-icons/fa';

const Footer: React.FC = () => {
  const { theme } = useTheme();

  const footerSections = {
    product: {
      title: 'Product',
      links: [
        { name: 'About', href: '/about', external: false },
        { name: 'Changelog', href: '/changelog', external: false },
      ]
    },
    support: {
      title: 'Support',
      links: [
        { name: 'Help & Support', href: '/help', external: false },
        { name: 'Documentation', href: '/docs', external: false },
        { name: 'GitHub Issues', href: 'https://github.com/ptnghia-j/ChordMiniApp/issues', external: true },
      ]
    },
    legal: {
      title: 'Legal',
      links: [
        { name: 'Privacy Policy', href: '/privacy', external: false },
        { name: 'Terms of Service', href: '/terms', external: false },
      ]
    }
  };

  const socialLinks = [
    {
      name: 'GitHub',
      href: 'https://github.com/ptnghia-j/ChordMiniApp',
      icon: <SiGithub className="w-5 h-5" />,
    },
  ];

  return (
    <footer className="relative z-20 bg-white dark:bg-dark-bg border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main Footer Content */}
        <div className="py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">

            {/* Brand Section */}
            <div className="lg:col-span-2">
              <div className="flex items-center space-x-3 mb-4">
                <Link href="/">
                  <Image
                  src={theme === 'dark' ? "/chordMiniLogo-dark.webp" : "/chordMiniLogo.webp"}
                  alt="ChordMini Logo"
                  width={40}
                  height={40}
                  sizes="40px"
                  priority={false}
                  className="w-10 h-10"
                  />
                </Link>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    ChordMini
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    AI-Powered Chord Recognition
                  </p>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex space-x-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                    aria-label={social.name}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Navigation Sections */}
            {Object.entries(footerSections).map(([key, section]) => (
              <div key={key}>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  {section.title}
                </h4>
                <ul className="space-y-3">
                  {section.links.map((link) => (
                    <li key={link.name}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 flex items-center space-x-1"
                        >
                          <span>{link.name}</span>
                          <FaExternalLinkAlt className="w-3 h-3" />
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                        >
                          {link.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="py-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">

            {/* Left Side - Copyright and Contact */}
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © 2025 ChordMini. All rights reserved.
              </p>
              <div className="flex items-center space-x-2">
                <HiMail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <a
                  href="mailto:phantrongnghia510@gmail.com"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                >
                  phantrongnghia510@gmail.com
                </a>
              </div>
            </div>

            {/* Right Side - Version and Support */}
            <div className="flex items-center space-x-6">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Version 0.4.4
              </span>
              <a
                href="https://buymeacoffee.com/nghiaphan"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors duration-200"
              >
                <HiHeart className="w-4 h-4" />
                <span>Support</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;