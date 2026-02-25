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
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
      }}
    >
      {/* Container with horizontal scrolling animation */}
      <motion.div
        className="flex space-x-8 will-change-transform"
        animate={{
          x: [0, -576] // Move left by width of 6 chord diagrams (96px each + 32px gap)
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ backfaceVisibility: 'hidden' }}
      >
        {/* Render chords twice for seamless loop */}
        {[...chordProgression, ...chordProgression].map((chord, index) => {
          const chordData = chordDataCache.get(chord);

          return (
            <div
              key={`${chord}-${index}`}
              className="flex-shrink-0 w-28 h-44 flex flex-col items-center justify-center"
            >
              {chordData ? (
                <GuitarChordDiagram
                  chordData={chordData}
                  size="large"
                  className="w-24 h-32"
                  showChordName={true}
                  displayName={chord}
                />
              ) : (
                <div className="w-24 h-32 bg-gray-200 dark:bg-blue-900/20 animate-pulse rounded-lg border border-gray-300 dark:border-blue-700" />
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default HeroScrollingChordAnimation;
