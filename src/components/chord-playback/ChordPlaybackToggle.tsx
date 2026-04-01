'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineMusicalNote, HiMusicalNote, HiSpeakerWave, HiVideoCamera, HiXMark } from 'react-icons/hi2';
import { MdPiano, MdRefresh } from 'react-icons/md';
import { GiGuitar, GiViolin, GiFlute, GiGuitarBassHead, GiSaxophone } from 'react-icons/gi';
import { Popover, PopoverTrigger, PopoverContent, Tooltip, Slider, Divider, Button } from '@heroui/react';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import { DEFAULT_AUDIO_MIXER_SETTINGS } from '@/config/audioDefaults';
import { usePlaybackStore } from '@/stores/playbackStore';
import { getPitchShiftService } from '@/services/audio/pitchShiftServiceInstance';
import { useIsPitchShiftEnabled } from '@/stores/uiStore';
import UtilityPopoverPanel from '@/components/analysis/UtilityPopoverPanel';
import { getAppSliderClassNames } from '@/components/ui/appSliderStyles';

interface ChordPlaybackToggleProps {
  isEnabled: boolean;
  onClick: () => void;
  pianoVolume: number;
  guitarVolume: number;
  violinVolume: number;
  fluteVolume: number;
  onPianoVolumeChange: (volume: number) => void;
  onGuitarVolumeChange: (volume: number) => void;
  onViolinVolumeChange: (volume: number) => void;
  onFluteVolumeChange: (volume: number) => void;
  className?: string;
  // Optional YouTube player for volume control
  youtubePlayer?: {
    seekTo: (time: number, type?: 'seconds' | 'fraction') => void;
    playVideo: () => void;
    pauseVideo: () => void;
    setPlaybackRate: (rate: number) => void;
    getCurrentTime: () => number;
    muted: boolean;
    // Volume control methods (may not be available on all YouTube player implementations)
    setVolume?: (volume: number) => void;
    getVolume?: () => number;
    mute?: () => void;
    unMute?: () => void;
    isMuted?: () => boolean;
  } | null;
}

const MIXER_SECTION_HEADING_CLASS = "text-xs font-bold uppercase tracking-[0.14em] text-gray-600 dark:text-gray-300";
const MIXER_LABEL_CLASS = "flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200";
const MIXER_VALUE_CLASS = "min-w-[2.75rem] rounded-md bg-gray-100 px-1.5 py-0.5 text-right text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300";
const MIXER_SLIDER_BASE_CLASS = "max-w-full gap-0.5";

/**
 * Toggle button for chord playback with toggle-based control panel
 * Plays chord progressions synchronized with the beat animation
 * Includes individual volume controls for piano and guitar instruments
 */
