'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

// Lazy load the guitar chord diagram component
const GuitarChordDiagram = dynamic(() => import('@/components/chord-playback/GuitarChordDiagram'), {
  loading: () => <div className="w-16 h-20 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg" />,
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

interface HeroScrollingChordAnimationProps {
  className?: string;
}

const HeroScrollingChordAnimation: React.FC<HeroScrollingChordAnimationProps> = ({
  className = ''
}) => {
  const [chordDataCache, setChordDataCache] = useState<Map<string, ChordData | null>>(new Map());

  // Extended chord progression for scrolling effect
  const chordProgression = useMemo(() => ['C', 'Am', 'F', 'G', 'Em', 'Dm', 'A', 'E', 'Bm', 'D'], []);

  // Load chord data
  useEffect(() => {
    const loadChordData = async () => {
      try {
        const { chordMappingService } = await import('@/services/chord-analysis/chordMappingService');
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
        console.error('Failed to load chord data for scrolling animation:', error);
      }
    };

    loadChordData();
  }, [chordProgression]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Container with horizontal scrolling animation */}
      <motion.div
        className="flex space-x-8"
        animate={{
          x: [0, -576] // Move left by width of 6 chord diagrams (96px each + 32px gap)
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        {/* Render chords twice for seamless loop */}
        {[...chordProgression, ...chordProgression].map((chord, index) => {
          const chordData = chordDataCache.get(chord);

          return (
            <motion.div
              key={`${chord}-${index}`}
              className="flex-shrink-0 w-28 h-44 flex flex-col items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              {chordData ? (
                <GuitarChordDiagram
                  chordData={chordData}
                  size="large"
                  className="w-24 h-32"
                  showChordName={true}
                  displayName={chord} // Pass the original chord name for consistent formatting
                />
              ) : (
                <div className="w-24 h-32 bg-gray-200 dark:bg-blue-900/20 animate-pulse rounded-lg border border-gray-300 dark:border-blue-700" />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Gradient overlays for smooth fade effect */}
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white dark:from-content-bg to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white dark:from-content-bg to-transparent pointer-events-none z-10" />
    </div>
  );
};

export default HeroScrollingChordAnimation;
