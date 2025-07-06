'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HiUpload } from 'react-icons/hi';
import Link from 'next/link';

interface StickySearchBarProps {
  isVisible: boolean;
  className?: string;
}

const StickySearchBar: React.FC<StickySearchBarProps> = ({
  isVisible,
  className = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching] = useState(false);
  const router = useRouter();

  const extractVideoId = (url: string): string | null => {
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
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if it's a direct YouTube URL or video ID
    const videoId = extractVideoId(searchQuery);
    if (videoId) {
      router.push(`/analyze/${videoId}`);
      return;
    }

    // For search queries, redirect to home page with search
    router.push(`/?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <div
      className={`sticky-search-bar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      } ${className}`}
    >
      <div className="flex items-center gap-1 xl:gap-2 w-full">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search music or paste URL..."
              className="w-full pl-2 xl:pl-3 pr-8 xl:pr-10 py-1 xl:py-1.5 text-xs xl:text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1 xl:right-2 top-1/2 transform -translate-y-1/2 p-0.5 xl:p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 disabled:opacity-50"
              aria-label="Search"
            >
              {isSearching ? (
                <div className="animate-spin rounded-full h-3 w-3 xl:h-4 xl:w-4 border-b-2 border-blue-600"></div>
              ) : (
                <svg className="w-3 h-3 xl:w-4 xl:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>
          </div>
        </form>
        
        <Link
          href="/analyze"
          className="bg-blue-600 dark:bg-blue-700 text-white font-medium py-1 xl:py-1.5 px-2 xl:px-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 whitespace-nowrap flex items-center gap-1 text-xs xl:text-sm xl:gap-2"
          aria-label="Upload audio file"
        >
          <HiUpload className="w-3 h-3 xl:w-4 xl:h-4" />
          <span className="hidden lg:inline xl:inline">Upload</span>
        </Link>
      </div>
    </div>
  );
};

export default StickySearchBar;
