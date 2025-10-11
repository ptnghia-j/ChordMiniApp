'use client';

import React, { useState, useRef } from 'react';
import { Button, Progress, Card, CardBody, CardHeader } from '@heroui/react';
import { HiArrowUpTray, HiMusicalNote, HiMicrophone } from 'react-icons/hi2';
import { GiDrumKit, GiGuitarBassHead } from 'react-icons/gi';
import Navigation from '@/components/Navigation';

/**
 * POC: VocalRemover.org Audio Splitter Integration
 *
 * This is a proof-of-concept to test the vocalremover.org API integration
 * discovered through browser automation investigation.
 *
 * API Workflow (via Backend Proxy to bypass CORS):
 * 1. GET /api/audio-splitter/get-server → GET https://api.vocalremover.org/split/get_server
 * 2. POST /api/audio-splitter/upload → POST https://api{N}.vocalremover.org/split/tracks
 * 3. Wait for processing (~90-120 seconds)
 * 4. GET https://api{N}.vocalremover.org/split/listen/{type}/{id}/{hash} - Download stems
 *
 * Note: Direct client-side API calls are blocked by CORS. We use Next.js API routes
 * as a backend proxy to call the vocalremover.org API from the server side.
 *
 * Known Limitations:
 * - CORS: Direct client-side calls blocked, requires backend proxy
 * - Rate limiting: Free tier allows only 2-3 uploads before 429 error
 * - Processing time: ~1-2 minutes for typical songs
 * - Undocumented API: May change without notice
 */

interface StemUrls {
  music: string;
  vocal: string;
  bass: string;
  drums: string;
}

type ProcessingStage = 'idle' | 'getting-server' | 'uploading' | 'processing' | 'encoding' | 'complete' | 'error';

