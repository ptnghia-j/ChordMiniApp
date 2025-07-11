'use client';

import React from 'react';
import Navigation from '@/components/Navigation';

export default function ChangelogPage() {

  const releases = [
    {
      version: 'v0.2.6',
      date: 'July 9, 2025',
      title: 'UI Revamp & Model Selection Improvements',
      description: 'Major UI improvements with HeroUI component migration, streamlined model selection workflow, and enhanced user experience',
      features: [
        'UI: Migrated to HeroUI component library for better consistency and maintainability',
        'UI: Streamlined model selection workflow by removing redundant standalone model selection page',
        'UI: Enhanced embedded model selectors with improved accessibility (aria-labels and textValue props)',
        'UI: Fixed upload audio button styling with proper contrast and blue accent theme (#1e40af)',
        'UI: Improved API key management instructions with more concise Music.AI workflow setup guidance',
        'BACKEND: Fixed model selection API endpoint routing from direct backend calls to Next.js API routes',
        'BACKEND: Resolved status page localhost endpoint configuration issues'
      ],
      technical: [
        'Removed standalone /model-selection page and ModelSelectionInterface component to eliminate code duplication',
        'Fixed HeroUIChordModelSelector API endpoint from ${backendUrl}/chord-model-info to /api/model-info',
        'Added proper accessibility attributes to HeroUI Select components (textValue, aria-label)',
        'Enhanced button styling with explicit background colors and hover states for better contrast',
        'Simplified Music.AI API key setup instructions while maintaining essential workflow information'
      ],
      breaking: [
        'Removed /model-selection route - model selection is now embedded in analyze pages only'
      ]
    },
    {
      version: 'v0.2.5',
      date: 'July 8, 2025',
      title: 'Search UI Enhancements & Backend Port Update',
      description: 'Enhanced search functionality with improved dropdown width, simplified result display, and backend port configuration update for macOS compatibility',
      features: [
        'UI: Expanded sticky search bar dropdown width to span full width of search input and upload button combined',
        'UI: Simplified search results display by removing view count and duration metadata',
        'UI: Fixed search results clearing bug when search input is emptied',
        'UI: Enhanced beat timeline visualization with improved proportional downbeat bars',
        'UI: Improved mini search box functionality in navigation bar with dropdown results and state synchronization',
        'BACKEND: Updated localhost backend URL from port 5000 to 5001 to avoid conflict with macOS AirDrop/AirTunes',
        'BACKEND: Centralized backend URL configuration through environment variables for better maintainability'
      ],
      technical: [
        'Moved search dropdown positioning from form-relative to parent container-relative for full width spanning',
        'Removed duration and view count display from SearchResults ThumbnailImage component',
        'Enhanced search state synchronization between main and sticky search components',
        'Updated all backend URL references to use port 5001 instead of 5000',
        'Maintained 400ms debouncing for optimal search performance and YouTube API quota management'
      ],
      breaking: [
        'Backend port changed from 5000 to 5001 - update local development environment accordingly'
      ]
    },
    {
      version: 'v0.2.4',
      date: 'July 7, 2025',
      title: 'Critical Stability & UI Fixes',
      description: 'Essential fixes for React infinite loops, layout spacing issues, and production build optimizations',
      features: [
        'STABILITY: Fixed React "Maximum update depth exceeded" infinite loop errors in Lyrics & Chords tab',
        'STABILITY: Resolved circular dependencies in useScrollAndAnimation and LeadSheetDisplay components',
        'STABILITY: Eliminated duplicate beat tracking that caused state conflicts and crashes',
        'UI: Fixed excessive white space above "Analysis Results" title for better visual layout',
        'UI: Improved guitar chord diagram animation smoothness with reduced scale differences',
        'UI: Fixed musicAI.png image aspect ratio warning for proper rendering',
        'CLEANUP: Removed all console logging statements from guitar chord diagram functionality',
        'CLEANUP: Eliminated debug logs from chord parsing and pattern suffix mapping',
        'BUILD: Fixed TypeScript compilation errors and unused variable warnings'
      ],
      technical: [
        'useEffect dependency arrays optimized to prevent infinite re-renders',
        'Removed setCurrentTime from useScrollAndAnimation hook dependencies',
        'Fixed memoizedChords usage in LeadSheetDisplay component',
        'Eliminated redundant beat tracking in analyze page',
        'Reduced container padding from p-4 to px-4 pt-2 pb-1 for better spacing',
        'Image component aspect ratio properly maintained without style overrides'
      ],
      breaking: []
    },
    {
      version: 'v0.2.3',
      date: 'July 7, 2025',
      title: 'Music.AI Caching & UI Polish',
      description: 'Critical fixes for Music.AI lyrics caching, React performance optimizations, and enhanced user interface with globe icon for translations',
      features: [
        'CACHING: Fixed Music.AI lyrics caching to Firestore - no more expensive repeated API calls',
        'CACHING: Implemented unauthenticated public caching for ML model outputs (lyrics transcriptions)',
        'CACHING: Updated Firestore security rules to support safe public caching of transcription results',
        'PERFORMANCE: Fixed React "Maximum update depth exceeded" errors in lyrics & chord tab',
        'PERFORMANCE: Added proper memoization with useMemo and useCallback to prevent infinite re-renders',
        'PERFORMANCE: Optimized useEffect dependency arrays to eliminate unnecessary component updates',
        'UI: Added professional globe icon (🌐) to translate lyrics button with light/dark mode support',
        'UI: Enhanced visual consistency with custom SVG icon integration',
        'CLEANUP: Removed all remaining console logs with emoji prefixes for production-ready code',
        'CLEANUP: Eliminated debug logs from AnalyzePage, AudioProcessing, Metronome, and Auth services',
        'STABILITY: Fixed build issues with dynamic imports and improved error handling in cache routes'
      ],
      technical: [
        'Firebase authentication issue resolved for server-side API routes',
        'Firestore security rules updated to allow unauthenticated writes to lyrics collection',
        'React hooks optimized with proper dependency management',
        'LeadSheetDisplay component performance significantly improved',
        'Source map errors eliminated from production builds'
      ],
      breaking: []
    },
    {
      version: 'v0.2.2',
      date: 'July 6, 2025',
      title: 'Performance Revolution & Metronome Redesign',
      description: 'Major performance optimizations with 90%+ improvements and complete metronome system redesign for professional-grade functionality',
      features: [
        'PERFORMANCE: Beat-chord grid alignment optimization with two-pointer replacing brute force (90%+ improvement)',
        'PERFORMANCE: React component memoization reducing re-renders by 80-90%',
        'METRONOME: Complete redesign using pre-generated audio tracks for perfect synchronization',
        'METRONOME: 300% volume boost with 360% downbeat emphasis for clear audibility',
        'METRONOME: Perfect sync - starts from current playback position instead of restarting',
        'METRONOME: Continuous playback throughout entire song duration',
        'ANIMATION: Fixed critical regression where clicking chord cells froze beat tracking',
        'OPTIMIZATION: Binary search O(log n) beat tracking replacing O(n) algorithms',
        'OPTIMIZATION: Bundle size maintained at 438kB while adding significant functionality',
        'CLEANUP: Removed excessive console logging for cleaner development experience'
      ],
      breaking: [
        'Metronome now uses pre-generated tracks instead of real-time scheduling',
        'Legacy metronome scheduling methods deprecated but maintained for compatibility'
      ]
    },
    {
      version: 'v0.2.0',
      date: 'July 5, 2025',
      title: 'Guitar Chords Tab & Enhanced Music Analysis',
      description: 'Major feature release introducing interactive guitar chord diagrams with professional music notation',
      features: [
        'NEW: Guitar Chords tab with interactive chord diagram visualization',
        'Animated chord progression view that adapts to your screen size',
        'Professional musical notation with proper sharp (♯) and flat (♭) symbols',
        'Enhanced chord recognition with support for complex chord types',
        'Smoother animations and improved visual experience',
        'Comprehensive credits section acknowledging open-source contributions'
      ],
      breaking: [
        'Guitar Chords and Lyrics & Chords tabs marked as [beta] - features may evolve based on feedback'
      ]
    },
    {
      version: 'v0.1.2',
      date: 'July 4, 2025',
      title: 'Improved YouTube Audio Processing',
      description: 'Enhanced reliability and performance for YouTube audio extraction with better Unicode support',
      features: [
        'Improved YouTube audio extraction with better reliability',
        'Enhanced support for international song titles and artist names',
        'Streamlined setup process for local development',
        'Better error handling and user feedback during audio processing',
        'Improved performance and stability for production deployments'
      ],
      breaking: [
        'Local development now requires Python backend running on localhost:5001 (avoiding macOS AirTunes port 5000 conflict)'
      ]
    },
    {
      version: 'v0.1.1',
      date: 'July 2, 2025',
      title: 'Critical Bug Fixes & Performance Improvements',
      description: 'Resolved critical production issues affecting chord synchronization and performance warnings',
      features: [
        'Fixed chord synchronization API failure (HTTP 400 errors) for direct file uploads',
        'Resolved 413 "Payload Too Large" errors for files >4MB in blob upload workflow',
        'Created new /api/synchronize-chords endpoint for direct chord-beat synchronization',
        'Enhanced service worker error handling to prevent console warnings',
        'Optimized resource preloading to eliminate unused preload warnings',
        'Achieved functional equivalence between YouTube and direct upload workflows',
        'Improved production console output with cleaner error handling',
        'Enhanced blob upload workflow with proper API contract matching',
        'Zero build warnings and clean compilation for production deployment'
      ]
    },
    {
      version: 'v0.1.0',
      date: 'June 30, 2025',
      title: 'Production Ready Release',
      description: 'Complete chord recognition and music analysis platform with AI assistance',
      features: [
        'YouTube integration with audio extraction using yt-dlp',
        'Advanced chord recognition with multiple models (Chord-CNN-LSTM, BTC SL/PL)',
        'Beat detection using Beat-Transformer and madmom models',
        'Lyrics transcription and translation with Music.ai and Gemini APIs',
        'AI chatbot assistant with contextual music analysis',
        'Synchronized metronome with Web Audio API',
        'Dark/light mode theme support',
        'API key management with client-side encryption',
        'Firebase caching for analysis results and translations',
        'Karaoke-style lyrics with letter-by-letter synchronization',
        'Enharmonic chord correction with toggle functionality',
        'Lead sheet layout with professional music notation',
        'Dynamic chord grid visualization with beat alignment',
        'Multi-language lyrics translation support'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-dark-bg">
      <Navigation />
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            Changelog
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Track ChordMini&apos;s evolution with detailed release notes and feature updates.
          </p>
        </div>

        {/* Releases */}
        <div className="max-w-2xl mx-auto space-y-6">
          {releases.map((release, index) => (
            <div
              key={index}
              className="bg-gray-100 dark:bg-content-bg rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
            >
              {/* Release Header */}
              <div className="bg-primary-600 dark:bg-primary-700 text-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{release.version}</h2>
                    <p className="text-primary-100 mt-1 text-lg">{release.title}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-primary-100 text-sm">Released</div>
                    <div className="text-lg font-semibold">{release.date}</div>
                  </div>
                </div>
                <p className="text-primary-100 mt-2 text-sm">{release.description}</p>
              </div>

              {/* Release Content */}
              <div className="p-4 bg-gray-100 dark:bg-content-bg">
                {/* Added Features */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-4">
                    Features
                  </h3>
                  <ul className="space-y-2">
                    {release.features.map((item, idx) => (
                      <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start">
                        <span className="text-green-500 mr-3 mt-1 text-xs">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Breaking Changes */}
                {release.breaking && (
                  <div>
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
                      Core Changes
                    </h3>
                    <ul className="space-y-2">
                      {release.breaking.map((item, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start">
                          <span className="text-red-500 mr-3 mt-1 text-xs">⚠</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 dark:text-gray-400">
          <p className="text-lg">
            For technical details and API documentation, visit the{' '}
            <a href="/docs" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
              API Documentation
            </a>{' '}
            page.
          </p>
        </div>
      </div>
    </div>
  );
}
