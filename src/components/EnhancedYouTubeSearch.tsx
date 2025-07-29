'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { YouTubeApiService, YouTubeSearchResult, youtubeUtils } from '@/services/youtubeApiService';

// Simple debounce utility
function useDebounce(
  callback: (query: string) => Promise<void>,
  delay: number
): (query: string) => void {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  return useCallback(
    (query: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(query);
      }, delay);
    },
    [callback, delay]
  );
}

interface EnhancedYouTubeSearchProps {
  onVideoSelect: (videoId: string, title?: string) => void;
  apiKey: string;
  className?: string;
}

export const EnhancedYouTubeSearch: React.FC<EnhancedYouTubeSearchProps> = ({
  onVideoSelect,
  apiKey,
  className = ''
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'search' | 'url'>('search');

  // Initialize YouTube API service
  const youtubeApi = useMemo(() => new YouTubeApiService(apiKey), [apiKey]);

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    // Check if input is a YouTube URL
    const videoId = youtubeUtils.extractVideoId(searchQuery);
    if (videoId) {
      setSearchMode('url');
      setLoading(true);
      setError(null);

      try {
        // FIXED: Use backend API instead of direct YouTube API calls
        console.log(`🔍 Fetching metadata for direct URL: ${videoId}`);

        const response = await fetch(`/api/youtube/info?videoId=${videoId}`);
        const data = await response.json();

        if (data.success && data.title) {
          // Navigate with full metadata like search results
          onVideoSelect(videoId, data.title);
          console.log(`✅ Direct URL metadata fetched: "${data.title}"`);
        } else {
          // Fallback to videoId only if metadata fetch fails
          onVideoSelect(videoId);
          console.log(`⚠️ Direct URL metadata fetch failed: ${data.error || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Failed to fetch video metadata for direct URL:', err);
        // Fallback to videoId only if metadata fetch fails
        onVideoSelect(videoId);
      } finally {
        setLoading(false);
      }
      return;
    }

    setSearchMode('search');
    setLoading(true);
    setError(null);

    try {
      const searchResults = await youtubeApi.searchWithDetails(searchQuery, 10, {
        order: 'relevance',
        videoCategoryId: '10' // Music category
      });
      setResults(searchResults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults([]);
      console.error('YouTube search error:', err);
    } finally {
      setLoading(false);
    }
  }, [youtubeApi, onVideoSelect]);

  // Debounced search function
  const debouncedSearch = useDebounce(performSearch, 500);

  // Effect to trigger search when query changes
  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  const handleVideoSelect = (result: YouTubeSearchResult) => {
    // Pass both videoId and title to the parent component
    onVideoSelect(result.id, result.title);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setError(null);
  };

  return (
    <div className={`enhanced-youtube-search ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search for music or paste YouTube URL..."
            className="w-full p-4 pr-12 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          />
          
          {/* Loading Spinner */}
          {loading && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}

          {/* Search Icon */}
          {!loading && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Search Mode Indicator */}
        {query && (
          <div className="absolute -bottom-6 left-0 text-sm text-gray-500">
            {searchMode === 'url' ? (
              <span className="text-green-600">✓ YouTube URL detected</span>
            ) : (
              <span>Searching YouTube...</span>
            )}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
          <p className="text-red-600 text-sm mt-1">
            Try a different search term or paste a direct YouTube URL.
          </p>
        </div>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Search Results ({results.length})
          </h3>
          {results.map((result) => (
            <SearchResultCard
              key={result.id}
              result={result}
              onSelect={() => handleVideoSelect(result)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && query && results.length === 0 && searchMode === 'search' && (
        <div className="mt-6 text-center py-8">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
          </svg>
          <p className="text-gray-500">No videos found for &quot;{query}&quot;</p>
          <p className="text-gray-400 text-sm mt-1">Try a different search term or paste a YouTube URL</p>
        </div>
      )}
    </div>
  );
};

// Search Result Card Component
const SearchResultCard: React.FC<{
  result: YouTubeSearchResult;
  onSelect: () => void;
}> = ({ result, onSelect }) => {
  const [imageError, setImageError] = useState(false);

  // Validate thumbnail URL and provide fallback
  const getValidThumbnailUrl = (url: string): string => {
    if (!url || url.trim() === '' || url === 'undefined' || url === 'null') {
      return `https://img.youtube.com/vi/${result.id}/mqdefault.jpg`;
    }
    return url;
  };

  const validThumbnailUrl = getValidThumbnailUrl(result.thumbnail);

  return (
    <div
      className="flex p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-all duration-200 group"
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0">
        {!imageError ? (
          <Image
            src={validThumbnailUrl}
            alt={result.title}
            width={160}
            height={112}
            className="w-40 h-28 object-cover rounded-lg"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-40 h-28 bg-gray-200 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        
        {/* Duration Badge */}
        {result.duration && (
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
            {result.duration}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="ml-4 flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {result.title}
        </h3>
        
        <p className="text-sm text-gray-600 mt-1 flex items-center">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          {result.channelTitle}
        </p>

        {/* Stats */}
        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
          <span>{new Date(result.publishedAt).toLocaleDateString()}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 mt-2 line-clamp-2">
          {result.description}
        </p>
      </div>

      {/* Action Arrow */}
      <div className="flex items-center ml-4">
        <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};
