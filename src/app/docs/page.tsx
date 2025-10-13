// src/app/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import { isDevelopmentEnvironment } from '@/utils/modelFiltering';
import { CodeBlock } from '@/components/CodeBlock';
import { useTheme } from '@/contexts/ThemeContext';

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
  FiAlertCircle,
  FiInfo
} from 'react-icons/fi';
import { Card, CardBody } from '@heroui/react';

// Reusable Status Icon Component
const StatusIcon = ({ status }: { status: 'Operational' | 'Degraded' | 'Offline' | 'Active' | 'Enabled' }) => {
  let colorClass = 'bg-green-500';
  if (status === 'Degraded') colorClass = 'bg-yellow-500';
  if (status === 'Offline') colorClass = 'bg-red-500';
  if (status === 'Active' || status === 'Enabled') colorClass = 'bg-blue-500';
  
  return <div className={`w-3 h-3 ${colorClass} rounded-full animate-pulse`}></div>;
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>('welcome');
  // Consume theme to toggle a CSS class for docs without referencing the value directly
  const { theme } = useTheme();
  // no-op read to satisfy linter while keeping reactive subscription
  void theme;

  // Use environment variable for backend URL (supports runtime configuration)
  // Fallback to localhost:5001 for local development
  const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';

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
        rootMargin: '-20% 0px -80% 0px' // Adjusted for better section tracking
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
        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-gray-800'
    }`;

  const infoCardClass = (type: 'info' | 'warning' | 'success') => {
    switch (type) {
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-400';
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-400';
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 dark:border-green-400';
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-content-bg transition-colors duration-300">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Sidebar Navigation */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-20 py-8">
              <nav className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Welcome
                  </h3>
                  <a href="#welcome" className={navItemClasses('welcome')}>
                    <FiInfo className="w-4 h-4" /> Overview
                  </a>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Getting Started
                  </h3>
                  <a href="#getting-started" className={navItemClasses('getting-started')}>
                    <FiZap className="w-4 h-4" /> Quick Start
                  </a>
                  <a href="#authentication" className={navItemClasses('authentication')}>
                    <FiCheckCircle className="w-4 h-4" /> Authentication
                  </a>
                  <a href="#rate-limits" className={navItemClasses('rate-limits')}>
                    <FiActivity className="w-4 h-4" /> Rate Limits
                  </a>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    API Reference
                  </h3>
                  <a href="#models" className={navItemClasses('models')}>
                    <FiCpu className="w-4 h-4" /> Models
                  </a>
                  <a href="#endpoints" className={navItemClasses('endpoints')}>
                    <FiLink className="w-4 h-4" /> Endpoints
                  </a>
                  <a href="#examples" className={navItemClasses('examples')}>
                    <FiCode className="w-4 h-4" /> Examples
                  </a>
                  <a href="#sample-responses" className={navItemClasses('sample-responses')}>
                    <FiFileText className="w-4 h-4" /> Responses
                  </a>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Support
                  </h3>
                  <a href="#troubleshooting" className={navItemClasses('troubleshooting')}>
                    <FiAlertCircle className="w-4 h-4" /> Troubleshooting
                  </a>
                  <a href="#status" className={navItemClasses('status')}>
                    <FiServer className="w-4 h-4" /> Status
                  </a>
                </div>
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 min-w-0 py-8">
            <div className="space-y-16">
              {/* Welcome / Overview */}
              <section id="welcome" className="scroll-mt-8">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 mx-auto">
                    <FiCode className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white leading-tight">
                    ChordMini API Documentation
                  </h1>
                  <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                    A comprehensive guide to using our powerful audio analysis API, covering beat detection, chord recognition, and more.
                  </p>
                </div>
              </section>

              {/* Getting Started */}
              <section id="getting-started" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Getting Started</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    The ChordMini API provides powerful audio analysis capabilities with no authentication required. Start making requests immediately to analyze audio files and extract musical information.
                  </p>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700">
                    <CardBody>
                      <div className="flex items-center gap-4 mb-2">
                        <FiActivity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Beat Detection</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Identify beat positions and downbeats using advanced ML models.
                      </p>
                    </CardBody>
                  </Card>
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700">
                    <CardBody>
                      <div className="flex items-center gap-4 mb-2">
                        <FiCpu className="w-6 h-6 text-green-600 dark:text-green-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Chord Recognition</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Recognize chord progressions with multiple model options.
                      </p>
                    </CardBody>
                  </Card>
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700">
                    <CardBody>
                      <div className="flex items-center gap-4 mb-2">
                        <FiFileText className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Lyrics Fetching</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Retrieve synchronized lyrics from LRClib database.
                      </p>
                    </CardBody>
                  </Card>
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700">
                    <CardBody>
                      <div className="flex items-center gap-4 mb-2">
                        <FiServer className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Model Info</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Get details about available models and capabilities.
                      </p>
                    </CardBody>
                  </Card>
                </div>
              </section>

              {/* Authentication */}
              <section id="authentication" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Authentication</h2>
                <div className={`rounded-lg p-6 mb-6 ${infoCardClass('success')}`}>
                  <div className="flex items-start gap-3">
                    <FiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">No API Key Required</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        The ChordMini API is currently open and does not require authentication. All endpoints are publicly accessible,
                        making it easy to get started immediately.
                      </p>
                    </div>
                  </div>
                </div>
                <div className={`rounded-lg p-6 ${infoCardClass('warning')}`}>
                  <div className="flex items-start gap-3">
                    <FiAlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Future Changes</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Authentication may be required in future versions. Implement proper error handling for potential `401/403` responses.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Rate Limits */}
              <section id="rate-limits" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Rate Limits</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    The ChordMini API implements production-grade rate limiting to ensure fair usage and system stability. Rate limits vary by endpoint based on computational requirements.
                  </p>
                </div>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-content-bg/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Endpoint</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate Limit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">30/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Health checks, status monitoring</td>
                      </tr>
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/model-info</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">GET</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">20/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Information endpoint, moderate usage</td>
                      </tr>
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/detect-beats</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">POST</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400">2/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Heavy processing, resource intensive</td>
                      </tr>
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/recognize-chords*</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">POST</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400">2/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Heavy processing, ML inference</td>
                      </tr>
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/lrclib-lyrics</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">10/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Synchronized lyrics with timestamps</td>
                      </tr>
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">/api/genius-lyrics</td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">10/minute</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Genius.com lyrics fetching</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Models */}
              <section id="models" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Available Models</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    ChordMini provides multiple machine learning models for different audio analysis tasks. Each model is optimized for specific use cases and performance characteristics.
                  </p>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Beat Detection Models</h3>
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3 mb-3">
                      <StatusIcon status="Operational" />
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
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3 mb-3">
                      <StatusIcon status="Operational" />
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

                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Chord Recognition Models</h3>
                <div className="grid gap-6">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3 mb-3">
                      <StatusIcon status="Operational" />
                      <h4 className="font-semibold text-gray-900 dark:text-white">Chord-CNN-LSTM</h4>
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Default</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      Convolutional and LSTM neural network for chord recognition with 301 chord labels. Excellent balance of accuracy and performance.
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <strong>Labels:</strong> 301 chord types • <strong>Best for:</strong> General purpose chord recognition
                    </div>
                  </div>
                  {isDevelopmentEnvironment() && (
                    <>
                      <div className="border border-amber-200 dark:border-amber-700 rounded-lg p-6 bg-amber-50 dark:bg-amber-900/20">
                        <div className="flex items-center gap-3 mb-3">
                          <StatusIcon status="Degraded" />
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
                      <div className="border border-amber-200 dark:border-amber-700 rounded-lg p-6 bg-amber-50 dark:bg-amber-900/20">
                        <div className="flex items-center gap-3 mb-3">
                          <StatusIcon status="Degraded" />
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
              </section>

              {/* API Endpoints */}
              <section id="endpoints" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">API Endpoints</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    All endpoints are available at the base URL: <strong className="font-mono text-gray-900 dark:text-white">{backendUrl}</strong>
                  </p>
                </div>
                <div className="grid gap-6">
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
                    <CardBody>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                        <span className="font-mono text-sm text-gray-900 dark:text-gray-100">/api/detect-beats</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Analyzes audio file and returns beat timestamps, BPM, and time signature.
                      </p>
                      <ul className="text-sm space-y-2">
                        <li><strong>Parameters:</strong> `file` (audio file), `model` (optional: `beat-transformer`, `madmom`, `auto`)</li>
                      </ul>
                    </CardBody>
                  </Card>
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
                    <CardBody>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">POST</span>
                        <span className="font-mono text-sm text-gray-900 dark:text-gray-100">/api/recognize-chords</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Analyzes audio file and returns chord progression with timestamps.
                      </p>
                      <ul className="text-sm space-y-2">
                        <li><strong>Parameters:</strong> `file` (audio file), `model` (optional: `chord-cnn-lstm`)</li>
                      </ul>
                    </CardBody>
                  </Card>
                </div>
              </section>

              {/* Examples */}
              <section id="examples" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Usage Examples</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    Here are some practical examples of how to use the ChordMini API using Javascript and cURL.
                  </p>
                </div>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Chord Recognition with Javascript</h3>
                    <CodeBlock
                      title="Javascript"
                      language="javascript"
                      code={`const formData = new FormData();
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
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Beat Detection with cURL</h3>
                    <CodeBlock
                      title="cURL"
                      language="bash"
                      code={`curl -X POST "${backendUrl}/api/detect-beats" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=beat-transformer"`}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Chord Recognition with cURL</h3>
                    <CodeBlock
                      title="cURL"
                      language="bash"
                      code={`curl -X POST "${backendUrl}/api/recognize-chords" \\
  -F "file=@your-audio-file.mp3" \\
  -F "model=chord-cnn-lstm"`}
                    />
                  </div>
                </div>
              </section>

              {/* Status Page */}
              <section id="status" className="scroll-mt-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">API Status</h2>
                <div className="prose prose-gray dark:prose-invert max-w-none mb-8">
                  <p>
                    Monitor the real-time status of ChordMini API services and endpoints.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
                    <CardBody>
                      <div className="flex items-center gap-3 mb-4">
                        <StatusIcon status="Operational" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Backend Services</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>Beat Detection</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>Chord Recognition</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>Lyrics Services</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Operational</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                  <Card shadow="sm" className="hover:shadow-lg transition-all border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
                    <CardBody>
                      <div className="flex items-center gap-3 mb-4">
                        <FiServer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">Infrastructure</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>Google Cloud Run</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Online</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>Rate Limiting</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Active</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                          <span>CORS Support</span>
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">Enabled</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </div>
                <div className={`rounded-lg p-6 ${infoCardClass('info')}`}>
                  <div className="flex items-start gap-3">
                    <FiExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Detailed Status Page</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        For real-time monitoring and detailed service metrics, visit our dedicated status page.
                      </p>
                      <a href="/status" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm transition-colors">
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