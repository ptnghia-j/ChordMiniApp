'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMusicalNote, HiMusicalNote, HiSpeakerWave, HiVideoCamera, HiXMark } from 'react-icons/hi2';
import { MdPiano, MdRefresh } from 'react-icons/md';
import { GiGuitarBassHead, GiViolin } from 'react-icons/gi';
import { Tooltip, Slider, Divider } from '@heroui/react';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/audioMixerService';
import { getPitchShiftService } from '@/services/pitchShiftServiceInstance';
import { useUI } from '@/contexts/UIContext';

interface ChordPlaybackToggleProps {
  isEnabled: boolean;
  onClick: () => void;
  pianoVolume: number;
  guitarVolume: number;
  violinVolume: number;
  onPianoVolumeChange: (volume: number) => void;
  onGuitarVolumeChange: (volume: number) => void;
  onViolinVolumeChange: (volume: number) => void;
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

/**
 * Toggle button for chord playback with toggle-based control panel
 * Plays chord progressions synchronized with the beat animation
 * Includes individual volume controls for piano and guitar instruments
 */
const ChordPlaybackToggle: React.FC<ChordPlaybackToggleProps> = ({
  isEnabled,
  onClick,
  pianoVolume: _pianoVolume, // eslint-disable-line @typescript-eslint/no-unused-vars
  guitarVolume: _guitarVolume, // eslint-disable-line @typescript-eslint/no-unused-vars
  violinVolume: _violinVolume, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPianoVolumeChange,
  onGuitarVolumeChange,
  onViolinVolumeChange,
  className = '',
  youtubePlayer
}) => {
  const [showControls, setShowControls] = useState(false);
  const [isControlPanelVisible, setIsControlPanelVisible] = useState(true);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [audioSettings, setAudioSettings] = useState<AudioMixerSettings | null>(null);

  // Get pitch shift state to determine audio source label
  const { isPitchShiftEnabled } = useUI();

  // Draggable state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);
  const audioMixer = useRef<ReturnType<typeof getAudioMixerService> | null>(null);

  // CRITICAL FIX: Sync showControls with isEnabled state
  // The button click handler can't reliably predict the new isEnabled value
  // because onClick() triggers async state updates through the parent
  // Instead, watch isEnabled and update showControls accordingly
  useEffect(() => {
    if (isEnabled) {
      // Chord playback is enabled, show the control panel
      setShowControls(true);
      setIsControlPanelVisible(true);
    } else {
      // Chord playback is disabled, hide the control panel
      setShowControls(false);
      setIsControlPanelVisible(true);
    }
  }, [isEnabled]);

  // Handle button click - just toggle chord playback
  // The effect above will handle showing/hiding the panel
  const handleButtonClick = () => {
    onClick(); // Toggle chord playback (state update happens in parent)
  };

  // Handle clicking outside the control panel to close it
  const handleClickOutside = (event: MouseEvent) => {
    if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
      setShowControls(false);
    }
  };

