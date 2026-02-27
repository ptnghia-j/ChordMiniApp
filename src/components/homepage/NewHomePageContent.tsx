"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/common/Navigation';
import AnimatedTitle from '@/components/homepage/AnimatedTitle';
import HeroChordGridLyricsMock from '@/components/homepage/HeroChordGridLyricsMock';
import HeroPianoVisualizerMock from '@/components/homepage/HeroPianoVisualizerMock';

import { useTheme } from '@/contexts/ThemeContext';
import { IoMusicalNotes, IoMusicalNote } from 'react-icons/io5';
import { FaMusic } from 'react-icons/fa';
import { useSearchBoxVisibility } from '@/hooks/ui/useSearchBoxVisibility';
import { useSharedSearchState } from '@/hooks/search/useSharedSearchState';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Chip } from '@heroui/react';
import { HiSparkles } from 'react-icons/hi2';
// import { WarningBanner } from '@/components/WarningBanner';
import SupportChordMini from '@/components/homepage/SupportChordMini'
import FeaturesTabSection from '@/components/homepage/FeaturesTabSection';

// Dynamic imports for heavy components
const RecentVideos = dynamic(() => import('@/components/homepage/LazyRecentVideos'), {
  loading: () => (
    <div className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="h-96 overflow-hidden p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider rounded-md">
              <div className="p-3">
                <div className="flex gap-3">
                  <div className="w-20 h-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  ssr: false
});

const HeroScrollingChordAnimation = dynamic(() => import('@/components/homepage/HeroScrollingChordAnimation'), {
  loading: () => <div className="w-full h-24 bg-gray-200 dark:bg-slate-700 animate-pulse rounded-lg"></div>,
  ssr: false
});

const IntegratedSearchContainer = dynamic(() => import('@/components/homepage/LazyIntegratedSearchContainer'), {
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded-lg h-24"></div>,
  ssr: false
});

function NewHomePageContentInner() {
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Track when component has mounted to prevent hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Scroll-based animations
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  // const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

  // Use shared search state for synchronization between main and sticky search
  const {
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    updateSearchQuery,
    handleSearch,
    handleVideoSelect,
    setSearchError
  } = useSharedSearchState();

  // Search box visibility detection for sticky search bar
  const { elementRef: searchBoxRef, shouldShowStickySearch } = useSearchBoxVisibility();

  // Handle URL query parameters for search
  useEffect(() => {
    const query = searchParams.get('q');
    if (query && query !== searchQuery) {
      updateSearchQuery(query);
    }
  }, [searchParams, searchQuery, updateSearchQuery]);

  return (
    <div className="flex flex-col min-h-screen transition-colors duration-300">
      {/* Navigation */}
      <Navigation showStickySearch={shouldShowStickySearch} />


      {/* <WarningBanner /> */}

      
      {/* Hero Section - Adjusted for navigation bar visibility */}
      <motion.section
        style={{
          opacity: heroOpacity,
          // scale: heroScale,
          minHeight: 'calc(100vh - 20px)',
        }}
        className="relative flex items-start justify-center overflow-hidden bg-gray-50 dark:bg-dark-bg"
      >
        {/* Hero Background - Consolidated effects */}
        <div className="absolute inset-0 z-0">
          {theme === 'dark' ? (
            // Dark Mode: Subtle Midnight Mist effect - better integrated with navigation
            // <div
            //   className="absolute inset-0 z-0"
            //   style={{
            //     backgroundImage: `
            //       radial-gradient(circle at 50% 100%, rgba(70, 85, 110, 0.3) 0%, transparent 10%),
            //       radial-gradient(circle at 50% 100%, rgba(99, 102, 241, 0.25) 0%, transparent 20%),
            //       radial-gradient(circle at 50% 100%, rgba(181, 184, 208, 0.2) 0%, transparent 50%)
            //     `,
            //   }}
            // />

            <div className="min-h-screen w-full bg-black relative">
              {/* Deep Ocean Glow */}
              <div
                className="absolute inset-0 z-0"
                style={{
                  background:
                  "radial-gradient(70% 55% at 50% 50%, #2a5d77 0%, #184058 18%, #0f2a43 34%, #0a1b30 50%, #071226 66%, #040d1c 80%, #020814 92%, #01040d 97%, #000309 100%), radial-gradient(160% 130% at 10% 10%, rgba(0,0,0,0) 38%, #000309 76%, #000208 100%), radial-gradient(160% 130% at 90% 90%, rgba(0,0,0,0) 38%, #000309 76%, #000208 100%)"
                }}
              />
            </div>
            
          ) : (
            // Light Mode: Blue Corner Glow Background (NO BLUR for performance)
            <div className="min-h-screen w-full bg-white relative overflow-hidden">
              {/* Blue Corner Glow Background */}
              <div
                className="absolute inset-0 z-0"
                style={{
                  backgroundImage: `
                    radial-gradient(circle 600px at 0% 200px, #bfdbfe, transparent),
                    radial-gradient(circle 600px at 100% 200px, #bfdbfe, transparent)
                  `,
                }}
              />
            </div>
          )}
        </div>

        {/* Decorative Music Notes - Only show after hydration to prevent mismatch */}
        {mounted && (
          <>
            <IoMusicalNote className="absolute top-8 left-8 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />
            <IoMusicalNotes className="absolute top-8 right-8 w-12 h-12 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />
            <FaMusic className="absolute bottom-8 right-8 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />
          </>
        )}

        {/* Split-Screen Layout */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center pt-8">
          {/* Left Side: Hero Content (60%) */}
          <div className="lg:col-span-3 space-y-8">
            {/* Title - Centered */}
            <div ref={titleRef} className="text-center">
              <AnimatedTitle text="Chord Mini" className="mb-3" />
              <div className="min-h-[2rem] flex items-center justify-center mt-2">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.3,
                    duration: 1.2,
                    ease: "easeOut",
                  }}
                  className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-normal tracking-wide text-center leading-relaxed max-w-lg mx-auto"
                >
                  Open source chord & beat detection application. Get your favorite songs transcribed!
                </motion.p>
              </div>
            </div>

            {/* Search Container - Above guitar chord animation */}
            <IntegratedSearchContainer
              searchQuery={searchQuery}
              setSearchQuery={updateSearchQuery}
              handleSearch={handleSearch}
              isSearching={isSearching}
              searchError={searchError}
              error={error}
              setError={setError}
              setSearchError={setSearchError}
              searchResults={searchResults}
              handleVideoSelect={handleVideoSelect}
              containerRef={searchBoxRef}
            />

            {/* Enhanced Scrolling Guitar Chord Animation - Below search box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0, duration: 1 }}
              className="flex justify-center"
            >
              <HeroScrollingChordAnimation className="w-full max-w-6xl" />
            </motion.div>
          </div>

          {/* Right Side: Demo Images (40%) */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                >
                  <HeroChordGridLyricsMock />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Beat & Chord Analysis & Lyrics</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Progressions with Roman numeral analysis, key changes, and sync lyrics</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                >
                  <HeroPianoVisualizerMock />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Piano Visualizer</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Falling notes visualization with multi-instrument support and MIDI export</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Recent Videos Section - Light source in the center */}
      <section className="relative py-16 bg-white dark:bg-slate-800 transition-colors duration-300 min-h-[33vh] overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {theme === 'dark' ? (
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)` }} />
          ) : (
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(255, 235, 59, 0.2) 0%, transparent 70%)` }} />
          )}
        </div>
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Recent Analyses
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Explore recently analyzed songs and discover new music through our community
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <RecentVideos />
          </motion.div>
        </div>
      </section>

      {/* Features Section - Tab-based design */}
      <FeaturesTabSection />

      {/* Animated Support Section - Diffuse glow */}
      <section className="relative py-20 bg-gray-50 dark:bg-slate-900 transition-colors duration-300 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {theme === 'dark' ? (
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(70, 85, 110, 0.2) 0%, transparent 70%)` }} />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(255, 167, 38, 0.1) 0%, transparent 50%)` }} />
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Left Column: Description (40%) */}
            <div className="lg:col-span-2 lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                
                <h3 className="text-lg font-medium flex items-center gap-2 text-gray-900 dark:text-white">
                  <HiSparkles className="w-5 h-5 text-primary" />
                  Support ChordMini
                </h3>
                <Chip size="sm" variant="flat" color="success">
                  Open Source
                </Chip>

                <p className="text-md text-gray-700 dark:text-gray-200 leading-relaxed">
                  ChordMini is a free, open-source project. The backend server is not guaranteed to be maintained and running for extended periods due to budget constraints. We try our best to keep it running and add new features/models. If you&apos;d like to support the project to keep the backend server running, you can use the donation link. We really appreciate your support! <br />
                  <em className="text-sm">Note: current server is CPU-based computation, GPU acceleration is more than 10 times faster.</em>
                  <br />
                  <em className="text-sm">You can always clone/self-host the app from the source code in <a className="text-yellow-500"href="https://github.com/ptnghia-j/ChordMiniApp" target="_blank" rel="noopener noreferrer">github</a> and deploy it on your own server.</em>
                </p>
              </motion.div>
            </div>

            {/* Right Column: Support Actions and Research Project (60%) */}
            <div className="lg:col-span-3 w-full">
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="space-y-6 w-full"
              >
                <SupportChordMini />
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function NewHomePageContent() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-dark-bg" />}>
      <NewHomePageContentInner />
    </Suspense>
  );
}