'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';

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
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.5725 0c-.1763 0-.3098.0013-.3584.0067-.0516.0053-.2159.021-.3636.0328-3.4088.3073-6.6017 2.1463-8.624 4.9728C1.1004 6.584.3802 8.3666.1082 10.255c-.0962.659-.108.8537-.108 1.7474s.012 1.0884.108 1.7476c.652 4.506 3.8591 8.2919 8.2087 9.6945.7789.2511 1.6.4223 2.5337.5255.3636.04 1.9354.04 2.299 0 1.6117-.1783 2.9772-.577 4.3237-1.2643.2065-.1056.2464-.1337.2183-.1573-.0188-.0139-.8987-1.1938-1.9543-2.62l-1.919-2.592-2.4047-3.5583c-1.3231-1.9564-2.4117-3.556-2.4211-3.556-.0094-.0026-.0187 1.5787-.0235 3.509-.0067 3.3802-.0093 3.5162-.0516 3.596-.061.115-.108.1618-.2064.2134-.075.0374-.1408.0445-.5429.0445h-.4570l-.0803-.0516c-.0516-.0336-.0939-.0822-.1213-.1201-.0146-.0212-.0094-1.3157.0188-4.2857l.0375-4.2488.0563-.0687c.0235-.0299.0797-.0895.1213-.1309.0692-.0624.1089-.0748.4973-.0748.4511 0 .5376.0187.6170.1309.0235.0299 1.1884 1.7804 2.5923 3.8889 1.4039 2.1085 2.7079 4.0687 2.8977 4.3576.1898.2889 2.7079 4.0687 2.8977 4.3576.1898.2889.5376.8114.7742 1.1628l.4299.6394.0563-.0374c.7929-.5255 1.6117-1.2643 2.2478-2.0346 1.0884-1.3157 1.8113-2.8977 2.1085-4.6204.0962-.659.108-.8537.108-1.7474s-.012-1.0884-.108-1.7476C22.8196 6.584 19.6125 2.7981 15.2629 1.3955 14.4840 1.1444 13.6632.9732 12.7295.8701 12.3659.8326 11.9351.8326 11.5725.8326z"/>
        </svg>
      ),
    },
    {
      name: 'TypeScript',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z"/>
        </svg>
      ),
    },
    {
      name: 'Tailwind CSS',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 C13.666,10.618,15.027,12,18.001,12c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 C7.666,17.818,9.027,19.2,12.001,19.2c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C10.337,13.382,8.976,12,6.001,12z"/>
        </svg>
      ),
    },
    {
      name: 'Firebase',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.229 4.382l3.821 3.821-.888-1.636A1.122 1.122 0 0 0 6.943 5.5L5.229 4.382zM12 2.1L8.179 5.921l3.821 3.821L16.821 5.921 12 2.1zm6.771 2.282L17.057 5.5a1.122 1.122 0 0 0-1.219 1.067l-.888 1.636 3.821-3.821zM12 21.9l6.771-2.282a1.122 1.122 0 0 0 .729-1.067V8.179L12 21.9zm-6.771-2.282L12 21.9 4.5 8.179v10.372a1.122 1.122 0 0 0 .729 1.067z"/>
        </svg>
      ),
    },
    {
      name: 'Python',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z"/>
        </svg>
      ),
    },
    {
      name: 'Web Audio API',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      ),
    },
    {
      name: 'Gemini AI',
      icon: <Image src="/sparkles-outline.svg" alt="Gemini AI Logo" width={24} height={24} className="w-6 h-6 object-contain" />,
    },
    {
      name: 'Music.AI',
      icon: <Image src="/musicAI.png" alt="Music.AI Logo" width={24} height={24} className="w-6 h-6 object-contain" style={{ width: 'auto', height: 'auto' }} />,
    },
    {
      name: 'LRClib',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      ),
    },
    {
      name: 'Genius',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.285 12.433c0 .357.183.673.46.857.277.184.62.184.897 0 .277-.184.46-.5.46-.857s-.183-.673-.46-.857c-.277-.184-.62-.184-.897 0-.277.184-.46.5-.46.857zm7.428 0c0 .357.183.673.46.857.277.184.62.184.897 0 .277-.184.46-.5.46-.857s-.183-.673-.46-.857c-.277-.184-.62-.184-.897 0-.277.184-.46.5-.46.857zm7.429 0c0 .357.183.673.46.857.277.184.62.184.897 0 .277-.184.46-.5.46-.857s-.183-.673-.46-.857c-.277-.184-.62-.184-.897 0-.277.184-.46.5-.46.857zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/>
        </svg>
      ),
    },
  ];

  return (
    <footer className="bg-white dark:bg-black border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Section - Logo and Navigation */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-8 lg:space-y-0">

          {/* Left Section - Logo and Title */}
          <div className="flex items-center space-x-4">
            <Image
              src={theme === 'dark' ? "/chordMiniLogo_dark.png" : "/chordMiniLogo.png"}
              alt="ChordMini Logo"
              width={48}
              height={48}
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

        {/* Bottom Section - Copyright */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              © 2025 ChordMini App
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Version 0.1.0 
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;