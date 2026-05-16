'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody, Button, Chip, Select, SelectItem, Skeleton } from '@heroui/react';
import { useIsVisible } from '@/hooks/scroll/useIntersectionObserver';
import { useRecentVideosQuery } from '@/hooks/query/useRecentVideosQuery';
import { buildAnalyzePageUrl } from '@/utils/analyzeRouteUtils';
import {
  ALL_KEYS_VALUE,
  RECENT_VIDEOS_PAGE_SIZE,
} from '@/services/query/recentVideos';

const KEY_OPTIONS = [
  { value: ALL_KEYS_VALUE, label: 'All Keys' },
  { value: 'C major', label: 'C Major' },
  { value: 'C minor', label: 'C Minor' },
  { value: 'C# major', label: 'C# / D♭ Major' },
  { value: 'C# minor', label: 'D♭ / C# Minor' },
  { value: 'D major', label: 'D Major' },
  { value: 'D minor', label: 'D Minor' },
  { value: 'E♭ major', label: 'D# / E♭ Major' },
  { value: 'E♭ minor', label: 'E♭ Minor' },
  { value: 'E major', label: 'E Major' },
  { value: 'E minor', label: 'E Minor' },
  { value: 'F major', label: 'F Major' },
  { value: 'F minor', label: 'F Minor' },
  { value: 'F# major', label: 'F# / G♭ Major' },
  { value: 'F# minor', label: 'G♭ / F# Minor' },
  { value: 'G major', label: 'G Major' },
  { value: 'G minor', label: 'G Minor' },
  { value: 'A♭ major', label: 'A♭ Major' },
  { value: 'A♭ minor', label: 'G# / A♭ Minor' },
  { value: 'A major', label: 'A Major' },
  { value: 'A minor', label: 'A Minor' },
  { value: 'B♭ major', label: 'B♭ Major' },
  { value: 'B♭ minor', label: 'A# / B♭ Minor' },
  { value: 'B major', label: 'B Major' },
  { value: 'B minor', label: 'B Minor' },
];

