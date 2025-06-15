"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

export default function CacheManagementPage() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
    } catch {
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
    } catch {
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
    } catch {
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
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900 transition-colors duration-300">
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Cache Management</h1>
          <Link href="/" className="text-white hover:text-blue-100 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4">
        <div className="max-w-3xl mx-auto my-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-medium text-gray-800">Cache Status</h2>
              <div className="flex space-x-2">
                <button
                  onClick={cleanCache}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  aria-label="Clean old cache entries"
                >
                  Clean Old Entries
                </button>
                <button
                  onClick={clearCache}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  aria-label="Clear all cache entries"
                >
                  Clear All Cache
                </button>
              </div>
            </div>

            {message && (
              <div className={`p-3 mb-4 rounded text-sm ${
                message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {message.text}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <>
                {cacheStatus ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Cached Videos</p>
                        <p className="text-2xl font-medium text-blue-800">{cacheStatus.cacheEntries}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Total Size</p>
                        <p className="text-2xl font-medium text-blue-800">{formatBytes(cacheStatus.totalSize)}</p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <h3 className="text-lg font-medium text-gray-800 mb-3">Cache Entries</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video ID</th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Processed</th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {cacheStatus.cacheIndex.map((entry) => (
                              <tr key={entry.videoId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{entry.videoId}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{formatDate(entry.processedAt)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{entry.fileSize ? formatBytes(entry.fileSize) : 'Unknown'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-600 py-8">No cache information available</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>


    </div>
  );
}
