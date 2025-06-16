'use client';

import { useTheme } from '@/contexts/ThemeContext';
import Navigation from '@/components/Navigation';
import {
  FiBook,
  FiLock,
  FiActivity,
  FiCpu,
  FiLink,
  FiInfo,
  FiFileText,
  FiTool,
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiClock,
  FiCopy
} from 'react-icons/fi';

interface Parameter {
  type: string;
  required: boolean;
  description: string;
  options?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Endpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  rateLimit?: string;
  rateLimitReason?: string;
  parameters?: Record<string, Parameter>;
}

export default function DocsPage() {
  const { theme } = useTheme();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Static API documentation data
  const staticApiDocs = {
    title: "ChordMini API",
    version: "1.0.0",
    description: "Powerful Audio Analysis API",
    base_url: "https://chordmini-backend-full-12071603127.us-central1.run.app",
    endpoints: [
      {
        path: "/",
        method: "GET",
        summary: "Health check",
        description: "Returns API status and available models information",
        rateLimit: "30 requests per minute",
        rateLimitReason: "Health checks, status monitoring"
      },
      {
        path: "/api/detect-beats",
        method: "POST",
        summary: "Detect beats in audio",
        description: "Analyzes audio file and returns beat timestamps, BPM, and time signature",
        rateLimit: "10 requests per minute",
        rateLimitReason: "Heavy processing, resource intensive",
        parameters: {
          file: {
            type: "file",
            required: true,
            description: "Audio file to analyze (MP3, WAV, etc.)"
          },
          model: {
            type: "string",
            required: false,
            description: "Beat detection model to use",
            options: ["beat-transformer", "madmom", "auto"]
          }
        }
      },
      {
        path: "/api/recognize-chords",
        method: "POST",
        summary: "Recognize chords in audio",
        description: "Analyzes audio file and returns chord progression with timestamps",
        rateLimit: "10 requests per minute",
        rateLimitReason: "Heavy processing, ML inference",
        parameters: {
          file: {
            type: "file",
            required: true,
            description: "Audio file to analyze (MP3, WAV, etc.)"
          },
          model: {
            type: "string",
            required: false,
            description: "Chord recognition model to use",
            options: ["chord-cnn-lstm", "btc-sl", "btc-pl"]
          }
        }
      },
      {
        path: "/api/genius-lyrics",
        method: "POST",
        summary: "Fetch lyrics from Genius",
        description: "Retrieves lyrics and metadata from Genius.com",
        rateLimit: "15 requests per minute",
        rateLimitReason: "External API calls, moderate limit",
        parameters: {
          artist: {
            type: "string",
            required: true,
            description: "Artist name"
          },
          title: {
            type: "string",
            required: true,
            description: "Song title"
          }
        }
      },
      {
        path: "/api/model-info",
        method: "GET",
        summary: "Get model information",
        description: "Returns information about available models and their capabilities",
        rateLimit: "20 requests per minute",
        rateLimitReason: "Information endpoint, moderate usage"
      }
    ]
  };

  // Static model information
  const staticModelInfo = {
    success: true,
    models: {
      beat: [
        {
          id: "beat-transformer",
          name: "Beat-Transformer",
          description: "Deep learning model for beat tracking with downbeat detection",
          default: true,
          available: true
        },
        {
          id: "madmom",
          name: "Madmom",
          description: "Classical beat tracking algorithm with neural network components",
          default: false,
          available: true
        }
      ],
      chord: [
        {
          id: "chord-cnn-lstm",
          name: "Chord-CNN-LSTM",
          description: "Convolutional and LSTM neural network for chord recognition (301 labels)",
          default: true,
          available: true
        },
        {
          id: "btc-sl",
          name: "BTC Supervised Learning",
          description: "Beat-synchronized chord recognition with supervised learning",
          default: false,
          available: true
        },
        {
          id: "btc-pl",
          name: "BTC Pseudo-Label",
          description: "Beat-synchronized chord recognition with pseudo-labeling",
          default: false,
          available: true
        }
      ]
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">

      <Navigation />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <FiCpu className="w-8 h-8" />
              <h1 className="text-3xl font-bold">ChordMini API</h1>
            </div>
            <p className="text-lg opacity-90 mb-3">
              Powerful Audio Analysis API
            </p>
            <p className="text-sm opacity-75 max-w-2xl mx-auto mb-4">
              Advanced machine learning models for beat detection, chord recognition, and lyrics fetching.
            </p>
            <div className="bg-black/20 backdrop-blur-sm rounded-lg p-3 inline-block">
              <p className="text-xs opacity-90">
                <strong>Backend API:</strong> <code className="bg-black/30 px-2 py-1 rounded text-xs">https://chordmini-backend-full-12071603127.us-central1.run.app</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Main Content - 2 Column Layout */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Navigation & Quick Info */}
          <div className="lg:col-span-1">
            {/* Sticky Navigation */}
            <div className="sticky top-8 space-y-6">
              {/* Quick Navigation */}
              <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-4">
                  <FiBook className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Navigation</h3>
                </div>
                <nav className="space-y-1">
                  <a href="#overview" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiBook className="w-4 h-4" />
                    Overview
                  </a>
                  <a href="#authentication" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiLock className="w-4 h-4" />
                    Authentication
                  </a>
                  <a href="#rate-limits" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiActivity className="w-4 h-4" />
                    Rate Limits
                  </a>
                  <a href="#models" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiCpu className="w-4 h-4" />
                    Available Models
                  </a>
                  <a href="#endpoints" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiLink className="w-4 h-4" />
                    API Endpoints
                  </a>
                  <a href="#examples" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiInfo className="w-4 h-4" />
                    Usage Examples
                  </a>
                  <a href="#sample-responses" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiFileText className="w-4 h-4" />
                    Sample Responses
                  </a>
                  <a href="#troubleshooting" className="flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors py-2 px-3 rounded-md">
                    <FiTool className="w-4 h-4" />
                    Troubleshooting
                  </a>
                </nav>
              </div>

              {/* API Status */}
              <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-4">
                  <FiActivity className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">API Status</h3>
                </div>
                <div className="space-y-3">
                  <div className="space-y-3">
                    <div className={`border rounded-lg p-3 ${
                      theme === 'dark'
                        ? 'border-green-500 bg-green-900/20'
                        : 'border-green-300 bg-green-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <FiCheckCircle className={`w-4 h-4 ${
                          theme === 'dark' ? 'text-green-400' : 'text-green-600'
                        }`} />
                        <span className={`font-semibold ${
                          theme === 'dark' ? 'text-green-400' : 'text-green-700'
                        }`}>Backend Status</span>
                      </div>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-green-300' : 'text-green-600'
                      }`}>
                        Production service operational
                      </p>
                    </div>

                    <div className={`border rounded-lg p-3 ${
                      theme === 'dark'
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-blue-300 bg-blue-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <FiCpu className={`w-4 h-4 ${
                          theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                        }`} />
                        <span className={`font-semibold ${
                          theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                        }`}>Available Models</span>
                      </div>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        5 models deployed and ready
                      </p>
                    </div>

                    <div className={`border rounded-lg p-3 ${
                      theme === 'dark'
                        ? 'border-purple-500 bg-purple-900/20'
                        : 'border-purple-300 bg-purple-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <FiBook className={`w-4 h-4 ${
                          theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                        }`} />
                        <span className={`font-semibold ${
                          theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                        }`}>Documentation</span>
                      </div>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-purple-300' : 'text-purple-600'
                      }`}>
                        Static documentation available
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-4">
                  <FiActivity className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Quick Stats</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">2</div>
                    <div className="text-xs text-gray-500">Beat Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">3</div>
                    <div className="text-xs text-gray-500">Chord Models</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">4</div>
                    <div className="text-xs text-gray-500">Endpoints</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">10-30</div>
                    <div className="text-xs text-gray-500">Req/Min</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-8">
            {/* Overview */}
            <section id="overview" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-4">
                <FiBook className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Overview</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                The ChordMini API provides powerful audio analysis capabilities including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 mb-6">
                <li><strong>Beat Detection:</strong> Identify beat positions and downbeats using advanced ML models</li>
                <li><strong>Chord Recognition:</strong> Recognize chord progressions with multiple model options</li>
                <li><strong>Lyrics Fetching:</strong> Retrieve lyrics from Genius.com and LRClib</li>
                <li><strong>Model Information:</strong> Get details about available models and their capabilities</li>
              </ul>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center gap-2 mb-2">
                    <FiCheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200">Getting Started</h3>
                  </div>
                  <p className="text-blue-700 dark:text-blue-300 text-sm">
                    No API key required! Start making requests immediately to any endpoint.
                  </p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
                  <div className="flex items-center gap-2 mb-2">
                    <FiActivity className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">Rate Limits</h3>
                  </div>
                  <p className="text-orange-700 dark:text-orange-300 text-sm">
                    IP-based rate limiting: 10-30 requests per minute per endpoint.
                  </p>
                </div>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-4">
                <FiLock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Authentication</h2>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-content-bg rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">No Authentication Required</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    The ChordMini API is currently open and does not require authentication. All endpoints are publicly accessible.
                  </p>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FiAlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm">Note</span>
                    </div>
                    <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                      This may change in future versions. We recommend implementing proper error handling for potential authentication requirements.
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">CORS Support</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      Cross-Origin Resource Sharing (CORS) is enabled for all origins.
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                    <h4 className="font-semibold mb-2 text-purple-800 dark:text-purple-200">Content Types</h4>
                    <p className="text-purple-700 dark:text-purple-300 text-sm">
                      Supports <code>multipart/form-data</code> for file uploads and <code>application/json</code> for data.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Rate Limits */}
            <section id="rate-limits" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-4">
                <FiActivity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Rate Limits</h2>
              </div>

              <div className="space-y-6">
                {/* Overview */}
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiActivity className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">Rate Limiting Overview</h3>
                  </div>
                  <p className="text-orange-700 dark:text-orange-300 text-sm mb-3">
                    The ChordMini API implements IP-based rate limiting to ensure fair usage and maintain service quality.
                    Rate limits vary by endpoint based on computational requirements.
                  </p>
                  <div className="bg-orange-100 dark:bg-orange-800/30 rounded p-3">
                    <p className="text-orange-800 dark:text-orange-200 text-sm">
                      <strong>Rate Limit Method:</strong> IP Address-based limiting with sliding window
                    </p>
                  </div>
                </div>

                {/* Rate Limits Table */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiFileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Rate Limits by Endpoint</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-content-bg">
                          <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left text-gray-800 dark:text-gray-100">Endpoint</th>
                          <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left text-gray-800 dark:text-gray-100">Method</th>
                          <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left text-gray-800 dark:text-gray-100">Rate Limit</th>
                          <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left text-gray-800 dark:text-gray-100">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded text-sm font-medium">GET</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>30/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">Health checks, status monitoring</td>
                        </tr>
                        <tr className="bg-gray-25 dark:bg-gray-800/50">
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/api/model-info</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded text-sm font-medium">GET</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>20/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">Information endpoint, moderate usage</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/api/detect-beats</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded text-sm font-medium">POST</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>10/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">Heavy processing, resource intensive</td>
                        </tr>
                        <tr className="bg-gray-25 dark:bg-gray-800/50">
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/api/recognize-chords*</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded text-sm font-medium">POST</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>10/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">Heavy processing, ML inference</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/api/genius-lyrics</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded text-sm font-medium">POST</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>15/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">External API calls, moderate limit</td>
                        </tr>
                        <tr className="bg-gray-25 dark:bg-gray-800/50">
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><code>/api/lrclib-lyrics</code></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded text-sm font-medium">POST</span>
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-700 dark:text-gray-300"><strong>15/minute</strong></td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">External API calls, moderate limit</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    * Includes <code>/api/recognize-chords-btc-sl</code> and <code>/api/recognize-chords-btc-pl</code>
                  </p>
                </div>

                {/* Rate Limit Headers */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiFileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Rate Limit Headers</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    All API responses include rate limiting information in the headers:
                  </p>
                  <div className="bg-gray-50 dark:bg-content-bg rounded-lg p-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">Standard Headers</h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex justify-between">
                            <code className="text-blue-600 dark:text-blue-400">X-RateLimit-Limit</code>
                            <span className="text-gray-600 dark:text-gray-400">Maximum requests allowed</span>
                          </li>
                          <li className="flex justify-between">
                            <code className="text-blue-600 dark:text-blue-400">X-RateLimit-Remaining</code>
                            <span className="text-gray-600 dark:text-gray-400">Requests remaining in window</span>
                          </li>
                          <li className="flex justify-between">
                            <code className="text-blue-600 dark:text-blue-400">X-RateLimit-Reset</code>
                            <span className="text-gray-600 dark:text-gray-400">Time when limit resets</span>
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">Rate Limited Response</h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex justify-between">
                            <code className="text-red-600 dark:text-red-400">HTTP 429</code>
                            <span className="text-gray-600 dark:text-gray-400">Too Many Requests</span>
                          </li>
                          <li className="flex justify-between">
                            <code className="text-blue-600 dark:text-blue-400">Retry-After</code>
                            <span className="text-gray-600 dark:text-gray-400">Seconds to wait before retry</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Response Example */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiXCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Rate Limit Error Response</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    When rate limits are exceeded, the API returns a 429 status code with the following response:
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-sm">HTTP Response</span>
                      <button
                        onClick={() => copyToClipboard(`HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1672531200
Retry-After: 60
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait before trying again.",
  "retry_after": 60
}`)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                    <pre className="text-green-400 text-sm">
{`HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1672531200
Retry-After: 60
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait before trying again.",
  "retry_after": 60
}`}
                    </pre>
                  </div>
                </div>

                {/* Best Practices */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiInfo className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Best Practices</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                      <div className="flex items-center gap-2 mb-2">
                        <FiActivity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="font-semibold text-blue-800 dark:text-blue-200">Retry Logic</h4>
                      </div>
                      <ul className="text-blue-700 dark:text-blue-300 text-sm space-y-1">
                        <li>• Implement exponential backoff</li>
                        <li>• Respect the <code>Retry-After</code> header</li>
                        <li>• Limit maximum retry attempts</li>
                        <li>• Add jitter to prevent thundering herd</li>
                      </ul>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                      <div className="flex items-center gap-2 mb-2">
                        <FiActivity className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <h4 className="font-semibold text-green-800 dark:text-green-200">Monitoring</h4>
                      </div>
                      <ul className="text-green-700 dark:text-green-300 text-sm space-y-1">
                        <li>• Monitor rate limit headers</li>
                        <li>• Track 429 response frequency</li>
                        <li>• Implement client-side rate limiting</li>
                        <li>• Log rate limit violations</li>
                      </ul>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                      <div className="flex items-center gap-2 mb-2">
                        <FiClock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="font-semibold text-purple-800 dark:text-purple-200">Performance</h4>
                      </div>
                      <ul className="text-purple-700 dark:text-purple-300 text-sm space-y-1">
                        <li>• Batch requests when possible</li>
                        <li>• Cache responses appropriately</li>
                        <li>• Use appropriate timeouts</li>
                        <li>• Optimize file sizes for uploads</li>
                      </ul>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
                      <div className="flex items-center gap-2 mb-2">
                        <FiTool className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200">Error Handling</h4>
                      </div>
                      <ul className="text-orange-700 dark:text-orange-300 text-sm space-y-1">
                        <li>• Handle 429 responses gracefully</li>
                        <li>• Provide user-friendly error messages</li>
                        <li>• Implement circuit breaker patterns</li>
                        <li>• Fallback to cached data when possible</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Available Models */}
            <section id="models" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-6">
                <FiCpu className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Available Models</h2>
              </div>

              {/* Current Service Status */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h3 className="font-semibold text-green-800 dark:text-green-200">Current Service Status</h3>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm mb-2">
                  <strong>Production Service Operational:</strong> Google Cloud Run backend service is deployed and working correctly.
                </p>
                <div className="bg-green-100 dark:bg-green-800/30 rounded p-4 mt-3">
                  <h4 className="font-semibold text-green-800 dark:text-green-200 text-sm">Backend Service Features</h4>
                  <div className="text-green-700 dark:text-green-300 text-xs mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Beat detection (Beat-Transformer + madmom fallback)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Chord recognition (Chord-CNN-LSTM, 301 labels)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Lyrics processing (Genius API)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>All features in one unified endpoint</span>
                    </div>
                  </div>
                </div>
              </div>

              {staticModelInfo && staticModelInfo.success && staticModelInfo.models ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Beat Models */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <FiActivity className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Beat Detection Models</h3>
                    </div>
                    <div className="space-y-3">
                      {staticModelInfo.models.beat?.map((model) => (
                        <div key={model.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{model.name}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">({model.id})</span>
                          </div>
                          <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{model.description}</p>
                          <div className="flex gap-2">
                            {model.default && (
                              <div className={`border rounded-lg px-3 py-1 ${
                                theme === 'dark'
                                  ? 'border-blue-500 bg-blue-900/20'
                                  : 'border-blue-300 bg-blue-50'
                              }`}>
                                <div className="flex items-center gap-1">
                                  <FiCheckCircle className={`w-3 h-3 ${
                                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                                  }`} />
                                  <span className={`text-xs font-medium ${
                                    theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                                  }`}>Default</span>
                                </div>
                              </div>
                            )}
                            <div className={`border rounded-lg px-3 py-1 ${
                              theme === 'dark'
                                ? 'border-green-500 bg-green-900/20'
                                : 'border-green-300 bg-green-50'
                            }`}>
                              <div className="flex items-center gap-1">
                                <FiCheckCircle className={`w-3 h-3 ${
                                  theme === 'dark' ? 'text-green-400' : 'text-green-600'
                                }`} />
                                <span className={`text-xs font-medium ${
                                  theme === 'dark' ? 'text-green-400' : 'text-green-700'
                                }`}>Operational</span>
                              </div>
                            </div>
                            <div className={`border rounded-lg px-3 py-1 ${
                              theme === 'dark'
                                ? 'border-purple-500 bg-purple-900/20'
                                : 'border-purple-300 bg-purple-50'
                            }`}>
                              <div className="flex items-center gap-1">
                                <FiCpu className={`w-3 h-3 ${
                                  theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                                }`} />
                                <span className={`text-xs font-medium ${
                                  theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                                }`}>Production Ready</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) || <p className="text-gray-500">No beat detection models available</p>}
                    </div>
                  </div>

                  {/* Chord Models */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <FiCpu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Chord Recognition Models</h3>
                    </div>
                    <div className="space-y-3">
                      {staticModelInfo.models.chord?.map((model) => (
                        <div key={model.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{model.name}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">({model.id})</span>
                          </div>
                          <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{model.description}</p>
                          <div className="flex gap-2">
                            {model.default && (
                              <div className={`border rounded-lg px-3 py-1 ${
                                theme === 'dark'
                                  ? 'border-blue-500 bg-blue-900/20'
                                  : 'border-blue-300 bg-blue-50'
                              }`}>
                                <div className="flex items-center gap-1">
                                  <FiCheckCircle className={`w-3 h-3 ${
                                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                                  }`} />
                                  <span className={`text-xs font-medium ${
                                    theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                                  }`}>Default</span>
                                </div>
                              </div>
                            )}
                            <div className={`border rounded-lg px-3 py-1 ${
                              theme === 'dark'
                                ? 'border-green-500 bg-green-900/20'
                                : 'border-green-300 bg-green-50'
                            }`}>
                              <div className="flex items-center gap-1">
                                <FiCheckCircle className={`w-3 h-3 ${
                                  theme === 'dark' ? 'text-green-400' : 'text-green-600'
                                }`} />
                                <span className={`text-xs font-medium ${
                                  theme === 'dark' ? 'text-green-400' : 'text-green-700'
                                }`}>Operational</span>
                              </div>
                            </div>
                            <div className={`border rounded-lg px-3 py-1 ${
                              theme === 'dark'
                                ? 'border-purple-500 bg-purple-900/20'
                                : 'border-purple-300 bg-purple-50'
                            }`}>
                              <div className="flex items-center gap-1">
                                <FiCpu className={`w-3 h-3 ${
                                  theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                                }`} />
                                <span className={`text-xs font-medium ${
                                  theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                                }`}>Production Ready</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) || <p className="text-gray-500">No chord recognition models available</p>}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            {/* API Endpoints */}
            {staticApiDocs && (
              <section id="endpoints" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-3 mb-6">
                  <FiLink className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">API Endpoints</h2>
                </div>

                <div className="space-y-6">
                  {staticApiDocs.endpoints.map((endpoint, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      {/* Endpoint Header */}
                      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 border-b border-blue-200 dark:border-blue-700">
                        <div className="flex items-center gap-3">
                          <div className={`border rounded-lg px-3 py-1 ${
                            endpoint.method === 'GET'
                              ? 'border-green-500 bg-green-100 dark:bg-green-900/30'
                              : 'border-blue-500 bg-blue-100 dark:bg-blue-900/30'
                          }`}>
                            <span className={`text-sm font-bold ${
                              endpoint.method === 'GET'
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-blue-700 dark:text-blue-400'
                            }`}>
                              {endpoint.method}
                            </span>
                          </div>
                          <code className="text-lg font-mono text-gray-800 dark:text-gray-100">
                            {endpoint.path}
                          </code>
                        </div>
                        <h3 className="text-lg font-semibold mt-2 text-gray-800 dark:text-gray-100">
                          {endpoint.summary}
                        </h3>
                      </div>

                      {/* Endpoint Body */}
                      <div className="p-4">
                        <p className="text-gray-600 dark:text-gray-300 mb-4">{endpoint.description}</p>

                        {/* Rate Limiting Info */}
                        {endpoint.rateLimit && (
                          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3 mb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <FiActivity className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                              <span className="font-semibold text-orange-800 dark:text-orange-200 text-sm">Rate Limit</span>
                            </div>
                            <p className="text-orange-700 dark:text-orange-300 text-sm">
                              <strong>{endpoint.rateLimit}</strong>
                              {endpoint.rateLimitReason && (
                                <span className="text-orange-600 dark:text-orange-400"> - {endpoint.rateLimitReason}</span>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Parameters */}
                        {endpoint.parameters && (
                          <div className="mb-4">
                            <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">Parameters:</h4>
                            <div className="space-y-2">
                              {Object.entries(endpoint.parameters!).map(([name, param]: [string, Parameter]) => (
                                <div key={name} className="bg-white dark:bg-gray-800 p-3 rounded border-l-4 border-blue-500 shadow-sm">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">{name}</span>
                                    <span className="text-sm text-green-600 dark:text-green-400">({param.type})</span>
                                    {param.required && (
                                      <div className="border border-red-500 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1">
                                        <span className="text-red-700 dark:text-red-400 text-xs font-medium">Required</span>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 dark:text-gray-300">{param.description}</p>
                                  {param.options && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                      <strong>Options:</strong> {param.options.join(', ')}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}


                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Usage Examples */}
            <section id="examples" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-6">
                <FiInfo className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Usage Examples</h2>
              </div>

              {/* Important Notes */}
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <FiAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">Important Parameter Notes</h3>
                </div>
                <ul className="text-amber-700 dark:text-amber-300 text-sm space-y-1">
                  <li>• Use <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">file</code> parameter for audio uploads (not <code>audio_file</code>)</li>
                  <li>• Use <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">detector</code> parameter for beat detection models (not <code>model</code>)</li>
                  <li>• Available detectors: <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">beat-transformer</code>, <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">madmom</code>, <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">auto</code></li>
                </ul>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Health Check Example</h3>
                  <div className="relative mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Backend Health Check</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-3 rounded overflow-x-auto text-xs border border-gray-700">
                      {`curl -X GET "https://chordmini-backend-full-12071603127.us-central1.run.app/"`}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(`curl -X GET "https://chordmini-backend-full-12071603127.us-central1.run.app/"`)}
                      className="absolute top-6 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                      title="Copy to clipboard"
                    >
                      <FiCopy className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Expected Response</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-3 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "beat_model": "Beat-Transformer",
  "chord_model": "Chord-CNN-LSTM",
  "genius_available": true,
  "message": "Audio analysis API is running",
  "status": "healthy"
}`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Beat Detection Example</h3>
                  <div className="relative">
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                      {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/detect-beats" \\
  -F "file=@song.mp3" \\
  --max-time 120`}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/detect-beats" \\\n  -F "file=@song.mp3" \\\n  --max-time 120`)}
                      className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                      title="Copy to clipboard"
                    >
                      <FiCopy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Chord Recognition Examples</h3>

                  {/* Default Chord-CNN-LSTM */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Default Model (Chord-CNN-LSTM)</h4>
                    <div className="relative">
                      <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                        {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords" \\
  -F "file=@song.mp3" \\
  --max-time 180`}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords" \\\n  -F "file=@song.mp3" \\\n  --max-time 180`)}
                        className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* BTC Supervised Learning */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">BTC Supervised Learning Model</h4>
                    <div className="relative">
                      <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                        {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords-btc-sl" \\
  -F "file=@song.mp3" \\
  --max-time 180`}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords-btc-sl" \\\n  -F "file=@song.mp3" \\\n  --max-time 180`)}
                        className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* BTC Pseudo-Label */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">BTC Pseudo-Label Model</h4>
                    <div className="relative">
                      <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                        {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords-btc-pl" \\
  -F "file=@song.mp3" \\
  --max-time 180`}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/recognize-chords-btc-pl" \\\n  -F "file=@song.mp3" \\\n  --max-time 180`)}
                        className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Lyrics Fetching Examples</h3>

                  {/* Genius API */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Genius.com Lyrics</h4>
                    <div className="relative">
                      <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                        {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/genius-lyrics" \\
  -H "Content-Type: application/json" \\
  -d '{"artist": "The Beatles", "title": "Hey Jude"}'`}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/genius-lyrics" \\\n  -H "Content-Type: application/json" \\\n  -d '{"artist": "The Beatles", "title": "Hey Jude"}'`)}
                        className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* LRClib API */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">LRClib Synchronized Lyrics</h4>
                    <div className="relative">
                      <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-sm border border-gray-700">
                        {`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/lrclib-lyrics" \\
  -H "Content-Type: application/json" \\
  -d '{"artist": "The Beatles", "title": "Hey Jude", "duration": 431}'`}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-12071603127.us-central1.run.app/api/lrclib-lyrics" \\\n  -H "Content-Type: application/json" \\\n  -d '{"artist": "The Beatles", "title": "Hey Jude", "duration": 431}'`)}
                        className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        title="Copy to clipboard"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Sample Responses */}
            <section id="sample-responses" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-6">
                <FiFileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Sample API Responses</h2>
              </div>

              <div className="space-y-8">
                {/* Beat Detection Response */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiActivity className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Beat Detection Response</h3>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Beat-Transformer Model</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "beats": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
  "beat_info": {
    "beat_times": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
    "downbeats": [0.0, 2.0],
    "bpm": 120.0,
    "time_signature": [4, 4]
  },
  "downbeats": [0.0, 2.0],
  "bpm": 120.0,
  "time_signature": [4, 4],
  "model_used": "beat-transformer",
  "processing_time": 45.2
}`}
                    </pre>
                  </div>
                </div>

                {/* Chord Recognition Responses */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiCpu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Chord Recognition Responses</h3>
                  </div>

                  {/* Chord-CNN-LSTM */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Chord-CNN-LSTM Model (Default)</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "chords": [
    {
      "start": 0.0,
      "end": 2.5,
      "time": 0.0,
      "chord": "C:maj",
      "confidence": 0.85
    },
    {
      "start": 2.5,
      "end": 5.0,
      "time": 2.5,
      "chord": "F:maj",
      "confidence": 0.92
    },
    {
      "start": 5.0,
      "end": 7.5,
      "time": 5.0,
      "chord": "G:maj",
      "confidence": 0.88
    }
  ],
  "total_chords": 3,
  "model_used": "chord-cnn-lstm",
  "model_name": "Chord-CNN-LSTM",
  "processing_time": 32.1
}`}
                    </pre>
                  </div>

                  {/* BTC-SL */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">BTC Supervised Learning Model</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "chords": [
    {
      "start": 0.0,
      "end": 0.835918,
      "time": 0.0,
      "chord": "N",
      "confidence": 1.0
    },
    {
      "start": 0.835918,
      "end": 19.040363,
      "time": 0.835918,
      "chord": "A",
      "confidence": 1.0
    },
    {
      "start": 19.040363,
      "end": 20.062041,
      "time": 19.040363,
      "chord": "D",
      "confidence": 1.0
    },
    {
      "start": 20.062041,
      "end": 23.405714,
      "time": 20.062041,
      "chord": "A",
      "confidence": 1.0
    }
  ],
  "total_chords": 4,
  "model_used": "btc-sl",
  "model_name": "BTC SL (Supervised Learning)",
  "chord_dict": "large_voca",
  "processing_time": 156.8
}`}
                    </pre>
                  </div>

                  {/* BTC-PL */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">BTC Pseudo-Label Model</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "chords": [
    {
      "start": 0.0,
      "end": 1.2,
      "time": 0.0,
      "chord": "N",
      "confidence": 1.0
    },
    {
      "start": 1.2,
      "end": 4.8,
      "time": 1.2,
      "chord": "C:maj",
      "confidence": 1.0
    },
    {
      "start": 4.8,
      "end": 8.4,
      "time": 4.8,
      "chord": "A:min",
      "confidence": 1.0
    },
    {
      "start": 8.4,
      "end": 12.0,
      "time": 8.4,
      "chord": "F:maj",
      "confidence": 1.0
    }
  ],
  "total_chords": 4,
  "model_used": "btc-pl",
  "model_name": "BTC PL (Pseudo-Label)",
  "chord_dict": "large_voca",
  "processing_time": 142.3
}`}
                    </pre>
                  </div>
                </div>

                {/* Lyrics Responses */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiFileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Lyrics API Responses</h3>
                  </div>

                  {/* Genius Response */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Genius.com Lyrics</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "lyrics": "Hey Jude, don't make it bad\\nTake a sad song and make it better\\nRemember to let her into your heart\\nThen you'll start to make it better...",
  "song_info": {
    "title": "Hey Jude",
    "artist": "The Beatles",
    "album": "Hey Jude",
    "release_date": "1968-08-26",
    "genius_url": "https://genius.com/the-beatles-hey-jude-lyrics"
  },
  "source": "genius"
}`}
                    </pre>
                  </div>

                  {/* LRClib Response */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">LRClib Synchronized Lyrics</h4>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                      {`{
  "success": true,
  "lyrics": "[00:07.00]Hey Jude, don't make it bad\\n[00:13.00]Take a sad song and make it better\\n[00:20.00]Remember to let her into your heart\\n[00:27.00]Then you'll start to make it better",
  "plain_lyrics": "Hey Jude, don't make it bad\\nTake a sad song and make it better\\nRemember to let her into your heart\\nThen you'll start to make it better",
  "synced_lyrics": [
    {"time": 7.0, "text": "Hey Jude, don't make it bad"},
    {"time": 13.0, "text": "Take a sad song and make it better"},
    {"time": 20.0, "text": "Remember to let her into your heart"},
    {"time": 27.0, "text": "Then you'll start to make it better"}
  ],
  "song_info": {
    "title": "Hey Jude",
    "artist": "The Beatles",
    "duration": 431
  },
  "source": "lrclib"
}`}
                    </pre>
                  </div>
                </div>

                {/* Model Info Response */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FiCpu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Model Information Response</h3>
                  </div>
                  <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded overflow-x-auto text-xs border border-gray-700">
                    {`{
  "success": true,
  "models": {
    "beat": [
      {
        "id": "beat-transformer",
        "name": "Beat-Transformer",
        "description": "Deep learning model for beat tracking with downbeat detection",
        "default": true,
        "available": true
      },
      {
        "id": "madmom",
        "name": "Madmom",
        "description": "Classical beat tracking algorithm with neural network components",
        "default": false,
        "available": true
      }
    ],
    "chord": [
      {
        "id": "chord-cnn-lstm",
        "name": "Chord-CNN-LSTM",
        "description": "Convolutional and LSTM neural network for chord recognition (301 labels)",
        "default": true,
        "available": true
      },
      {
        "id": "btc-sl",
        "name": "BTC Supervised Learning",
        "description": "Beat-synchronized chord recognition with supervised learning",
        "default": false,
        "available": true
      },
      {
        "id": "btc-pl",
        "name": "BTC Pseudo-Label",
        "description": "Beat-synchronized chord recognition with pseudo-labeling",
        "default": false,
        "available": true
      }
    ]
  }
}`}
                  </pre>
                </div>
              </div>
            </section>

            {/* Troubleshooting */}
            <section id="troubleshooting" className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-6">
                <FiTool className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Troubleshooting</h2>
              </div>

              <div className="space-y-4">
                <div className="border border-green-500 bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <h3 className="font-semibold text-green-700 dark:text-green-400">Current Service Status</h3>
                  </div>
                  <p className="text-green-700 dark:text-green-300 text-sm mb-2">
                    <strong>All models are operational and working correctly:</strong>
                  </p>
                  <ul className="text-green-700 dark:text-green-300 text-sm space-y-1 ml-4">
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Beat-Transformer: Fully operational with all dependencies</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Madmom: Available as fallback beat detection</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Chord-CNN-LSTM: Available (default chord model)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>BTC SL (Supervised Learning): Available with 170 chord vocabulary</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>BTC PL (Pseudo-Label): Available with 170 chord vocabulary</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>Genius API: Available for lyrics processing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheckCircle className="w-3 h-3" />
                      <span>LRClib API: Available for synchronized lyrics</span>
                    </li>
                  </ul>
                </div>

                <div className="border border-red-500 bg-red-50 dark:bg-red-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiXCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <h3 className="font-semibold text-red-700 dark:text-red-400">&ldquo;No file or path provided&rdquo;</h3>
                  </div>
                  <p className="text-red-700 dark:text-red-300 text-sm mb-2">
                    Make sure you&rsquo;re using the correct parameter name:
                  </p>
                  <ul className="text-red-700 dark:text-red-300 text-sm space-y-1 ml-4">
                    <li>• Use <code className="bg-red-200 dark:bg-red-800 px-1 rounded">file</code> instead of <code>audio_file</code></li>
                    <li>• Ensure the file path is correct and accessible</li>
                    <li>• Remember to use <code className="bg-red-200 dark:bg-red-800 px-1 rounded">@</code> before file path in curl</li>
                  </ul>
                </div>

                <div className="border border-orange-500 bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiAlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="font-semibold text-orange-700 dark:text-orange-400">&ldquo;No beat detection model available&rdquo;</h3>
                  </div>
                  <p className="text-orange-700 dark:text-orange-300 text-sm mb-2">
                    This indicates model initialization issues:
                  </p>
                  <ul className="text-orange-700 dark:text-orange-300 text-sm space-y-1 ml-4">
                    <li>• Try using <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">detector=auto</code> instead of specific models</li>
                    <li>• The deployment may need model reinitialization</li>
                    <li>• Check the model availability in the status section above</li>
                  </ul>
                </div>

                <div className="border border-orange-500 bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiActivity className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="font-semibold text-orange-700 dark:text-orange-400">Rate Limiting Issues</h3>
                  </div>
                  <p className="text-orange-700 dark:text-orange-300 text-sm mb-2">
                    If you receive HTTP 429 (Too Many Requests) responses:
                  </p>
                  <ul className="text-orange-700 dark:text-orange-300 text-sm space-y-1 ml-4">
                    <li>• Check the <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">Retry-After</code> header for wait time</li>
                    <li>• Implement exponential backoff in your retry logic</li>
                    <li>• Monitor <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">X-RateLimit-Remaining</code> header</li>
                    <li>• Consider caching responses to reduce API calls</li>
                    <li>• Batch operations when possible to stay within limits</li>
                  </ul>
                </div>

                <div className="border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiAlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">Genius API Configuration</h3>
                  </div>
                  <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-2">
                    If you receive &ldquo;Unauthorized&rdquo; or &ldquo;expired API key&rdquo; errors for lyrics:
                  </p>
                  <ul className="text-yellow-700 dark:text-yellow-300 text-sm space-y-1 ml-4">
                    <li>• The backend <code className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">GENIUS_API_KEY</code> environment variable needs to be updated</li>
                    <li>• Contact the system administrator to configure a valid Genius API key</li>
                    <li>• The lyrics service endpoint is operational but requires proper API key configuration</li>
                  </ul>
                </div>

                <div className="border border-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiInfo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold text-blue-700 dark:text-blue-400">General Tips</h3>
                  </div>
                  <ul className="text-blue-700 dark:text-blue-300 text-sm space-y-1 ml-4">
                    <li>• Use files smaller than 50MB for better performance</li>
                    <li>• MP3, WAV, and FLAC formats are supported</li>
                    <li>• Add <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">force=true</code> parameter for large files with beat-transformer</li>
                    <li>• Check the live status indicators in the sidebar for backend health</li>
                    <li>• Respect rate limits to ensure consistent API performance</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="text-center mt-8 text-gray-500 dark:text-gray-400">
              <p className="text-lg">
                For real-time server status and endpoint monitoring, visit the{' '}
                <a href="/status" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                  Status Page
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}