export default function AudioSplitterPOC() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [stemUrls, setStemUrls] = useState<StemUrls | null>(null);
  const [serverNumber, setServerNumber] = useState<number | null>(null);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [trackHash, setTrackHash] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg'];
    const validExtensions = ['.mp3', '.wav', '.m4a', '.ogg'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setErrorMessage('Invalid file format. Please upload MP3, WAV, M4A, or OGG files.');
      return;
    }

    // Check file size (limit to 20MB for POC)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      setErrorMessage('File too large. Please upload files smaller than 20MB.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
    setStage('idle');
    setStemUrls(null);
  };

  const processAudio = async () => {
    if (!selectedFile) return;

    try {
      // Step 1: Get server assignment (via backend proxy to bypass CORS)
      setStage('getting-server');
      setProgress(10);
      setStatusMessage('Getting server assignment...');
      setErrorMessage('');

      const serverResponse = await fetch('/api/audio-splitter/get-server', {
        method: 'GET'
      });

      if (serverResponse.status === 429) {
        throw new Error('Rate limited! The free tier has strict limits. Please wait a few minutes and try again, or consider subscribing to the service.');
      }

      if (!serverResponse.ok) {
        const errorData = await serverResponse.json();
        throw new Error(errorData.message || `Failed to get server assignment: ${serverResponse.status}`);
      }

      const serverData = await serverResponse.json();
      const assignedServer = serverData.server;
      setServerNumber(assignedServer);
      setProgress(20);
      setStatusMessage(`Assigned to server ${assignedServer}`);

      // Step 2: Upload file (via backend proxy to bypass CORS)
      setStage('uploading');
      setProgress(30);
      setStatusMessage('Uploading file...');

      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);
      formData.append('server', assignedServer.toString());

      const uploadResponse = await fetch('/api/audio-splitter/upload', {
        method: 'POST',
        body: formData
      });

      if (uploadResponse.status === 429) {
        throw new Error('Rate limited! The free tier has strict limits. Please wait a few minutes and try again, or consider subscribing to the service.');
      }

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || `Upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      const id = uploadData.id;
      const hash = uploadData.hash;
      
      setTrackId(id);
      setTrackHash(hash);
      setProgress(50);
      setStatusMessage(`Upload successful! Track ID: ${id}`);

      // Step 3: Wait for processing
      setStage('processing');
      setStatusMessage('AI processing in progress...');
      
      // Simulate processing stages (actual processing happens server-side)
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      setProgress(70);
      
      setStage('encoding');
      setStatusMessage('Encoding stems...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds
      setProgress(90);

      // Step 4: Build download URLs
      setStage('complete');
      setProgress(100);
      setStatusMessage('Processing complete!');

      const stems: StemUrls = {
        music: `https://api${assignedServer}.vocalremover.org/split/listen/music/${id}/${hash}`,
        vocal: `https://api${assignedServer}.vocalremover.org/split/listen/vocal/${id}/${hash}`,
        bass: `https://api${assignedServer}.vocalremover.org/split/listen/bass/${id}/${hash}`,
        drums: `https://api${assignedServer}.vocalremover.org/split/listen/drums/${id}/${hash}`
      };

      setStemUrls(stems);

    } catch (error) {
      setStage('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
      console.error('Audio splitting error:', error);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setStage('idle');
    setProgress(0);
    setStatusMessage('');
    setErrorMessage('');
    setStemUrls(null);
    setServerNumber(null);
    setTrackId(null);
    setTrackHash(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStageColor = () => {
    switch (stage) {
      case 'error': return 'danger';
      case 'complete': return 'success';
      case 'idle': return 'default';
      default: return 'primary';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Audio Splitter POC
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Proof-of-concept integration with vocalremover.org API to split audio into separate stems
            (vocals, bass, drums, and other instruments)
          </p>
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ <strong>Rate Limiting:</strong> Free tier allows only 2-3 uploads before rate limiting kicks in.
              Processing takes ~1-2 minutes per song.
            </p>
          </div>
        </div>

        {/* File Upload Section */}
        <Card className="mb-6">
          <CardHeader className="flex gap-3">
            <HiArrowUpTray className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <div className="flex flex-col">
              <p className="text-lg font-semibold">Upload Audio File</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Select an audio file to split into stems (MP3, WAV, M4A, OGG - max 20MB)
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/x-m4a,audio/ogg"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="audio-file-input"
                />
                <Button
                  color="primary"
                  variant="bordered"
                  onPress={() => fileInputRef.current?.click()}
                  startContent={<HiArrowUpTray size={20} />}
                  isDisabled={stage !== 'idle' && stage !== 'error' && stage !== 'complete'}
                >
                  Choose File
                </Button>
                {selectedFile && (
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                )}
              </div>

              {selectedFile && stage === 'idle' && (
                <Button
                  color="success"
                  size="lg"
                  onPress={processAudio}
                  className="w-full"
                >
                  Start Processing
                </Button>
              )}

              {(stage !== 'idle' && stage !== 'complete') && (
                <div className="space-y-2">
                  <Progress
                    value={progress}
                    color={getStageColor()}
                    className="w-full"
                    showValueLabel
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    {statusMessage}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    <strong>Error:</strong> {errorMessage}
                  </p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Results Section */}
        {stemUrls && stage === 'complete' && (
          <Card>
            <CardHeader className="flex gap-3">
              <HiMusicalNote className="w-6 h-6 text-success-600 dark:text-success-400" />
              <div className="flex flex-col">
                <p className="text-lg font-semibold">Separated Stems</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your audio has been successfully split into 4 stems
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {/* Debug Info */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono">
                  <p><strong>Server:</strong> {serverNumber}</p>
                  <p><strong>Track ID:</strong> {trackId}</p>
                  <p><strong>Hash:</strong> {trackHash}</p>
                </div>

                {/* Music (Instrumental) */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <HiMusicalNote className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Music (Instrumental)</h3>
                  </div>
                  <audio controls className="w-full" src={stemUrls.music}>
                    Your browser does not support the audio element.
                  </audio>
                  <a
                    href={stemUrls.music}
                    download
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                  >
                    Download MP3
                  </a>
                </div>

                {/* Vocals */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <HiMicrophone className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Vocals</h3>
                  </div>
                  <audio controls className="w-full" src={stemUrls.vocal}>
                    Your browser does not support the audio element.
                  </audio>
                  <a
                    href={stemUrls.vocal}
                    download
                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline mt-2 inline-block"
                  >
                    Download MP3
                  </a>
                </div>

                {/* Bass */}
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <GiGuitarBassHead className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Bass</h3>
                  </div>
                  <audio controls className="w-full" src={stemUrls.bass}>
                    Your browser does not support the audio element.
                  </audio>
                  <a
                    href={stemUrls.bass}
                    download
                    className="text-sm text-green-600 dark:text-green-400 hover:underline mt-2 inline-block"
                  >
                    Download MP3
                  </a>
                </div>

                {/* Drums */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <GiDrumKit className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Drums</h3>
                  </div>
                  <audio controls className="w-full" src={stemUrls.drums}>
                    Your browser does not support the audio element.
                  </audio>
                  <a
                    href={stemUrls.drums}
                    download
                    className="text-sm text-orange-600 dark:text-orange-400 hover:underline mt-2 inline-block"
                  >
                    Download MP3
                  </a>
                </div>

                {/* Reset Button */}
                <Button
                  color="default"
                  variant="bordered"
                  onPress={reset}
                  className="w-full"
                >
                  Process Another File
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Technical Details */}
        <Card className="mt-6">
          <CardHeader>
            <p className="text-lg font-semibold">Technical Details</p>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <div>
                <strong className="text-gray-900 dark:text-white">API Workflow:</strong>
                <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                  <li>GET server assignment from api.vocalremover.org</li>
                  <li>POST audio file to assigned server (api{'{N}'}.vocalremover.org)</li>
                  <li>Wait for server-side AI processing (~90-120 seconds)</li>
                  <li>Retrieve download URLs for 4 separated stems</li>
                </ol>
              </div>
              <div>
                <strong className="text-gray-900 dark:text-white">Known Limitations:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li>Rate limiting: Free tier allows only 2-3 uploads before 429 error</li>
                  <li>Processing time: ~1-2 minutes for typical songs</li>
                  <li>Undocumented API: May change without notice</li>
                  <li>No official support or SLA</li>
                </ul>
              </div>
              <div>
                <strong className="text-gray-900 dark:text-white">Next Steps:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li>Investigate subscription pricing for production use</li>
                  <li>Implement proper polling mechanism instead of fixed wait times</li>
                  <li>Add caching to reduce API calls</li>
                  <li>Consider fallback to self-hosted solution (Spleeter/Demucs)</li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