const ChordPlaybackToggle: React.FC<ChordPlaybackToggleProps> = ({
  isEnabled,
  onClick,
  pianoVolume: _pianoVolume,  
  guitarVolume: _guitarVolume,  
  violinVolume: _violinVolume,  
  fluteVolume: _fluteVolume,  
  onPianoVolumeChange,
  onGuitarVolumeChange,
  onViolinVolumeChange,
  onFluteVolumeChange,
  className = '',
  youtubePlayer
}) => {
  const successSliderClassNames = getAppSliderClassNames('success');
  const dangerSliderClassNames = getAppSliderClassNames('danger');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioMixerSettings | null>(null);

  // Get pitch shift state to determine audio source label
  const isPitchShiftEnabled = useIsPitchShiftEnabled();

  const audioRef = usePlaybackStore((s) => s.audioRef);

  const audioMixer = useRef<ReturnType<typeof getAudioMixerService> | null>(null);

  // Track which slider is being actively dragged to prevent race conditions
  const [activeSlider, setActiveSlider] = useState<string | null>(null);

  useEffect(() => {
    if (isEnabled) {
      setIsPopoverOpen(true);
    } else {
      setIsPopoverOpen(false);
    }
  }, [isEnabled]);

  const handleButtonClick = () => {
    onClick();
  };

  // Initialize audio mixer, listen for settings changes, and get initial settings
  // The logic is consolidated into a single, reliable useEffect hook.
  useEffect(() => {
    const initializeAudioMixer = async () => {
      // Ensure we're on the client side
      if (typeof window === 'undefined') {
        return;
      }

    // Initialize audio mixer on client side only if not already initialized
    if (!audioMixer.current) {
      try {
        audioMixer.current = getAudioMixerService();
      } catch (error) {
        console.error('🎵 Failed to initialize audio mixer service:', error);
        // Fallback: set default audio settings so the panel can still appear
        setAudioSettings({ ...DEFAULT_AUDIO_MIXER_SETTINGS });
        return;
      }
    }

    const mixer = audioMixer.current;
    if (!mixer) {
      console.error('🎵 Audio mixer is null after initialization');
      // Fallback: set default audio settings so the panel can still appear
      setAudioSettings({ ...DEFAULT_AUDIO_MIXER_SETTINGS });
      return;
    }

    // Set YouTube player in mixer
    if (youtubePlayer) {
      mixer.setYouTubePlayer(youtubePlayer);
    }

    // Register soundfont chord playback service with audio mixer for volume control integration
    try {
      const { getSoundfontChordPlaybackService } = await import('@/services/chord-playback/soundfontChordPlaybackService');
      const chordPlaybackService = getSoundfontChordPlaybackService();
      mixer.setChordPlaybackService(chordPlaybackService);
    } catch (error) {
      console.error('🎵 Failed to register soundfont chord playback service:', error);
      // Fallback to lightweight service
      try {
        const { getLightweightChordPlaybackService } = await import('@/services/chord-playback/lightweightChordPlaybackService');
        const fallbackService = getLightweightChordPlaybackService();
        mixer.setChordPlaybackService(fallbackService);
      } catch (fallbackError) {
        console.error('🎵 Failed to register fallback chord playback service:', fallbackError);
      }
    }

    // Get initial settings and set them in state
    try {
      const initialSettings = mixer.getSettings();
      setAudioSettings(initialSettings);
    } catch (error) {
      console.error('🎵 Failed to get initial settings:', error);
      // Fallback: set default audio settings
      setAudioSettings({ ...DEFAULT_AUDIO_MIXER_SETTINGS });
    }

    // Listen for real-time settings changes
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = mixer.addListener((settings) => {
        setAudioSettings(settings);
      });
    } catch (error) {
      console.error('🎵 Failed to add audio mixer listener:', error);
    }

      // Cleanup subscription on unmount
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    };

    // Call the async initialization function
    const cleanup = initializeAudioMixer();

    // Return cleanup function that handles the promise
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then(cleanupFn => {
          if (typeof cleanupFn === 'function') {
            cleanupFn();
          }
        });
      }
    };
  }, [youtubePlayer]); // Re-run effect only when youtubePlayer prop changes

  // CRITICAL FIX: Sync pitch shift service volume to audio settings when pitch shift is enabled
  // This ensures the slider displays the correct default volume 30% for pitch-shifted audio
  // and preserves YouTube video volume (100%) separately
  useEffect(() => {
    if (isPitchShiftEnabled && audioSettings) {
      const pitchShiftService = getPitchShiftService();
      if (pitchShiftService) {
        const pitchShiftVolume = pitchShiftService.getVolume();
        // Only update if the volume is different to avoid infinite loops
        if (pitchShiftVolume !== audioSettings.pitchShiftedAudioVolume) {
          setAudioSettings(prev => prev ? { ...prev, pitchShiftedAudioVolume: pitchShiftVolume } : null);
        }
      }
    }
  }, [isPitchShiftEnabled, audioSettings]);

  return (
    <Popover
      placement="top"
      offset={10}
      isOpen={isPopoverOpen && isEnabled}
      onOpenChange={setIsPopoverOpen}
      classNames={{
        content: 'p-0 border-none bg-transparent shadow-none'
      }}
    >
      <PopoverTrigger>
        <div className="relative group">
          <Tooltip
            content={isEnabled ? "Disable chord playback" : "Enable chord playback"}
            placement="top"
            delay={500}
            closeDelay={100}
            classNames={{
              content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
            }}
          >
            <motion.button
              onClick={handleButtonClick}
              className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
                isEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
              } ${className}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              aria-label={isEnabled ? "Disable chord playback" : "Enable chord playback"}
              aria-pressed={isEnabled}
            >
              {isEnabled ? (
                <HiMusicalNote className="h-4 w-4" />
              ) : (
                <HiOutlineMusicalNote className="h-4 w-4" />
              )}
            </motion.button>
          </Tooltip>

          <div className="absolute -top-1 -right-1 bg-green-500/70 dark:bg-green-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
            BETA
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent>
        <UtilityPopoverPanel
          title="Audio Mixer"
          headerStartContent={<HiMusicalNote className="h-5 w-5 text-green-600 dark:text-green-400" />}
          headerEndContent={
            <Button
              isIconOnly
              radius="sm"
              size="sm"
              variant="light"
              onPress={() => setIsPopoverOpen(false)}
              aria-label="Close audio mixer"
              className="text-gray-500 dark:text-gray-400"
            >
              <HiXMark className="h-5 w-5" />
            </Button>
          }
          bodyClassName="overflow-y-auto max-h-[min(78vh,38rem)] w-[320px] space-y-3 p-3"
        >

              {audioSettings ? (
                <>
                  {/* Master Volume Controls */}
                  <div className="space-y-2.5">
                    <div className={MIXER_SECTION_HEADING_CLASS}>
                      Master Controls
                    </div>

                    {/* Master Volume */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <HiSpeakerWave className="h-3.5 w-3.5" />
                          Master
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.masterVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('master')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          // Only clear if this slider was active
                          if (activeSlider === 'master') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.masterVolume}
                          onChange={(value) => {
                            if (activeSlider === 'master' || activeSlider === null) {
                              audioMixer.current?.setMasterVolume(Array.isArray(value) ? value[0] : value);
                            }
                          }}
                          className="w-full"
                          aria-label="Master volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>

                    {/* YouTube / Pitch-Shifted Audio Volume */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <HiVideoCamera className="h-3.5 w-3.5" />
                          {isPitchShiftEnabled ? 'Pitch-Shifted Audio' : (youtubePlayer ? 'YouTube Video' : 'Original Audio')}
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(isPitchShiftEnabled ? audioSettings.pitchShiftedAudioVolume : audioSettings.youtubeVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('youtube')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'youtube') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color={isPitchShiftEnabled ? 'success' : 'danger'}
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={isPitchShiftEnabled ? audioSettings.pitchShiftedAudioVolume : audioSettings.youtubeVolume}
                          onChange={(value) => {
                            if (activeSlider === 'youtube' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              if (isPitchShiftEnabled) {
                                // Control pitch-shifted audio volume
                                const pitchShiftService = getPitchShiftService();
                                if (pitchShiftService) {
                                  pitchShiftService.setVolume(vol);
                                  console.log(`🔊 Pitch-shifted audio volume set to ${vol}%`);
                                  // Update the pitch-shifted audio volume in audio mixer
                                  audioMixer.current?.setPitchShiftedAudioVolume(vol);
                                  // Update the audioSettings state to sync the slider UI
                                  setAudioSettings(prev => prev ? { ...prev, pitchShiftedAudioVolume: vol } : null);
                                }
                              } else {
                                // Control original source: YouTube if available, otherwise HTML audio (upload page)
                                if (youtubePlayer) {
                                  audioMixer.current?.setYouTubeVolume(vol);
                                } else {
                                  // Upload page: set HTMLAudioElement volume (0-1)
                                  if (audioRef?.current) {
                                    const v = Math.max(0, Math.min(1, (typeof vol === 'number' ? vol : Number(vol)) / 100));
                                    try { audioRef.current.volume = v; } catch {}
                                  }
                                  // Persist UI value in mixer for consistency (safe even without YT player)
                                  audioMixer.current?.setYouTubeVolume(vol);
                                }
                              }
                            }
                          }}
                          className="w-full"
                          aria-label={isPitchShiftEnabled ? "Pitch-shifted audio volume control" : (youtubePlayer ? "YouTube video volume control" : "Original audio volume control")}
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...(isPitchShiftEnabled ? successSliderClassNames : dangerSliderClassNames),
                          }}
                        />
                      </div>
                    </div>

                    {/* Chord Playback Master Volume */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <HiMusicalNote className="h-3.5 w-3.5" />
                          Chord Playback
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.chordPlaybackVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('chordPlayback')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'chordPlayback') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.chordPlaybackVolume}
                          onChange={(value) => {
                            if (activeSlider === 'chordPlayback' || activeSlider === null) {
                              audioMixer.current?.setChordPlaybackVolume(Array.isArray(value) ? value[0] : value);
                            }
                          }}
                          className="w-full"
                          aria-label="Chord playback master volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <Divider className="my-2.5 border-gray-200 dark:border-gray-600" />

                  {/* Individual Instrument Controls */}
                  <div className="space-y-2.5">
                    <div className={MIXER_SECTION_HEADING_CLASS}>
                      Instruments
                    </div>

                    {/* Piano volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <MdPiano className="h-3.5 w-3.5" />
                          Piano
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.pianoVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('piano')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'piano') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.pianoVolume}
                          onChange={(value) => {
                            if (activeSlider === 'piano' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setPianoVolume(vol);
                              onPianoVolumeChange(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Piano volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>

                    {/* Guitar volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <GiGuitar className="h-3.5 w-3.5" />
                          Guitar
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.guitarVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('guitar')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'guitar') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.guitarVolume}
                          onChange={(value) => {
                            if (activeSlider === 'guitar' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setGuitarVolume(vol);
                              onGuitarVolumeChange(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Guitar volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>

                    {/* Violin volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <GiViolin className="h-3.5 w-3.5" />
                          Violin
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.violinVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('violin')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'violin') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.violinVolume}
                          onChange={(value) => {
                            if (activeSlider === 'violin' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setViolinVolume(vol);
                              onViolinVolumeChange(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Violin volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>

                    {/* Flute volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <GiFlute className="h-3.5 w-3.5" />
                          Flute
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.fluteVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('flute')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'flute') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.fluteVolume}
                          onChange={(value) => {
                            if (activeSlider === 'flute' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setFluteVolume(vol);
                              onFluteVolumeChange(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Flute volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>

                    {/* Saxophone volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label
                          className={MIXER_LABEL_CLASS}
                          title="Auto-on during instrumental sections. Outside them, raise the slider to hear saxophone manually."
                        >
                          <GiSaxophone className="h-3.5 w-3.5" />
                          Saxophone
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.saxophoneVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('saxophone')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'saxophone') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.saxophoneVolume}
                          onChange={(value) => {
                            if (activeSlider === 'saxophone' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setSaxophoneVolume(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Saxophone volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                        Auto-on in instrumental sections; manual everywhere else.
                      </p>
                    </div>

                    {/* Bass volume control */}
                    <div className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2.5">
                        <label className={MIXER_LABEL_CLASS}>
                          <GiGuitarBassHead className="h-3.5 w-3.5" />
                          Bass
                        </label>
                        <span className={MIXER_VALUE_CLASS}>
                          {Math.round(audioSettings.bassVolume)}%
                        </span>
                      </div>
                      <div
                        onMouseDown={() => setActiveSlider('bass')}
                        onMouseUp={() => setActiveSlider(null)}
                        onMouseLeave={() => {
                          if (activeSlider === 'bass') setActiveSlider(null);
                        }}
                      >
                        <Slider
                          color="success"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioSettings.bassVolume}
                          onChange={(value) => {
                            if (activeSlider === 'bass' || activeSlider === null) {
                              const vol = Array.isArray(value) ? value[0] : value;
                              audioMixer.current?.setBassVolume(vol);
                            }
                          }}
                          className="w-full"
                          aria-label="Bass volume control"
                          classNames={{
                            base: MIXER_SLIDER_BASE_CLASS,
                            ...successSliderClassNames,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <Divider className="my-2.5 border-gray-200 dark:border-gray-600" />

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="flat"
                      color="success"
                      onPress={() => {
                        // Test chord playback with lightweight service
                        import('@/services/chord-playback/lightweightChordPlaybackService').then(({ getLightweightChordPlaybackService }) => {
                          const service = getLightweightChordPlaybackService();
                          service.testPlayback();
                        });
                      }}
                      startContent={<HiMusicalNote className="h-4 w-4" />}
                      className="flex-1"
                      aria-label="Test chord playback audio"
                    >
                      Test Audio
                    </Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color="success"
                      onPress={() => audioMixer.current?.resetToDefaults()}
                      startContent={<MdRefresh className="h-4 w-4" />}
                      className="flex-1"
                      aria-label="Reset all volume controls to default values"
                    >
                      Reset
                    </Button>
                  </div>

                </>
              ) : (
                <div className="py-7 text-sm text-center text-gray-500 dark:text-gray-400">
                  Loading audio settings...
                </div>
              )}
        </UtilityPopoverPanel>
      </PopoverContent>
    </Popover>
  );
};

export default ChordPlaybackToggle;
