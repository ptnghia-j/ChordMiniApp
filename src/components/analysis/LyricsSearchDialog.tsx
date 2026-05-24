'use client';

import React from 'react';
import { Button } from '@heroui/react';
import { HiMagnifyingGlass } from 'react-icons/hi2';
import type { LyricsServiceResponse } from '@/services/lyrics/lyricsService';
import type { LRCLibCandidate } from '@/services/lyrics/lrclibService';

interface LyricsSearchDialogProps {
  isOpen: boolean;
  query: string;
  isLoading: boolean;
  error: string | null;
  result: LyricsServiceResponse | null;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSearch: () => void;
  onApplyCandidate: (candidate: LRCLibCandidate) => void;
}

function modeLabel(mode?: string): string {
  if (mode === 'word') return 'Word sync';
  if (mode === 'line') return 'Line sync';
  return 'Plain';
}

function modeClassName(mode?: string): string {
  if (mode === 'word') return 'bg-blue-600 text-white';
  if (mode === 'line') return 'bg-emerald-600 text-white';
  return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100';
}

export default function LyricsSearchDialog({
  isOpen,
  query,
  isLoading,
  error,
  result,
  onQueryChange,
  onClose,
  onSearch,
  onApplyCandidate,
}: LyricsSearchDialogProps) {
  if (!isOpen) return null;

  const candidates = (result?.candidates || []).slice(0, 4);

  return (
    <div className="w-[min(92vw,380px)] space-y-3 p-3" role="dialog" aria-label="Lyrics search">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSearch();
            } else if (event.key === 'Escape') {
              onClose();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/45 dark:border-white/10 dark:bg-white/[0.08] dark:text-white"
          placeholder="Artist - Song"
          aria-label="Lyrics search query"
        />
        <Button
          size="sm"
          color="primary"
          isIconOnly
          isLoading={isLoading}
          isDisabled={!query.trim() || isLoading}
          onPress={onSearch}
          aria-label="Search lyrics"
        >
          {!isLoading ? <HiMagnifyingGlass className="h-4 w-4" /> : null}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/12 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {!isLoading && candidates.length === 0 && !error && (
        <div className="rounded-lg bg-white/35 px-3 py-4 text-center text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
          Search results will appear here.
        </div>
      )}

      {candidates.length > 0 && (
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {candidates.map((candidate, index) => (
            <div
              key={`${candidate.id}-${index}`}
              className="rounded-lg bg-white/45 p-2.5 dark:bg-white/[0.055]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {candidate.trackName || 'Unknown title'}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {candidate.artistName || 'Unknown artist'}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${modeClassName(candidate.lyric_mode)}`}>
                  {modeLabel(candidate.lyric_mode)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                  {candidate.confidence} confidence
                  {candidate.durationDelta !== undefined ? ` · ${candidate.durationDelta.toFixed(1)}s delta` : ''}
                </div>
                <Button
                  size="sm"
                  color={candidate.lyric_mode === 'plain' ? 'default' : 'primary'}
                  variant={candidate.lyric_mode === 'plain' ? 'bordered' : 'solid'}
                  onPress={() => onApplyCandidate(candidate)}
                >
                  {candidate.lyric_mode === 'plain' ? 'Apply Plain' : 'Apply'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.success && result.lyric_mode === 'plain' && (
        <div className="rounded-lg bg-amber-500/12 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Plain lyrics will render in a separate scroll area beside the grid.
        </div>
      )}
    </div>
  );
}
