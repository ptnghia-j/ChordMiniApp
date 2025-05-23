"use client";

import Link from 'next/link';
import Image from 'next/image';

export default function FeaturesPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top navigation bar */}
      <div className="bg-white text-gray-800 p-3 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="/chordMiniLogo.png"
              alt="ChordMini Logo"
              width={32}
              height={32}
              className="mr-2"
            />
            <h1 className="text-xl font-bold text-primary-700">Chord Mini</h1>
          </div>
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link href="/" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-primary-700 hover:text-primary-800 transition-colors font-medium">
                  Features
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <main className="flex-grow container mx-auto p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">Features</h1>

          <div className="space-y-8">
            {/* Feature 1 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Chord Recognition</h2>
              <p className="text-gray-600 mb-4">
                Our advanced chord recognition system can identify over 300 different chord types in your music,
                including major, minor, 7th, suspended, and complex jazz chords.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                  <li>Accurate detection of chord progressions</li>
                  <li>Support for complex chord voicings</li>
                  <li>Real-time visualization of chord changes</li>
                  <li><span className="font-medium">NEW:</span> Customizable models for different music genres</li>
                </ul>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Beat Tracking</h2>
              <p className="text-gray-600 mb-4">
                Our beat detection algorithm precisely identifies the rhythmic structure of your music,
                including time signatures, tempo changes, and downbeats.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                  <li>Accurate BPM detection</li>
                  <li>Support for various time signatures (4/4, 3/4, 6/8, etc.)</li>
                  <li>Visual beat grid with measure indicators</li>
                  <li><span className="font-medium">NEW:</span> Selectable beat detection models for optimal accuracy</li>
                </ul>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Lyrics Transcription</h2>
              <p className="text-gray-600 mb-4">
                Get synchronized lyrics with chord annotations positioned directly above the words
                where chord changes occur, creating a professional lead sheet layout.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                  <li>Synchronized lyrics with chord annotations</li>
                  <li>Karaoke-style highlighting of current lyrics with letter-by-letter animation</li>
                  <li>Auto-scrolling with customizable focus point</li>
                  <li>Adjustable font size for better readability</li>
                </ul>
              </div>
            </div>

            {/* Feature 4 - Lyrics Translation */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Lyrics Translation</h2>
              <div className="flex items-center mb-4">
                <p className="text-gray-600 flex-grow">
                  Powered by Gemini AI, our lyrics translation feature provides accurate translations for non-English songs,
                  displayed directly below the original lyrics for easy comparison.
                </p>
                <svg width="32" height="32" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg" className="ml-3 flex-shrink-0">
                  <path d="M95.5 15.5L26.5 176.5H165.5L95.5 15.5Z" fill="#8e44ef" />
                </svg>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                  <li>Support for multiple languages</li>
                  <li>Intelligent language detection</li>
                  <li>Firebase caching for faster loading of previously translated content</li>
                  <li>Toggle translations on/off with language selection dropdown</li>
                </ul>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">YouTube Integration</h2>
              <p className="text-gray-600 mb-4">
                Analyze any YouTube video directly by pasting the URL or searching within the app.
                Our system extracts the audio and processes it for chord and beat detection.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ul className="list-disc list-inside text-gray-700 space-y-2">
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
              className="inline-block bg-primary-600 text-white font-medium py-3 px-8 rounded-lg hover:bg-primary-700 transition-colors duration-200"
            >
              Try It Now
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white p-4 mt-auto">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm">&copy; {new Date().getFullYear()} Chord Recognition App. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
