"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LyricsPlayer from '@/components/LyricsPlayer';
import { LyricsData } from '@/types/musicAiTypes';
import Link from 'next/link';
import ClientErrorBoundary from '@/components/ClientErrorBoundary';

/**
 * Demo page for lyrics transcription with our specific audio file
 */
export default function LyricsDemo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Specific video ID for our demo
  const videoId = 'KoM13RvBHrk';

  // Fetch lyrics data when the component mounts
  useEffect(() => {
    const fetchLyrics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try to get lyrics from the API with forceRefresh to bypass cache
        const response = await axios.post('/api/transcribe-lyrics', {
          videoId,
          audioPath: '/audio/KoM13RvBHrk_1747853615886.mp3',
          forceRefresh: true
        });

        if (response.data.success && response.data.lyrics) {
          setLyrics(response.data.lyrics);
        } else {
          throw new Error(response.data.error || 'Failed to transcribe lyrics');
        }
      } catch (error: any) {
        console.error('Error fetching lyrics:', error);
        setError(error.response?.data?.error || error.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, []);

  // Handle auto-scroll toggle
  const toggleAutoScroll = () => {
    setAutoScroll(!autoScroll);
  };

  return (
    <ClientErrorBoundary>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Lyrics Transcription Demo</h1>

          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <label htmlFor="autoScroll" className="mr-2 text-sm font-medium text-gray-700">
                Auto-scroll
              </label>
              <div className="relative inline-block w-10 mr-2 align-middle select-none">
                <input
                  type="checkbox"
                  id="autoScroll"
                  checked={autoScroll}
                  onChange={toggleAutoScroll}
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                />
                <label
                  htmlFor="autoScroll"
                  className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                    autoScroll ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                ></label>
              </div>
            </div>

            <Link
              href="/"
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
            >
              Back to Home
            </Link>
          </div>
        </div>

      {loading && (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Loading lyrics transcription...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && !error && lyrics && (
        <>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="text-blue-700">
              <strong>Demo Information:</strong> This page demonstrates the lyrics transcription feature using our specific audio file.
              The lyrics are transcribed using the Music.ai API and displayed in sync with the YouTube video.
            </p>
          </div>

          <LyricsPlayer
            videoId={videoId}
            lyrics={lyrics}
            autoScroll={autoScroll}
          />
        </>
      )}

      {/* Fallback message if no lyrics are available */}
      {!loading && !error && !lyrics && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative">
          <strong className="font-bold">No lyrics available: </strong>
          <span className="block sm:inline">
            Could not transcribe lyrics for this video. The video may not contain vocals or the audio quality may be too low.
          </span>
        </div>
      )}
      </div>
    </ClientErrorBoundary>
  );
}
