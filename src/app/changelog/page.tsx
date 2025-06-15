'use client';

import React from 'react';
import Navigation from '@/components/Navigation';

export default function ChangelogPage() {

  const releases = [
    {
      version: 'v0.1.0',
      date: 'June 6, 2025',
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
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Changelog
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-4xl mx-auto leading-relaxed">
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
              <div className="bg-primary-600 dark:bg-primary-700 text-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{release.version}</h2>
                    <p className="text-primary-100 mt-1 text-xl">{release.title}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-primary-100 text-lg">Released</div>
                    <div className="text-xl font-semibold">{release.date}</div>
                  </div>
                </div>
                <p className="text-primary-100 mt-3 text-lg leading-relaxed">{release.description}</p>
              </div>

              {/* Release Content */}
              <div className="p-6 bg-gray-100 dark:bg-content-bg">
                {/* Added Features */}
                <div>
                  <h3 className="text-xl font-semibold text-green-600 dark:text-green-400 mb-6 flex items-center">
                    <span className="mr-3 text-xl">✨</span>
                    Features
                  </h3>
                  <ul className="space-y-4 max-w-4xl">
                    {release.features.map((item, idx) => (
                      <li key={idx} className="text-lg text-gray-700 dark:text-gray-300 flex items-start leading-relaxed">
                        <span className="text-green-500 mr-4 mt-1.5 text-base">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
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
