'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, Chip, Divider } from '@heroui/react';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import { BeatInfo } from '@/services/audio/beatDetectionService';
import {
  SongMetadata,
  fetchSongMetadata,
} from '@/services/musicbrainz/musicbrainzService';

interface AnalysisSummaryProps {
  analysisResults: {
    chords: ChordDetectionResult[];
    beats: BeatInfo[];
    downbeats?: number[];
    synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[];
    beatModel?: string;
    chordModel?: string;
    beatDetectionResult?: {
      time_signature?: number;
      bpm?: number;
    };
  };
  audioDuration?: number;
  videoTitle?: string;
  children?: React.ReactNode;
}

const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  analysisResults,
  audioDuration = 0,
  videoTitle,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [songMetadata, setSongMetadata] = useState<SongMetadata | null>(null);

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
    { label: 'Common', value: mostCommonChord, color: 'warning' as const },
  ];

  const detailRows = [
    { label: 'Beat Model', value: analysisResults.beatModel || 'Unknown' },
    { label: 'Chord Model', value: analysisResults.chordModel || 'Unknown' },
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

  return (
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
                      <span className="text-[11px] font-medium text-emerald-500 dark:text-emerald-400 uppercase tracking-wider">
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
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
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

        {/* Embedded content (e.g. BeatTimeline) */}
        {children && (
          <>
            <Divider className="my-0.5" />
            {children}
          </>
        )}
      </CardBody>
    </Card>
  );
};

export default AnalysisSummary;
