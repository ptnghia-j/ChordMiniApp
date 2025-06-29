'use client';

import { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import {
  FiActivity,
  FiCpu,
  FiLink,
  FiFileText,
  FiCheckCircle,
  FiExternalLink,
  FiCode,
  FiServer,
  FiZap,
  FiCopy
} from 'react-icons/fi';

export default function DocsPage() {
  // Track which section is currently visible to highlight the sidebar navigation
  const [activeSection, setActiveSection] = useState<string>('welcome');

  useEffect(() => {
    const sectionIds = [
      'welcome',
      'getting-started',
      'authentication',
      'rate-limits',
      'models',
      'endpoints',
      'examples',
      'sample-responses',
      'troubleshooting',
      'status'
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-50% 0px -50% 0px'
      }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const navItemClasses = (id: string) =>
    `flex items-center gap-2 text-sm py-2 px-3 rounded-md transition-colors ${
      activeSection === id
        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      <Navigation />

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-8 py-8">
              <nav className="space-y-1">
                {/* Overview / Welcome */}
                <div className="pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Welcome
                  </h3>
                  <div className="space-y-1">
                    <a href="#welcome" className={navItemClasses('welcome')}>
                      Overview
                    </a>
                  </div>
                </div>
                <div className="pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Getting Started
                  </h3>
                  <div className="space-y-1">
                    <a href="#getting-started" className={navItemClasses('getting-started')}>
                      Quick Start
                    </a>
                    <a href="#authentication" className={navItemClasses('authentication')}>
                      Authentication
                    </a>
                    <a href="#rate-limits" className={navItemClasses('rate-limits')}>
                      Rate Limits
                    </a>
                  </div>
                </div>
                
                <div className="pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    API Reference
                  </h3>
                  <div className="space-y-1">
                    <a href="#models" className={navItemClasses('models')}>
                      Models
                    </a>
                    <a href="#endpoints" className={navItemClasses('endpoints')}>
                      Endpoints
                    </a>
                    <a href="#examples" className={navItemClasses('examples')}>
                      Examples
                    </a>
                    <a href="#sample-responses" className={navItemClasses('sample-responses')}>
                      Responses
                    </a>
                  </div>
                </div>
                
                <div className="pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Support
                  </h3>
                  <div className="space-y-1">
                    <a href="#troubleshooting" className={navItemClasses('troubleshooting')}>
                      Troubleshooting
                    </a>
                    <a href="#status" className={navItemClasses('status')}>
                      Status
                    </a>
                  </div>
                </div>
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 py-8">
            <div className="max-w-4xl space-y-12">
              {/* Welcome / Overview */}
              <section id="welcome" className="scroll-mt-8">
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <FiCode className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to ChordMini</h2>
                  </div>
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    Advanced machine learning models for beat detection, chord recognition, and lyrics fetching.
                    Get started with our comprehensive API documentation and examples.
                  </p>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap justify-center gap-3">
                    <a
                      href="#getting-started"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <FiZap className="w-4 h-4" />
                      Get Started
                    </a>
                    <a
                      href="#endpoints"
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      <FiLink className="w-4 h-4" />
                      API Reference
                    </a>
                  </div>
                </div>
              </section>

              {/* Getting Started */}
              <section id="getting-started" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Getting Started</h2>
                </div>
                
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
                    The ChordMini API provides powerful audio analysis capabilities with no authentication required. 
                    Start making requests immediately to analyze audio files and extract musical information.
                  </p>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <FiActivity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Beat Detection</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Identify beat positions and downbeats using advanced ML models
                    </p>
                  </div>
                  
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <FiCpu className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Chord Recognition</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Recognize chord progressions with multiple model options
                    </p>
                  </div>
                  
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <FiFileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Lyrics Fetching</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Retrieve synchronized lyrics from LRClib database
                    </p>
                  </div>
                  
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <FiServer className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Model Info</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Get details about available models and capabilities
                    </p>
                  </div>
                </div>

                {/* Quick Start */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Start</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Base URL</h4>
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <code className="text-sm text-gray-800 dark:text-gray-200">
                          https://chordmini-backend-full-191567167632.us-central1.run.app
                        </code>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Authentication</h4>
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <FiCheckCircle className="w-4 h-4" />
                        No API key required
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Authentication */}
              <section id="authentication" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Authentication</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-6">
                  <p className="text-gray-600 dark:text-gray-400">
                    The ChordMini API is currently open and does not require authentication. All endpoints are publicly accessible,
                    making it easy to get started with audio analysis immediately.
                  </p>
                </div>

                {/* No Auth Required Card */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">No API Key Required</h3>
                      <p className="text-green-800 dark:text-green-200 text-sm mb-3">
                        Start making requests immediately without any setup or registration process.
                      </p>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5">⚠️</div>
                          <div>
                            <p className="text-amber-800 dark:text-amber-200 text-sm">
                              <strong>Future Changes:</strong> Authentication may be required in future versions.
                              Implement proper error handling for potential 401/403 responses.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Technical Details */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FiServer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">CORS Support</h3>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      Cross-Origin Resource Sharing (CORS) is enabled for all origins, allowing browser-based requests.
                    </p>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                      <code className="text-xs text-gray-700 dark:text-gray-300">
                        Access-Control-Allow-Origin: *
                      </code>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FiFileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Content Types</h3>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      Supports multiple content types for different use cases.
                    </p>
                    <div className="space-y-2">
                      <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                        <code className="text-xs text-gray-700 dark:text-gray-300">multipart/form-data</code>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">for file uploads</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                        <code className="text-xs text-gray-700 dark:text-gray-300">application/json</code>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">for data requests</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Rate Limits */}
              <section id="rate-limits" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Rate Limits</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-6">
                  <p className="text-gray-600 dark:text-gray-400">
                    The ChordMini API implements IP-based rate limiting to ensure fair usage and maintain service quality.
                    Rate limits vary by endpoint based on computational requirements.
                  </p>
                </div>

                {/* Overview Card */}
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-6 mb-8">
                  <div className="flex items-start gap-3">
                    <FiActivity className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">Rate Limiting Overview</h3>
                      <p className="text-orange-800 dark:text-orange-200 text-sm mb-3">
                        IP-based rate limiting ensures fair usage and maintains service quality.
                        Limits vary by endpoint based on computational requirements.
                      </p>
                      <div className="bg-orange-100 dark:bg-orange-800/30 rounded-lg p-3">
                        <p className="text-orange-800 dark:text-orange-200 text-sm">
                          <strong>Method:</strong> IP Address-based limiting with sliding window
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rate Limits Table */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rate Limits by Endpoint</h3>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Endpoint</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate Limit</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">30/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Health checks, status monitoring</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/model-info</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">20/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Information endpoint, moderate usage</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/detect-beats</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">5/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Heavy processing, resource intensive</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/recognize-chords*</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">5/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Heavy processing, ML inference</td>
                        </tr>

                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/lrclib-lyrics</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">10/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Synchronized lyrics with timestamps</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    * Includes <code>/api/recognize-chords-btc-sl</code> and <code>/api/recognize-chords-btc-pl</code>
                  </p>
                </div>
              </section>

              {/* Models */}
              <section id="models" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Available Models</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p className="text-gray-600 dark:text-gray-400">
                    ChordMini provides multiple machine learning models for different audio analysis tasks.
                    Each model is optimized for specific use cases and performance characteristics.
                  </p>
                </div>

                {/* Beat Detection Models */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Beat Detection Models</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Beat-Transformer</h4>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Default</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                        Deep learning model for beat tracking with downbeat detection. Provides high accuracy for modern music genres.
                      </p>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <strong>Best for:</strong> Pop, Rock, Electronic music
                      </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Madmom</h4>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                        Classical beat tracking algorithm with neural network components. Reliable for complex rhythmic patterns.
                      </p>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <strong>Best for:</strong> Jazz, Classical, Complex rhythms
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chord Recognition Models */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Chord Recognition Models</h3>
                  <div className="grid gap-4">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Chord-CNN-LSTM</h4>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Default</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                        Convolutional and LSTM neural network for chord recognition with 301 chord labels.
                        Excellent balance of accuracy and performance.
                      </p>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <strong>Labels:</strong> 301 chord types • <strong>Best for:</strong> General purpose chord recognition
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">BTC Supervised Learning</h4>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                          Beat-synchronized chord recognition with supervised learning approach.
                        </p>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <strong>Best for:</strong> Rhythmically aligned chord analysis
                        </div>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">BTC Pseudo-Label</h4>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                          Beat-synchronized chord recognition with pseudo-labeling technique.
                        </p>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <strong>Best for:</strong> Enhanced accuracy with beat alignment
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* API Endpoints */}
              <section id="endpoints" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Endpoints</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p className="text-gray-600 dark:text-gray-400">
                    All endpoints are available at the base URL:
                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm ml-1">
                      https://chordmini-backend-full-191567167632.us-central1.run.app
                    </code>
                  </p>
                </div>

                {/* Endpoints Grid */}
                <div className="grid gap-6">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <code className="text-lg font-mono text-gray-900 dark:text-gray-100">/api/detect-beats</code>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Analyzes audio file and returns beat timestamps, BPM, and time signature.
                    </p>
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> file (audio file), model (optional: beat-transformer, madmom, auto)
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <code className="text-lg font-mono text-gray-900 dark:text-gray-100">/api/recognize-chords</code>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Analyzes audio file and returns chord progression with timestamps.
                    </p>
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> file (audio file), model (optional: chord-cnn-lstm, btc-sl, btc-pl)
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <code className="text-lg font-mono text-gray-900 dark:text-gray-100">/api/lrclib-lyrics</code>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Retrieves synchronized lyrics with timestamps from LRClib database.
                    </p>
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> artist (string), title (string), duration (number, optional)
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span>
                      <code className="text-lg font-mono text-gray-900 dark:text-gray-100">/api/model-info</code>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Returns information about available models and their capabilities.
                    </p>
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> None required
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Examples */}
              <section id="examples" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Usage Examples</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p className="text-gray-600 dark:text-gray-400">
                    Here are some practical examples of how to use the ChordMini API with different programming languages and tools.
                  </p>
                </div>

                {/* cURL Example */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">cURL Examples</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Beat Detection</h4>
                      <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto border border-gray-700 relative">
                        <button
                          onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-191567167632.us-central1.run.app/api/detect-beats" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=beat-transformer"`)}
                          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 rounded"
                          title="Copy to clipboard"
                        >
                          <FiCopy className="w-4 h-4" />
                        </button>
                        <pre className="text-blue-300 text-sm pr-12">
{`curl -X POST "https://chordmini-backend-full-191567167632.us-central1.run.app/api/detect-beats" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=beat-transformer"`}
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Chord Recognition</h4>
                      <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto border border-gray-700 relative">
                        <button
                          onClick={() => copyToClipboard(`curl -X POST "https://chordmini-backend-full-191567167632.us-central1.run.app/api/recognize-chords" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=chord-cnn-lstm"`)}
                          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 rounded"
                          title="Copy to clipboard"
                        >
                          <FiCopy className="w-4 h-4" />
                        </button>
                        <pre className="text-blue-300 text-sm pr-12">
{`curl -X POST "https://chordmini-backend-full-191567167632.us-central1.run.app/api/recognize-chords" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=chord-cnn-lstm"`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                {/* JavaScript Example */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">JavaScript Example</h3>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto border border-gray-700 relative">
                    <button
                      onClick={() => copyToClipboard(`const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'chord-cnn-lstm');

const response = await fetch(
  'https://chordmini-backend-full-191567167632.us-central1.run.app/api/recognize-chords',
  {
    method: 'POST',
    body: formData
  }
);

const result = await response.json();
console.log(result);`)}
                      className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 rounded"
                      title="Copy to clipboard"
                    >
                      <FiCopy className="w-4 h-4" />
                    </button>
                    <pre className="text-blue-300 text-sm pr-12">
{`const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'chord-cnn-lstm');

const response = await fetch(
  'https://chordmini-backend-full-191567167632.us-central1.run.app/api/recognize-chords',
  {
    method: 'POST',
    body: formData
  }
);

const result = await response.json();
console.log(result);`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Troubleshooting */}
              <section id="troubleshooting" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Troubleshooting</h2>
                </div>

                <div className="space-y-6">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Common Issues</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Rate Limit Exceeded (429)</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                          You&apos;ve exceeded the rate limit for the endpoint. Wait for the time specified in the Retry-After header.
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                          <code className="text-xs text-gray-700 dark:text-gray-300">
                            Solution: Implement exponential backoff and respect rate limit headers
                          </code>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">File Format Not Supported</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                          The API supports common audio formats: MP3, WAV, FLAC, M4A, OGG.
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                          <code className="text-xs text-gray-700 dark:text-gray-300">
                            Solution: Convert your audio file to a supported format
                          </code>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Processing Timeout</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                          Large audio files may take longer to process. The API has a 10-minute timeout.
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                          <code className="text-xs text-gray-700 dark:text-gray-300">
                            Solution: Use shorter audio clips or compress your audio file
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Status Page */}
              <section id="status" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Status</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p className="text-gray-600 dark:text-gray-400">
                    Monitor the real-time status of ChordMini API services and endpoints.
                    Check service availability and performance metrics.
                  </p>
                </div>

                {/* Status Cards */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Backend Services</h3>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                      Core API services including beat detection, chord recognition, and lyrics fetching.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Beat Detection</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Chord Recognition</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Lyrics Services</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FiServer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Infrastructure</h3>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                      Server infrastructure and deployment status on Google Cloud Run.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Google Cloud Run</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Online</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Rate Limiting</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Active</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">CORS Support</span>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Enabled</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Page Link */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <FiExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Detailed Status Page</h3>
                      <p className="text-blue-800 dark:text-blue-200 text-sm mb-3">
                        For real-time monitoring and detailed service metrics, visit our dedicated status page.
                      </p>
                      <a
                        href="/status"
                        className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm transition-colors"
                      >
                        View Status Page
                        <FiExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
