"use client";

import React, { memo } from 'react';
import { Tooltip } from '@heroui/react';
import { HiOutlineChatBubbleLeftRight, HiChevronDoubleDown, HiOutlineChevronDoubleDown } from 'react-icons/hi2';
import { FaRegFileLines } from 'react-icons/fa6';
import { PiMetronomeBold, PiMetronome } from 'react-icons/pi';
import RomanNumeralToggle from '@/components/analysis/RomanNumeralToggle';
import ChordPlaybackToggle from '@/components/chord-playback/ChordPlaybackToggle';
import ChordSimplificationToggle from '@/components/analysis/ChordSimplificationToggle';
import PitchShiftPopover from '@/components/chord-playback/PitchShiftPopover';
import LoopPlaybackToggle from '@/components/analysis/LoopPlaybackToggle';
import { useShowRomanNumerals, useToggleRomanNumerals, useSimplifyChords, useToggleSimplifyChords } from '@/stores/uiStore';

interface UtilityBarProps {
  // States
  isFollowModeEnabled: boolean;
  chordPlayback: {
    isEnabled: boolean;
    togglePlayback: () => void;
    pianoVolume: number;
    guitarVolume: number;
    violinVolume: number;
    fluteVolume: number;
    setPianoVolume: (v: number) => void;
    setGuitarVolume: (v: number) => void;
    setViolinVolume: (v: number) => void;
    setFluteVolume: (v: number) => void;
  };
  youtubePlayer?: Parameters<typeof ChordPlaybackToggle>[0]['youtubePlayer'];

  // Playback rate for pitch shift
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  // Handlers
  toggleFollowMode: () => void;

  // Countdown
  isCountdownEnabled: boolean;
  isCountingDown: boolean;
  countdownDisplay?: string;
  toggleCountdown: () => void;

  // Panels
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  toggleChatbot: () => void;
  toggleLyricsPanel: () => void;

  // Metronome
  metronome?: {
    isEnabled: boolean;
    toggleMetronomeWithSync: () => Promise<boolean>;
  };

  // Loop playback
  totalBeats?: number;

  // Layout
  maxWidth?: string | number;
  className?: string;

  // Page context
  isUploadPage?: boolean;
}

