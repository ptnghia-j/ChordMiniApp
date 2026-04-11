"use client";

import React, { memo, useCallback, useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Tooltip } from '@heroui/react';
import { motion } from 'framer-motion';
import { HiOutlineChatBubbleLeftRight, HiChevronDoubleDown, HiOutlineChevronDoubleDown } from 'react-icons/hi2';
import { FaRegFileLines } from 'react-icons/fa6';
import { PiMetronomeBold, PiMetronome } from 'react-icons/pi';
import SegmentationToggleButton from '@/components/analysis/SegmentationToggleButton';
import RomanNumeralToggle from '@/components/analysis/RomanNumeralToggle';
import MelodicTranscriptionToggle from '@/components/analysis/MelodicTranscriptionToggle';
import ChordPlaybackToggle from '@/components/chord-playback/ChordPlaybackToggle';
import ChordSimplificationToggle from '@/components/analysis/ChordSimplificationToggle';
import PitchShiftPopover from '@/components/chord-playback/PitchShiftPopover';
import LoopPlaybackToggle from '@/components/analysis/LoopPlaybackToggle';
import { useShowRomanNumerals, useToggleRomanNumerals, useSimplifyChords, useToggleSimplifyChords } from '@/stores/uiStore';
import { metronomeService } from '@/services/chord-playback/metronomeService';

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
  melodicTranscriptionPlayback?: {
    isEnabled: boolean;
    hasTranscription: boolean;
    isLoading?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    errorMessage?: string | null;
    canAdjustVolume?: boolean;
    togglePlayback: () => void;
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
  segmentation: {
    isVisible: boolean;
    hasData: boolean;
    isLoading: boolean;
    disabled?: boolean;
    disabledReason?: string;
    errorMessage?: string | null;
    onToggle: () => void;
  };

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

interface UtilityBarMetronomeControlProps {
  onToggleWithSync?: () => Promise<boolean>;
}

const UtilityBarMetronomeControl: React.FC<UtilityBarMetronomeControlProps> = ({
  onToggleWithSync,
}) => {
  const utilityCircleButtonClass = 'h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0';
  const [isEnabled, setIsEnabled] = useState(false);
  const [trackMode, setTrackMode] = useState<'metronome' | 'drum'>('metronome');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const frameId = requestAnimationFrame(() => {
      setIsEnabled(metronomeService.isMetronomeEnabled());
      setTrackMode(metronomeService.getTrackMode());
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleToggle = useCallback(async () => {
    const newEnabled = onToggleWithSync
      ? await onToggleWithSync()
      : !isEnabled;

    if (!onToggleWithSync) {
      await metronomeService.setEnabled(newEnabled, 0);
    }

    setIsEnabled(newEnabled);
    setIsPopoverOpen(newEnabled);

    if (newEnabled) {
      setTimeout(() => {
        void metronomeService.testClick(false);
      }, 100);
    }
  }, [isEnabled, onToggleWithSync]);

  const handleTrackModeChange = useCallback(async (newMode: 'metronome' | 'drum') => {
    setTrackMode(newMode);
    await metronomeService.setTrackMode(newMode);

    if (isEnabled) {
      void metronomeService.testClick(false);
    }

    setIsPopoverOpen(false);
  }, [isEnabled]);

  return (
    <Popover
      placement="top"
      offset={10}
      isOpen={isPopoverOpen}
      onOpenChange={setIsPopoverOpen}
      classNames={{
        content: 'p-0 border-none bg-transparent shadow-none',
      }}
    >
      <PopoverTrigger>
        <div className="relative inline-block">
          <Tooltip
            content={isEnabled ? 'Metronome options' : 'Enable metronome'}
            placement="top"
            delay={500}
            closeDelay={100}
            classNames={{
              content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
            }}
          >
            <motion.button
              onClick={handleToggle}
              className={`${utilityCircleButtonClass} ${
                isEnabled
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              aria-label={isEnabled ? 'Metronome options' : 'Enable metronome'}
              aria-pressed={isEnabled}
            >
              {isEnabled ? (
                <PiMetronomeBold className="h-4 w-4" />
              ) : (
                <PiMetronome className="h-4 w-4" />
              )}
            </motion.button>
          </Tooltip>
        </div>
      </PopoverTrigger>

      <PopoverContent>
        <div className="bg-white/70 dark:bg-content-bg/70 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg min-w-[240px] backdrop-blur-sm">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">
            Rhythm Track
          </div>
          <div className="mt-3 flex gap-2">
            {(['metronome', 'drum'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => void handleTrackModeChange(mode)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  trackMode === mode
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {mode === 'metronome' ? 'Metronome' : 'Drum Track'}
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
            {trackMode === 'drum'
              ? 'Kick, snare, and hi-hat groove'
              : 'Classic click track with selectable sound styles'}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const UtilityBar: React.FC<UtilityBarProps> = ({
  isFollowModeEnabled,
  chordPlayback,
  melodicTranscriptionPlayback,
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
  segmentation,
  metronome,
  totalBeats = 0,
  maxWidth = '1200px',
  className = '',
  isUploadPage = false
}) => {
  const utilityCircleButtonClass = 'h-9 w-9 min-w-9 rounded-full inline-flex items-center justify-center p-0 transition-colors';
  // Roman numerals from Zustand store
  const showRomanNumerals = useShowRomanNumerals();
  const toggleRomanNumerals = useToggleRomanNumerals();
  // Simplify from Zustand store
  const simplifyChords = useSimplifyChords();
  const toggleSimplifyChords = useToggleSimplifyChords();

  return (
    <div className={`w-full ${className}`}>
      <div
        className="mx-auto rounded-full border border-white/35 bg-default-200 px-3 py-1 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.7)] backdrop-blur-md sm:px-4 sm:py-1.5 dark:border-white/20 dark:bg-gray-800/60"
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
                className={`${utilityCircleButtonClass} ${isFollowModeEnabled ? 'bg-blue-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                aria-label="Toggle auto-scroll"
              >
                {isFollowModeEnabled ? <HiChevronDoubleDown className="h-4 w-4"/> : <HiOutlineChevronDoubleDown className="h-4 w-4"/>}
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

            {melodicTranscriptionPlayback && (
              <MelodicTranscriptionToggle
                isEnabled={melodicTranscriptionPlayback.isEnabled}
                hasTranscription={melodicTranscriptionPlayback.hasTranscription}
                isLoading={melodicTranscriptionPlayback.isLoading}
                disabled={melodicTranscriptionPlayback.disabled}
                disabledReason={melodicTranscriptionPlayback.disabledReason}
                errorMessage={melodicTranscriptionPlayback.errorMessage}
                canAdjustVolume={melodicTranscriptionPlayback.canAdjustVolume}
                onClick={melodicTranscriptionPlayback.togglePlayback}
              />
            )}

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
              <UtilityBarMetronomeControl onToggleWithSync={metronome.toggleMetronomeWithSync} />
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
                className={`${utilityCircleButtonClass} ${isCountdownEnabled ? 'bg-green-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                aria-label="Toggle countdown"
              >
                {/* Simple timer glyph */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

          <div className="flex items-center gap-2 sm:gap-3">
            <SegmentationToggleButton
              isEnabled={segmentation.isVisible}
              onClick={segmentation.onToggle}
              hasSegmentationData={segmentation.hasData}
              isLoading={segmentation.isLoading}
              disabled={segmentation.disabled}
              disabledReason={segmentation.disabledReason}
              errorMessage={segmentation.errorMessage}
            />

            {!isUploadPage && (
              <>
                <Tooltip
                  content={isLyricsPanelOpen ? 'Hide lyrics' : 'Show lyrics'}
                  placement="top"
                  classNames={{
                    content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
                  }}
                >
                  <button
                    onClick={toggleLyricsPanel}
                    className={`${utilityCircleButtonClass} ${isLyricsPanelOpen ? 'bg-emerald-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                    aria-label="Toggle lyrics panel"
                  >
                    <FaRegFileLines className="h-4 w-4"/>
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
                    className={`${utilityCircleButtonClass} ${isChatbotOpen ? 'bg-purple-600 text-white' : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100'}`}
                    aria-label="Toggle AI chat"
                  >
                    <HiOutlineChatBubbleLeftRight className="h-4 w-4"/>
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(UtilityBar);
