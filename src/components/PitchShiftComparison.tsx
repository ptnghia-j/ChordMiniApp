'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, Slider, Card, CardBody, CardHeader, Divider, Select, SelectItem, Textarea, Checkbox } from '@heroui/react';
import { HiPlay, HiPause, HiStop, HiArrowUpTray, HiCheckCircle, HiXMark } from 'react-icons/hi2';
import { PitchShiftService } from '@/services/pitchShiftService';
import { PhazePitchShiftService } from '@/services/phazePitchShiftService';

// Sample audio URLs for testing
// Using Internet Archive public domain audio files for testing
const SAMPLE_AUDIO = [
  {
    id: 'vocal',
    name: 'Vocal-heavy Track',
    description: 'Tests transient handling and formant preservation',
    // Public domain classical vocal piece from Internet Archive
    url: 'https://ia801409.us.archive.org/16/items/78_ave-maria_enrico-caruso-bach-gounod_gbia0000281b/Ave%20Maria%20-%20Enrico%20Caruso-restored.mp3'
  },
  {
    id: 'instrumental',
    name: 'Instrumental Track',
    description: 'Tests harmonic accuracy',
    // Public domain piano piece from Internet Archive
    url: 'https://ia800304.us.archive.org/9/items/DebussyClairDeLune/Debussy-ClairDeLune.mp3'
  },
  {
    id: 'percussive',
    name: 'Percussive Track',
    description: 'Tests transient preservation',
    // Public domain orchestral piece with percussion from Internet Archive
    url: 'https://ia800107.us.archive.org/27/items/VivaldiSpring1/Vivaldi-Spring1.mp3'
  }
];

// Quality checklist items
const QUALITY_CHECKLIST = [
  { id: 'crackling', label: 'Crackling/popping artifacts' },
  { id: 'buzzing', label: 'Buzzing/rattling sounds' },
  { id: 'pitch_accuracy', label: 'Pitch accuracy issues' },
  { id: 'transients', label: 'Poor transient preservation' },
  { id: 'clarity', label: 'Lack of clarity/naturalness' }
];

