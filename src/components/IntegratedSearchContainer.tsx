'use client';

import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HiUpload } from 'react-icons/hi';
import { Tooltip } from '@heroui/react';

interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  view_count?: number;
  upload_date?: string;
  description?: string;
  url?: string;
}

interface IntegratedSearchContainerProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearch: (e: FormEvent) => void;
  isSearching: boolean;
  searchError: string | null;
  error: string;
  setError: (error: string) => void;
  setSearchError: (error: string | null) => void;
  searchResults: YouTubeSearchResult[];
  handleVideoSelect: (videoId: string, title?: string, metadata?: YouTubeSearchResult) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const IntegratedSearchContainer: React.FC<IntegratedSearchContainerProps> = ({
  searchQuery,
  setSearchQuery,
  handleSearch,
  isSearching,
  searchError,
  error,
  setError,
  setSearchError,
  searchResults,
  handleVideoSelect,
  containerRef
}) => {
  const [showMoreResults, setShowMoreResults] = useState(false);



  // Format upload date from YYYYMMDD to readable format
  const formatDate = (uploadDate?: string) => {
    if (!uploadDate || uploadDate.length !== 8) return '';

    const year = uploadDate.substring(0, 4);
    const month = uploadDate.substring(4, 6);
    const day = uploadDate.substring(6, 8);

    const date = new Date(`${year}-${month}-${day}`);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Split results into initial 5 and additional 5
  const initialResults = searchResults.slice(0, 5);
  const additionalResults = searchResults.slice(5, 10);
  const hasMoreResults = additionalResults.length > 0;

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-content-bg rounded-lg shadow-card hover:shadow-lg transition-all duration-300 w-full border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 group"
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 text-center transition-colors duration-300">
          Analyze Music
        </h3>

        {/* Search Form */}
        <form onSubmit={handleSearch}>
          {/* Search Input Row */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                id="youtube-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setError('');
                  setSearchError(null);
                }}
                placeholder="Search for music or paste YouTube URL..."
                className="w-full pl-4 pr-12 py-2 text-base border-2 border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              />
              {/* Search Icon Button */}
              <button
                type="submit"
                disabled={isSearching}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 disabled:opacity-50"
                aria-label="Search"
              >
                {isSearching ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>

            {/* Upload Song Button */}
            <div className="relative group">
              <Tooltip
                content={
                  <div className="px-1 py-2">
                    <div className="text-sm">Upload audio files (MP3, WAV, FLAC) up to 20MB</div>
                  </div>
                }
              >
                <Link
                href="/analyze"
                className="font-medium py-2 px-4 rounded-lg whitespace-nowrap flex items-center gap-2 transition-all duration-200 bg-default-100 dark:bg-default-200/20 border border-default-300 dark:border-default-400 text-foreground hover:bg-default-200 dark:hover:bg-default-300/30"
                aria-label="Upload audio file"
                >
                  <HiUpload className="w-4 h-4" />
                  Upload Song
                </Link>
              </Tooltip>
              
            </div>
          </div>




        </form>

        {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
      </div>

      {/* Search Results */}
      {(searchResults.length > 0 || isSearching) && (
        <div className="p-2">
          {isSearching ? (
            <div className="flex flex-col items-center py-6">
              <div className="relative">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-center text-gray-700 dark:text-gray-300 font-medium mt-2">Searching YouTube...</p>
              <p className="text-center text-gray-500 dark:text-gray-400 text-sm mt-1">Results will appear in a moment</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100">Search Results</h4>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Initial 5 Results */}
              <div className="space-y-3">
                {initialResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-3 rounded-lg transition-colors border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500"
                    onClick={() => handleVideoSelect(result.id, result.title, result)}
                  >
                    <div className="flex-shrink-0 w-20 h-12 relative overflow-hidden rounded-md">
                      <Image
                        src={result.thumbnail}
                        alt={result.title}
                        className="object-cover"
                        fill
                        sizes="80px"
                      />

                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                      <h5 className="font-medium line-clamp-2 text-gray-800 dark:text-gray-100 text-sm leading-tight mb-1">{result.title}</h5>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">{result.channel}</p>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-500 mb-1">
                        {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
                      </div>
                      {result.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                          {result.description.length > 120 ? result.description.substring(0, 120) + '...' : result.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Show More Button and Additional Results */}
              {hasMoreResults && (
                <div className="mt-4">
                  {!showMoreResults ? (
                    <button
                      onClick={() => setShowMoreResults(true)}
                      className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                      <span>Show More ({additionalResults.length} more results)</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      {/* Additional Results */}
                      <div className="space-y-3 mb-3">
                        {additionalResults.map((result) => (
                          <div
                            key={result.id}
                            className="flex cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-3 rounded-lg transition-colors border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500"
                            onClick={() => handleVideoSelect(result.id, result.title, result)}
                          >
                            <div className="flex-shrink-0 w-20 h-12 relative overflow-hidden rounded-md">
                              <Image
                                src={result.thumbnail}
                                alt={result.title}
                                className="object-cover"
                                fill
                                sizes="80px"
                              />

                            </div>
                            <div className="ml-3 flex-1 min-w-0">
                              <h5 className="font-medium line-clamp-2 text-gray-800 dark:text-gray-100 text-sm leading-tight mb-1">{result.title}</h5>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">{result.channel}</p>
                              <div className="flex items-center text-xs text-gray-500 dark:text-gray-500 mb-1">
                                {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
                              </div>
                              {result.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                                  {result.description.length > 120 ? result.description.substring(0, 120) + '...' : result.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Show Less Button */}
                      <button
                        onClick={() => setShowMoreResults(false)}
                        className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 flex items-center justify-center gap-2"
                      >
                        <span>Show Less</span>
                        <svg className="w-4 h-4 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default IntegratedSearchContainer;