  // Add/remove click outside listener
  useEffect(() => {
    if (showControls) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showControls]);

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
        setAudioSettings({
          masterVolume: 80,
          youtubeVolume: 100,
          chordPlaybackVolume: 60,
          pianoVolume: 50,
          guitarVolume: 30,
          violinVolume: 60,
          metronomeVolume: 70
        });
        return;
      }
    }

    const mixer = audioMixer.current;
    if (!mixer) {
      console.error('🎵 Audio mixer is null after initialization');
      // Fallback: set default audio settings so the panel can still appear
      setAudioSettings({
        masterVolume: 80,
        youtubeVolume: 100,
        chordPlaybackVolume: 60,
        pianoVolume: 50,
        guitarVolume: 30,
        violinVolume: 60,
        metronomeVolume: 70
      });
      return;
    }

    // Set YouTube player in mixer
    if (youtubePlayer) {
      mixer.setYouTubePlayer(youtubePlayer);
    }

    // Register soundfont chord playback service with audio mixer for volume control integration
    try {
      const { getSoundfontChordPlaybackService } = await import('@/services/soundfontChordPlaybackService');
      const chordPlaybackService = getSoundfontChordPlaybackService();
      mixer.setChordPlaybackService(chordPlaybackService);
      console.log('🎵 Soundfont chord playback service registered');
    } catch (error) {
      console.error('🎵 Failed to register soundfont chord playback service:', error);
      // Fallback to lightweight service
      try {
        const { getLightweightChordPlaybackService } = await import('@/services/lightweightChordPlaybackService');
        const fallbackService = getLightweightChordPlaybackService();
        mixer.setChordPlaybackService(fallbackService);
        console.log('🎵 Fallback to lightweight chord playback service');
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
      setAudioSettings({
        masterVolume: 80,
        youtubeVolume: 100,
        chordPlaybackVolume: 60,
        pianoVolume: 50,
        guitarVolume: 30,
        violinVolume: 60,
        metronomeVolume: 70
      });
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

  // Effect to hide control panel when chord playback is disabled
  useEffect(() => {
    if (!isEnabled) {
      setShowControls(false);
    }
  }, [isEnabled, showControls, isControlPanelVisible]);

  // Fallback effect to ensure audioSettings is initialized when chord playback is enabled
  // This ensures the control panel can appear even if the main audio mixer effect fails
  useEffect(() => {
    if (isEnabled && showControls && !audioSettings) {
      // Set default settings as fallback so the panel can appear
      setAudioSettings({
        masterVolume: 80,
        youtubeVolume: 100,
        chordPlaybackVolume: 60,
        pianoVolume: 50,
        guitarVolume: 30,
        violinVolume: 60,
        metronomeVolume: 70
      });
    }
  }, [isEnabled, showControls, audioSettings]);

  // Draggable functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dragRef.current) return;

    const rect = dragRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });

    // Prevent text selection during drag
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newPosition = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    };

    // Keep panel within viewport bounds
    const maxX = window.innerWidth - 400; // Approximate panel width
    const maxY = window.innerHeight - 300; // Approximate panel height

    setPosition({
      x: Math.max(0, Math.min(newPosition.x, maxX)),
      y: Math.max(0, Math.min(newPosition.y, maxY))
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Close button handler
  const handleClosePanel = () => {
    setIsControlPanelVisible(false);
  };



  return (
    <div className="relative group">
      {/* Main toggle button */}
      <div>
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
            {/* Icon */}
            {isEnabled ? (
              <HiMusicalNote className="h-4 w-4" />
            ) : (
              <HiOutlineMusicalNote className="h-4 w-4" />
            )}
          </motion.button>
        </Tooltip>

        {/* Beta tag */}
        <div className="absolute -top-1 -right-1 bg-green-500/70 dark:bg-green-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
          BETA
        </div>
      </div>



      {/* Portal-based control panel - renders outside all parent containers */}
      {(() => {
        const shouldShowPanel = showControls && isEnabled && isControlPanelVisible && typeof window !== 'undefined';

        if (!shouldShowPanel) return null;

        return createPortal(
          <AnimatePresence>
            <motion.div
              key="audio-mixer-panel"
              ref={(el) => { dragRef.current = el as HTMLDivElement | null; controlsRef.current = el as HTMLDivElement | null; }}
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`fixed bg-white/60 dark:bg-content-bg/60 text-gray-900 dark:text-gray-100 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 w-[360px] max-h-[80vh] ${isDragging ? 'cursor-grabbing' : ''}`}
              style={{
                left: position.x || '50%',
                top: position.y || '50%',
                transform: position.x && position.y ? 'none' : 'translate(-50%, -50%)',
                zIndex: 2147483647,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(16px)',
                pointerEvents: 'auto',
              }}
            >
            {/* Draggable panel header with close button */}
            <div
              className={`flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onMouseDown={handleMouseDown}
            >
              <div className="flex items-center gap-2 select-none">
                <HiMusicalNote className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audio Mixer</h3>
              </div>
              <button
                onClick={handleClosePanel}
                onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking close button
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close audio mixer"
              >
                <HiXMark className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Scrollable content area */}
            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4 space-y-4"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgb(156 163 175) transparent'
              }}
            >

              {audioSettings ? (
                <>
                  {/* Master Volume Controls */}
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Master Controls
                    </div>

                    {/* Master Volume */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <HiSpeakerWave className="h-4 w-4" />
                          Master
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.masterVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.masterVolume}
                        onChange={(value) => audioMixer.current?.setMasterVolume(Array.isArray(value) ? value[0] : value)}
                        className="w-full"
                        aria-label="Master volume control"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: "bg-green-500 dark:bg-green-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>

                    {/* YouTube / Pitch-Shifted Audio Volume */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <HiVideoCamera className="h-4 w-4" />
                          {isPitchShiftEnabled ? 'Pitch-Shifted Audio' : 'YouTube Video'}
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.youtubeVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.youtubeVolume}
                        onChange={(value) => {
                          const vol = Array.isArray(value) ? value[0] : value;
                          if (isPitchShiftEnabled) {
                            // Control pitch-shifted audio volume
                            const pitchShiftService = getPitchShiftService();
                            if (pitchShiftService) {
                              pitchShiftService.setVolume(vol);
                              console.log(`🔊 Pitch-shifted audio volume set to ${vol}%`);
                              // Update the audioSettings state to sync the slider UI
                              setAudioSettings(prev => prev ? { ...prev, youtubeVolume: vol } : null);
                            }
                          } else {
                            // Control YouTube volume
                            audioMixer.current?.setYouTubeVolume(vol);
                          }
                        }}
                        className="w-full"
                        aria-label={isPitchShiftEnabled ? "Pitch-shifted audio volume control" : "YouTube video volume control"}
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: isPitchShiftEnabled ? "bg-green-500 dark:bg-green-400" : "bg-red-500 dark:bg-red-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>

                    {/* Chord Playback Master Volume */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <HiMusicalNote className="h-4 w-4" />
                          Chord Playback
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.chordPlaybackVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.chordPlaybackVolume}
                        onChange={(value) => audioMixer.current?.setChordPlaybackVolume(Array.isArray(value) ? value[0] : value)}
                        className="w-full"
                        aria-label="Chord playback master volume control"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: "bg-green-500 dark:bg-green-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>
                  </div>

                  <Divider className="my-4 border-gray-200 dark:border-gray-600" />

                  {/* Individual Instrument Controls */}
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Instruments
                    </div>

                    {/* Piano volume control */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <MdPiano className="h-4 w-4" />
                          Piano
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.pianoVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.pianoVolume}
                        onChange={(value) => {
                          const vol = Array.isArray(value) ? value[0] : value;
                          audioMixer.current?.setPianoVolume(vol);
                          onPianoVolumeChange(vol);
                        }}
                        className="w-full"
                        aria-label="Piano volume control"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: "bg-green-500 dark:bg-green-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>

                    {/* Guitar volume control */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <GiGuitarBassHead className="h-4 w-4" />
                          Guitar
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.guitarVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.guitarVolume}
                        onChange={(value) => {
                          const vol = Array.isArray(value) ? value[0] : value;
                          audioMixer.current?.setGuitarVolume(vol);
                          onGuitarVolumeChange(vol);
                        }}
                        className="w-full"
                        aria-label="Guitar volume control"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: "bg-green-500 dark:bg-green-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>

                    {/* Violin volume control */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                          <GiViolin className="h-4 w-4" />
                          Violin
                        </label>
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                          {Math.round(audioSettings.violinVolume)}%
                        </span>
                      </div>
                      <Slider
                        size="sm"
                        step={1}
                        minValue={0}
                        maxValue={100}
                        value={audioSettings.violinVolume}
                        onChange={(value) => {
                          const vol = Array.isArray(value) ? value[0] : value;
                          audioMixer.current?.setViolinVolume(vol);
                          onViolinVolumeChange(vol);
                        }}
                        className="w-full"
                        aria-label="Violin volume control"
                        classNames={{
                          base: "max-w-full",
                          track: "bg-gray-200 dark:bg-gray-600 h-1.5",
                          filler: "bg-green-500 dark:bg-green-400",
                          thumb: "bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0"
                        }}
                      />
                    </div>
                  </div>

                  <Divider className="my-4 border-gray-200 dark:border-gray-600" />

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Test chord playback with lightweight service
                        import('@/services/lightweightChordPlaybackService').then(({ getLightweightChordPlaybackService }) => {
                          const service = getLightweightChordPlaybackService();
                          service.testPlayback();
                        });
                      }}
                      className="flex-1 px-3 py-2 text-sm font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-all duration-200 flex items-center justify-center gap-2"
                      aria-label="Test chord playback audio"
                    >
                      <HiMusicalNote className="h-4 w-4" />
                      Test Audio
                    </button>
                    <button
                      onClick={() => audioMixer.current?.resetToDefaults()}
                      className="flex-1 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 flex items-center justify-center gap-2"
                      aria-label="Reset all volume controls to default values"
                    >
                      <MdRefresh className="h-4 w-4" />
                      Reset
                    </button>
                  </div>

                  {/* Status indicator */}
                  <div className="text-xs text-center text-gray-500 dark:text-gray-300 pt-2 border-t border-gray-200 dark:border-gray-600">
                    {isEnabled ? (
                      <span className="text-green-600 dark:text-green-400 font-medium flex items-center justify-center gap-1">
                        <HiMusicalNote className="h-3 w-3" />
                        Chord playback active
                      </span>
                    ) : (
                      <span>
                        Click button to enable chord playback
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  Loading audio settings...
                </div>
              )}
            </div>
          </motion.div>
          </AnimatePresence>,
          document.body
        );
      })()}
    </div>
  );
};

export default ChordPlaybackToggle;