export default function PitchShiftComparison() {
  // Services
  const toneServiceRef = useRef<PitchShiftService | null>(null);
  const phazeServiceRef = useRef<PhazePitchShiftService | null>(null);

  // Audio selection
  const [selectedAudio, setSelectedAudio] = useState<string>('vocal');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isUploadLoading, setIsUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Tone.js state
  const [tonePitch, setTonePitch] = useState<number>(0);
  const [toneVolume, setToneVolume] = useState<number>(90);
  const [toneIsPlaying, setToneIsPlaying] = useState<boolean>(false);
  const [toneIsLoading, setToneIsLoading] = useState<boolean>(false);

  // Phaze state
  const [phazePitch, setPhazePitch] = useState<number>(0);
  const [phazeVolume, setPhazeVolume] = useState<number>(90);
  const [phazeIsPlaying, setPhazeIsPlaying] = useState<boolean>(false);
  const [phazeIsLoading, setPhazeIsLoading] = useState<boolean>(false);

  // Sync controls
  const [syncPitch, setSyncPitch] = useState<boolean>(true);
  const [syncPlayback, setSyncPlayback] = useState<boolean>(false);

  // Quality assessment
  const [toneIssues, setToneIssues] = useState<Set<string>>(new Set());
  const [phazeIssues, setPhazeIssues] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string>('');

  // Initialize services
  useEffect(() => {
    toneServiceRef.current = new PitchShiftService();
    phazeServiceRef.current = new PhazePitchShiftService();

    return () => {
      toneServiceRef.current?.dispose();
      phazeServiceRef.current?.dispose();
    };
  }, []);

  // Load audio when selection changes
  useEffect(() => {
    // If there's an uploaded file, don't load from dropdown
    if (uploadedFile) return;

    const audioUrl = SAMPLE_AUDIO.find(a => a.id === selectedAudio)?.url;
    if (!audioUrl) return;

    loadAudio(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAudio, uploadedFile]);

  // Cleanup blob URL when component unmounts or when switching audio
  useEffect(() => {
    return () => {
      if (uploadedFileUrl) {
        console.log('🧹 Revoking blob URL:', uploadedFileUrl);
        URL.revokeObjectURL(uploadedFileUrl);
      }
    };
  }, [uploadedFileUrl]);

  const loadAudio = async (audioUrl: string) => {
    console.log('🎵 Loading audio for comparison:', audioUrl);

    // Load Tone.js
    setToneIsLoading(true);
    try {
      await toneServiceRef.current?.loadAudio(audioUrl, tonePitch);
      console.log('✅ Tone.js audio loaded');
    } catch (error) {
      console.error('❌ Failed to load Tone.js audio:', error);
    } finally {
      setToneIsLoading(false);
    }

    // Load Phaze
    setPhazeIsLoading(true);
    try {
      await phazeServiceRef.current?.loadAudio(audioUrl, phazePitch);
      console.log('✅ Phaze audio loaded');
    } catch (error) {
      console.error('❌ Failed to load Phaze audio:', error);
    } finally {
      setPhazeIsLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset error state
    setUploadError(null);

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/x-m4a'];
    const validExtensions = ['.mp3', '.wav', '.m4a', '.ogg'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setUploadError('Invalid file format. Please upload MP3, WAV, M4A, or OGG files.');
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      setUploadError('File too large. Maximum size is 50MB.');
      return;
    }

    console.log('📁 File uploaded:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    setIsUploadLoading(true);

    try {
      // Revoke previous blob URL if exists
      if (uploadedFileUrl) {
        URL.revokeObjectURL(uploadedFileUrl);
      }

      // Create blob URL
      const blobUrl = URL.createObjectURL(file);
      console.log('🔗 Created blob URL:', blobUrl);

      // Update state
      setUploadedFile(file);
      setUploadedFileUrl(blobUrl);

      // Load audio into both players
      await loadAudio(blobUrl);

      console.log('✅ Custom file loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load custom file:', error);
      setUploadError('Failed to load audio file. Please try a different file.');

      // Cleanup on error
      if (uploadedFileUrl) {
        URL.revokeObjectURL(uploadedFileUrl);
      }
      setUploadedFile(null);
      setUploadedFileUrl(null);
    } finally {
      setIsUploadLoading(false);
    }
  };

  // Clear uploaded file and return to dropdown selection
  const handleClearUpload = () => {
    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
    }
    setUploadedFile(null);
    setUploadedFileUrl(null);
    setUploadError(null);

    // Reload audio from dropdown selection
    const audioUrl = SAMPLE_AUDIO.find(a => a.id === selectedAudio)?.url;
    if (audioUrl) {
      loadAudio(audioUrl);
    }
  };

  // Tone.js controls
  const handleTonePlay = () => {
    toneServiceRef.current?.play();
    setToneIsPlaying(true);
    if (syncPlayback) {
      phazeServiceRef.current?.play();
      setPhazeIsPlaying(true);
    }
  };

  const handleTonePause = () => {
    toneServiceRef.current?.pause();
    setToneIsPlaying(false);
    if (syncPlayback) {
      phazeServiceRef.current?.pause();
      setPhazeIsPlaying(false);
    }
  };

  const handleToneStop = () => {
    toneServiceRef.current?.pause();
    toneServiceRef.current?.seek(0);
    setToneIsPlaying(false);
    if (syncPlayback) {
      phazeServiceRef.current?.stop();
      setPhazeIsPlaying(false);
    }
  };

  const handleTonePitchChange = (value: number | number[]) => {
    const pitch = Array.isArray(value) ? value[0] : value;
    setTonePitch(pitch);
    toneServiceRef.current?.setPitch(pitch);
    if (syncPitch) {
      setPhazePitch(pitch);
      phazeServiceRef.current?.setPitch(pitch);
    }
  };

  const handleToneVolumeChange = (value: number | number[]) => {
    const vol = Array.isArray(value) ? value[0] : value;
    setToneVolume(vol);
    toneServiceRef.current?.setVolume(vol);
  };

  // Phaze controls
  const handlePhazePlay = () => {
    phazeServiceRef.current?.play();
    setPhazeIsPlaying(true);
    if (syncPlayback) {
      toneServiceRef.current?.play();
      setToneIsPlaying(true);
    }
  };

  const handlePhazePause = () => {
    phazeServiceRef.current?.pause();
    setPhazeIsPlaying(false);
    if (syncPlayback) {
      toneServiceRef.current?.pause();
      setToneIsPlaying(false);
    }
  };

  const handlePhazeStop = () => {
    phazeServiceRef.current?.stop();
    setPhazeIsPlaying(false);
    if (syncPlayback) {
      toneServiceRef.current?.pause();
      toneServiceRef.current?.seek(0);
      setToneIsPlaying(false);
    }
  };

  const handlePhazePitchChange = (value: number | number[]) => {
    const pitch = Array.isArray(value) ? value[0] : value;
    setPhazePitch(pitch);
    phazeServiceRef.current?.setPitch(pitch);
    if (syncPitch) {
      setTonePitch(pitch);
      toneServiceRef.current?.setPitch(pitch);
    }
  };

  const handlePhazeVolumeChange = (value: number | number[]) => {
    const vol = Array.isArray(value) ? value[0] : value;
    setPhazeVolume(vol);
    phazeServiceRef.current?.setVolume(vol);
  };

  // Quality checklist handlers
  const toggleToneIssue = (issueId: string) => {
    const newIssues = new Set(toneIssues);
    if (newIssues.has(issueId)) {
      newIssues.delete(issueId);
    } else {
      newIssues.add(issueId);
    }
    setToneIssues(newIssues);
  };

  const togglePhazeIssue = (issueId: string) => {
    const newIssues = new Set(phazeIssues);
    if (newIssues.has(issueId)) {
      newIssues.delete(issueId);
    } else {
      newIssues.add(issueId);
    }
    setPhazeIssues(newIssues);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Pitch Shift A/B Comparison</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Compare Tone.js (current) vs phaze AudioWorklet (new) pitch shifting quality
        </p>
      </div>

      {/* Audio Selection */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Test Audio Selection</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {/* Dropdown selection */}
          <Select
            label="Select test audio"
            selectedKeys={[selectedAudio]}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0] as string;
              setSelectedAudio(key);
            }}
            isDisabled={!!uploadedFile}
          >
            {SAMPLE_AUDIO.map((audio) => (
              <SelectItem key={audio.id}>
                {audio.name} - {audio.description}
              </SelectItem>
            ))}
          </Select>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
            <span className="text-sm text-gray-500 dark:text-gray-400">OR</span>
            <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            {!uploadedFile ? (
              <div>
                <label htmlFor="audio-upload" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Upload your own audio file
                </label>
                <div className="flex gap-2">
                  <input
                    id="audio-upload"
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/x-m4a,audio/ogg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    color="primary"
                    variant="bordered"
                    onPress={() => document.getElementById('audio-upload')?.click()}
                    isLoading={isUploadLoading}
                    startContent={!isUploadLoading && <HiArrowUpTray size={20} />}
                  >
                    {isUploadLoading ? 'Loading...' : 'Choose File'}
                  </Button>
                  <span className="text-sm text-gray-500 dark:text-gray-400 self-center">
                    MP3, WAV, M4A, OGG (max 50MB)
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <HiCheckCircle className="text-green-600 dark:text-green-400" size={20} />
                      <span className="font-medium text-green-900 dark:text-green-100">
                        Custom file loaded
                      </span>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    onPress={handleClearUpload}
                    startContent={<HiXMark size={16} />}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {/* Error message */}
            {uploadError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-700 dark:text-red-300">{uploadError}</p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Sync Controls */}
      <Card>
        <CardBody className="flex flex-row gap-6">
          <Checkbox isSelected={syncPitch} onValueChange={setSyncPitch}>
            Sync pitch values
          </Checkbox>
          <Checkbox isSelected={syncPlayback} onValueChange={setSyncPlayback}>
            Sync play/pause
          </Checkbox>
        </CardBody>
      </Card>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tone.js Player */}
        <Card className="border-2 border-orange-500">
          <CardHeader className="bg-orange-500/10">
            <h2 className="text-xl font-semibold">Tone.js (Current)</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Playback controls */}
            <div className="flex gap-2">
              <Button
                isIconOnly
                color="primary"
                variant={toneIsPlaying ? 'flat' : 'solid'}
                onPress={toneIsPlaying ? handleTonePause : handleTonePlay}
                isDisabled={toneIsLoading}
              >
                {toneIsPlaying ? <HiPause size={20} /> : <HiPlay size={20} />}
              </Button>
              <Button
                isIconOnly
                color="danger"
                variant="flat"
                onPress={handleToneStop}
                isDisabled={toneIsLoading}
              >
                <HiStop size={20} />
              </Button>
            </div>

            {/* Volume control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Volume: {toneVolume}%
              </label>
              <Slider
                value={toneVolume}
                onChange={handleToneVolumeChange}
                minValue={0}
                maxValue={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Pitch control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Pitch: {tonePitch > 0 ? '+' : ''}{tonePitch} semitones
              </label>
              <Slider
                value={tonePitch}
                onChange={handleTonePitchChange}
                minValue={-6}
                maxValue={6}
                step={1}
                className="w-full"
                marks={[
                  { value: -6, label: '-6' },
                  { value: 0, label: '0' },
                  { value: 6, label: '+6' }
                ]}
              />
            </div>

            <Divider />

            {/* Quality checklist */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Quality Issues Detected:</h3>
              <div className="space-y-2">
                {QUALITY_CHECKLIST.map((item) => (
                  <Checkbox
                    key={item.id}
                    isSelected={toneIssues.has(item.id)}
                    onValueChange={() => toggleToneIssue(item.id)}
                  >
                    {item.label}
                  </Checkbox>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Phaze Player */}
        <Card className="border-2 border-green-500">
          <CardHeader className="bg-green-500/10">
            <h2 className="text-xl font-semibold">phaze AudioWorklet (New)</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Playback controls */}
            <div className="flex gap-2">
              <Button
                isIconOnly
                color="success"
                variant={phazeIsPlaying ? 'flat' : 'solid'}
                onPress={phazeIsPlaying ? handlePhazePause : handlePhazePlay}
                isDisabled={phazeIsLoading}
              >
                {phazeIsPlaying ? <HiPause size={20} /> : <HiPlay size={20} />}
              </Button>
              <Button
                isIconOnly
                color="danger"
                variant="flat"
                onPress={handlePhazeStop}
                isDisabled={phazeIsLoading}
              >
                <HiStop size={20} />
              </Button>
            </div>

            {/* Volume control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Volume: {phazeVolume}%
              </label>
              <Slider
                value={phazeVolume}
                onChange={handlePhazeVolumeChange}
                minValue={0}
                maxValue={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Pitch control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Pitch: {phazePitch > 0 ? '+' : ''}{phazePitch} semitones
              </label>
              <Slider
                value={phazePitch}
                onChange={handlePhazePitchChange}
                minValue={-6}
                maxValue={6}
                step={1}
                className="w-full"
                marks={[
                  { value: -6, label: '-6' },
                  { value: 0, label: '0' },
                  { value: 6, label: '+6' }
                ]}
              />
            </div>

            <Divider />

            {/* Quality checklist */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Quality Issues Detected:</h3>
              <div className="space-y-2">
                {QUALITY_CHECKLIST.map((item) => (
                  <Checkbox
                    key={item.id}
                    isSelected={phazeIssues.has(item.id)}
                    onValueChange={() => togglePhazeIssue(item.id)}
                  >
                    {item.label}
                  </Checkbox>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Comparison Notes</h2>
        </CardHeader>
        <CardBody>
          <Textarea
            placeholder="Record your observations about audio quality differences..."
            value={notes}
            onValueChange={setNotes}
            minRows={4}
          />
        </CardBody>
      </Card>
    </div>
  );
}

