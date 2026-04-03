import React, { useState, useEffect, useCallback } from 'react';
import type { MetronomeService } from '@/services/chord-playback/metronomeService';
import { Popover, PopoverTrigger, PopoverContent, Tooltip } from '@heroui/react';
import { motion } from 'framer-motion';
import { PiMetronomeBold, PiMetronome } from 'react-icons/pi';

interface MetronomeControlsProps {
  className?: string;
  onToggleWithSync?: () => Promise<boolean>;
}

const MetronomeControls = React.memo<MetronomeControlsProps>(({
  className = '',
  onToggleWithSync,
}) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [trackMode, setTrackMode] = useState<'metronome' | 'drum'>('metronome');
  const [metronomeService, setMetronomeService] = useState<MetronomeService | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const buttonClassName = `h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 ${
    isEnabled
      ? 'bg-orange-600 text-white hover:bg-orange-700'
      : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
  } ${className}`;

  useEffect(() => {
    const initMetronome = async () => {
      if (typeof window === 'undefined') return;
      const { metronomeService: service } = await import('@/services/chord-playback/metronomeService');
      setMetronomeService(service);
      setIsEnabled(service.isMetronomeEnabled());
      setTrackMode(service.getTrackMode());
    };
    initMetronome();
  }, []);

  const handleToggle = useCallback(async () => {
    if (!metronomeService) {
      console.error('MetronomeControls: No metronome service available');
      return;
    }

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
        metronomeService.testClick(false);
      }, 100);
    }
  }, [isEnabled, metronomeService, onToggleWithSync]);

  const handleTrackModeChange = useCallback(async (newMode: 'metronome' | 'drum') => {
    if (!metronomeService) return;
    setTrackMode(newMode);
    await metronomeService.setTrackMode(newMode);
    if (isEnabled) {
      void metronomeService.testClick(false);
    }
    setIsPopoverOpen(false);
  }, [isEnabled, metronomeService]);

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
        <div className={`relative inline-block ${className}`}>
          <Tooltip
            content={isEnabled ? 'Metronome options' : 'Enable metronome'}
            placement="top"
            delay={500}
            closeDelay={100}
            classNames={{
              base: 'max-w-xs',
              content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
            }}
          >
            <motion.button
              onClick={handleToggle}
              className={buttonClassName}
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
});

MetronomeControls.displayName = 'MetronomeControls';

export default MetronomeControls;
