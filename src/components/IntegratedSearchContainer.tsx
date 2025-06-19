'use client';

import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  view_count?: number;
  upload_date?: string;
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
  handleVideoSelect: (videoId: string) => void;
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
  handleVideoSelect
}) => {
  const [showMoreResults, setShowMoreResults] = useState(false);

  // Format view count with commas
  const formatViews = (count?: number) => {
    if (!count) return 'N/A views';
    return new Intl.NumberFormat('en-US').format(count) + ' views';
  };

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
    <div className="bg-white dark:bg-content-bg rounded-lg shadow-card hover:shadow-lg transition-all duration-300 w-full border border-gray-200 dark:border-gray-600">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-600">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 text-center transition-colors duration-300">
          Analyze Music
        </h3>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-3">
          {/* Search Input Row */}
          <div className="flex gap-3">
            <div className="flex-1">
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
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              />
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>

            {/* Upload Song Button */}
            <div className="relative group">
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full right-0 bg-gray-600 text-white text-sm rounded p-2 max-w-xs z-20 pointer-events-none mb-2">
                Upload audio files (MP3, WAV, FLAC) up to 20MB
              </div>
              <Link
                href="/analyze"
                className="bg-blue-600 dark:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 text-center block whitespace-nowrap flex items-center gap-2"
                aria-label="Upload audio file"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Song
              </Link>
            </div>
          </div>

          {/* Search Button */}
          <button
            type="submit"
            disabled={isSearching}
            className="w-full bg-blue-600 dark:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSearching ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Searching...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search YouTube
              </>
            )}
          </button>
        </form>

        {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
      </div>

      {/* Search Results */}
      {(searchResults.length > 0 || isSearching) && (
        <div className="p-4">
          {isSearching ? (
            <div className="flex flex-col items-center py-8">
              <div className="relative">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-center text-gray-700 dark:text-gray-300 font-medium mt-3">Searching YouTube...</p>
              <p className="text-center text-gray-500 dark:text-gray-400 text-sm mt-1">Results will appear in a moment</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Search Results</h4>
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
                    onClick={() => handleVideoSelect(result.id)}
                  >
                    <div className="flex-shrink-0 w-32 h-18 relative overflow-hidden rounded-md">
                      <Image
                        src={result.thumbnail}
                        alt={result.title}
                        className="object-cover"
                        fill
                        sizes="128px"
                      />
                      {result.duration_string && (
                        <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 py-0.5 rounded">
                          {result.duration_string}
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                      <h5 className="font-medium line-clamp-2 text-gray-800 dark:text-gray-100 text-sm">{result.title}</h5>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.channel}</p>
                      <div className="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-500">
                        {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
                        {result.upload_date && result.view_count && <span className="mx-1">•</span>}
                        {result.view_count && <span>{formatViews(result.view_count)}</span>}
                      </div>
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
                            onClick={() => handleVideoSelect(result.id)}
                          >
                            <div className="flex-shrink-0 w-32 h-18 relative overflow-hidden rounded-md">
                              <Image
                                src={result.thumbnail}
                                alt={result.title}
                                className="object-cover"
                                fill
                                sizes="128px"
                              />
                              {result.duration_string && (
                                <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 py-0.5 rounded">
                                  {result.duration_string}
                                </div>
                              )}
                            </div>
                            <div className="ml-3 flex-1 min-w-0">
                              <h5 className="font-medium line-clamp-2 text-gray-800 dark:text-gray-100 text-sm">{result.title}</h5>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.channel}</p>
                              <div className="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-500">
                                {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
                                {result.upload_date && result.view_count && <span className="mx-1">•</span>}
                                {result.view_count && <span>{formatViews(result.view_count)}</span>}
                              </div>
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