const UtilityBar: React.FC<UtilityBarProps> = ({
  isFollowModeEnabled,
  chordPlayback,
  youtubePlayer,
  playbackRate,
  setPlaybackRate,
  toggleFollowMode,
  isCountdownEnabled,
  isCountingDown,
  countdownDisplay,
  toggleCountdown,
  isChatbotOpen,
  isLyricsPanelOpen,
  toggleChatbot,
  toggleLyricsPanel,
  metronome,
  totalBeats = 0,
  maxWidth = '1200px',
  className = '',
  isUploadPage = false
}) => {
  // Roman numerals from Zustand store
  const showRomanNumerals = useShowRomanNumerals();
  const toggleRomanNumerals = useToggleRomanNumerals();
  // Simplify from Zustand store
  const simplifyChords = useSimplifyChords();
  const toggleSimplifyChords = useToggleSimplifyChords();

  return (
    <div className={`w-full ${className}`}>
      <div
        className="mx-auto rounded-2xl bg-slate-100/70 dark:bg-slate-800/70  backdrop-blur-md border border-gray-300 dark:border-gray-700 shadow-sm px-3 sm:px-4 py-1.5 sm:py-2.5"
        style={{ maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left group */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Auto-scroll */}
            <Tooltip
              content={isFollowModeEnabled ? 'Disable auto-scroll' : 'Enable auto-scroll'}
              placement="top"
              classNames={{
                content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
              }}
            >
              <button
                onClick={toggleFollowMode}
                className={`p-2 rounded-full transition-colors ${isFollowModeEnabled ? 'bg-blue-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                aria-label="Toggle auto-scroll"
              >
                {isFollowModeEnabled ? <HiChevronDoubleDown className="h-5 w-5"/> : <HiOutlineChevronDoubleDown className="h-5 w-5"/>}
              </button>
            </Tooltip>

            {/* Roman numerals */}
            <RomanNumeralToggle
              isEnabled={showRomanNumerals}
              onClick={toggleRomanNumerals}
            />

            {/* Chord playback with mixer */}
            <ChordPlaybackToggle
              isEnabled={chordPlayback.isEnabled}
              onClick={chordPlayback.togglePlayback}
              pianoVolume={chordPlayback.pianoVolume}
              guitarVolume={chordPlayback.guitarVolume}
              violinVolume={chordPlayback.violinVolume}
              fluteVolume={chordPlayback.fluteVolume}
              onPianoVolumeChange={chordPlayback.setPianoVolume}
              onGuitarVolumeChange={chordPlayback.setGuitarVolume}
              onViolinVolumeChange={chordPlayback.setViolinVolume}
              onFluteVolumeChange={chordPlayback.setFluteVolume}
              youtubePlayer={youtubePlayer || null}
            />

            {/* Simplify */}
            <ChordSimplificationToggle
              isEnabled={simplifyChords}
              onClick={toggleSimplifyChords}
            />

            {/* Pitch Shift */}
            <PitchShiftPopover
              playbackRate={playbackRate}
              setPlaybackRate={setPlaybackRate}
            />

            {/* Loop Playback */}
            <LoopPlaybackToggle
              totalBeats={totalBeats}
            />

            {/* Metronome */}
            {metronome && (
              <Tooltip
                content={metronome.isEnabled ? 'Disable metronome' : 'Enable metronome'}
                placement="top"
                classNames={{
                  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
                }}
              >
                <button
                  onClick={metronome.toggleMetronomeWithSync}
                  className={`p-2 rounded-full transition-colors ${metronome.isEnabled ? 'bg-orange-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                  aria-label="Toggle metronome"
                >
                  {metronome.isEnabled ? <PiMetronomeBold className="h-5 w-5"/> : <PiMetronome className="h-5 w-5"/>}
                </button>
              </Tooltip>
            )}

            {/* Countdown */}
            <Tooltip
              content={isCountdownEnabled ? 'Disable 1-measure countdown' : 'Enable 1-measure countdown'}
              placement="top"
              classNames={{
                content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
              }}
            >
              <button
                onClick={toggleCountdown}
                className={`p-2 rounded-full transition-colors ${isCountdownEnabled ? 'bg-green-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                aria-label="Toggle countdown"
              >
                {/* Simple timer glyph */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2h4"/>
                  <path d="M12 14V8"/>
                  <circle cx="12" cy="14" r="7"/>
                </svg>
              </button>
            </Tooltip>

            {/* Countdown readout when active */}
            {isCountingDown && (
              <div className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                {countdownDisplay || ''}
              </div>
            )}
          </div>

          {/* Right group: Lyrics + Chat (hidden on upload page) */}
          {!isUploadPage && (
            <div className="flex items-center gap-2 sm:gap-3">
              <Tooltip
                content={isLyricsPanelOpen ? 'Hide lyrics' : 'Show lyrics'}
                placement="top"
                classNames={{
                  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
                }}
              >
                <button
                  onClick={toggleLyricsPanel}
                  className={`p-2 rounded-full transition-colors ${isLyricsPanelOpen ? 'bg-emerald-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                  aria-label="Toggle lyrics panel"
                >
                  <FaRegFileLines className="h-5 w-5"/>
                </button>
              </Tooltip>

              <Tooltip
                content={isChatbotOpen ? 'Hide AI chat' : 'Show AI chat'}
                placement="top"
                classNames={{
                  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
                }}
              >
                <button
                  onClick={toggleChatbot}
                  className={`p-2 rounded-full transition-colors ${isChatbotOpen ? 'bg-purple-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                  aria-label="Toggle AI chat"
                >
                  <HiOutlineChatBubbleLeftRight className="h-5 w-5"/>
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(UtilityBar);

