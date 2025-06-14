"use client";

import { useState, FormEvent, useRef } from 'react';
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
import { useTheme } from '@/contexts/ThemeContext';

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

      const response = await fetch('/api/search-youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      });

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
                {/* YouTube Analysis Option - Full Width */}
                <div className="bg-white dark:bg-content-bg rounded-lg shadow-card p-4 hover:shadow-lg transition-all duration-300 w-full border border-gray-200 dark:border-gray-600">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2 text-center transition-colors duration-300">
                    Analyze Music
                  </h3>

                  <div className="space-y-3 max-w-3xl mx-auto">
                    {/* Unified Search/URL Input */}
                    <div>
                      <form onSubmit={handleSearch} className="space-y-2">
                        <div>
                          <input
                            id="youtube-search"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              setError('');
                              setSearchError(null);
                            }}
                            placeholder="Search for a song or paste YouTube URL..."
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-lg focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                          />
                          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <button
                            type="submit"
                            disabled={isSearching}
                            className="w-full md:w-auto bg-primary-600 dark:bg-primary-700 text-white font-medium py-2 px-6 rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors duration-200 disabled:opacity-50 flex-grow md:flex-grow-0"
                          >
                            {isSearching ? "Searching..." : "Search or Analyze URL"}
                          </button>

                          <div className="relative group w-full md:w-auto">
                            <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-600 text-white text-sm rounded p-2 max-w-xs z-20 pointer-events-none mb-2">
                              Upload audio files (MP3, WAV, FLAC) up to 20MB
                            </div>
                            <Link
                              href="/analyze"
                              className="bg-blue-600 dark:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 text-center block"
                              aria-label="Upload audio file"
                            >
                              Upload Audio
                            </Link>
                          </div>
                        </div>
                      </form>
                      {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {(searchResults.length > 0 || isSearching) && (
                  <div className="mt-3">
                    <SearchResults
                      results={searchResults}
                      isLoading={isSearching}
                      error={searchError}
                      onVideoSelect={handleVideoSelect}
                      fromCache={searchResults.length > 0}
                    />
                  </div>
                )}

                {/* Demo Images - Only show when not displaying search results */}
                {!searchResults.length && !isSearching && (
                  <div className="mt-4">
                    <div className="text-center mb-3">
                      <AnimatedBorderText>
                        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">
                          See ChordMini in Action
                        </h3>
                      </AnimatedBorderText>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <div className="p-3">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">Beat & Chord Analysis</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-300 transition-colors duration-300">Visualize chord progressions and beat patterns in real-time</p>
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
                        <div className="p-3">
                          <h4 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">Lyrics & Chord Transcription</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-300 transition-colors duration-300">Follow along with synchronized lyrics and chord annotations</p>
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
