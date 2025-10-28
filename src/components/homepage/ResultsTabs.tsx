'use client';

import React from 'react';
import { Tabs, Tab } from "@heroui/react";

interface ResultsTabsProps {
  activeTab: 'beatChordMap' | 'guitarChords' | 'lyricsChords';
  setActiveTab: (tab: 'beatChordMap' | 'guitarChords' | 'lyricsChords') => void;
  showLyrics: boolean;
  hasCachedLyrics: boolean;
}

// A small helper component to create the title with the beta badge
const BetaTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex items-center space-x-1">
    <span>{children}</span>
    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
      beta
    </span>
  </span>
);

const ResultsTabs: React.FC<ResultsTabsProps> = ({
  activeTab,
  setActiveTab,
  showLyrics,
  hasCachedLyrics
}) => {
  const handleSelectionChange = (key: React.Key) => {
    setActiveTab(key as 'beatChordMap' | 'guitarChords' | 'lyricsChords');
  };

  return (
    <div className="mb-4 sticky top-0 z-[60] backdrop-blur rounded-full">
      <Tabs
        aria-label="Results navigation tabs"
        selectedKey={activeTab}
        onSelectionChange={handleSelectionChange}
        size="md"
        className="px-2 sm:px-0"
        
        classNames={{
          // Tab list container background
          tabList: "dark:bg-gray-800/50",

          // Selected pill cursor color
          cursor: "dark:bg-gray-900",

          // Improve contrast for non-selected vs selected in dark mode
          // Apply colors to both the tab wrapper and its inner content to cover custom titles
          tab: "text-gray-700 data-[selected=true]:text-gray-900 dark:text-gray-300 dark:data-[selected=true]:text-white",
          tabContent: "text-gray-700 data-[selected=true]:text-gray-900 dark:text-gray-300 dark:data-[selected=true]:text-white",
        }}
      >
        <Tab
          key="beatChordMap"
          title="Beat & Chord Map"
        />
        <Tab
          key="guitarChords"
          title={<BetaTitle>Guitar Chords</BetaTitle>}
        />
        <Tab
          key="lyricsChords"
          title={<BetaTitle>Lyrics & Chords</BetaTitle>}
          isDisabled={!showLyrics && !hasCachedLyrics}
        />
      </Tabs>
    </div>
  );
};

export default ResultsTabs;
export { ResultsTabs };