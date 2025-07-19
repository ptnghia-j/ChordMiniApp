"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import OptimizedImage from '@/components/OptimizedImage';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import AnimatedTitle from '@/components/AnimatedTitle';
import OptimizedVideoDemo from '@/components/OptimizedVideoDemo';

import { useTheme } from '@/contexts/ThemeContext';
import { IoMusicalNotes, IoMusicalNote } from 'react-icons/io5';
import { FaMusic } from 'react-icons/fa';
import { useSearchBoxVisibility } from '@/hooks/useSearchBoxVisibility';
import { useSharedSearchState } from '@/hooks/useSharedSearchState';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Chip } from '@heroui/react';
import { HiSparkles } from 'react-icons/hi2';
import SupportChordMini from '@/components/SupportChordMini'

// Dynamic imports for heavy components
const RecentVideos = dynamic(() => import('@/components/LazyRecentVideos'), {
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-slate-700 rounded-lg h-32"></div>,
  ssr: false
});

// const AnimatedBorderText = dynamic(() => import('@/components/AnimatedBorderText'), {
//   loading: () => <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded animate-pulse"></div>,
//   ssr: false
// });

const HeroScrollingChordAnimation = dynamic(() => import('@/components/HeroScrollingChordAnimation'), {
  loading: () => <div className="w-full h-24 bg-gray-200 dark:bg-slate-700 animate-pulse rounded-lg"></div>,
  ssr: false
});

