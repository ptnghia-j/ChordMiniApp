'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

// Shared search state hook
export const useSharedSearchState = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Extract video ID from URL or direct ID
  const extractVideoId = useCallback((url: string): string | null => {
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

    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    return null;
  }, []);

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
      } catch (error) {
        console.error('Search error:', error);
        setSearchError(error instanceof Error ? error.message : 'Search failed');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400); // 400ms debounce delay for optimal UX
  }, [extractVideoId]);

  // Handle form submission (Enter key)
  const handleSearch = useCallback(async (e: React.FormEvent) => {
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
  }, [searchQuery, extractVideoId, router, performSearch]);

  // Handle video selection from search results
  const handleVideoSelect = useCallback((videoId: string, title?: string) => {
    // Navigate to analysis page with optional title
    const url = title
      ? `/analyze/${videoId}?title=${encodeURIComponent(title)}`
      : `/analyze/${videoId}`;
    router.push(url);
  }, [router]);

  // Real-time search effect - triggers search when searchQuery changes
  useEffect(() => {
    if (searchQuery.trim() && searchQuery.length > 2) {
      // Only search if query is meaningful (more than 2 characters)
      // Check if it's not a direct YouTube URL or video ID
      const videoId = extractVideoId(searchQuery);
      if (!videoId) {
        // Trigger debounced search for search queries
        performSearch(searchQuery);
      }
    } else if (searchQuery.trim() === '') {
      // Clear results when search is empty
      setSearchResults([]);
      setSearchError(null);
    }
  }, [searchQuery, performSearch, extractVideoId]);

  // Update search query (synchronized across all components)
  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Clear search state
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setIsSearching(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    // State
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    
    // Actions
    updateSearchQuery,
    handleSearch,
    handleVideoSelect,
    clearSearch,
    setSearchError,
    
    // Utilities
    extractVideoId,
  };
};
