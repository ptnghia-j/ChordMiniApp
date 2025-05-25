"use client";

import Link from 'next/link';
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">{title}</h2>
          {icon && <div className="ml-3 flex-shrink-0">{icon}</div>}
        </div>
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
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
        <div className="bg-blue-100 dark:bg-blue-800 p-4 rounded-lg transition-all duration-300 ease-in-out">
          <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
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
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
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
                <svg width="32" height="32" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M95.5 15.5L26.5 176.5H165.5L95.5 15.5Z" fill="#8e44ef" />
                </svg>
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
