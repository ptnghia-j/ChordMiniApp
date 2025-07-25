'use client';

import { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import { isDevelopmentEnvironment } from '@/utils/modelFiltering';

import {
  FiActivity,
  FiCpu,
  FiLink,
  FiFileText,
  FiCheckCircle,
  FiExternalLink,
  FiCode,
  FiServer,
  FiZap
} from 'react-icons/fi';

export default function DocsPage() {
  // Track which section is currently visible to highlight the sidebar navigation
  const [activeSection, setActiveSection] = useState<string>('welcome');

  // Get the backend URL for documentation examples
  const backendUrl = 'https://chordmini-backend-full-191567167632.us-central1.run.app';

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



  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      <Navigation />

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="hidden lg:block w-64 flex-shrink-0 bg-gray-50 dark:bg-dark-bg border-r border-gray-200 dark:border-gray-700">
            <div className="sticky top-8 py-8 dark:bg-dark-bg">
              <nav className="space-y-1 dark:bg-dark-bg">
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
                <div className="bg-gray-50 dark:bg-content-bg/50 border-l-4 border-blue-500 dark:border-blue-400 rounded-r-lg p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <FiZap className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">Quick Start</h3>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white mb-2">Base URL</h4>
                          <div className="relative group">
                            <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                              {backendUrl}
                            </div>
                            <button
                              onClick={() => navigator.clipboard.writeText(backendUrl)}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                              title="Copy this snippet"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
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
                <div className="bg-gray-50 dark:bg-content-bg/50 border-l-4 border-green-500 dark:border-green-400 rounded-r-lg p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">No API Key Required</h3>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                        Start making requests immediately without any setup or registration process.
                      </p>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-400 rounded-r-lg p-3">
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
                    <div className="relative group">
                      <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                        Access-Control-Allow-Origin: *
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText('Access-Control-Allow-Origin: *')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Copy this snippet"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
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
                      <div className="flex items-center gap-2">
                        <div className="relative group">
                          <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                            multipart/form-data
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText('multipart/form-data')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Copy this snippet"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">for file uploads</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative group">
                          <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                            application/json
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText('application/json')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Copy this snippet"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">for data requests</span>
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
                    The ChordMini API implements production-grade rate limiting to ensure fair usage and system stability.
                    Rate limits vary by endpoint based on computational requirements and are enforced using Redis-based storage.
                  </p>
                </div>

                {/* Overview Card */}
                <div className="bg-gray-50 dark:bg-content-bg/50 border-l-4 border-orange-500 dark:border-orange-400 rounded-r-lg p-6 mb-8">
                  <div className="flex items-start gap-3">
                    <FiActivity className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">Production-Grade Rate Limiting</h3>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                        Redis-based rate limiting with sliding window ensures fair usage and maintains service quality.
                        Heavy processing endpoints have stricter limits to prevent resource exhaustion.
                      </p>
                      <div className="bg-orange-100 dark:bg-orange-800/30 rounded-lg p-3">
                        <p className="text-orange-800 dark:text-orange-200 text-sm">
                          <strong>Method:</strong> IP Address-based limiting with Redis storage • <strong>Window:</strong> Sliding window algorithm
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
                        <tr className="bg-gray-50 dark:bg-content-bg/50 border-b border-gray-200 dark:border-gray-700">
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
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400">2/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Heavy processing, resource intensive</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/recognize-chords*</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400">2/minute</td>
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
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/genius-lyrics</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">10/minute</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Genius.com lyrics fetching</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    <span>* Includes Firebase-based endpoints for cached processing</span>
                  </div>
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

                    {/* BTC Models - Development Only */}
                    {isDevelopmentEnvironment() && (
                      <>
                        <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-6 bg-orange-50 dark:bg-orange-900/20">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">BTC SL (Supervised Learning)</h4>
                            <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded-full">DEV ONLY</span>
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                            Transformer model with 170 chord labels, supervised learning approach.
                            <strong className="text-orange-600 dark:text-orange-400"> Development only - requires local repository cloning.</strong>
                          </p>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <strong>Labels:</strong> 170 chord types • <strong>Best for:</strong> Research and development
                          </div>
                        </div>

                        <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-6 bg-orange-50 dark:bg-orange-900/20">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">BTC PL (Pseudo-Label)</h4>
                            <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded-full">DEV ONLY</span>
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                            Transformer model with 170 chord labels, pseudo-label training approach.
                            <strong className="text-orange-600 dark:text-orange-400"> Development only - requires local repository cloning.</strong>
                          </p>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <strong>Labels:</strong> 170 chord types • <strong>Best for:</strong> Research and development
                          </div>
                        </div>
                      </>
                    )}

                  </div>
                </div>
              </section>

              {/* API Endpoints */}
              <section id="endpoints" className="scroll-mt-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Endpoints</h2>
                </div>

                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <div className="text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                    <span>All endpoints are available at the base URL:</span>
                    <div className="relative group">
                      <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                        {backendUrl}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(backendUrl)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Copy this snippet"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Endpoints Grid */}
                <div className="grid gap-6">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                          /api/detect-beats
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText('/api/detect-beats')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Analyzes audio file and returns beat timestamps, BPM, and time signature.
                    </p>
                    <div className="bg-gray-50 dark:bg-content-bg/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> file (audio file), model (optional: beat-transformer, madmom, auto)
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                          /api/recognize-chords
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText('/api/recognize-chords')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Analyzes audio file and returns chord progression with timestamps.
                    </p>
                    <div className="bg-gray-50 dark:bg-content-bg/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> file (audio file), model (optional: chord-cnn-lstm)
                      </p>
                    </div>
                  </div>

                  {/* BTC Endpoints - Development Only */}
                  {isDevelopmentEnvironment() && (
                    <>
                      <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-6 bg-orange-50 dark:bg-orange-900/20">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">POST</span>
                          <div className="relative group">
                            <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                              /api/recognize-chords-btc-sl
                            </div>
                            <button
                              onClick={() => navigator.clipboard.writeText('/api/recognize-chords-btc-sl')}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                              title="Copy this snippet"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                          <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded-full">DEV ONLY</span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                          BTC Supervised Learning chord recognition model. <strong className="text-orange-600 dark:text-orange-400">Development environment only.</strong>
                        </p>
                        <div className="bg-orange-50 dark:bg-orange-800/50 rounded p-3">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <strong>Parameters:</strong> file (audio file), chord_dict (optional: large_voca)
                          </p>
                        </div>
                      </div>

                      <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-6 bg-orange-50 dark:bg-orange-900/20">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">POST</span>
                          <div className="relative group">
                            <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                              /api/recognize-chords-btc-pl
                            </div>
                            <button
                              onClick={() => navigator.clipboard.writeText('/api/recognize-chords-btc-pl')}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                              title="Copy this snippet"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                          <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded-full">DEV ONLY</span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                          BTC Pseudo-Label chord recognition model. <strong className="text-orange-600 dark:text-orange-400">Development environment only.</strong>
                        </p>
                        <div className="bg-orange-50 dark:bg-orange-800/50 rounded p-3">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <strong>Parameters:</strong> file (audio file), chord_dict (optional: large_voca)
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                          /api/lrclib-lyrics
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText('/api/lrclib-lyrics')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Retrieves synchronized lyrics with timestamps from LRClib database.
                    </p>
                    <div className="bg-gray-50 dark:bg-content-bg/50 rounded p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Parameters:</strong> artist (string), title (string), duration (number, optional)
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                          /api/model-info
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText('/api/model-info')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Returns information about available models and their capabilities.
                    </p>
                    <div className="bg-gray-50 dark:bg-content-bg/50 rounded p-3">
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
                    Here are some practical examples of how to use the ChordMini API using Javascript and cURL.
                  </p>
                </div>

                {/* JavaScript Example */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">JavaScript Example</h3>
                  <div className="relative group w-full">
                    <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                      <div className="whitespace-pre-wrap break-all">
                        {`const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'chord-cnn-lstm');

const response = await fetch(
  '${backendUrl}/api/recognize-chords',
  {
    method: 'POST',
    body: formData
  }
);

const result = await response.json();
console.log(result);`}
                      </div>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(`const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', 'chord-cnn-lstm');

const response = await fetch(
  '${backendUrl}/api/recognize-chords',
  {
    method: 'POST',
    body: formData
  }
);

const result = await response.json();
console.log(result);`)}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      title="Copy this snippet"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Beat Detection Example */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Beat Detection</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Request</h4>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`curl -X POST "${backendUrl}/api/detect-beats" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=beat-transformer"`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`curl -X POST "${backendUrl}/api/detect-beats" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=beat-transformer"`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Response</h4>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`{
  "success": true,
  "beats": [0.5, 1.0, 1.5, 2.0, 2.5],
  "total_beats": 5,
  "model": "beat-transformer",
  "processing_time": 2.3
}`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`{
  "success": true,
  "beats": [0.5, 1.0, 1.5, 2.0, 2.5],
  "total_beats": 5,
  "model": "beat-transformer",
  "processing_time": 2.3
}`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chord Recognition Example */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Chord Recognition</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Request</h4>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`curl -X POST "${backendUrl}/api/recognize-chords" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=chord-cnn-lstm"`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`curl -X POST "${backendUrl}/api/recognize-chords" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=chord-cnn-lstm"`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Response</h4>
                      <div className="relative group">
                        <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`{
  "success": true,
  "chords": [
    {"start": 0.0, "end": 2.0, "chord": "C", "confidence": 0.95},
    {"start": 2.0, "end": 4.0, "chord": "Am", "confidence": 0.87},
    {"start": 4.0, "end": 6.0, "chord": "F", "confidence": 0.92}
  ],
  "total_chords": 3,
  "model": "chord-cnn-lstm",
  "processing_time": 3.1
}`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`{
  "success": true,
  "chords": [
    {"start": 0.0, "end": 2.0, "chord": "C", "confidence": 0.95},
    {"start": 2.0, "end": 4.0, "chord": "Am", "confidence": 0.87},
    {"start": 4.0, "end": 6.0, "chord": "F", "confidence": 0.92}
  ],
  "total_chords": 3,
  "model": "chord-cnn-lstm",
  "processing_time": 3.1
}`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Response Examples */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Error Response Examples</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Rate Limit Exceeded (429)</h4>
                      <div className="relative group">
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait before trying again.",
  "retry_after": null
}`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait before trying again.",
  "retry_after": null
}`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Invalid File Format (400)</h4>
                      <div className="relative group">
                        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
                          <div className="whitespace-pre-wrap break-all">
                            {`{
  "error": "Invalid file format",
  "message": "Supported formats: MP3, WAV, FLAC, M4A, OGG",
  "supported_formats": ["mp3", "wav", "flac", "m4a", "ogg"]
}`}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(`{
  "error": "Invalid file format",
  "message": "Supported formats: MP3, WAV, FLAC, M4A, OGG",
  "supported_formats": ["mp3", "wav", "flac", "m4a", "ogg"]
}`)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Copy this snippet"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
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
                        <div className="relative group">
                          <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                            Solution: Implement exponential backoff and respect rate limit headers
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText('Solution: Implement exponential backoff and respect rate limit headers')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Copy this snippet"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">File Format Not Supported</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                          The API supports common audio formats: MP3, WAV, FLAC, M4A, OGG.
                        </p>
                        <div className="relative group">
                          <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                            Solution: Convert your audio file to a supported format
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText('Solution: Convert your audio file to a supported format')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Copy this snippet"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Processing Timeout</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                          Large audio files may take longer to process. The API has a 10-minute timeout.
                        </p>
                        <div className="relative group">
                          <div className="bg-gray-100 dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100">
                            Solution: Use shorter audio clips or compress your audio file
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText('Solution: Use shorter audio clips or compress your audio file')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Copy this snippet"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
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
