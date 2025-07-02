'use client';

import React, { useState } from 'react';
import Image from 'next/image';


interface FeatureItem {
  id: string;
  title: string;
  shortDescription: string;
  detailedDescription: string;
  icon: React.ReactNode;
  highlights: string[];
  technicalDetails?: string[];
}

const FeaturesSection: React.FC = () => {

  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const toggleFeature = (featureId: string) => {
    setExpandedFeature(expandedFeature === featureId ? null : featureId);
  };

  const features: FeatureItem[] = [
    {
      id: 'chord-recognition',
      title: 'Advanced Chord Recognition',
      shortDescription: 'AI-powered chord detection with multiple model options for maximum accuracy.',
      detailedDescription: 'ChordMini employs state-of-the-art machine learning models to identify chords in audio with exceptional precision. Our system supports multiple detection algorithms, each optimized for different musical styles and complexity levels.',
      icon: (
        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="2" fill="currentColor"/>
          <circle cx="18" cy="6" r="2" fill="currentColor"/>
          <circle cx="6" cy="18" r="2" fill="currentColor"/>
          <circle cx="18" cy="18" r="2" fill="currentColor"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
          <path d="M8 6l4 6m0 0l4-6m-4 6l-4 6m4-6l4 6" strokeWidth="1.5"/>
        </svg>
      ),
      highlights: [
        'Multiple AI models: Chord-CNN-LSTM and BTC (Beat-Transformer-Chord)',
        'Supports major, minor, 7th, diminished, and extended chords',
        'Real-time chord progression analysis',
        'Enharmonic correction with toggle functionality',
        'Context-aware chord interpretation'
      ],
      technicalDetails: [
        'Chord-CNN-LSTM: 301 chord labels with high accuracy for complex progressions',
        'BTC models: Beat-synchronized chord detection for rhythmic accuracy',
        'Automatic key signature detection and modulation analysis',
        'Confidence scoring for each detected chord'
      ]
    },
    {
      id: 'beat-detection',
      title: 'Intelligent Beat Detection',
      shortDescription: 'Precise rhythm analysis with BPM detection and time signature identification.',
      detailedDescription: 'Our advanced beat detection system uses cutting-edge algorithms to analyze musical timing, providing accurate beat tracking, tempo estimation, and rhythmic structure analysis for any audio input.',
      icon: (
        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      ),
      highlights: [
        'Beat-Transformer and Madmom algorithms for precise timing',
        'Automatic BPM (tempo) detection',
        'Time signature identification (4/4, 3/4, 6/8, etc.)',
        'Downbeat detection for measure alignment',
        'Pickup beat and anacrusis handling'
      ],
      technicalDetails: [
        'Beat-Transformer: State-of-the-art neural network for beat tracking',
        'Madmom: Robust traditional algorithm for complex rhythms',
        'Sub-beat accuracy with millisecond precision',
        'Adaptive tempo tracking for songs with tempo changes'
      ]
    },
    {
      id: 'visualization',
      title: 'Real-time Visualization',
      shortDescription: 'Interactive chord grids and beat maps that sync perfectly with audio playback.',
      detailedDescription: 'Experience music analysis like never before with our dynamic visualization system. Watch chords and beats come alive as they synchronize with the audio, providing an immersive and educational experience.',
      icon: (
        <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      highlights: [
        'Dynamic chord grid with measure-based layout',
        'Real-time beat highlighting during playback',
        'Interactive navigation - click any beat to jump to that time',
        'Responsive design adapting to different time signatures',
        'Visual chord change indicators and progression flow'
      ],
      technicalDetails: [
        'Optimized rendering for smooth 60fps animations',
        'Adaptive grid layout based on time signature and screen size',
        'Color-coded chord types and harmonic functions',
        'Synchronized with audio playback within millisecond accuracy'
      ]
    },
    {
      id: 'lyrics-integration',
      title: 'Lyrics Integration & Transcription',
      shortDescription: 'Automatic lyrics transcription with chord annotations for professional lead sheets.',
      detailedDescription: 'Transform any song into a professional lead sheet with our intelligent lyrics transcription system. Chords are automatically positioned above the corresponding words, creating publication-ready musical notation.',
      icon: (
        <Image
          src="/musicAI.png"
          alt="Music.AI"
          width={24}
          height={24}
          className="mr-0"
        />
      ),
      highlights: [
        'Automatic lyrics transcription from audio',
        'Chord positioning above corresponding words',
        'Karaoke-style letter-by-letter synchronization',
        'Professional lead sheet layout',
        'Multiple lyrics sources: LRClib, Genius, and direct transcription'
      ],
      technicalDetails: [
        'AI-powered vocal separation and speech recognition',
        'Intelligent word-to-chord alignment algorithms',
        'Support for multiple languages and character sets',
        'Timestamp-accurate lyrics synchronization'
      ]
    },
    {
      id: 'translation',
      title: 'Multi-language Support',
      shortDescription: 'AI-powered translation for non-English lyrics with context-aware interpretation.',
      detailedDescription: 'Break language barriers with our advanced translation system powered by Google\'s Gemini AI. Get accurate, context-aware translations that preserve the musical and poetic meaning of lyrics.',
      icon: (
        <Image
          src="/sparkles-outline.svg"
          alt="Gemini AI"
          width={24}
          height={24}
          className="mr-0"
        />
      ),
      highlights: [
        'Powered by Google Gemini AI for superior accuracy',
        'Context-aware translation preserving musical meaning',
        'Support for 8+ languages including Chinese, Japanese, Korean',
        'Side-by-side original and translated lyrics display',
        'Cultural and idiomatic expression handling'
      ],
      technicalDetails: [
        'Gemini Pro model for advanced language understanding',
        'Musical context preservation in translations',
        'Batch translation with caching for performance',
        'Real-time translation updates during playback'
      ]
    },
    {
      id: 'caching',
      title: 'Smart Caching System',
      shortDescription: 'Firebase-powered caching reduces processing time and optimizes resource usage.',
      detailedDescription: 'Our intelligent caching system ensures lightning-fast performance by storing analysis results, reducing processing time for previously analyzed content, and optimizing API usage across the platform.',
      icon: (
        <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      highlights: [
        'Firebase Firestore for reliable data storage',
        'Instant loading for previously analyzed songs',
        'Reduced API usage and processing costs',
        'Automatic cache invalidation and updates',
        'Cross-user benefit from shared analysis results'
      ],
      technicalDetails: [
        'Distributed caching with global CDN',
        'Intelligent cache warming for popular content',
        'Compression and optimization for minimal storage',
        'Background cache updates for improved accuracy'
      ]
    }
  ];

  return (
    <div id="features" className="mt-6">
      <div className="bg-white dark:bg-content-bg rounded-lg p-6 w-full transition-colors duration-300 shadow-sm">
        <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 text-center transition-colors duration-300">
          Features
        </h3>

        <div className="space-y-3">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden transition-all duration-300 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-500"
            >
              {/* Feature Header - Always Visible */}
              <button
                onClick={() => toggleFeature(feature.id)}
                className="w-full px-6 py-4 text-left flex items-center justify-between transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset group"
              >
                <div className="flex items-center space-x-4 flex-1">
                  <div className="flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                      {feature.title}
                    </h4>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 transition-colors duration-300">
                      {feature.shortDescription}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-4">
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${
                      expandedFeature === feature.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expandable Content */}
              {expandedFeature === feature.id && (
                <div className="bg-white dark:bg-content-bg transition-colors duration-300">
                  <div className="px-6 py-4 space-y-4">
                    {/* Detailed Description */}
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {feature.detailedDescription}
                    </p>

                    {/* Key Highlights */}
                    <div>
                      <h5 className="text-md font-semibold text-gray-800 dark:text-gray-100 mb-3">
                        Key Features:
                      </h5>
                      <ul className="space-y-2">
                        {feature.highlights.map((highlight, index) => (
                          <li key={index} className="flex items-start space-x-3">
                            <span className="text-blue-500 mt-1.5 text-xs">●</span>
                            <span className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                              {highlight}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Technical Details */}
                    {feature.technicalDetails && (
                      <div>
                        <h5 className="text-md font-semibold text-gray-800 dark:text-gray-100 mb-3">
                          Technical Details:
                        </h5>
                        <ul className="space-y-2">
                          {feature.technicalDetails.map((detail, index) => (
                            <li key={index} className="flex items-start space-x-3">
                              <span className="text-green-500 mt-1.5 text-xs">▸</span>
                              <span className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {detail}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Additional Features Section */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 text-center">
            Additional Capabilities
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700 transition-colors duration-300">
              <h5 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2 transition-colors duration-300">
                Audio Format Support
              </h5>
              <p className="text-gray-600 dark:text-gray-300 text-sm transition-colors duration-300">
                Supports MP3, WAV, FLAC, and direct YouTube URL processing with automatic audio extraction and format conversion.
              </p>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 p-4 rounded-lg border border-green-200 dark:border-green-700 transition-colors duration-300">
              <h5 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2 transition-colors duration-300">
                Open Source
              </h5>
              <p className="text-gray-600 dark:text-gray-300 text-sm transition-colors duration-300">
                Built with transparency in mind. Explore the code, contribute improvements, and customize for your needs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturesSection;
