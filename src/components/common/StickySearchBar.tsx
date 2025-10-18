'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HiUpload } from 'react-icons/hi';
import Link from 'next/link';
import Image from 'next/image';
import { useSharedSearchState } from '@/hooks/search/useSharedSearchState';
import { useTheme } from '@/contexts/ThemeContext';

interface StickySearchBarProps {
  isVisible: boolean;
  className?: string;
}

const StickySearchBar: React.FC<StickySearchBarProps> = ({
  isVisible,
  className = ''
}) => {
  const { theme } = useTheme();
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Use shared search state for synchronization with main search box
  const {
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    updateSearchQuery,
    handleSearch,
    handleVideoSelect
  } = useSharedSearchState();

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show results when there are search results or when searching
  useEffect(() => {
    setShowResults((searchResults.length > 0 || isSearching || !!searchError) && searchQuery.length > 2);
  }, [searchResults, isSearching, searchError, searchQuery]);



  return (
    <div
      ref={searchContainerRef}
      className={`sticky-search-bar transition-all duration-300 ease-in-out relative ${
        isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      } ${className}`}
    >
      <div className="flex items-center gap-1 xl:gap-2 w-full relative">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => updateSearchQuery(e.target.value)}
              placeholder="Search music or paste URL..."
              className="w-full min-w-[200px] xl:min-w-[300px] pl-2 xl:pl-3 pr-8 xl:pr-10 py-1 xl:py-1.5 text-xs xl:text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
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
          className="font-medium py-1 xl:py-1.5 px-2 xl:px-3 rounded-lg transition-all duration-200 whitespace-nowrap flex items-center gap-1 text-xs xl:text-sm xl:gap-2 bg-default-100 dark:bg-default-200/20 border border-default-300 dark:border-default-400 text-foreground hover:bg-default-200 dark:hover:bg-default-300/30"
          aria-label="Upload audio file"
        >
          <HiUpload className="w-3 h-3 xl:w-4 xl:h-4" />
          <span className="hidden lg:inline xl:inline">Upload</span>
        </Link>

        {/* Search Results Dropdown - positioned relative to parent container */}
        {showResults && (
          <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg border z-50 max-h-80 overflow-y-auto ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-600'
              : 'bg-white border-gray-200'
          }`}>
            {isSearching && (
              <div className="p-3 text-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  Searching...
                </p>
              </div>
            )}

            {searchError && !isSearching && (
              <div className="p-3 text-center">
                <p className={`text-xs ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                  {searchError}
                </p>
              </div>
            )}

            {searchResults.length > 0 && !isSearching && (
              <div className="py-1">
                {searchResults.slice(0, 5).map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      handleVideoSelect(result.id, result.title);
                      setShowResults(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center gap-2`}
                  >
                    <Image
                      src={result.thumbnail}
                      alt={result.title}
                      width={32}
                      height={24}
                      className="w-8 h-6 object-cover rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${
                        theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {result.title}
                      </p>
                      <div className={`text-xs flex items-center gap-2 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        <span>{result.channel}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.length === 0 && !isSearching && !searchError && searchQuery.length > 2 && (
              <div className="p-3 text-center">
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  No results found
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StickySearchBar;
