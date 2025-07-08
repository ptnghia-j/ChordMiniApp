"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import OptimizedImage from '@/components/OptimizedImage';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import TypewriterText from '@/components/TypewriterText';
import AnimatedTitle from '@/components/AnimatedTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { IoMusicalNotes, IoMusicalNote } from 'react-icons/io5';
import { FaMusic } from 'react-icons/fa';
import { useSearchBoxVisibility } from '@/hooks/useSearchBoxVisibility';
import { useSharedSearchState } from '@/hooks/useSharedSearchState';

// Dynamic imports for heavy components - using lazy-loaded version
const RecentVideos = dynamic(() => import('@/components/LazyRecentVideos'), {
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>,
  ssr: false
});

const AnimatedBorderText = dynamic(() => import('@/components/AnimatedBorderText'), {
  loading: () => <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>,
  ssr: false
});

const FeaturesSection = dynamic(() => import('@/components/FeaturesSection'), {
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-48"></div>,
  ssr: false
});

const IntegratedSearchContainer = dynamic(() => import('@/components/LazyIntegratedSearchContainer'), {
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-24"></div>,
  ssr: false
});



function HomePageContentInner() {
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const { theme } = useTheme();

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
      {/* Use the Navigation component */}
      <Navigation showStickySearch={shouldShowStickySearch} />

      {/* Main content with hero image background - added border-top to prevent margin collapse */}
      <main className="flex-grow relative border-t border-transparent dark:border-gray-700">
        {/* Hero Image Background - Optimized for LCP and reflow prevention */}
        <div className="fixed inset-0 z-0">
          <OptimizedImage
            src={theme === 'dark' ? "/hero-image-placeholder-dark.svg" : "/hero-image-placeholder.svg"}
            alt="ChordMini - Chord recognition and analysis application"
            width={1920}
            height={1080}
            priority={true}
            quality={60}
            sizes="100vw"
            className="object-cover opacity-30 w-full h-full"
            data-lcp-image
          />
        </div>

        {/* Decorative Music Notes with enhanced contrast */}
        <IoMusicalNote className="absolute top-4 left-4 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />

        <IoMusicalNotes className="absolute top-4 right-4 w-12 h-12 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />

        <FaMusic className="absolute bottom-4 right-4 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" />

        {/* Content Container */}
        <div className="relative z-10 container mx-auto p-3 hero-container">
          {/* Two-column layout: Main Content (75%) + Recent Videos (25%) */}
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column: Main content (75% width on desktop) */}
              <div className="lg:col-span-3">
                {/* App Title and Description - Centered in left column */}
                <div ref={titleRef} className="pt-3 pb-2 md:pt-4 md:pb-3 text-center">
                  <AnimatedTitle text="Chord Mini" className="mb-0.5" />
                  <div className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 font-light mb-2 transition-colors duration-300 min-h-[4rem] md:min-h-[5rem] flex items-center justify-center">
                    <TypewriterText
                      text="Open source chord & beat detection application. Get your favorite songs transcribed!"
                      speed={20}
                      delay={1000}
                      className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 font-light transition-colors duration-300 text-center leading-relaxed"
                      showCursor={true}
                      cursorChar="|"
                    />
                  </div>
                </div>
                {/* Integrated Search Container */}
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

                {/* Demo Images - Only show when not displaying search results */}
                {!searchResults.length && !isSearching && (
                  <div className="mt-2">
                    <div className="text-center mb-1">
                      <AnimatedBorderText>
                        <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">
                          See ChordMini in Action
                        </h3>
                      </AnimatedBorderText>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg group">
                        <div className="relative w-full overflow-hidden aspect-video">
                          <OptimizedImage
                            src={theme === 'dark' ? "/demo1_dark.png" : "/demo1.png"}
                            alt="ChordMini Beat and Chord Analysis Demo"
                            width={800}
                            height={450}
                            priority={false}
                            quality={75}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="p-1.5">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300 text-sm">Beat & Chord Analysis</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-300 transition-colors duration-300">Visualize chord progressions and beat patterns in real-time</p>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg group">
                        <div className="relative w-full overflow-hidden aspect-video">
                          <OptimizedImage
                            src={theme === 'dark' ? "/demo2_dark.png" : "/demo2.png"}
                            alt="ChordMini Guitar Chord Diagrams Demo"
                            width={800}
                            height={450}
                            priority={false}
                            quality={75}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="p-1.5">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300 text-sm">Guitar Chord Diagrams</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-300 transition-colors duration-300">Interactive guitar chord diagrams with real-time progression</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Features Section */}
                <div id="features" className="mt-4">
                  <FeaturesSection />
                </div>
              </div>

              {/* Right Column: Recent Videos (25% width on desktop) */}
              <div className="lg:col-span-1 mt-8 lg:mt-24">
                <RecentVideos />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function HomePageContent() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100 dark:bg-dark-bg" />}>
      <HomePageContentInner />
    </Suspense>
  );
}
