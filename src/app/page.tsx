"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SearchResults from '@/components/SearchResults';
import CacheManager from '@/components/CacheManager';

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

      <main className="flex-grow container mx-auto p-4">
        <div className="max-w-3xl mx-auto my-8">
          <h2 className="text-3xl font-heading font-bold text-gray-800 mb-6 text-center">
            Analyze Music to Detect Chords
          </h2>

          <p className="text-lg text-gray-600 mb-8 text-center">
            Upload a local audio file or analyze a YouTube video to detect the chords and beats.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* YouTube Analysis Option */}
            <div className="bg-white rounded-lg shadow-card p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-heading font-bold text-gray-800 mb-4">
                Analyze YouTube Video
              </h3>

              <div className="space-y-6">
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                      />
                      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={isSearching}
                      className="w-full bg-primary-600 text-white font-medium py-2 px-4 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                      {isSearching ? "Searching..." : "Search or Analyze URL"}
                    </button>
                  </form>
                  {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-500">
                <p className="font-medium">You can:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>Search for songs by title, artist, etc.</li>
                  <li>Paste YouTube URLs directly (e.g., https://youtu.be/dQw4w9WgXcQ)</li>
                  <li>Enter a YouTube video ID (e.g., dQw4w9WgXcQ)</li>
                </ul>
              </div>
            </div>

            {/* Local Audio Analysis Option */}
            <div className="bg-white rounded-lg shadow-card p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-heading font-bold text-gray-800 mb-4">
                Analyze Local Audio File
              </h3>

              <p className="text-gray-600 mb-6">
                Upload an audio file from your device for chord analysis.
              </p>

              <div className="flex flex-col items-center justify-center space-y-4">
                <img
                  src="/audio-waveform.svg"
                  alt="Audio waveform"
                  className="w-32 h-32 opacity-80"
                  onError={(e) => {
                    // If SVG fails to load, replace with text
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />

                <Link
                  href="/analyze"
                  className="w-full bg-primary-600 text-white font-medium py-2 px-4 rounded-md hover:bg-primary-700 transition-colors text-center"
                >
                  Upload Audio File
                </Link>
              </div>

              <div className="mt-4 text-sm text-gray-500">
                <p>Supported formats: MP3, WAV, M4A, FLAC</p>
                <p className="mt-1">For best results, use high-quality audio with minimal background noise.</p>
              </div>
            </div>
          </div>

          {/* Search Results */}
          {(searchResults.length > 0 || isSearching) && (
            <div className="mt-6">
              <SearchResults
                results={searchResults}
                isLoading={isSearching}
                error={searchError}
                onVideoSelect={handleVideoSelect}
              />
            </div>
          )}

          {/* Cache Manager */}
          <div className="mt-12">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-50 rounded-lg p-6">
                <h3 className="text-xl font-heading font-bold text-blue-800 mb-3">
                  About This App
                </h3>

                <p className="text-blue-700 mb-4">
                  This application uses audio processing and machine learning to detect musical chords and beats in audio files or YouTube videos.
                </p>

                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <h4 className="font-bold text-gray-800 mb-1">Chord Detection</h4>
                    <p className="text-gray-600">Identifies major, minor, and 7th chords in the audio using spectral analysis.</p>
                  </div>

                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <h4 className="font-bold text-gray-800 mb-1">Beat Tracking</h4>
                    <p className="text-gray-600">Detects rhythmic patterns and beat timings for synchronized chord display.</p>
                  </div>

                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <h4 className="font-bold text-gray-800 mb-1">Local Processing</h4>
                    <p className="text-gray-600">All audio processing happens in your browser - no files are uploaded to servers.</p>
                  </div>
                </div>
              </div>

              {/* Cache Manager Component */}
              <CacheManager />
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white p-4 mt-auto">
        <div className="container mx-auto text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Chord Recognition App. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
