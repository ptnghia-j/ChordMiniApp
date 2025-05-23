"use client";

import { useState, FormEvent, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SearchResults from '@/components/SearchResults';
import RecentVideos from '@/components/RecentVideos';

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
        console.log('Search is taking longer than expected... First searches may take up to 15 seconds.');
      }
    }, 2000);

    try {
      const startTime = performance.now();

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
      const endTime = performance.now();
      const searchTime = Math.round(endTime - startTime);

      console.log(`Search completed in ${searchTime}ms${data.fromCache ? ' (from cache)' : ''}`);

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
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Single sticky navigation bar */}
      <div className="sticky top-0 bg-white text-gray-800 p-3 shadow-md block z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="/chordMiniLogo.png"
              alt="ChordMini Logo"
              width={48}
              height={48}
              className="mr-2"
            />
            <h1 className="text-xl font-bold text-primary-700">Chord Mini</h1>
          </div>
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link href="/" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Features
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Main content with hero image background - added border-top to prevent margin collapse */}
      <main className="flex-grow relative border-t border-transparent">
        {/* Hero Image Background */}
        <div className="absolute inset-0 z-0">
          <div className="relative w-full h-full">
            <Image
              src="/hero-image-placeholder.svg"
              alt="ChordMini - Chord recognition and analysis application"
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-60"
            />
          </div>
          <div className="absolute inset-0 bg-black bg-opacity-10"></div>
        </div>

        {/* Decorative Music Notes */}
        <svg className="absolute top-4 left-4 w-8 h-8 text-gray-700 opacity-40 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>

        <svg className="absolute top-4 right-4 w-12 h-12 text-gray-700 opacity-40 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>

        <svg className="absolute bottom-4 right-4 w-8 h-8 text-gray-700 opacity-40 z-10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5.5" cy="17.5" r="3.5"></circle>
          <circle cx="18.5" cy="15.5" r="3.5"></circle>
          <path d="M18.5 5v10.5"></path>
          <path d="M5.5 7v10.5"></path>
          <path d="M18.5 5l-13 2"></path>
        </svg>

        {/* Content Container */}
        <div className="relative z-10 container mx-auto p-3">
          {/* App Title and Description - Added padding-top to prevent margin collapse */}
          <div ref={titleRef} className="pt-4 pb-4 md:py-5 flex flex-col items-center justify-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-0.5">ChordMini</h2>
            <p className="text-xl md:text-2xl text-gray-700 font-light mb-2">Chord recognition and analysis application</p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* YouTube Analysis Option - Full Width */}
            <div className="bg-white rounded-lg shadow-card p-4 hover:shadow-lg transition-shadow w-full">
              <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                      />
                      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <button
                        type="submit"
                        disabled={isSearching}
                        className="w-full md:w-auto bg-primary-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-primary-700 transition-colors duration-200 disabled:opacity-50 flex-grow md:flex-grow-0"
                      >
                        {isSearching ? "Searching..." : "Search or Analyze URL"}
                      </button>

                      <div className="relative group w-full md:w-auto">
                        <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-600 text-white text-sm rounded p-2 max-w-xs z-20 pointer-events-none mb-2">
                          Upload audio files (MP3, WAV, FLAC) up to 20MB
                        </div>
                        <Link
                          href="/analyze"
                          className="bg-blue-600 text-white font-medium py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors duration-200 text-center block"
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

              <div className="mt-2 text-xs text-gray-500 max-w-3xl mx-auto">
                <p className="font-medium">You can:</p>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                  <li>Search for songs by title, artist, etc.</li>
                  <li>Paste YouTube URLs directly (e.g., https://youtu.be/dQw4w9WgXcQ)</li>
                  <li>Enter a YouTube video ID (e.g., dQw4w9WgXcQ)</li>
                  <li>Upload your own audio file for analysis</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Search Results */}
          {(searchResults.length > 0 || isSearching) && (
            <div className="max-w-4xl mx-auto mt-3">
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
            <div className="max-w-4xl mx-auto mt-4">
              <h3 className="text-lg font-medium text-gray-800 mb-3 text-center">
                See ChordMini in Action
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <Image
                    src="/demo1.png"
                    alt="ChordMini Beat and Chord Analysis Demo"
                    width={800}
                    height={450}
                    className="w-full h-auto"
                  />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800">Beat & Chord Analysis</h4>
                    <p className="text-sm text-gray-600">Visualize chord progressions and beat patterns in real-time</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <Image
                    src="/demo2.png"
                    alt="ChordMini Lyrics Transcription Demo"
                    width={800}
                    height={450}
                    className="w-full h-auto"
                  />
                  <div className="p-3">
                    <h4 className="font-medium text-gray-800">Lyrics & Chord Transcription</h4>
                    <p className="text-sm text-gray-600">Follow along with synchronized lyrics and chord annotations</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Videos - Only show when not displaying search results */}
          {!searchResults.length && !isSearching && (
            <div className="max-w-4xl mx-auto mt-3">
              <RecentVideos />
            </div>
          )}

          {/* Information Container - Further reduced top margin */}
          <div className="max-w-4xl mx-auto mt-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4 w-full">
              <h3 className="text-xl font-medium text-gray-800 mb-2">
                About This App
              </h3>

              <p className="text-gray-700 mb-3 text-base">
                This application uses audio processing and machine learning to detect musical chords and beats in audio files or YouTube videos.
              </p>

              <div className="grid md:grid-cols-3 gap-2 text-sm">
                <div className="bg-white p-2 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-0.5">Chord Detection</h4>
                  <p className="text-gray-600 text-sm">Identifies major, minor, and 7th chords in the audio with customizable models for different music genres.</p>
                </div>

                <div className="bg-white p-2 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-0.5">Beat Tracking</h4>
                  <p className="text-gray-600 text-sm">Detects rhythmic patterns and beat timings with selectable models for optimal accuracy.</p>
                </div>

                <div className="bg-white p-2 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-0.5">Smart Caching</h4>
                  <p className="text-gray-600 text-sm">Firebase-powered caching system for faster analysis of previously processed videos.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-sm mt-2">
                <div className="bg-white p-2 rounded-md shadow-sm border border-gray-200 flex items-start">
                  <div className="flex-grow">
                    <h4 className="font-medium text-gray-800 mb-0.5">Lyrics Transcription</h4>
                    <p className="text-gray-600 text-sm">Synchronized lyrics with chord annotations positioned above words for professional lead sheet layout.</p>
                  </div>
                </div>

                <div className="bg-white p-2 rounded-md shadow-sm border border-gray-200 flex items-start">
                  <div className="flex-grow">
                    <h4 className="font-medium text-gray-800 mb-0.5">Lyrics Translation</h4>
                    <p className="text-gray-600 text-sm">
                      Powered by Gemini AI for accurate translations of non-English lyrics.
                      <span className="inline-block ml-1">
                        <svg width="16" height="16" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
                          <path d="M95.5 15.5L26.5 176.5H165.5L95.5 15.5Z" fill="#8e44ef" />
                        </svg>
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white p-4 mt-auto">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm">&copy; {new Date().getFullYear()} Chord Recognition App. All rights reserved.</p>

          {/* Minimized Cache Management Component */}
          <div className="relative group mt-2 md:mt-0">
            <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute z-20 bg-gray-800 text-white text-sm rounded p-2 max-w-xs bottom-full right-0 mb-4 pointer-events-none">
              <p className="font-medium mb-1">Cache Management</p>
              <p className="text-xs mb-2">Caching helps reduce loading times and YouTube API usage.</p>
            </div>
            <button
              className="rounded-full bg-blue-100 p-1 cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Cache management"
              onClick={() => {
                window.open('/cache-management', '_blank');
              }}
            >
              <svg className="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
