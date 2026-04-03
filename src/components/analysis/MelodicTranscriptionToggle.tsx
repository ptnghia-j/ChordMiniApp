'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, Slider, Tooltip } from '@heroui/react';
import { motion } from 'framer-motion';
import { HiArrowPath, HiSpeakerWave, HiXMark } from 'react-icons/hi2';
import UtilityPopoverPanel from '@/components/analysis/UtilityPopoverPanel';
import { getAppSliderClassNames } from '@/components/ui/appSliderStyles';
import { DEFAULT_AUDIO_MIXER_SETTINGS } from '@/config/audioDefaults';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/chord-playback/audioMixerService';

interface MelodicTranscriptionToggleProps {
  isEnabled: boolean;
  hasTranscription: boolean;
  isLoading?: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  errorMessage?: string | null;
  canAdjustVolume?: boolean;
  className?: string;
}

const MIXER_LABEL_CLASS = 'flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200';
const MIXER_VALUE_CLASS = 'min-w-[2.75rem] rounded-md bg-gray-100 px-1.5 py-0.5 text-right text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300';
const MIXER_SLIDER_BASE_CLASS = 'max-w-full gap-0.5';

const TrebleClefIcon = ({ active }: { active: boolean }) => (
  <span
    aria-hidden="true"
    className={`flex h-5 w-5 items-center justify-center text-[1.55rem] leading-none ${active ? 'opacity-100' : 'opacity-80'}`}
  >
    𝄞
  </span>
);

const MelodicTranscriptionToggle: React.FC<MelodicTranscriptionToggleProps> = ({
  isEnabled,
  hasTranscription,
  isLoading = false,
  onClick,
  disabled = false,
  disabledReason,
  errorMessage,
  canAdjustVolume = false,
  className = '',
}) => {
  const successSliderClassNames = getAppSliderClassNames('success');
  const audioMixer = useRef<ReturnType<typeof getAudioMixerService> | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioMixerSettings>(() => {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_AUDIO_MIXER_SETTINGS };
    }

    return getAudioMixerService().getSettings();
  });
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mixer = getAudioMixerService();
    audioMixer.current = mixer;

    const unsubscribe = mixer.addListener((settings) => {
      setAudioSettings({ ...settings });
    });

    return unsubscribe;
  }, []);

  const tooltipLabel = isLoading
    ? 'Computing melodic transcription...'
    : hasTranscription
      ? (isEnabled ? 'Disable melody playback' : 'Enable melody playback')
      : errorMessage
        ? 'Retry melodic transcription'
        : disabled && disabledReason
          ? disabledReason
          : 'Compute melodic transcription';

  return (
    <Popover
      placement="top"
      offset={10}
      isOpen={isPopoverOpen && isEnabled && hasTranscription && canAdjustVolume}
      onOpenChange={setIsPopoverOpen}
      classNames={{
        content: 'p-0 border-none bg-transparent shadow-none',
      }}
    >
      <PopoverTrigger>
        <div className={['relative', className].filter(Boolean).join(' ')}>
          <Tooltip
            content={tooltipLabel}
            placement="top"
            delay={500}
            closeDelay={100}
            classNames={{
              base: 'max-w-xs',
              content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
            }}
          >
            <motion.button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isEnabled || disabled || isLoading) {
                  setIsPopoverOpen(false);
                } else {
                  setIsPopoverOpen(true);
                }
                onClick();
              }}
              disabled={disabled || isLoading}
              className={`h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 ${
                isEnabled
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
              } ${(disabled || isLoading) ? 'cursor-not-allowed opacity-60' : ''}`}
              whileHover={(!disabled && !isLoading) ? { scale: 1.02 } : undefined}
              whileTap={(!disabled && !isLoading) ? { scale: 0.98 } : undefined}
              aria-label="Toggle melodic transcription playback"
              aria-pressed={isEnabled}
            >
              {isLoading ? (
                <HiArrowPath className="h-4 w-4 animate-spin" />
              ) : (
                <TrebleClefIcon active={isEnabled} />
              )}
            </motion.button>
          </Tooltip>

          <div className="absolute -top-1 -right-1 bg-cyan-500/70 dark:bg-cyan-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold pointer-events-none">
            BETA
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent>
        <UtilityPopoverPanel
          title="Melody Playback"
          headerStartContent={<HiSpeakerWave className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />}
          headerEndContent={
            <Button
              isIconOnly
              radius="sm"
              size="sm"
              variant="light"
              onPress={() => setIsPopoverOpen(false)}
              aria-label="Close melody playback controls"
              className="text-gray-500 dark:text-gray-400"
            >
              <HiXMark className="h-5 w-5" />
            </Button>
          }
          bodyClassName="overflow-y-auto w-[280px] space-y-3 p-3"
        >
          <div className="space-y-1">
            <div className="mb-1 flex items-center justify-between gap-2.5">
              <label className={MIXER_LABEL_CLASS}>
                <TrebleClefIcon active />
                Melody (Violin)
              </label>
              <span className={MIXER_VALUE_CLASS}>
                {Math.round(audioSettings.melodyVolume)}%
              </span>
            </div>
            <div>
              <Slider
                color="success"
                size="sm"
                step={1}
                minValue={0}
                maxValue={100}
                value={audioSettings.melodyVolume}
                onChange={(value) => {
                  const nextValue = Array.isArray(value) ? value[0] : value;
                  setAudioSettings((currentSettings) => ({
                    ...currentSettings,
                    melodyVolume: nextValue,
                  }));
                  audioMixer.current?.setMelodyVolume(nextValue);
                }}
                className="w-full"
                aria-label="Melody playback volume control"
                classNames={{
                  base: MIXER_SLIDER_BASE_CLASS,
                  ...successSliderClassNames,
                }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Melody volume is available while the transcription is playing inside Piano Visualizer.
          </p>
        </UtilityPopoverPanel>
      </PopoverContent>
    </Popover>
  );
};

export default memo(MelodicTranscriptionToggle);
