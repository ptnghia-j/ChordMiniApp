"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SearchResults from '@/components/SearchResults';

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
  const router = useRouter();

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
      setSearchError(
        error instanceof Error ? error.message : 'Failed to search for videos'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleVideoSelect = (videoId: string) => {
    router.push(`/analyze/${videoId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-2xl font-heading font-bold">Chord Mini</h1>
        </div>
      </header>

      {/* Main content with hero image background */}
      <main className="flex-grow relative">
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
        <div className="relative z-10 container mx-auto p-4">
          {/* App Title and Description */}
          <div className="py-16 md:py-20 flex flex-col items-center justify-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2 font-heading">ChordMini</h2>
            <p className="text-xl md:text-2xl text-gray-700 font-light mb-8">Chord recognition and analysis application</p>
          </div>

          <div className="max-w-3xl mx-auto">
            {/* YouTube Analysis Option - Full Width */}
            <div className="bg-white rounded-lg shadow-card p-6 hover:shadow-lg transition-shadow w-full">
              <h3 className="text-xl font-heading font-bold text-gray-800 mb-4 text-center">
                Analyze Music
              </h3>

              <div className="space-y-6 max-w-2xl mx-auto">
                {/* Unified Search/URL Input */}
                <div>
                  <form onSubmit={handleSearch} className="space-y-4">
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

                    <div className="flex flex-col md:flex-row md:items-center md:space-x-4">
                      <button
                        type="submit"
                        disabled={isSearching}
                        className="w-full md:w-3/4 bg-primary-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors duration-200 disabled:opacity-50"
                      >
                        {isSearching ? "Searching..." : "Search or Analyze URL"}
                      </button>

                      <div className="relative group w-full md:w-1/4 mt-4 md:mt-0">
                        <Link
                          href="/analyze"
                          className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 text-center block"
                          aria-label="Upload audio file"
                        >
                          Upload Audio
                        </Link>
                        <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-sm rounded p-2 max-w-xs z-10">
                          Upload audio files (MP3, WAV, FLAC) up to 20MB
                        </div>
                      </div>
                    </div>
                  </form>
                  {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-500 max-w-2xl mx-auto">
                <p className="font-medium">You can:</p>
                <ul className="list-disc list-inside mt-1">
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
            <div className="max-w-3xl mx-auto mt-6">
              <SearchResults
                results={searchResults}
                isLoading={isSearching}
                error={searchError}
                onVideoSelect={handleVideoSelect}
              />
            </div>
          )}

          {/* Information Container */}
          <div className="max-w-3xl mx-auto mt-12">
            <div className="bg-white border border-gray-200 rounded-lg p-6 w-full">
              <h3 className="text-xl font-medium text-gray-800 mb-4">
                About This App
              </h3>

              <p className="text-gray-700 mb-6">
                This application uses audio processing and machine learning to detect musical chords and beats in audio files or YouTube videos.
              </p>

              <div className="grid md:grid-cols-3 gap-6 text-sm">
                <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-2">Chord Detection</h4>
                  <p className="text-gray-600">Identifies major, minor, and 7th chords in the audio using spectral analysis.</p>
                </div>

                <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-2">Beat Tracking</h4>
                  <p className="text-gray-600">Detects rhythmic patterns and beat timings for synchronized chord display.</p>
                </div>

                <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
                  <h4 className="font-medium text-gray-800 mb-2">Local Processing</h4>
                  <p className="text-gray-600">All audio processing happens in your browser - no files are uploaded to servers.</p>
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
            <button
              className="rounded-full bg-blue-100 p-1 cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Cache management"
              onClick={() => {
                // This will be handled by the tooltip/modal
              }}
            >
              <svg className="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-[300ms] absolute z-10 bg-gray-800 text-white text-sm rounded p-2 max-w-xs bottom-full right-0 mb-2">
              <p className="font-medium mb-1">Cache Management</p>
              <p className="text-xs mb-2">Caching helps reduce loading times and YouTube API usage.</p>
              <div className="flex space-x-2 justify-end">
                <a
                  href="/cache-management"
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open('/cache-management', '_blank');
                  }}
                >
                  Manage Cache
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
