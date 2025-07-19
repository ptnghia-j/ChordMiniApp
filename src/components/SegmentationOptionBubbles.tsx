'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SongContext } from '@/types/chatbotTypes';
import { useApiKeys } from '@/hooks/useApiKeys';
import { HiOutlineLightBulb } from 'react-icons/hi2';

interface SegmentationOptionBubblesProps {
  songContext?: SongContext;
  onOptionSelect: (option: 'analysis' | 'segmentation') => void;
}

/**
 * Component that displays selectable option bubbles for analysis types
 */
const SegmentationOptionBubbles: React.FC<SegmentationOptionBubblesProps> = ({
  songContext,
  onOptionSelect
}) => {
  const { getApiKey } = useApiKeys();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingApiKey, setIsCheckingApiKey] = useState(true);

  const hasLyrics = !!(songContext?.lyrics && songContext.lyrics.lines.length > 0);
  const canDoSegmentation = hasApiKey && hasLyrics;

  // Check API key availability on mount
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const musicAiKey = await getApiKey('musicAi');
        setHasApiKey(!!musicAiKey);
      } catch (error) {
        console.error('Error checking Music.AI API key:', error);
        setHasApiKey(false);
      } finally {
        setIsCheckingApiKey(false);
      }
    };

    checkApiKey();
  }, [getApiKey]);

  return (
    <div className="flex flex-col gap-3 mt-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        Choose what you&apos;d like to explore:
      </p>
      
      <div className="flex flex-col gap-2">
        {/* Beat/Chord/Lyrics Analysis Option */}
        <motion.button
          onClick={() => onOptionSelect('analysis')}
          className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors duration-200 text-left"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 dark:text-blue-100">Beat/Chord/Lyrics Analysis</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Explore chord progressions, beat patterns, and lyrics analysis
            </p>
          </div>
        </motion.button>

        {/* Song Segmentation Option */}
        <motion.button
          onClick={() => canDoSegmentation ? onOptionSelect('segmentation') : undefined}
          disabled={!canDoSegmentation || isCheckingApiKey}
          className={`flex items-center gap-3 p-4 border rounded-lg text-left transition-colors duration-200 ${
            canDoSegmentation && !isCheckingApiKey
              ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 cursor-pointer'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 cursor-not-allowed opacity-60'
          }`}
          whileHover={canDoSegmentation && !isCheckingApiKey ? { scale: 1.02 } : {}}
          whileTap={canDoSegmentation && !isCheckingApiKey ? { scale: 0.98 } : {}}
        >
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            canDoSegmentation ? 'bg-purple-500' : 'bg-gray-400'
          }`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className={`font-medium ${
              canDoSegmentation ? 'text-purple-900 dark:text-purple-100' : 'text-gray-600 dark:text-gray-400'
            }`}>
              Song Segmentation Analysis
            </h3>
            <p className={`text-sm ${
              canDoSegmentation ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-500'
            }`}>
              {isCheckingApiKey
                ? 'Checking requirements...'
                : canDoSegmentation
                  ? 'Identify song structure (intro, verse, chorus, bridge) with color-coded visualization'
                  : 'Requires Music.AI API key and lyrics to be available'
              }
            </p>
            {!canDoSegmentation && !isCheckingApiKey && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {!hasApiKey && !hasLyrics && 'Missing: Music.AI API key and lyrics'}
                {!hasApiKey && hasLyrics && 'Missing: Music.AI API key (configure in settings)'}
                {hasApiKey && !hasLyrics && 'Missing: Lyrics data (try transcribing first)'}
              </div>
            )}
          </div>
        </motion.button>
      </div>

      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <HiOutlineLightBulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span><strong>Tip:</strong> Song segmentation creates a color-coded visualization of your song&apos;s structure,
          making it easy to see verses, choruses, and other sections at a glance.</span>
        </p>
      </div>
    </div>
  );
};

export default SegmentationOptionBubbles;
