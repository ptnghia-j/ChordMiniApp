"use client";

import { useState, FormEvent, useRef, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import OptimizedImage from '@/components/OptimizedImage';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import TypewriterText from '@/components/TypewriterText';
import AnimatedTitle from '@/components/AnimatedTitle';
import { useTheme } from '@/contexts/ThemeContext';
import { apiPost } from '@/config/api';
import { IoMusicalNotes, IoMusicalNote } from 'react-icons/io5';
import { FaMusic } from 'react-icons/fa';
import { useSearchBoxVisibility } from '@/hooks/useSearchBoxVisibility';

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

// YouTube search result interface
interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  view_count?: number;
  upload_date?: string;
}

function HomePageContentInner() {
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Search box visibility detection for sticky search bar
  const { elementRef: searchBoxRef, shouldShowStickySearch } = useSearchBoxVisibility();



  const extractVideoId = (url: string): string | null => {
    // Regular expressions to match different YouTube URL formats
    const regexPatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/watch\?.*v=)([^&?/]+)/,
      /youtube\.com\/watch\?.*v=([^&]+)/,
      /youtube\.com\/shorts\/([^?&/]+)/
    ];

    for (const regex of regexPatterns) {
      const match = url.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }

    // If it's already just a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    return null;
  };

  // Debounced search function for continuous searching
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    // Check if it's a direct YouTube URL or video ID
    const videoId = extractVideoId(query);
    if (videoId) {
      // Don't auto-navigate for URLs during typing, just clear results
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set up new debounced search
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const searchTimeout = setTimeout(() => {
          throw new Error('Search request timed out after 30 seconds');
        }, 30000);

        const response = await apiPost('SEARCH_YOUTUBE', {
          query: query.trim(),
          maxResults: 10
        });

        clearTimeout(searchTimeout);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to search YouTube');
        }

        const data = await response.json();

        if (data.success && data.results) {
          setSearchResults(data.results);
          setSearchError(null);
        } else {
          setSearchResults([]);
          setSearchError('No results found for your search.');
        }
      } catch (error: unknown) {
        console.error('Error searching YouTube:', error);

        // Check if it's a timeout error
        const errorMessage = error instanceof Error ? error.message : 'Failed to search for videos';
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          setSearchError(
            'Search timed out. Please try again. First searches may take longer to complete.'
          );
        } else {
          setSearchError(errorMessage);
        }
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce delay
  }, []);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if it's a direct YouTube URL or video ID
    const videoId = extractVideoId(searchQuery);
    if (videoId) {
      router.push(`/analyze/${videoId}`);
      return;
    }

    // For search queries, perform the search
    await performSearch(searchQuery);
  };

  const handleVideoSelect = (videoId: string, title?: string, metadata?: YouTubeSearchResult) => {
    // Build URL parameters from search metadata
    const params = new URLSearchParams();

    if (title) {
      params.set('title', title);
    }

    // Pass duration from search metadata if available
    if (metadata?.duration_string) {
      params.set('duration', metadata.duration_string);
    }

    // Pass other useful metadata
    if (metadata?.channel) {
      params.set('channel', metadata.channel);
    }

    if (metadata?.thumbnail) {
      params.set('thumbnail', metadata.thumbnail);
    }

    const queryString = params.toString();
    const url = queryString ? `/analyze/${videoId}?${queryString}` : `/analyze/${videoId}`;

    router.push(url);
  };

  // Handle URL query parameters for search
  useEffect(() => {
    const query = searchParams.get('q');
    if (query && query !== searchQuery) {
      setSearchQuery(query);
      // Trigger search automatically
      performSearch(query);
    }
  }, [searchParams, searchQuery, performSearch]);

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
                  setSearchQuery={setSearchQuery}
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
