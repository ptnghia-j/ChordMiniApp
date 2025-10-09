'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Slider, Button, Card, CardBody, CardHeader, Divider } from '@heroui/react';
import { MdPiano, MdPlayArrow, MdPause, MdRefresh } from 'react-icons/md';
import { GiGuitarBassHead, GiViolin } from 'react-icons/gi';
import { getSoundfontMixerService, type MixerSettings, type PerformanceMetrics } from './SoundfontMixerService';

/**
 * Soundfont Mixer POC Component
 * 
 * Demonstrates real instrument soundfont playback with:
 * - Piano, Guitar, and Violin
 * - Independent volume and octave controls
 * - Test chord progression: C - Am - F - G
 * - Performance metrics display
 */
export default function SoundfontMixerPOC() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChord, setCurrentChord] = useState<string>('');
  const [settings, setSettings] = useState<MixerSettings>({
    masterVolume: 80,
    piano: { volume: 70, octave: 4, enabled: true },
    guitar: { volume: 50, octave: 3, enabled: true },
    violin: { volume: 60, octave: 5, enabled: true }
  });
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadingTime: 0,
    lastPlaybackLatency: 0,
    instrumentsLoaded: []
  });

  const mixerService = useRef(getSoundfontMixerService());
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // Test chord progression
  const chordProgression = ['C', 'Am', 'F', 'G'];

  /**
   * Load instruments
   */
  const handleLoadInstruments = async () => {
    setIsLoading(true);
    try {
      await mixerService.current.initialize();
      setIsLoaded(true);
      setMetrics(mixerService.current.getMetrics());
    } catch (error) {
      console.error('Failed to load instruments:', error);
      alert('Failed to load instruments. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Play chord progression
   */
  const handlePlay = () => {
    if (!isLoaded) return;

    setIsPlaying(true);
    let chordIndex = 0;

    // Play first chord immediately
    playChord(0);

    // Set up interval to play next chords
    playbackInterval.current = setInterval(() => {
      chordIndex = (chordIndex + 1) % chordProgression.length;
      playChord(chordIndex);
    }, 2000); // Change chord every 2 seconds
  };

  /**
   * Pause playback
   */
  const handlePause = () => {
    setIsPlaying(false);
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }
    mixerService.current.stopAll();
    setCurrentChord('');
  };

  /**
   * Play a specific chord
   */
  const playChord = (index: number) => {
    const chord = chordProgression[index];
    setCurrentChord(chord);
    mixerService.current.playChord(chord, 2.0);
    setMetrics(mixerService.current.getMetrics());
  };

  /**
   * Update master volume
   */
  const handleMasterVolumeChange = (value: number | number[]) => {
    const volume = Array.isArray(value) ? value[0] : value;
    const newSettings = { ...settings, masterVolume: volume };
    setSettings(newSettings);
    mixerService.current.updateSettings(newSettings);
  };

  /**
   * Update instrument volume
   */
  const handleInstrumentVolumeChange = (
    instrument: 'piano' | 'guitar' | 'violin',
    value: number | number[]
  ) => {
    const volume = Array.isArray(value) ? value[0] : value;
    const newSettings = {
      ...settings,
      [instrument]: { ...settings[instrument], volume }
    };
    setSettings(newSettings);
    mixerService.current.updateInstrument(instrument, { volume });
  };

  /**
   * Update instrument octave
   */
  const handleInstrumentOctaveChange = (
    instrument: 'piano' | 'guitar' | 'violin',
    octave: number
  ) => {
    const newSettings = {
      ...settings,
      [instrument]: { ...settings[instrument], octave }
    };
    setSettings(newSettings);
    mixerService.current.updateInstrument(instrument, { octave });
  };

  /**
   * Toggle instrument enabled
   */
  const handleInstrumentToggle = (instrument: 'piano' | 'guitar' | 'violin') => {
    const newSettings = {
      ...settings,
      [instrument]: { ...settings[instrument], enabled: !settings[instrument].enabled }
    };
    setSettings(newSettings);
    mixerService.current.updateInstrument(instrument, { enabled: !settings[instrument].enabled });
  };

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    const service = mixerService.current;
    return () => {
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
      }
      service.dispose();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Soundfont Mixer POC
          </h1>
          <p className="text-gray-400">
            Real instrument soundfont playback with Piano, Guitar, and Violin
          </p>
        </div>

        {/* Main Controls */}
        <Card className="mb-6 bg-gray-800/50 border border-gray-700">
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Controls</h2>
            <div className="flex gap-2">
              {!isLoaded && (
                <Button
                  color="primary"
                  onClick={handleLoadInstruments}
                  isLoading={isLoading}
                  startContent={!isLoading && <MdRefresh />}
                >
                  {isLoading ? 'Loading...' : 'Load Instruments'}
                </Button>
              )}
              {isLoaded && !isPlaying && (
                <Button
                  color="success"
                  onClick={handlePlay}
                  startContent={<MdPlayArrow />}
                >
                  Play
                </Button>
              )}
              {isLoaded && isPlaying && (
                <Button
                  color="warning"
                  onClick={handlePause}
                  startContent={<MdPause />}
                >
                  Pause
                </Button>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {/* Chord Grid */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Chord Progression</h3>
              <div className="grid grid-cols-4 gap-4">
                {chordProgression.map((chord, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg text-center font-bold text-2xl transition-all ${
                      currentChord === chord && isPlaying
                        ? 'bg-green-600 text-white scale-105 shadow-lg'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {chord}
                  </div>
                ))}
              </div>
            </div>

            <Divider className="my-6 bg-gray-700" />

            {/* Master Volume */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">Master Volume</span>
                <span className="text-sm text-gray-400">{settings.masterVolume}%</span>
              </div>
              <Slider
                aria-label="Master Volume"
                value={settings.masterVolume}
                onChange={handleMasterVolumeChange}
                minValue={0}
                maxValue={100}
                step={1}
                className="max-w-full"
                color="primary"
                isDisabled={!isLoaded}
              />
            </div>
          </CardBody>
        </Card>

        {/* Instrument Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Piano */}
          <InstrumentControl
            name="Piano"
            icon={<MdPiano className="h-6 w-6" />}
            color="primary"
            volume={settings.piano.volume}
            octave={settings.piano.octave}
            enabled={settings.piano.enabled}
            isLoaded={isLoaded}
            onVolumeChange={(v) => handleInstrumentVolumeChange('piano', v)}
            onOctaveChange={(o) => handleInstrumentOctaveChange('piano', o)}
            onToggle={() => handleInstrumentToggle('piano')}
          />

          {/* Guitar */}
          <InstrumentControl
            name="Guitar"
            icon={<GiGuitarBassHead className="h-6 w-6" />}
            color="success"
            volume={settings.guitar.volume}
            octave={settings.guitar.octave}
            enabled={settings.guitar.enabled}
            isLoaded={isLoaded}
            onVolumeChange={(v) => handleInstrumentVolumeChange('guitar', v)}
            onOctaveChange={(o) => handleInstrumentOctaveChange('guitar', o)}
            onToggle={() => handleInstrumentToggle('guitar')}
          />

          {/* Violin */}
          <InstrumentControl
            name="Violin"
            icon={<GiViolin className="h-6 w-6" />}
            color="secondary"
            volume={settings.violin.volume}
            octave={settings.violin.octave}
            enabled={settings.violin.enabled}
            isLoaded={isLoaded}
            onVolumeChange={(v) => handleInstrumentVolumeChange('violin', v)}
            onOctaveChange={(o) => handleInstrumentOctaveChange('violin', o)}
            onToggle={() => handleInstrumentToggle('violin')}
          />
        </div>

        {/* Performance Metrics */}
        {isLoaded && (
          <Card className="bg-gray-800/50 border border-gray-700">
            <CardHeader>
              <h2 className="text-xl font-semibold text-white">Performance Metrics</h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-500">
                    {metrics.loadingTime.toFixed(0)}ms
                  </div>
                  <div className="text-sm text-gray-400">Loading Time</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-500">
                    {metrics.lastPlaybackLatency.toFixed(1)}ms
                  </div>
                  <div className="text-sm text-gray-400">Playback Latency</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-500">
                    {metrics.instrumentsLoaded.length}/3
                  </div>
                  <div className="text-sm text-gray-400">Instruments Loaded</div>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Instrument Control Component
 */
interface InstrumentControlProps {
  name: string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'secondary';
  volume: number;
  octave: number;
  enabled: boolean;
  isLoaded: boolean;
  onVolumeChange: (value: number | number[]) => void;
  onOctaveChange: (octave: number) => void;
  onToggle: () => void;
}

function InstrumentControl({
  name,
  icon,
  color,
  volume,
  octave,
  enabled,
  isLoaded,
  onVolumeChange,
  onOctaveChange,
  onToggle
}: InstrumentControlProps) {
  const colorClasses = {
    primary: 'bg-blue-600',
    success: 'bg-green-600',
    secondary: 'bg-purple-600'
  };

  const borderColor = enabled
    ? (color === 'primary' ? 'border-blue-500' : color === 'success' ? 'border-green-500' : 'border-purple-500')
    : 'border-gray-700';

  return (
    <Card className={`bg-gray-800/50 border ${borderColor}`}>
      <CardHeader className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
        </div>
        <Button
          size="sm"
          color={enabled ? color : 'default'}
          variant={enabled ? 'solid' : 'bordered'}
          onClick={onToggle}
          isDisabled={!isLoaded}
        >
          {enabled ? 'ON' : 'OFF'}
        </Button>
      </CardHeader>
      <CardBody>
        {/* Volume */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">Volume</span>
            <span className="text-sm text-gray-400">{volume}%</span>
          </div>
          <Slider
            aria-label={`${name} Volume`}
            value={volume}
            onChange={onVolumeChange}
            minValue={0}
            maxValue={100}
            step={1}
            className="max-w-full"
            color={color}
            isDisabled={!isLoaded || !enabled}
          />
        </div>

        {/* Octave */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">Octave</span>
            <span className="text-sm text-gray-400">{octave}</span>
          </div>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map(o => (
              <Button
                key={o}
                size="sm"
                color={octave === o ? color : 'default'}
                variant={octave === o ? 'solid' : 'bordered'}
                onClick={() => onOctaveChange(o)}
                isDisabled={!isLoaded || !enabled}
                className="flex-1"
              >
                {o}
              </Button>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

