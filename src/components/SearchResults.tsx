import React from 'react';

interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  view_count?: number;
  upload_date?: string;
}

interface SearchResultsProps {
  results: YouTubeSearchResult[];
  isLoading: boolean;
  error: string | null;
  onVideoSelect: (videoId: string) => void;
  fromCache?: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  isLoading,
  error,
  onVideoSelect,
  fromCache = false
}) => {
  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-card mt-4">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <p className="text-center text-gray-700 font-medium mt-3">Searching YouTube...</p>
          <p className="text-center text-gray-500 text-sm mt-1">Results will appear in a moment</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-card mt-4">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return null; // Don't show anything if no results
  }

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

  return (
    <div className="p-6 bg-white rounded-xl shadow-card mt-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-heading font-semibold text-gray-800">Search Results</h3>
        {fromCache && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
            From Cache
          </span>
        )}
      </div>
      <div className="space-y-4">
        {results.map((result) => (
          <div
            key={result.id}
            className="flex cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors border border-gray-100 hover:border-gray-200"
            onClick={() => onVideoSelect(result.id)}
          >
            <div className="flex-shrink-0 w-36 h-20 relative overflow-hidden rounded-md">
              <img
                src={result.thumbnail}
                alt={result.title}
                className="object-cover w-full h-full"
                width={144}
                height={80}
              />
              {result.duration_string && (
                <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 py-0.5 rounded">
                  {result.duration_string}
                </div>
              )}
            </div>
            <div className="ml-4 flex-1">
              <h4 className="font-medium line-clamp-2 text-gray-800">{result.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{result.channel}</p>
              <div className="flex items-center mt-1 text-xs text-gray-500">
                {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
                {result.upload_date && result.view_count && <span className="mx-2">•</span>}
                {result.view_count && <span>{formatViews(result.view_count)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchResults;