'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Button, Card, CardBody, Chip, Divider } from '@heroui/react';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import { BeatInfo } from '@/services/audio/beatDetectionService';
import {
  SongMetadata,
  fetchSongMetadata,
} from '@/services/musicbrainz/musicbrainzService';
import { getLightweightChordPlaybackService } from '@/services/chord-playback/lightweightChordPlaybackService';
import type { RomanNumeralData, SequenceCorrectionsData } from '@/services/firebase/firestoreService';
import {
  computeAccidentalPreference,
  getEnharmonicEquivalent,
  getAccidentalPreferenceFromKey,
} from '@/utils/chordUtils';
import {
  buildChordOccurrenceMap,
  buildChordOccurrenceCorrectionMap,
  buildChordSequenceIndexMap,
  getDisplayChord,
} from '@/utils/chordProcessing';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useShowCorrectedChords, useKeySignature } from '@/stores/analysisStore';

// Helper to determine if a chord is minor or diminished
const getIsMinorOrDim = (chordName: string): boolean => {
  if (!chordName) return false;
  const parts = chordName.split('/');
  const baseChord = parts[0].trim();
  const rootMatch = baseChord.match(/^[A-G][#b#♭♯]*/);
  if (!rootMatch) return false;
  const root = rootMatch[0];
  const remainder = baseChord.slice(root.length).toLowerCase();
  return (
    (remainder.includes('m') && !remainder.includes('maj')) ||
    remainder.includes('min') ||
    remainder.includes('dim') ||
    remainder.includes('ø') ||
    remainder.includes('°')
  );
};

// Formats Roman numeral casing to match the chord quality
const formatRomanNumeralCase = (roman: string, chord: string): string => {
  if (!roman) return '';
  const match = roman.match(/^([IVXivx]+)(.*)$/);
  if (!match) return roman;

  const [, base, suffix] = match;
  const isMinorOrDim = getIsMinorOrDim(chord);

  const adjustedBase = isMinorOrDim ? base.toLowerCase() : base.toUpperCase();
  return adjustedBase + suffix;
};

interface AnalysisSummaryProps {
  analysisResults: {
    chords: ChordDetectionResult[];
    beats: BeatInfo[];
    downbeats?: number[];
    synchronizedChords: { chord: string; beatIndex: number; beatNum?: number }[];
    beatModel?: string;
    chordModel?: string;
    beatDetectionResult?: {
      time_signature?: number;
      bpm?: number;
    };
  };
  audioDuration?: number;
  videoTitle?: string;
  usageCount?: number;
  romanNumerals?: RomanNumeralData | null;
  sequenceCorrections?: SequenceCorrectionsData;
}

const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  analysisResults,
  audioDuration = 0,
  videoTitle,
  usageCount = 0,
  romanNumerals,
  sequenceCorrections,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [songMetadata, setSongMetadata] = useState<SongMetadata | null>(null);
  const showCorrectedChords = useShowCorrectedChords();
  const keySignature = useKeySignature();

  const [playingProgressionIndex, setPlayingProgressionIndex] = useState<number | null>(null);
  const [playingChordIndex, setPlayingChordIndex] = useState<number | null>(null);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  /* ---------- Auto-shrink on Scroll detection ---------- */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          usePlaybackStore.getState().setIsVideoMinimized(true);
        } else {
          usePlaybackStore.getState().setIsVideoMinimized(false);
        }
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.05,
      }
    );

    observer.observe(element);
    return () => {
      observer.unobserve(element);
    };
  }, []);

  /* ---------- fetch MusicBrainz metadata when videoTitle is set ---------- */
  useEffect(() => {
    if (!videoTitle) return;
    const controller = new AbortController();
    fetchSongMetadata(videoTitle, controller.signal).then((data) => {
      if (!controller.signal.aborted) setSongMetadata(data);
    });
    return () => controller.abort();
  }, [videoTitle]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const mostCommonChord = useMemo(() => {
    if (!analysisResults.synchronizedChords?.forEach) return 'N/A';
    try {
      const counts: Record<string, number> = {};
      analysisResults.synchronizedChords.forEach(item => {
        if (item?.chord) {
          counts[item.chord] = (counts[item.chord] || 0) + 1;
        }
      });
      let best = '';
      let max = 0;
      for (const chord in counts) {
        if (counts[chord] > max) { best = chord; max = counts[chord]; }
      }
      return best || 'N/A';
    } catch {
      return 'N/A';
    }
  }, [analysisResults.synchronizedChords]);

  const bpm = analysisResults.beatDetectionResult?.bpm ||
    (analysisResults.beats?.length > 1 && analysisResults.beats[0] && analysisResults.beats[1]
      ? Math.round(60 / (analysisResults.beats[1].time - analysisResults.beats[0].time))
      : null);

  const timeSig = analysisResults.beatDetectionResult?.time_signature
    ? (analysisResults.beatDetectionResult.time_signature === 6
        ? '6/8'
        : `${analysisResults.beatDetectionResult.time_signature}/4`)
    : '4/4';

  const stats = [
    { label: 'Chords', value: analysisResults.chords?.length ?? 0, color: 'primary' as const },
    { label: 'Beats', value: analysisResults.beats?.length ?? 0, color: 'success' as const },
    { label: 'BPM', value: bpm ?? 'N/A', color: 'secondary' as const },
    { label: 'Time', value: timeSig, color: 'primary' as const },
    { label: 'Uses', value: usageCount, color: 'warning' as const },
    { label: 'Common', value: mostCommonChord, color: 'warning' as const },
  ];

  const detailRows = [
    { label: 'Beat Model', value: analysisResults.beatModel || 'Unknown' },
    { label: 'Chord Model', value: analysisResults.chordModel || 'Unknown' },
    { label: 'Usage Count', value: String(usageCount) },
    { label: 'Time Signature', value: timeSig },
    { label: 'Duration', value: formatTime(audioDuration) },
    ...(analysisResults.downbeats?.length
      ? [{ label: 'Downbeats', value: String(analysisResults.downbeats.length) }]
      : []),
  ];

  /** Capitalise each word: "folk pop" → "Folk Pop" */
  const capitalise = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());

  const metadataRows = useMemo(() => {
    if (!songMetadata) return [];
    const rows: { label: string; value: string }[] = [];
    if (songMetadata.albumName) rows.push({ label: 'Album', value: songMetadata.albumName });
    if (songMetadata.releaseDate) rows.push({ label: 'Released', value: songMetadata.releaseDate });
    if (songMetadata.label) rows.push({ label: 'Label', value: songMetadata.label });
    if (songMetadata.genres?.length)
      rows.push({ label: 'Genres', value: songMetadata.genres.map(capitalise).join(', ') });
    return rows;
  }, [songMetadata]);

  /* ---------- Chord Progression Summarization Algorithm ---------- */
  
  // Helper to normalize chords: simplifies extensions and retains basic slash chords
  const normalizeChord = useCallback((chord: string): string => {
    if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N') return 'N.C.';
    const parts = chord.split('/');
    const baseChord = parts[0].trim();
    const bass = parts[1] ? parts[1].trim() : '';
    const rootMatch = baseChord.match(/^[A-G][#b]?/);
    if (!rootMatch) return chord;
    const root = rootMatch[0];
    const remainder = baseChord.slice(root.length).toLowerCase();
    
    const isMinor = remainder.includes('m') && !remainder.includes('maj');
    const suffix = isMinor ? 'm' : '';
    
    // Strip numeric slash degrees like /4, /7, /b7, /#4
    const hasNumericBass = bass && /^[#b]?\d+$/.test(bass);
    const bassSuffix = (bass && !hasNumericBass) ? '/' + bass : '';
    
    return root + suffix + bassSuffix;
  }, []);

  // Helper to adjust flat/sharp spelling
  const adjustSpelling = useCallback((chord: string, preferSharps: boolean): string => {
    if (!chord || chord === 'N.C.') return chord;
    const parts = chord.split('/');
    const base = parts[0];
    const bass = parts[1];
    
    const formatNote = (note: string) => {
      const rootMatch = note.match(/^([A-G])([#b]?)(.*)$/);
      if (!rootMatch) return note;
      const letter = rootMatch[1];
      const accidental = rootMatch[2];
      const extra = rootMatch[3];
      if (!accidental) return note;
      
      const fullNote = letter + accidental;
      const corrected = getEnharmonicEquivalent(fullNote, preferSharps);
      return corrected + extra;
    };
    
    const newBase = formatNote(base);
    const newBass = bass ? formatNote(bass) : '';
    return newBase + (newBass ? '/' + newBass : '');
  }, []);

  // Levenshtein distance calculation
  const getSequenceDistance = useCallback((a: string[], b: string[]): number => {
    const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // deletion
            dp[i][j - 1] + 1,    // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }
    return dp[a.length][b.length];
  }, []);

  // Helper to check cyclic rotation
  const isCyclicRotation = useCallback((a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const doubleA = [...a, ...a].join(',');
    const strB = b.join(',');
    return doubleA.includes(strB);
  }, []);

  // Phrase/Measure alignment score
  const getPhraseAlignmentScore = useCallback((startBeat: number, firstChordBeatIndex: number, timeSignature: number): number => {
    const phraseBeats = timeSignature * 4; // 16 beats for 4 measures
    const relativeBeat = Math.abs(startBeat - firstChordBeatIndex);
    const rem = relativeBeat % phraseBeats;
    if (rem === 0) return 2.0; 
    if (rem === 1 || rem === phraseBeats - 1) return 1.5;
    if (rem % (timeSignature * 2) === 0) return 1.0;
    if (rem % timeSignature === 0) return 0.5;
    return 0.1;
  }, []);

  const chordProgressions = useMemo(() => {
    const syncChords = analysisResults.synchronizedChords;
    if (!syncChords || syncChords.length === 0) return [];

    const rawTimeSig = analysisResults.beatDetectionResult?.time_signature || 4;
    const timeSigValue = typeof rawTimeSig === 'number' ? rawTimeSig : 4;

    const shiftedChords = syncChords.map(c => c.chord);

    // Determine spelling preference using keySignature if available
    const keyPref = getAccidentalPreferenceFromKey(keySignature);
    const accidentalPref = keyPref || computeAccidentalPreference(shiftedChords);
    let preferSharps = accidentalPref === 'sharp';
    if (accidentalPref === null) {
      const normalizedCommon = normalizeChord(mostCommonChord);
      const flatRoots = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
      const hasFlatRoot = flatRoots.some(root => normalizedCommon.startsWith(root));
      preferSharps = !hasFlatRoot;
    }

    // Build overall map from normalized chord names to Roman numerals
    const chordToRomanMap = new Map<string, string>();
    const referenceSequence = sequenceCorrections?.correctedSequence || 
                              analysisResults.chords?.map(c => c.chord) || [];
                              
    if (romanNumerals?.analysis && referenceSequence.length > 0) {
      const counts = new Map<string, Map<string, number>>();
      referenceSequence.forEach((chord, idx) => {
        const norm = normalizeChord(chord);
        const roman = romanNumerals.analysis[idx];
        if (norm && roman) {
          const key = (showCorrectedChords && sequenceCorrections) ? norm : adjustSpelling(norm, preferSharps);
          if (!counts.has(key)) {
            counts.set(key, new Map<string, number>());
          }
          const romanCounts = counts.get(key)!;
          romanCounts.set(roman, (romanCounts.get(roman) || 0) + 1);
        }
      });
      
      counts.forEach((romanCounts, key) => {
        let bestRoman = '';
        let maxCount = 0;
        romanCounts.forEach((count, roman) => {
          if (count > maxCount) {
            maxCount = count;
            bestRoman = roman;
          }
        });
        chordToRomanMap.set(key, bestRoman);
      });
    }

    // 1. Project into spelling-corrected normalized chord stream beat-by-beat
    const chordGroupOccurrenceMap = buildChordOccurrenceMap(shiftedChords);
    const chordOccurrenceCorrectionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections || null);
    const chordSequenceIndexMap = buildChordSequenceIndexMap(
      shiftedChords,
      sequenceCorrections?.originalSequence
    );

    const beatChords = syncChords.map((sc, beatIndex) => {
      const originalChord = sc.chord;
      const { chord: displayChord, wasCorrected } = getDisplayChord(
        originalChord,
        beatIndex,
        showCorrectedChords,
        sequenceCorrections || null,
        chordGroupOccurrenceMap,
        chordOccurrenceCorrectionMap,
        chordSequenceIndexMap
      );
      const norm = normalizeChord(displayChord);
      return wasCorrected ? norm : adjustSpelling(norm, preferSharps);
    });

    // 2. Compress consecutive identical chords
    interface ChordSegment {
      chord: string;
      startBeat: number;
      duration: number;
    }
    const segments: ChordSegment[] = [];
    beatChords.forEach((chord, beatIndex) => {
      if (segments.length > 0 && segments[segments.length - 1].chord === chord) {
        segments[segments.length - 1].duration++;
      } else {
        segments.push({ chord, startBeat: beatIndex, duration: 1 });
      }
    });

    const firstChordBeatIndex = syncChords.findIndex(c => c.chord !== 'N.C.' && c.chord !== 'N/C' && c.chord !== 'N');
    const filteredSegments = segments.filter(seg => seg.chord !== 'N.C.');

    // 3. Mine windows of length 4
    const windowSize = 4;
    const candidates: { chords: string[]; startBeat: number }[] = [];
    for (let i = 0; i <= filteredSegments.length - windowSize; i++) {
      const slice = filteredSegments.slice(i, i + windowSize);
      candidates.push({
        chords: slice.map(s => s.chord),
        startBeat: slice[0].startBeat
      });
    }

    // 4. Group by cyclic rotation
    interface ProgressionGroup {
      representative: string[];
      allCandidates: { chords: string[]; startBeat: number }[];
      totalCount: number;
    }
    const groups: ProgressionGroup[] = [];
    candidates.forEach(cand => {
      let foundGroup = false;
      for (const group of groups) {
        if (isCyclicRotation(group.representative, cand.chords)) {
          group.allCandidates.push(cand);
          group.totalCount++;
          foundGroup = true;
          break;
        }
      }
      if (!foundGroup) {
        groups.push({
          representative: cand.chords,
          allCandidates: [cand],
          totalCount: 1
        });
      }
    });

    // 5. Determine canonical representative (starting chord) based on phrase alignment
    groups.forEach(group => {
      const rotationScores = new Map<string, number>();
      group.allCandidates.forEach(cand => {
        const key = cand.chords.join(',');
        const score = getPhraseAlignmentScore(cand.startBeat, firstChordBeatIndex === -1 ? 0 : firstChordBeatIndex, timeSigValue);
        rotationScores.set(key, (rotationScores.get(key) || 0) + score);
      });

      let bestRotationStr = '';
      let maxScore = -1;
      rotationScores.forEach((score, key) => {
        if (score > maxScore) {
          maxScore = score;
          bestRotationStr = key;
        }
      });

      if (bestRotationStr) {
        group.representative = bestRotationStr.split(',');
      }
    });

    // 6. Consolidate similar groups using Levenshtein distance
    const consolidated: ProgressionGroup[] = [];
    groups.sort((a, b) => b.totalCount - a.totalCount);

    for (const g of groups) {
      let merged = false;
      for (const c of consolidated) {
        const dist = getSequenceDistance(g.representative, c.representative);
        const threshold = 1;

        if (dist <= threshold) {
          c.totalCount += g.totalCount;
          merged = true;
          break;
        }
      }
      if (!merged) {
        consolidated.push(g);
      }
    }

    // 7. Calculate final ranking with subset deprioritization
    interface ProgressionPattern {
      chords: string[];
      romanNumerals: string[];
      count: number;
    }
    const selected: ProgressionPattern[] = [];
    const selectedChordSets: Set<string>[] = [];

    while (selected.length < 3 && consolidated.length > 0) {
      let bestIdx = -1;
      let maxScore = -1;

      for (let i = 0; i < consolidated.length; i++) {
        const cand = consolidated[i];
        const uniqueChords = new Set(cand.representative);
        
        let isSubset = false;
        if (selectedChordSets.length > 0) {
          const unionSelected = new Set<string>();
          selectedChordSets.forEach(set => {
            set.forEach(ch => unionSelected.add(ch));
          });
          isSubset = true;
          for (const ch of uniqueChords) {
            if (!unionSelected.has(ch)) {
              isSubset = false;
              break;
            }
          }
        }

        const score = cand.totalCount * (isSubset ? 0.2 : 1.0);
        if (score > maxScore) {
          maxScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        const chosen = consolidated.splice(bestIdx, 1)[0];
        
        // Map to roman numerals
        const romans = chosen.representative.map(ch => {
          const rawRoman = chordToRomanMap.get(ch) || '';
          return formatRomanNumeralCase(rawRoman, ch);
        });
        
        selected.push({
          chords: chosen.representative,
          romanNumerals: romans,
          count: chosen.totalCount
        });
        selectedChordSets.push(new Set(chosen.representative));
      } else {
        break;
      }
    }

    return selected;
  }, [
    analysisResults,
    romanNumerals,
    sequenceCorrections,
    showCorrectedChords,
    normalizeChord,
    adjustSpelling,
    getSequenceDistance,
    isCyclicRotation,
    getPhraseAlignmentScore,
    mostCommonChord,
    keySignature
  ]);

  /* ---------- Audio Playback Logic ---------- */

  const stopProgression = useCallback(() => {
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    try {
      getLightweightChordPlaybackService().stopAll();
    } catch {}
    setPlayingProgressionIndex(null);
    setPlayingChordIndex(null);
  }, []);

  const playProgression = async (chords: string[], progressionIdx: number) => {
    stopProgression();

    setPlayingProgressionIndex(progressionIdx);
    setPlayingChordIndex(0);

    try {
      const playbackService = getLightweightChordPlaybackService();
      playbackService.updateOptions({ enabled: true, pianoVolume: 80, guitarVolume: 0 });

      let currentIdx = 0;

      const playNext = () => {
        if (currentIdx >= chords.length) {
          setPlayingProgressionIndex(null);
          setPlayingChordIndex(null);
          return;
        }

        setPlayingChordIndex(currentIdx);
        const chord = chords[currentIdx];
        
        void playbackService.playChord(chord, 1.5);

        currentIdx++;
        playbackTimeoutRef.current = setTimeout(playNext, 1500);
      };

      playNext();
    } catch (error) {
      console.error('Failed to play progression:', error);
      stopProgression();
    }
  };

  const handlePlayToggle = (chords: string[], index: number) => {
    if (playingProgressionIndex === index) {
      stopProgression();
    } else {
      void playProgression(chords, index);
    }
  };

  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
      try {
        getLightweightChordPlaybackService().stopAll();
      } catch {}
    };
  }, []);

  return (
    <div ref={containerRef}>
      <Card
        shadow="sm"
        radius="lg"
        className="mt-3 border border-gray-200 dark:border-gray-700"
      >
      <CardBody className="px-4 py-3 gap-3">
        {/* Header row */}
        <button
          type="button"
          className="flex items-center justify-between w-full group"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="text-sm font-semibold tracking-wide uppercase text-gray-600 dark:text-gray-300">
            Analysis Summary
          </h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Stat chips */}
        <div className="flex flex-wrap gap-2">
          {stats.map(({ label, value, color }) => (
            <Chip
              key={label}
              variant="flat"
              color={color}
              size="sm"
              classNames={{
                base: 'px-2.5 h-7',
                content: 'font-semibold text-xs tracking-wide',
              }}
            >
              {label}: {value}
            </Chip>
          ))}
        </div>

        {/* Expanded detail section */}
        {isExpanded && (
          <>
            <Divider className="my-0.5" />

            {/* Song metadata from MusicBrainz (only non-empty fields) */}
            {metadataRows.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  {metadataRows.map(({ label, value }) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-xs font-medium text-emerald-500 dark:text-emerald-400 uppercase tracking-[0.12em]">
                        {label}
                      </span>
                      <span className="text-gray-800 dark:text-gray-200 font-medium truncate">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <Divider className="my-0.5" />
              </>
            )}

            {/* Analysis detail rows */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {detailRows.map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em]">
                    {label}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200 font-medium truncate">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Chord Progressions Section - Replacing BeatTimeline children */}
        {chordProgressions.length > 0 && (
          <>
            <Divider className="my-0.5" />
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em]">
                Key Chord Progressions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                {chordProgressions.map((prog, idx) => {
                  const hasRoman = prog.romanNumerals && prog.romanNumerals.some(r => !!r);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 transition-all duration-300 gap-3 border-b border-gray-100 dark:border-white/5"
                    >
                      {/* Chord sequence view */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 py-0.5">
                        {prog.chords.map((chord, cIdx) => {
                          const isChordPlaying = playingProgressionIndex === idx && playingChordIndex === cIdx;
                          return (
                            <React.Fragment key={cIdx}>
                              <div className="flex flex-col items-center">
                                <div
                                  className={`px-2.5 py-1 rounded-md font-bold text-xs tracking-wide transition-all duration-200 border shadow-sm ${
                                    isChordPlaying
                                      ? 'bg-blue-600 text-white border-blue-600 scale-105 shadow-blue-500/20'
                                      : 'bg-white dark:bg-slate-950 text-foreground border-gray-200 dark:border-white/10'
                                  }`}
                                >
                                  {chord}
                                </div>
                                {hasRoman && prog.romanNumerals[cIdx] && (
                                  <span className="text-[9px] text-gray-500 dark:text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                                    {prog.romanNumerals[cIdx]}
                                  </span>
                                )}
                              </div>
                              {cIdx < prog.chords.length - 1 && (
                                <div className={hasRoman && prog.romanNumerals[cIdx] ? 'pb-4' : ''}>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2.5}
                                    stroke="currentColor"
                                    className="w-3 h-3 text-gray-400 dark:text-slate-400"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                  </svg>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Play button & Frequency count */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          Used {prog.count} {prog.count === 1 ? 'time' : 'times'}
                        </span>
                        <Button
                          size="sm"
                          variant="flat"
                          color={playingProgressionIndex === idx ? 'danger' : 'primary'}
                          radius="full"
                          isIconOnly
                          onPress={() => handlePlayToggle(prog.chords, idx)}
                          className="h-8 w-8 min-w-8"
                        >
                          {playingProgressionIndex === idx ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5">
                              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                            </svg>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  </div>
  );
};

export default AnalysisSummary;