export default function RecentVideos() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedKey, setSelectedKey] = useState(ALL_KEYS_VALUE);

  // PERFORMANCE FIX #5: Lazy load using Intersection Observer
  const [containerRef, isVisible] = useIsVisible<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '100px', // Start loading 100px before component enters viewport
    freezeOnceVisible: true // Only load once
  });

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = useRecentVideosQuery({
    selectedKey,
    enabled: isVisible,
  });

  const videos = useMemo(
    () => data?.pages.flatMap((page) => page.videos) ?? [],
    [data]
  );

  const loading = !isVisible || (isPending && videos.length === 0);
  const errorMessage = error ? 'Failed to load transcribed videos' : null;

  const handleShowMore = () => setIsExpanded(true);
  const handleShowLess = () => setIsExpanded(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatBPM = (bpm?: number) => {
    if (!bpm) return '';
    return `${Math.round(bpm)} BPM`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeSignature = (timeSignature?: number) => {
    if (!timeSignature) return '';
    return `${timeSignature}/4`;
  };

  const formatUsageCount = (usageCount?: number) => {
    const normalizedUsageCount =
      typeof usageCount === 'number' && Number.isFinite(usageCount) && usageCount >= 0
        ? usageCount
        : 0;

    return `${normalizedUsageCount} use${normalizedUsageCount === 1 ? '' : 's'}`;
  };

  const selectedKeyLabel = KEY_OPTIONS.find((option) => option.value === selectedKey)?.label ?? selectedKey;

  const renderHeader = (status: React.ReactNode) => (
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recently Transcribed Songs</h3>
          {status}
        </div>
        <div className="flex items-center gap-2 md:min-w-[250px]">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Key
          </span>
          <Select
            aria-label="Filter recent analyses by key"
            selectedKeys={[selectedKey]}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const nextValue = Array.from(keys)[0];
              if (typeof nextValue === 'string') {
                if (nextValue !== selectedKey) {
                  setIsExpanded(false);
                }
                setSelectedKey(nextValue);
              }
            }}
            className="w-full"
            size="sm"
            variant="bordered"
            color="default"
            disallowEmptySelection
          >
            {KEY_OPTIONS.map((option) => (
              <SelectItem key={option.value} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
  );

  if (loading) {
    return (
      <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
        {renderHeader(<Chip size="sm" variant="flat" color="default">Loading...</Chip>)}
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(RECENT_VIDEOS_PAGE_SIZE)].map((_, index) => (
              <Card key={index} className="w-full bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10">
                <CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || videos.length === 0) {
    return (
      <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
        {renderHeader(
          <Chip size="sm" variant="flat" color={error ? "danger" : "default"}>
            {errorMessage ? "Error" : "Empty"}
          </Chip>
        )}
        <div className="h-48 flex items-center justify-center">
          <div className="text-center">
            <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              {errorMessage ? 'Failed to load transcribed videos' : 'No recent transcriptions found'}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {errorMessage
                ? 'Please retry or check your connection.'
                : selectedKey === ALL_KEYS_VALUE
                  ? 'New analyses will appear here as they are created.'
                  : `No recent analyses matched ${selectedKeyLabel}.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
      {renderHeader(
        <Chip size="sm" variant="flat" color="default" className="text-foreground dark:text-white">
          {isFetching && !isFetchingNextPage ? 'Updating...' : `${videos.length} song${videos.length !== 1 ? 's' : ''}`}
        </Chip>
      )}

      {/* Song cards grid - no outer container box */}
      <div className={`${isExpanded ? 'max-h-[672px]' : 'max-h-96'} overflow-y-auto scrollbar-thin transition-all duration-300 ease-in-out`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <Card
              key={video.videoId}
              as={Link}
              href={buildAnalyzePageUrl(video.videoId, {
                title: video.title && video.title !== `Video ${video.videoId}` ? video.title : null,
                channel: video.channelTitle || null,
                thumbnail: video.thumbnailUrl || null,
                beatModel: (video.beatModel as 'madmom' | 'beat-transformer' | null) || null,
                chordModel: (video.chordModel as 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl' | null) || null,
              })}
              isPressable
              className="group hover:scale-[1.02] transition-all duration-200 bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-lg"
            >
              <CardBody className="p-3">
                <div className="flex gap-3">
                  <div className="relative w-20 h-12 bg-gray-100 dark:bg-gray-600 rounded-md overflow-hidden flex-shrink-0 shadow-sm transition-all duration-300 border border-gray-200 dark:border-gray-500">
                    {/* Intentionally use direct YouTube thumbnails to avoid Vercel image-optimization quota usage. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnailUrl || '/hero-image-placeholder.svg'}
                      alt={video.title || 'Video thumbnail'}
                      width={80}
                      height={48}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.src = '/hero-image-placeholder.svg'; }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200"></div>
                    {video.duration && <div className="absolute bottom-0.5 right-0.5 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">{formatDuration(video.duration)}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">{video.title}</h4>
                    {video.channelTitle && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-1 truncate">
                        {video.channelTitle}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      <div className="flex items-center justify-between"><span>{formatDate(video.processedAt)}</span>{video.bpm && (<span className="text-blue-600 dark:text-blue-400 font-medium">{formatBPM(video.bpm)}</span>)}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{formatUsageCount(video.usageCount)}</span>
                        {video.timeSignature && (<span className="text-green-600 dark:text-green-400">{formatTimeSignature(video.timeSignature)}</span>)}
                        {video.keySignature && (<span className="text-purple-600 dark:text-purple-400 font-medium truncate">{video.keySignature}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* "Load More" button and loading indicator */}
        <div className="flex justify-center mt-6">
          {hasNextPage && !isFetchingNextPage && (
            <Button onPress={() => void fetchNextPage()} color="primary" variant="flat">Load More</Button>
          )}
          {isFetchingNextPage && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
              {[...Array(2)].map((_, index) => (
                <Card key={`loading-${index}`} className="w-full bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10"><CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody></Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Show More / Show Less Button */}
      <div className="mt-4">
        <Button onPress={isExpanded ? handleShowLess : handleShowMore} color="default" variant="bordered" size="md" className="w-full">
          {isExpanded ? "Show Less" : "Show More"}
        </Button>
      </div>
    </div>
  );
}
