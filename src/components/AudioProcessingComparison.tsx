/**
 * Audio Processing Comparison Component
 * Side-by-side comparison of Appwrite vs downr.org + Opus→MP3 conversion approaches
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { Input } from '@heroui/react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { Progress } from '@heroui/react';
import { Chip } from '@heroui/react';
import { useAudioProcessingComparison } from '@/hooks/useAudioProcessingComparison';

export default function AudioProcessingComparison() {
  const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=jNQXAC9IVRw'); // Default: "Me at the zoo"

  const {
    isRunning,
    appwriteResult,
    downrResult,
    appwriteProgress,
    downrProgress,
    error,
    runAppwriteTest,
    runDownrTest,
    runBothTests,
    clearResults,
    exportResults,
    hasResults,
    performanceSummary
  } = useAudioProcessingComparison({
    enablePerformanceTracking: true,
    onProgress: (method, step, progress) => {
      console.log(`${method} progress: ${step} (${progress}%)`);
    },
    onStepComplete: (method, step, duration) => {
      console.log(`${method} completed ${step}: ${duration}ms`);
    },
    onError: (method, error) => {
      console.error(`${method} error:`, error);
    }
  });

  const handleRunBothTests = async () => {
    await runBothTests(youtubeUrl);
  };

  const handleRunAppwriteTest = async () => {
    await runAppwriteTest();
  };

  const handleRunDownrTest = async () => {
    await runDownrTest(youtubeUrl);
  };

  const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;
  const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Audio Processing Performance Comparison</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Compare Appwrite vs downr.org + Opus→MP3 conversion approaches
        </p>
      </div>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Test Configuration</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="YouTube URL"
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={isRunning}
          />

          <div className="flex gap-4">
            <Button
              color="primary"
              onClick={handleRunBothTests}
              disabled={isRunning || !youtubeUrl}
              isLoading={isRunning}
            >
              Run Both Tests
            </Button>
            <Button
              color="secondary"
              variant="bordered"
              onClick={handleRunAppwriteTest}
              disabled={isRunning}
            >
              Test Appwrite Only
            </Button>
            <Button
              color="secondary"
              variant="bordered"
              onClick={handleRunDownrTest}
              disabled={isRunning || !youtubeUrl}
            >
              Test downr.org Only
            </Button>
            <Button
              color="warning"
              variant="light"
              onClick={clearResults}
              disabled={isRunning}
            >
              Clear Results
            </Button>
            <Button
              color="success"
              variant="light"
              onClick={exportResults}
              disabled={!hasResults}
            >
              Export Data
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950">
          <CardBody>
            <p className="text-red-600 dark:text-red-400">❌ {error}</p>
          </CardBody>
        </Card>
      )}

      {/* Progress Display */}
      {isRunning && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Appwrite Progress</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">{appwriteProgress.step || 'Waiting...'}</p>
                <Progress
                  value={appwriteProgress.progress}
                  color="primary"
                  className="w-full"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">downr.org Progress</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">{downrProgress.step || 'Waiting...'}</p>
                <Progress
                  value={downrProgress.progress}
                  color="secondary"
                  className="w-full"
                />
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Results Display */}
      {hasResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Appwrite Results */}
          <Card>
            <CardHeader className="flex justify-between">
              <h3 className="text-lg font-semibold">Appwrite Results</h3>
              <Chip color={appwriteResult?.success ? 'success' : 'danger'}>
                {appwriteResult?.success ? 'Success' : 'Failed'}
              </Chip>
            </CardHeader>
            <CardBody>
              {appwriteResult ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Total Time:</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatSeconds(appwriteResult.timings?.total || 0)}
                    </p>
                  </div>

                  {appwriteResult.timings && (
                    <div className="space-y-1 text-sm">
                      {appwriteResult.timings.chordRecognition && (
                        <p>Chord Recognition: {formatTime(appwriteResult.timings.chordRecognition)}</p>
                      )}
                      {appwriteResult.timings.beatDetection && (
                        <p>Beat Detection: {formatTime(appwriteResult.timings.beatDetection)}</p>
                      )}
                    </div>
                  )}

                  <div className="text-sm">
                    <p>Chords: {appwriteResult.chords?.length || 0}</p>
                    <p>Beats: {appwriteResult.beats?.beats?.length || 0}</p>
                    {appwriteResult.beats?.bpm && (
                      <p>BPM: {appwriteResult.beats.bpm}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No results yet</p>
              )}
            </CardBody>
          </Card>

          {/* downr.org Results */}
          <Card>
            <CardHeader className="flex justify-between">
              <h3 className="text-lg font-semibold">downr.org Results</h3>
              <Chip color={downrResult?.success ? 'success' : 'danger'}>
                {downrResult?.success ? 'Success' : 'Failed'}
              </Chip>
            </CardHeader>
            <CardBody>
              {downrResult ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Total Time:</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatSeconds(downrResult.timings?.total || 0)}
                    </p>
                  </div>

                  {downrResult.timings && (
                    <div className="space-y-1 text-sm">
                      {downrResult.timings.extraction && (
                        <p>Extraction: {formatTime(downrResult.timings.extraction)}</p>
                      )}
                      {downrResult.timings.download && (
                        <p>Download: {formatTime(downrResult.timings.download)}</p>
                      )}
                      {downrResult.timings.conversion && (
                        <p>Conversion: {formatTime(downrResult.timings.conversion)}</p>
                      )}
                      {downrResult.timings.chordRecognition && (
                        <p>Chord Recognition: {formatTime(downrResult.timings.chordRecognition)}</p>
                      )}
                      {downrResult.timings.beatDetection && (
                        <p>Beat Detection: {formatTime(downrResult.timings.beatDetection)}</p>
                      )}
                    </div>
                  )}

                  <div className="text-sm">
                    <p>Chords: {downrResult.chords?.length || 0}</p>
                    <p>Beats: {downrResult.beats?.beats?.length || 0}</p>
                    {downrResult.beats?.bpm && (
                      <p>BPM: {downrResult.beats.bpm}</p>
                    )}
                    {downrResult.metadata && (
                      <>
                        <p>Title: {downrResult.metadata.title}</p>
                        <p>Compression: {downrResult.metadata.compressionRatio.toFixed(2)}x</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No results yet</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Comparison Results */}
      {performanceSummary && (
        <Card>
          <CardHeader>
            <h3 className="text-xl font-semibold">Performance Comparison</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-lg">
                  <span className="font-bold text-green-600">
                    {performanceSummary.winner}
                  </span>
                  {' '}is faster by{' '}
                  <span className="font-bold">
                    {formatSeconds(performanceSummary.timeDifference)}
                  </span>
                  {' '}({performanceSummary.percentageDifference.toFixed(1)}%)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Performance Summary</h4>
                  <div className="space-y-1 text-sm">
                    <p>Appwrite Time: {formatSeconds(performanceSummary.appwriteTime)}</p>
                    <p>downr.org Time: {formatSeconds(performanceSummary.downrTime)}</p>
                    <p>Time Difference: {formatSeconds(performanceSummary.timeDifference)}</p>
                    <p>Percentage Difference: {performanceSummary.percentageDifference.toFixed(1)}%</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Results Comparison</h4>
                  <div className="space-y-1 text-sm">
                    <p>Appwrite Success: {performanceSummary.appwriteSuccess ? '✅' : '❌'}</p>
                    <p>downr.org Success: {performanceSummary.downrSuccess ? '✅' : '❌'}</p>
                    <p>Appwrite Chords: {performanceSummary.appwriteChords}</p>
                    <p>downr.org Chords: {performanceSummary.downrChords}</p>
                    <p>Winner: <span className="font-bold">{performanceSummary.winner}</span></p>
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
