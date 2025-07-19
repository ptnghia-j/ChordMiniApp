'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Lazy load the guitar chord diagram component
const GuitarChordDiagram = dynamic(() => import('@/components/GuitarChordDiagram'), {
  loading: () => <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg" />,
  ssr: false
});

interface ChordData {
  key: string;
  suffix: string;
  positions: Array<{
    frets: number[];
    fingers: number[];
    baseFret: number;
    barres: number[];
    capo?: boolean;
    midi?: number[];
  }>;
}

interface HeroGuitarChordAnimationProps {
  className?: string;
}

/**
 * Slow-animated guitar chord progression for the hero section
 * Shows a simple chord progression with very slow, subtle animations
 */
const HeroGuitarChordAnimation: React.FC<HeroGuitarChordAnimationProps> = ({
  className = ''
}) => {
  const [currentChordIndex, setCurrentChordIndex] = useState(0);
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());

  // Simple chord progression for demo
  const chordProgression = useMemo(() => ['C', 'Am', 'F', 'G'], []);

  // Load chord data
  useEffect(() => {
    const loadChordData = async () => {
      try {
        const { chordMappingService } = await import('@/services/chordMappingService');
        const results = await Promise.all(
          chordProgression.map(async (chord) => ({
            chord,
            data: await chordMappingService.getChordData(chord)
          }))
        );

        const newCache = new Map<string, ChordData | null>();
        results.forEach(({ chord, data }) => {
          newCache.set(chord, data);
        });
        setChordDataCache(newCache);
      } catch (error) {
        console.error('Failed to load chord data for hero animation:', error);
      }
    };

    loadChordData();
  }, [chordProgression]);

  // Very slow chord progression - change every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentChordIndex((prev) => (prev + 1) % 4); // Use fixed length instead of chordProgression.length
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex justify-center items-center py-6 ${className}`}>
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentChordIndex}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              duration: 1.2,
              ease: "easeInOut"
            }}
            className="flex flex-col items-center"
          >
            {/* Chord diagram */}
            <div className="mb-2">
              <GuitarChordDiagram
                chordData={chordDataCache.get(chordProgression[currentChordIndex]) || null}
                size="medium"
                showChordName={false}
                displayName={chordProgression[currentChordIndex]}
                isFocused={true}
              />
            </div>
            
            {/* Chord name */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-center"
            >
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {chordProgression[currentChordIndex]}
              </span>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Progress indicators */}
        <div className="flex justify-center mt-4 space-x-2">
          {chordProgression.map((_, index) => (
            <motion.div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                index === currentChordIndex
                  ? 'bg-blue-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
              animate={{
                scale: index === currentChordIndex ? 1.2 : 1
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroGuitarChordAnimation;
