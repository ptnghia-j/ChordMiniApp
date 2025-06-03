"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import Navigation from '@/components/Navigation';

// Collapsible Feature Component
interface FeatureProps {
  title: string;
  description: string;
  details: string[];
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}

function CollapsibleFeature({ title, description, details, icon, isExpanded, onToggle }: FeatureProps) {
  return (
    <div className="bg-white dark:bg-content-bg rounded-lg shadow-md p-6 transition-colors duration-300 border border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">{title}</h2>
          {icon && <div className="ml-3 flex-shrink-0">{icon}</div>}
        </div>
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          <svg
            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <p className="text-gray-600 dark:text-gray-300 mb-4 transition-colors duration-300">
        {description}
      </p>
      {isExpanded && (
        <div className="bg-blue-50 dark:bg-gray-700 p-4 rounded-lg transition-all duration-300 ease-in-out border border-blue-200 dark:border-gray-600">
          <ul className="list-disc list-inside text-gray-700 dark:text-gray-200 space-y-2 transition-colors duration-300">
            {details.map((detail, index) => (
              <li key={index} dangerouslySetInnerHTML={{ __html: detail }} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function FeaturesPage() {
  // State to manage which features are expanded
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({
    chord: false,
    beat: false,
    lyrics: false,
    translation: false,
    youtube: false,
  });

  const toggleFeature = (featureKey: string) => {
    setExpandedFeatures(prev => ({
      ...prev,
      [featureKey]: !prev[featureKey]
    }));
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      <main className="flex-grow container mx-auto p-6 text-gray-800 dark:text-gray-100 transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-6 transition-colors duration-300">Features</h1>

          <div className="space-y-8">
            {/* Feature 1 - Chord Recognition */}
            <CollapsibleFeature
              title="Chord Recognition"
              description="Our advanced chord recognition system can identify over 300 different chord types in your music, including major, minor, 7th, suspended, and complex jazz chords."
              details={[
                'Accurate detection of chord progressions',
                'Support for complex chord voicings',
                'Real-time visualization of chord changes',
                '<span class="font-medium">NEW:</span> Customizable models for different music genres'
              ]}
              icon={
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="6" cy="6" r="2" fill="currentColor"/>
                  <circle cx="18" cy="6" r="2" fill="currentColor"/>
                  <circle cx="6" cy="18" r="2" fill="currentColor"/>
                  <circle cx="18" cy="18" r="2" fill="currentColor"/>
                  <circle cx="12" cy="12" r="2" fill="currentColor"/>
                  <path d="M8 6l4 6m0 0l4-6m-4 6l-4 6m4-6l4 6" strokeWidth="1.5"/>
                </svg>
              }
              isExpanded={expandedFeatures.chord}
              onToggle={() => toggleFeature('chord')}
            />

            {/* Feature 2 - Beat Tracking */}
            <CollapsibleFeature
              title="Beat Tracking"
              description="Our beat detection algorithm precisely identifies the rhythmic structure of your music, including time signatures, tempo changes, and downbeats."
              details={[
                'Accurate BPM detection',
                'Support for various time signatures (4/4, 3/4, 6/8, etc.)',
                'Visual beat grid with measure indicators',
                '<span class="font-medium">NEW:</span> Selectable beat detection models for optimal accuracy'
              ]}
              icon={
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              }
              isExpanded={expandedFeatures.beat}
              onToggle={() => toggleFeature('beat')}
            />

            {/* Feature 3 - Lyrics Transcription */}
            <CollapsibleFeature
              title="Lyrics Transcription"
              description="Get synchronized lyrics with chord annotations positioned directly above the words where chord changes occur, creating a professional lead sheet layout."
              details={[
                'Synchronized lyrics with chord annotations',
                'Karaoke-style highlighting of current lyrics with letter-by-letter animation',
                'Auto-scrolling with customizable focus point',
                'Adjustable font size for better readability'
              ]}
              icon={
                <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              isExpanded={expandedFeatures.lyrics}
              onToggle={() => toggleFeature('lyrics')}
            />

            {/* Feature 4 - Lyrics Translation */}
            <CollapsibleFeature
              title="Lyrics Translation"
              description="Powered by Gemini AI, our lyrics translation feature provides accurate translations for non-English songs, displayed directly below the original lyrics for easy comparison."
              details={[
                'Support for multiple languages',
                'Intelligent language detection',
                'Firebase caching for faster loading of previously translated content',
                'Toggle translations on/off with language selection dropdown'
              ]}
              icon={
                <Image
                  src="/sparkles-outline.svg"
                  alt="Gemini AI"
                  width={32}
                  height={32}
                  className="text-purple-600 dark:text-purple-400"
                />
              }
              isExpanded={expandedFeatures.translation}
              onToggle={() => toggleFeature('translation')}
            />

            {/* Feature 5 - YouTube Integration */}
            <CollapsibleFeature
              title="YouTube Integration"
              description="Analyze any YouTube video directly by pasting the URL or searching within the app. Our system extracts the audio and processes it for chord and beat detection."
              details={[
                'Direct YouTube search functionality with fast results (under 2 seconds)',
                'Support for URL and video ID input',
                'Firebase-powered caching system for faster analysis of previously processed videos',
                'Recent videos history for quick access to previously analyzed content'
              ]}
              icon={
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              }
              isExpanded={expandedFeatures.youtube}
              onToggle={() => toggleFeature('youtube')}
            />
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-block bg-primary-600 dark:bg-primary-700 text-white font-medium py-3 px-8 rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 transition-colors duration-200"
            >
              Try It Now
            </Link>
          </div>
        </div>
      </main>


    </div>
  );
}
