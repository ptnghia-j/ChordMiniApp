'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import Navigation from '@/components/Navigation';
import { useStatusMonitoring } from '@/hooks/useRateLimiting';
import { FiActivity, FiCheckCircle, FiXCircle, FiAlertTriangle } from 'react-icons/fi';

interface EndpointStatus {
  endpoint: string;
  status: 'online' | 'offline' | 'checking';
  responseTime?: number;
  lastChecked?: string;
  error?: string;
}

export default function StatusPage() {
  const { theme } = useTheme();
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([
    { endpoint: '/', status: 'checking' },
    { endpoint: '/api/model-info', status: 'checking' },
    { endpoint: '/api/detect-beats', status: 'checking' },
    { endpoint: '/api/recognize-chords', status: 'checking' },
    { endpoint: '/api/genius-lyrics', status: 'checking' },
  ]);

  const { isChecking, lastUpdate, rateLimitState, checkAllEndpoints } = useStatusMonitoring();

  const baseUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';



  useEffect(() => {
    // Check immediately on page load
    const performInitialCheck = async () => {
      if (isChecking) return;

      try {
        const results = await checkAllEndpoints();
        if (results.length > 0) {
          setEndpoints(results);
        }
      } catch (error) {
        console.error('Failed to check endpoints:', error);
      }
    };

    performInitialCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only once on mount

  const getStatusColor = (status: EndpointStatus['status']) => {
    switch (status) {
      case 'online':
        return theme === 'dark' 
          ? 'text-green-400 bg-green-900/20 border-green-500'
          : 'text-green-700 bg-green-50 border-green-300';
      case 'offline':
        return theme === 'dark'
          ? 'text-red-400 bg-red-900/20 border-red-500'
          : 'text-red-700 bg-red-50 border-red-300';
      case 'checking':
        return theme === 'dark'
          ? 'text-yellow-400 bg-yellow-900/20 border-yellow-500'
          : 'text-yellow-700 bg-yellow-50 border-yellow-300';
    }
  };

  const getStatusIcon = (status: EndpointStatus['status']) => {
    switch (status) {
      case 'online':
        return <FiCheckCircle className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <FiXCircle className="w-5 h-5 text-red-500" />;
      case 'checking':
        return <FiActivity className="w-5 h-5 text-yellow-500 animate-pulse" />;
    }
  };

  const overallStatus = endpoints.every(e => e.status === 'online') ? 'online' : 
                      endpoints.some(e => e.status === 'online') ? 'partial' : 'offline';

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      
      {/* Hero Section */}
      <div className=" bg-white dark:bg-dark-bg text-black dark:text-white">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <FiActivity className="w-8 h-8" />
              <h1 className="text-3xl font-bold">ChordMini API Status</h1>
            </div>
            <p className="text-lg opacity-90 mb-3">
              Backend service monitoring (checked on page load)
            </p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              overallStatus === 'online' ? 'bg-green-600' :
              overallStatus === 'partial' ? 'bg-yellow-600' : 'bg-red-600'
            }`}>
              {overallStatus === 'online' ? (
                <FiCheckCircle className="w-5 h-5 text-white" />
              ) : overallStatus === 'partial' ? (
                <FiAlertTriangle className="w-5 h-5 text-white" />
              ) : (
                <FiXCircle className="w-5 h-5 text-white" />
              )}
              <span className="font-semibold text-white">
                {overallStatus === 'online' ? 'All Systems Operational' :
                 overallStatus === 'partial' ? 'Partial Outage' : 'Service Unavailable'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Rate Limiting Notification */}
        {rateLimitState.isRateLimited && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <FiAlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Rate Limited</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {rateLimitState.message}
                  {rateLimitState.retryAfter && (
                    <span className="block mt-1">
                      Please wait {rateLimitState.retryAfter} seconds before making more requests.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Service Status - 60% width (3/5) */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Service Status</h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Last updated: {lastUpdate}
                  </span>
                  {isChecking && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                      Checking...
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.endpoint}
                    className={`border rounded-lg p-4 ${getStatusColor(endpoint.status)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(endpoint.status)}
                        <div>
                          <h3 className="font-semibold">
                            {baseUrl}{endpoint.endpoint}
                          </h3>
                          <p className="text-sm opacity-75">
                            {endpoint.endpoint === '/' ? 'Health Check' :
                             endpoint.endpoint === '/api/model-info' ? 'Model Information' :
                             endpoint.endpoint === '/api/detect-beats' ? 'Beat Detection' :
                             endpoint.endpoint === '/api/recognize-chords' ? 'Chord Recognition' :
                             endpoint.endpoint === '/api/genius-lyrics' ? 'Lyrics Fetching' :
                             endpoint.endpoint}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        {endpoint.responseTime && (
                          <div className="text-sm font-medium">
                            {endpoint.responseTime}ms
                          </div>
                        )}
                        {endpoint.lastChecked && (
                          <div className="text-xs opacity-75">
                            {endpoint.lastChecked}
                          </div>
                        )}
                        {endpoint.error && (
                          <div className="text-xs opacity-75">
                            {endpoint.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Service Information - 40% width (2/5) */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
              <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">Service Information</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">Backend Service</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Hosted on Google Cloud Run with auto-scaling capabilities
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• 16GB Memory, 8 CPU cores</li>
                    <li>• 600-800s timeout for processing</li>
                    <li>• Auto-scaling up to 5 instances</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">Available Models</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Beat-Transformer (default)</li>
                    <li>• Madmom </li>
                    <li>• Chord-CNN-LSTM (301 labels)</li>
                    <li>• BTC Supervised Learning</li>
                    <li>• BTC Pseudo-Label</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