const IntegratedSearchContainer = dynamic(() => import('@/components/LazyIntegratedSearchContainer'), {
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
    setMounted(true);
  }, []);

  // Scroll-based animations
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

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
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-dark-bg transition-colors duration-300">
      {/* Navigation */}
      <Navigation showStickySearch={shouldShowStickySearch} />

      {/* Hero Section - Adjusted for navigation bar visibility */}
      <motion.section
        style={{
          opacity: heroOpacity,
          scale: heroScale,
          minHeight: 'calc(100vh - 80px)',
          // CHANGE: Removed inline paddingTop to reduce top whitespace
        }}
        // CHANGE: Removed pt-4 class
        className="relative flex items-start justify-center overflow-hidden"
      >
        {/* Hero Background */}
        <div className="absolute inset-0 z-0">
          <OptimizedImage
            src={theme === 'dark' ? "/hero-image-placeholder-dark.svg" : "/hero-image-placeholder.svg"}
            alt="ChordMini - Chord recognition and analysis application"
            width={1920}
            height={1080}
            priority={true}
            quality={60}
            sizes="100vw"
            className="object-cover opacity-10 w-full h-full"
            data-lcp-image
          />
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
        {/* CHANGE: Added pt-8 to control the top spacing from here */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center pt-8">
          {/* Left Side: Hero Content (60%) */}
          {/* CHANGE: Increased space-y-2 to space-y-8 to create more room between elements */}
          <div className="lg:col-span-3 space-y-8">
            {/* Title - Centered */}
            <div ref={titleRef} className="text-center">
              <AnimatedTitle text="Chord Mini" className="mb-0" />
              <div className="text-xl md:text-2xl lg:text-3xl text-gray-700 dark:text-gray-300 font-light mb-1 min-h-[2.5rem] flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 1, // This corresponds to the original delay={1000}
                    duration: 0.5,
                    ease: "easeOut",
                  }}
                  className="text-xl md:text-2xl lg:text-3xl text-gray-700 dark:text-gray-300 font-light mb-1 min-h-[2.5rem] text-center leading-relaxed"
                >
                  Open source chord & beat detection application. Get your favorite songs transcribed!
                </motion.div>
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
              transition={{ delay: 3, duration: 1 }}
              // CHANGE: Removed mt-8. The parent's space-y-8 now controls the spacing for consistency.
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
                  transition={{ delay: 2, duration: 0.6 }}
                  className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="relative w-full overflow-hidden">
                    <OptimizedVideoDemo
                      src="https://s3.us-east-1.amazonaws.com/remotionlambda-production/renders/jyz9tckw05/out.mp4?v=be04b2e1f43c43bec8e5a43b5252c76c"
                      alt="ChordMini Beat and Chord Analysis Demo"
                      className="transition-transform duration-300 group-hover:scale-105"
                      posterLight="/demo1.webp"
                      posterDark="/demo1_dark.webp"
                    />
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Beat & Chord Analysis</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Visualize chord progressions and beat patterns in real-time</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.3, duration: 0.6 }}
                  className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="relative w-full overflow-hidden">
                    <OptimizedVideoDemo
                      src="https://s3.us-east-1.amazonaws.com/remotionlambda-production/renders/hemrkftkqv/out.mp4?v=699a461ecf45812c072d16232bb01b21"
                      alt="ChordMini Guitar Chord Diagrams Demo"
                      className="transition-transform duration-300 group-hover:scale-105"
                      posterLight="/demo2.webp"
                      posterDark="/demo2_dark.webp"
                    />
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1 text-sm">Guitar Chord Diagrams</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">Interactive guitar chord diagrams with real-time progression</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Animated Features Section */}
      <section className="py-20 bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 space-y-20">
          {/* Feature 1: Advanced Chord Recognition */}
          <div id="features" className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Left Column: Title and Subtitle (40%) */}
            <div className="lg:col-span-2 lg:text-right">
              <motion.div
                initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
                  Advanced Chord Recognition
                </h2>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                  AI-powered chord detection with multiple model options for maximum accuracy
                </p>
              </motion.div>
            </div>

            {/* Right Column: Detailed Content (60%) */}
            <div className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="space-y-6"
              >
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400">
                    ChordMini employs state-of-the-art machine learning models to identify chords in audio with exceptional precision. Our system supports multiple detection algorithms, each optimized for different musical styles and complexity levels.
                  </p>
                  <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 mt-1.5 text-xs">●</span>
                      <span>Multiple AI models: Chord-CNN-LSTM and BTC (Beat-Transformer-Chord)</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 mt-1.5 text-xs">●</span>
                      <span>Supports major, minor, 7th, diminished, and extended chords</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 mt-1.5 text-xs">●</span>
                      <span>Real-time chord progression analysis</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 mt-1.5 text-xs">●</span>
                      <span>Enharmonic correction with toggle functionality</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 mt-1.5 text-xs">●</span>
                      <span>Context-aware chord interpretation</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Feature 2: Intelligent Beat Detection */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Left Column: Title and Subtitle (40%) */}
            <div className="lg:col-span-2 lg:text-right">
              <motion.div
                initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
                  Intelligent Beat Detection
                </h2>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                  Precision rhythm analysis with BPM detection and time signature identification
                </p>
              </motion.div>
            </div>

            {/* Right Column: Detailed Content (60%) */}
            <div className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="space-y-6"
              >
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400">
                    Our advanced beat detection system uses cutting-edge algorithms to analyze musical timing, providing accurate beat tracking, tempo estimation, and rhythmic structure analysis for any audio input.
                  </p>
                  <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="flex items-start space-x-3">
                      <span className="text-green-500 mt-1.5 text-xs">●</span>
                      <span>Beat-Transformer and Madmom algorithms for precise timing</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-green-500 mt-1.5 text-xs">●</span>
                      <span>Automatic BPM (tempo) detection</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-green-500 mt-1.5 text-xs">●</span>
                      <span>Time signature identification (4/4, 3/4, 6/8, etc.)</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-green-500 mt-1.5 text-xs">●</span>
                      <span>Downbeat detection for measure alignment</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-green-500 mt-1.5 text-xs">●</span>
                      <span>Pickup beat and anacrusis handling</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Feature 3: Real-time Visualization */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Left Column: Title and Subtitle (40%) */}
            <div className="lg:col-span-2 lg:text-right">
              <motion.div
                initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
                  Real-time Visualization
                </h2>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                  Interactive chord grids and beat maps that sync perfectly with audio playback
                </p>
              </motion.div>
            </div>

            {/* Right Column: Detailed Content (60%) */}
            <div className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="space-y-6"
              >
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400">
                    Experience music analysis like never before with our dynamic visualization system. Watch chords and beats come alive as they synchronize with the audio, providing an immersive and educational experience.
                  </p>
                  <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="flex items-start space-x-3">
                      <span className="text-purple-500 mt-1.5 text-xs">●</span>
                      <span>Dynamic chord grid with measure-based layout</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-purple-500 mt-1.5 text-xs">●</span>
                      <span>Real-time beat highlighting during playback</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-purple-500 mt-1.5 text-xs">●</span>
                      <span>Interactive navigation - click any beat to jump to that time</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-purple-500 mt-1.5 text-xs">●</span>
                      <span>Responsive design adapting to different time signatures</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-purple-500 mt-1.5 text-xs">●</span>
                      <span>Visual chord change indicators and progression flow</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Videos Section - Two Column Layout */}
      <section className="py-16 bg-white dark:bg-slate-800 transition-colors duration-300 min-h-[33vh]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
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
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <RecentVideos />
          </motion.div>
        </div>
      </section>

      {/* Animated Support Section */}
      <section className="py-20 bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Left Column: Description (40%) */}
            <div className="lg:col-span-2 lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
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

                <p className="text-lg text-gray-700 dark:text-gray-200 leading-relaxed">
                  ChordMini is a free, open-source project. The backend server is not guaranteed to be maintained and running for extended periods due to budget constraints. We try our best to keep it running and add new features/models. If you&apos;d like to support the project to keep the backend server running, you can use the donation link below. We really appreciate your support!
                </p>
              </motion.div>
            </div>

            {/* Right Column: Support Actions and Research Project (60%) */}
            <div className="lg:col-span-3 w-full">
              <motion.div
                initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
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