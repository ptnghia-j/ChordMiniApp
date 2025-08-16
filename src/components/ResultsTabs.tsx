'use client';

import React from 'react';

interface ResultsTabsProps {
  activeTab: 'beatChordMap' | 'guitarChords' | 'lyricsChords';
  setActiveTab: (tab: 'beatChordMap' | 'guitarChords' | 'lyricsChords') => void;
  showLyrics: boolean;
  hasCachedLyrics: boolean;
}

const ResultsTabs: React.FC<ResultsTabsProps> = ({
  activeTab,
  setActiveTab,
  showLyrics,
  hasCachedLyrics
}) => {
  return (
    <div className="border-b border-gray-200 mb-4">
      <div className="flex -mb-px">
        <button
          onClick={() => setActiveTab('beatChordMap')}
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'beatChordMap'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
          }`}
        >
          Beat & Chord Map
        </button>
        <button
          onClick={() => setActiveTab('guitarChords')}
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'guitarChords'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center space-x-1">
            <span>Guitar Chords</span>
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
              beta
            </span>
          </span>
        </button>
        <button
          onClick={() => setActiveTab('lyricsChords')}
          disabled={!showLyrics && !hasCachedLyrics}
          className={`py-2 px-4 text-sm font-medium ${
            activeTab === 'lyricsChords'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : (!showLyrics && !hasCachedLyrics)
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center space-x-1">
            <span>Lyrics & Chords</span>
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
              beta
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

export default ResultsTabs;
export { ResultsTabs };
