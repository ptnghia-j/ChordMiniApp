'use client';

import { useState, useEffect } from 'react';

interface CacheStatus {
  cacheEntries: number;
  totalSize: number;
  cacheIndex: Array<{
    videoId: string;
    audioUrl: string;
    videoUrl?: string | null;
    processedAt: number;
    fileSize?: number;
  }>;
}

export default function CacheManager() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Fetch cache status
  const fetchCacheStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cache');
      const data = await response.json();
      
      if (data.success) {
        setCacheStatus(data);
      } else {
        setMessage({ text: data.error || 'Failed to fetch cache status', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Failed to fetch cache status', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Clear cache
  const clearCache = async () => {
    if (!confirm('Are you sure you want to clear the entire cache?')) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'clear' }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        fetchCacheStatus();
      } else {
        setMessage({ text: data.error || 'Failed to clear cache', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Failed to clear cache', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Clean old cache entries
  const cleanCache = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'clean', maxAge: 7 }), // Clean entries older than 7 days
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        fetchCacheStatus();
      } else {
        setMessage({ text: data.error || 'Failed to clean cache', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Failed to clean cache', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Load cache status on mount
  useEffect(() => {
    fetchCacheStatus();
  }, []);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Cache Management</h3>
      
      {message && (
        <div className={`p-2 mb-3 rounded text-sm ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}
      
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {cacheStatus ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Cached videos:</span> {cacheStatus.cacheEntries}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Total size:</span> {formatBytes(cacheStatus.totalSize)}
                  </p>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={cleanCache}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    Clean Old
                  </button>
                  <button
                    onClick={clearCache}
                    className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:underline flex items-center"
              >
                {showDetails ? 'Hide' : 'Show'} details
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 ml-1 transition-transform ${showDetails ? 'transform rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              
              {showDetails && (
                <div className="mt-2 border-t pt-2">
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-2 py-1 text-left">Video ID</th>
                          <th className="px-2 py-1 text-left">Date</th>
                          <th className="px-2 py-1 text-left">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cacheStatus.cacheIndex.map((entry) => (
                          <tr key={entry.videoId} className="border-t border-gray-100">
                            <td className="px-2 py-1">{entry.videoId}</td>
                            <td className="px-2 py-1">{formatDate(entry.processedAt)}</td>
                            <td className="px-2 py-1">{entry.fileSize ? formatBytes(entry.fileSize) : 'Unknown'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No cache information available</p>
          )}
          
          <div className="mt-3 text-xs text-gray-500">
            <p>Caching helps reduce loading times and YouTube API usage.</p>
          </div>
        </>
      )}
    </div>
  );
}
