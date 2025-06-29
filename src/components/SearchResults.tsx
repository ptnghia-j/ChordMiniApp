import React, { useState } from 'react';
import OptimizedImage from './OptimizedImage';

interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  upload_date?: string;
}

interface SearchResultsProps {
  results: YouTubeSearchResult[];
  isLoading: boolean;
  error: string | null;
  onVideoSelect: (videoId: string, title?: string) => void;
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
      <div className="p-6 bg-white dark:bg-content-bg rounded-xl shadow-card mt-4 transition-colors duration-300">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <p className="text-center text-gray-700 dark:text-gray-300 font-medium mt-3 transition-colors duration-300">Searching YouTube...</p>
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm mt-1 transition-colors duration-300">Results will appear in a moment</p>
          <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-2 transition-colors duration-300">First search may take up to 15 seconds</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white dark:bg-content-bg rounded-xl shadow-card mt-4 transition-colors duration-300">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return null; // Don't show anything if no results
  }

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
    <div className="p-6 bg-white dark:bg-content-bg rounded-xl shadow-card mt-6 transition-colors duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 transition-colors duration-300">Search Results</h3>
        {fromCache && (
          <span className="text-xs border-2 border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-1 rounded-md">
            From Cache
          </span>
        )}
      </div>
      <div className="space-y-4">
        {results.map((result) => (
          <div
            key={result.id}
            className="flex cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-3 rounded-lg transition-colors border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
            onClick={() => onVideoSelect(result.id, result.title)}
          >
            <ThumbnailImage
              src={result.thumbnail}
              alt={result.title}
              videoId={result.id}
              duration={result.duration_string}
            />
            <div className="ml-4 flex-1">
              <h4 className="font-medium line-clamp-2 text-gray-800 dark:text-gray-100 transition-colors duration-300">{result.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-300">{result.channel}</p>
              <div className="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-500 transition-colors duration-300">
                {result.upload_date && <span>{formatDate(result.upload_date)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Thumbnail Image Component with Error Handling
const ThumbnailImage: React.FC<{
  src: string;
  alt: string;
  videoId: string;
  duration?: string;
}> = ({ src, alt, videoId, duration }) => {
  const [imageError, setImageError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  // Validate and provide fallback for thumbnail URL
  const getValidThumbnailUrl = (url: string, fallbackVideoId: string): string => {
    if (!url || url.trim() === '' || url === 'undefined' || url === 'null') {
      return `https://img.youtube.com/vi/${fallbackVideoId}/mqdefault.jpg`;
    }
    return url;
  };

  const handleImageError = () => {
    if (!imageError) {
      // Try YouTube's fallback thumbnail
      const fallbackUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      if (currentSrc !== fallbackUrl) {
        setCurrentSrc(fallbackUrl);
        return;
      }
    }
    setImageError(true);
  };

  const validSrc = getValidThumbnailUrl(currentSrc, videoId);

  return (
    <div className="flex-shrink-0 w-36 h-20 relative overflow-hidden rounded-md">
      {!imageError ? (
        <OptimizedImage
          src={validSrc}
          alt={alt}
          width={144}
          height={80}
          className="object-cover w-full h-full"
          sizes="(max-width: 768px) 144px, 144px"
          priority={false}
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
          onError={handleImageError}
        />
      ) : (
        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        </div>
      )}
      {duration && (
        <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 py-0.5 rounded">
          {duration}
        </div>
      )}
    </div>
  );
};

export default SearchResults;