'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

import StickySearchBar from '@/components/common/StickySearchBar';
import { Navbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenuToggle, NavbarMenu, NavbarMenuItem, Button } from '@heroui/react';

interface NavigationProps {
  className?: string;
  showStickySearch?: boolean;
  overlay?: boolean;
}

interface NavigationItem {
  href: string;
  label: string;
  isScroll?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ className = '', showStickySearch = false, overlay = false }) => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [isClient, setIsClient] = useState(false);

  // Use CSS-based theme switching for logos to prevent hydration mismatch

  // Handle client-side hydration and hash detection
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
    setCurrentHash(window.location.hash);

    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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



  const isActiveRoute = (href: string) => {
    if (!pathname) return false;
    if (href === '/') {
      return pathname === '/' && (!isClient || !currentHash);
    }
    if (href === '/#features') {
      return pathname === '/' && isClient && currentHash === '#features';
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = (href: string, isScroll?: boolean) => {
    if (isScroll && href === '/#features') {
      // If we're not on the home page, navigate there first
      if (pathname !== '/') {
        if (isClient) {
          window.location.assign('/#features');
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
    <>
      <Navbar
        data-chordmini-navigation="true"
        maxWidth="full"
        position="static"
        isBlurred={false}
        classNames={{
          base: `
            navbar-backdrop-sm navbar-optimized !fixed !inset-x-0 !top-0 !z-[100]
            !h-16 !border-0 !bg-transparent !bg-none !px-2 !py-1.5 !shadow-none
            !backdrop-blur-none !backdrop-saturate-100 sm:!px-4
            ${className}
          `,
          wrapper: `
            h-12 max-w-[calc(100vw-1rem)] rounded-full border border-black/10
            bg-white/80 px-3 shadow-[0_14px_44px_-28px_rgba(15,23,42,0.9)]
            backdrop-blur-sm transition-colors duration-300
            dark:border-transparent dark:bg-content-bg/80 dark:shadow-[0_18px_52px_-30px_rgba(0,0,0,0.95)]
            sm:max-w-[min(1260px,calc(100vw-2rem))] sm:px-6
          `,
          menu: `
            mx-3 mt-2 rounded-2xl border border-black/10 bg-white/90
            shadow-[0_18px_48px_-26px_rgba(15,23,42,0.9)] backdrop-blur-xl
            dark:border-white/10 dark:bg-black/90
          `,
        }}
        style={{
          background: 'transparent',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        height="4rem"
      >
        <NavbarContent>
          <NavbarMenuToggle className="sm:hidden" />
          <NavbarBrand>
            <Link href="/" className="flex items-center group">
              {/* Light theme logo - hidden in dark mode */}
              <Image
                src="/chordMiniLogo.webp"
                alt="ChordMini Logo"
                width={40}
                height={40}
                sizes="40px"
                className="mr-2 transition-transform duration-200 group-hover:scale-105 rounded-lg block dark:hidden"
                style={{ width: '40px', height: '40px' }}
              />
              {/* Dark theme logo - hidden in light mode */}
              <Image
                src="/chordMiniLogo-dark.webp"
                alt="ChordMini Logo"
                width={40}
                height={40}
                sizes="40px"
                className="mr-2 rounded-lg hidden transition-all duration-200 group-hover:scale-105 dark:block dark:opacity-60 dark:group-hover:opacity-85"
                style={{ width: '40px', height: '40px' }}
              />
              <h1 className="text-xl font-nunito font-extrabold text-foreground transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 tracking-tight">
                ChordMini
              </h1>
            </Link>
          </NavbarBrand>
        </NavbarContent>

        <NavbarContent justify="end" className="gap-1 sm:gap-2">
          {/* Sticky Search Bar - only show on homepage when original search is out of view */}
          {pathname === '/' && (
            <NavbarItem className="hidden md:flex">
              <StickySearchBar
                isVisible={showStickySearch}
                className="max-w-[200px] lg:max-w-xs xl:max-w-md"
              />
            </NavbarItem>
          )}

          {/* Navigation Items - Hide on small screens where mobile menu is available */}
          {navigationItems.map((item) => (
            <NavbarItem key={item.href} className="hidden sm:flex" suppressHydrationWarning>
              {item.isScroll ? (
                <Button
                  variant="ghost"
                  color="default"
                  onPress={() => handleNavClick(item.href, item.isScroll)}
                  className={`font-medium text-sm transition-all duration-200 ${
                    isActiveRoute(item.href)
                      ? 'bg-black/[0.08] text-foreground border border-black/10 dark:bg-white/[0.12] dark:border-white/[0.18]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/10 text-black dark:text-foreground bg-transparent border border-transparent hover:border-black/10 dark:hover:border-white/[0.15]'
                  }`}
                  size="sm"
                  radius="full"
                >
                  {item.label}
                </Button>
              ) : (
                <Button
                  as={Link}
                  href={item.href}
                  variant="ghost"
                  color="default"
                  className={`font-medium text-sm transition-all duration-200 ${
                    isActiveRoute(item.href)
                      ? 'bg-black/[0.08] text-foreground border border-black/10 dark:bg-white/[0.12] dark:border-white/[0.18]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/10 text-black dark:text-foreground bg-transparent border border-transparent hover:border-black/10 dark:hover:border-white/[0.15]'
                  }`}
                  size="sm"
                  radius="full"
                >
                  {item.label}
                </Button>
              )}
            </NavbarItem>
          ))}

          <NavbarItem>
            <ThemeToggle />
          </NavbarItem>
        </NavbarContent>

        <NavbarMenu>
          {/* Mobile Sticky Search Bar - only show on homepage when original search is out of view AND mobile menu is open */}
          {pathname === '/' && showStickySearch && isMobileMenuOpen && (
            <NavbarMenuItem>
              <StickySearchBar
                isVisible={true}
                className="w-full mb-4"
              />
            </NavbarMenuItem>
          )}

          {navigationItems.map((item) => (
            <NavbarMenuItem key={item.href} suppressHydrationWarning>
              {item.isScroll ? (
                <Button
                  variant={isActiveRoute(item.href) ? "solid" : "flat"}
                  color={isActiveRoute(item.href) ? "primary" : "default"}
                  onPress={() => {
                    handleNavClick(item.href, item.isScroll);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full justify-start font-medium text-base transition-all duration-200 ${
                    isActiveRoute(item.href)
                      ? 'bg-blue-600 text-white border border-blue-600'
                      : 'text-gray-900 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  size="lg"
                >
                  {item.label}
                </Button>
              ) : (
                <Button
                  as={Link}
                  href={item.href}
                  variant={isActiveRoute(item.href) ? "solid" : "flat"}
                  color={isActiveRoute(item.href) ? "primary" : "default"}
                  onPress={() => setIsMobileMenuOpen(false)}
                  className={`w-full justify-start font-medium text-base transition-all duration-200 ${
                    isActiveRoute(item.href)
                      ? 'bg-blue-600 text-white border border-blue-600'
                      : 'text-gray-900 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                  size="lg"
                >
                  {item.label}
                </Button>
              )}
            </NavbarMenuItem>
          ))}
        </NavbarMenu>
      </Navbar>
      {!overlay && <div aria-hidden="true" className="h-16 shrink-0" />}
    </>
  );
};

export default Navigation;
