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
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  isLoading,
  error,
  onVideoSelect
}) => {
  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-card mt-4">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
        <p className="text-center text-gray-500 mt-3">Searching for videos...</p>
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
      <h3 className="text-xl font-heading font-semibold mb-4 text-gray-800">Search Results</h3>
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