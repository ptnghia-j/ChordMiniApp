"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import LyricsPlayer from '@/components/LyricsPlayer';
import { LyricsData } from '@/types/musicAiTypes';
import Link from 'next/link';

/**
 * Page component for displaying synchronized lyrics with YouTube video
 */
export default function LyricsPage() {
  const params = useParams();
  const videoId = params?.videoId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Check for cached lyrics when the component mounts (but don't auto-transcribe)
  useEffect(() => {
    const checkCachedLyrics = async () => {
      if (!videoId) return;

      setLoading(true);
      setError(null);

      try {
        // Only check for cached lyrics, don't auto-transcribe
        const transcribeResponse = await axios.post('/api/transcribe-lyrics', {
          videoId,
          checkCacheOnly: true // Only check cache, don't process - audioPath not needed for cache-only
        });

        if (transcribeResponse.data.success && transcribeResponse.data.lyrics) {
          setLyrics(transcribeResponse.data.lyrics);
        } else {
          // No cached lyrics found - show message to user
          setError('No lyrics found for this video. Please use the main analyze page to transcribe lyrics first.');
        }
      } catch (error: unknown) {
        console.error('Error checking cached lyrics:', error);
        setError('No lyrics found for this video. Please use the main analyze page to transcribe lyrics first.');
      } finally {
        setLoading(false);
      }
    };

    checkCachedLyrics();
  }, [videoId]);

  // Handle auto-scroll toggle
  const toggleAutoScroll = () => {
    setAutoScroll(!autoScroll);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Lyrics Transcription</h1>

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
        <LyricsPlayer
          videoId={videoId}
          lyrics={lyrics}
          autoScroll={autoScroll}
        />
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
  );
}
