"use client";

import { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SearchResults from '@/components/SearchResults';
import RecentVideos from '@/components/RecentVideos';
import Navigation from '@/components/Navigation';
import TypewriterText from '@/components/TypewriterText';
import AnimatedTitle from '@/components/AnimatedTitle';
import AnimatedBorderText from '@/components/AnimatedBorderText';
import FeaturesSection from '@/components/FeaturesSection';
import IntegratedSearchContainer from '@/components/IntegratedSearchContainer';
import { useTheme } from '@/contexts/ThemeContext';
import { apiPost } from '@/config/api';

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

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { theme } = useTheme();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // No longer need intersection observer since we have a permanent sticky header

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

    try {
      const response = await apiPost('SEARCH_YOUTUBE', { query });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search YouTube');
      }

      const data = await response.json();

      if (data.success && data.results) {
        setSearchResults(data.results);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: unknown) {
      console.error('Error searching YouTube:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search for videos';
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        setSearchError('Search timed out. Please try again. First searches may take longer to complete.');
      } else {
        setSearchError(errorMessage);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer for debounced search
    if (searchQuery.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 800); // 800ms debounce delay
    } else {
      // Clear results immediately when query is empty
      setSearchResults([]);
      setSearchError(null);
    }

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      setSearchError('Please enter a search query or YouTube URL');
      return;
    }

    // First check if it's a direct YouTube URL or video ID
    const videoId = extractVideoId(searchQuery);
    if (videoId) {
      // It's a direct URL, navigate to analysis page
      router.push(`/analyze/${videoId}`);
      return;
    }

    // If it's not a URL, proceed with search
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    // Set a timeout to show a loading message if search takes too long
    const searchTimeout = setTimeout(() => {
      if (isSearching) {

      }
    }, 2000);

    try {
      // Use yt-dlp search for both local and production
      const response = await apiPost('SEARCH_YOUTUBE', { query: searchQuery });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search YouTube');
      }

      const data = await response.json();

      if (data.success && data.results) {
        setSearchResults(data.results);
      } else {
        throw new Error('Invalid response format');
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
      clearTimeout(searchTimeout);
      setIsSearching(false);
    }
  };

  const handleVideoSelect = (videoId: string) => {
    router.push(`/analyze/${videoId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      {/* Main content with hero image background - added border-top to prevent margin collapse */}
      <main className="flex-grow relative border-t border-transparent dark:border-gray-700">
        {/* Hero Image Background - Fixed to prevent stretching */}
        <div className="fixed inset-0 z-0">
          <Image
            src={theme === 'dark' ? "/hero-image-placeholder-dark.svg" : "/hero-image-placeholder.svg"}
            alt="ChordMini - Chord recognition and analysis application"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60"
          />
        </div>

        {/* Decorative Music Notes with enhanced contrast */}
        <svg className="absolute top-4 left-4 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>

        <svg className="absolute top-4 right-4 w-12 h-12 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>

        <svg className="absolute bottom-4 right-4 w-8 h-8 text-gray-600 dark:text-gray-300 opacity-50 dark:opacity-70 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5.5" cy="17.5" r="3.5"></circle>
          <circle cx="18.5" cy="15.5" r="3.5"></circle>
          <path d="M18.5 5v10.5"></path>
          <path d="M5.5 7v10.5"></path>
          <path d="M18.5 5l-13 2"></path>
        </svg>

        {/* Content Container */}
        <div className="relative z-10 container mx-auto p-3">
          {/* Two-column layout: Main Content (75%) + Recent Videos (25%) */}
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column: Main content (75% width on desktop) */}
              <div className="lg:col-span-3">
                {/* App Title and Description - Centered in left column */}
                <div ref={titleRef} className="pt-4 pb-4 md:py-5 text-center">
                  <AnimatedTitle text="Chord Mini" className="mb-0.5" />
                  <div className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 font-light mb-2 transition-colors duration-300 min-h-[2rem] md:min-h-[2.5rem]">
                    <TypewriterText
                      text="Open source chord & beat detection application. Get your favorite songs transcribed!"
                      speed={20}
                      delay={1000}
                      className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 font-light transition-colors duration-300"
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
                />

                {/* Demo Images - Only show when not displaying search results */}
                {!searchResults.length && !isSearching && (
                  <div className="mt-3">
                    <div className="text-center mb-2">
                      <AnimatedBorderText>
                        <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">
                          See ChordMini in Action
                        </h3>
                      </AnimatedBorderText>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg group">
                        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
                          <Image
                            src={theme === 'dark' ? "/demo1_dark.png" : "/demo1.png"}
                            alt="ChordMini Beat and Chord Analysis Demo"
                            width={800}
                            height={450}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            priority
                          />
                        </div>
                        <div className="p-2">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300 text-sm">Beat & Chord Analysis</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-300 transition-colors duration-300">Visualize chord progressions and beat patterns in real-time</p>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-content-bg rounded-lg shadow-md overflow-hidden transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg group">
                        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
                          <Image
                            src={theme === 'dark' ? "/demo2_dark.png" : "/demo2.png"}
                            alt="ChordMini Lyrics Transcription Demo"
                            width={800}
                            height={450}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            priority
                          />
                        </div>
                        <div className="p-2">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300 text-sm">Lyrics & Chord Transcription</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-300 transition-colors duration-300">Follow along with synchronized lyrics and chord annotations</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}



                {/* Features Section */}
                <FeaturesSection />

                {/* Cache Management Component - Centered */}
                <div className="mt-4 flex justify-center">
                  <div className="relative group">
                    <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute z-20 bg-gray-800 dark:bg-gray-900 text-white text-sm rounded p-2 max-w-xs bottom-full left-1/2 transform -translate-x-1/2 mb-4 pointer-events-none">
                      <p className="font-medium mb-1">Cache Management</p>
                      <p className="text-xs mb-2">Caching helps reduce loading times and YouTube API usage.</p>
                    </div>
                    <button
                      className="rounded-full bg-blue-100 dark:bg-blue-200 p-2 cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-300 hover:bg-blue-200 dark:hover:bg-blue-300"
                      aria-label="Cache management"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.open('/cache-management', '_blank');
                        }
                      }}
                    >
                      <svg className="w-6 h-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Support ChordMini Project Section - Dropdown */}
                <div className="mt-8 mb-6 w-full">
                  <details className="group w-full shooting-star-border bg-white dark:bg-transparent rounded-lg shadow-card transition-all duration-300 hover:shadow-lg">
                    <summary className="cursor-pointer list-none w-full p-4 shooting-star-content">
                      <div className="flex items-center justify-between w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                          Support ChordMini Project
                        </h3>
                        <svg
                          className="w-5 h-5 text-gray-700 dark:text-gray-300 transition-transform duration-200 group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </summary>
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-600 mt-2 shooting-star-content">
                      <div className="pt-4">
                        <p className="text-sm text-gray-800 dark:text-gray-200 mb-4 leading-relaxed transition-colors duration-300">
                          The backend server is not guaranteed to be maintained and running for extended periods due to budget constraints.
                          We try our best to keep it running and add new features/models. If you&apos;d like to support the project to keep
                          the backend server running, you can use the donation link below. We really appreciate your support!
                        </p>
                        <div className="text-center">
                          <a
                            href="https://coff.ee/nghiaphan"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                          >
                            <span className="text-lg">☕</span>
                            <span>Donation</span>
                          </a>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-300">
                            (Buy Me a Coffee link)
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              {/* Right Column: Recent Videos (25% width on desktop) */}
              <div className="lg:col-span-1">
                {/* Recent Videos - Positioned lower */}
                <div className="pt-4 pb-4 md:py-5">
                  {/* Spacer to align with title section height */}
                </div>
                <div className="mt-24">
                  {/* Additional spacer to move Recent Videos lower */}
                </div>
                <RecentVideos />
              </div>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}
