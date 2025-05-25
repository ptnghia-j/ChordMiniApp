"use client";

import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';

export default function FeaturesPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Use the Navigation component */}
      <Navigation />

      <main className="flex-grow container mx-auto p-6 text-gray-800 dark:text-gray-100 transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-6 transition-colors duration-300">Features</h1>

          <div className="space-y-8">
            {/* Feature 1 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Chord Recognition</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 transition-colors duration-300">
                Our advanced chord recognition system can identify over 300 different chord types in your music,
                including major, minor, 7th, suspended, and complex jazz chords.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg transition-colors duration-300">
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
                  <li>Accurate detection of chord progressions</li>
                  <li>Support for complex chord voicings</li>
                  <li>Real-time visualization of chord changes</li>
                  <li><span className="font-medium">NEW:</span> Customizable models for different music genres</li>
                </ul>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Beat Tracking</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 transition-colors duration-300">
                Our beat detection algorithm precisely identifies the rhythmic structure of your music,
                including time signatures, tempo changes, and downbeats.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg transition-colors duration-300">
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
                  <li>Accurate BPM detection</li>
                  <li>Support for various time signatures (4/4, 3/4, 6/8, etc.)</li>
                  <li>Visual beat grid with measure indicators</li>
                  <li><span className="font-medium">NEW:</span> Selectable beat detection models for optimal accuracy</li>
                </ul>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Lyrics Transcription</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 transition-colors duration-300">
                Get synchronized lyrics with chord annotations positioned directly above the words
                where chord changes occur, creating a professional lead sheet layout.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg transition-colors duration-300">
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
                  <li>Synchronized lyrics with chord annotations</li>
                  <li>Karaoke-style highlighting of current lyrics with letter-by-letter animation</li>
                  <li>Auto-scrolling with customizable focus point</li>
                  <li>Adjustable font size for better readability</li>
                </ul>
              </div>
            </div>

            {/* Feature 4 - Lyrics Translation */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Lyrics Translation</h2>
              <div className="flex items-center mb-4">
                <p className="text-gray-600 dark:text-gray-300 flex-grow transition-colors duration-300">
                  Powered by Gemini AI, our lyrics translation feature provides accurate translations for non-English songs,
                  displayed directly below the original lyrics for easy comparison.
                </p>
                <svg width="32" height="32" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg" className="ml-3 flex-shrink-0">
                  <path d="M95.5 15.5L26.5 176.5H165.5L95.5 15.5Z" fill="#8e44ef" />
                </svg>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg transition-colors duration-300">
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
                  <li>Support for multiple languages</li>
                  <li>Intelligent language detection</li>
                  <li>Firebase caching for faster loading of previously translated content</li>
                  <li>Toggle translations on/off with language selection dropdown</li>
                </ul>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">YouTube Integration</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4 transition-colors duration-300">
                Analyze any YouTube video directly by pasting the URL or searching within the app.
                Our system extracts the audio and processes it for chord and beat detection.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg transition-colors duration-300">
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 transition-colors duration-300">
                  <li>Direct YouTube search functionality with fast results (under 2 seconds)</li>
                  <li>Support for URL and video ID input</li>
                  <li>Firebase-powered caching system for faster analysis of previously processed videos</li>
                  <li>Recent videos history for quick access to previously analyzed content</li>
                </ul>
              </div>
            </div>
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
