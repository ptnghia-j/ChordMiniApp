import React, { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { LyricsData } from '@/types/musicAiTypes';

/**
 * Test page for lyrics transcription
 * This page allows you to:
 * 1. Test the lyrics transcription with a specific audio file
 * 2. View the transcription results
 * 3. Display the lyrics in a lead sheet format
 */
export default function TestLyricsTranscription() {
  const [loading, setLoading] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  
  const router = useRouter();
  
  // Test the lyrics transcription
  const testTranscription = async () => {
    setLoading(true);
    setError(null);
    setLyrics(null);
    
    try {
      const response = await axios.get('/api/test-lyrics-transcription');
      
      if (response.data.success && response.data.transcription) {
        setLyrics(response.data.transcription);
      } else {
        setError(response.data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Error testing lyrics transcription:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };
  
  // Simulate playback by updating the current time
  const simulatePlayback = () => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) return;
    
    // Reset current time
    setCurrentTime(0);
    
    // Get the last line's end time to know when to stop
    const lastLine = lyrics.lines[lyrics.lines.length - 1];
    const duration = lastLine.endTime;
    
    // Update current time every 100ms
    let time = 0;
    const interval = setInterval(() => {
      time += 0.1;
      setCurrentTime(time);
      
      if (time >= duration) {
        clearInterval(interval);
      }
    }, 100);
    
    // Clean up interval on unmount
    return () => clearInterval(interval);
  };
  
  // Get the current line based on current time
  const getCurrentLine = () => {
    if (!lyrics || !lyrics.lines) return null;
    
    return lyrics.lines.find(
      line => currentTime >= line.startTime && currentTime <= line.endTime
    );
  };
  
  // Render the lyrics in a lead sheet format
  const renderLyrics = () => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
      return <p className="text-gray-500">No lyrics available</p>;
    }
    
    const currentLine = getCurrentLine();
    
    return (
      <div className="space-y-4">
        {lyrics.lines.map((line, index) => (
          <div 
            key={index} 
            className={`relative ${currentLine === line ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}
          >
            {/* Render chords above the lyrics if available */}
            {line.chords && line.chords.length > 0 && (
              <div className="absolute -top-5 left-0 w-full">
                {line.chords.map((chord, chordIndex) => (
                  <span 
                    key={chordIndex}
                    className="text-red-600 text-sm font-bold"
                    style={{ 
                      position: 'absolute', 
                      left: `${(chord.position / line.text.length) * 100}%`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    {chord.chord}
                  </span>
                ))}
              </div>
            )}
            
            {/* Render the lyrics text */}
            <p className="text-lg leading-loose">{line.text}</p>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Test Lyrics Transcription</h1>
      
      <div className="mb-8">
        <p className="mb-4">
          This test will transcribe lyrics from the specific audio file <code>KoM13RvBHrk_1747853615886.mp3</code> using the Music.ai API.
        </p>
        
        <div className="flex space-x-2">
          <button 
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={testTranscription}
            disabled={loading}
          >
            {loading ? 'Transcribing...' : 'Test Transcription'}
          </button>
          
          {lyrics && (
            <button 
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              onClick={simulatePlayback}
            >
              Simulate Playback
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {lyrics && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Transcription Result</h2>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Lyrics</h3>
              {renderLyrics()}
            </div>
            
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Raw Data</h3>
              <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                {JSON.stringify(lyrics, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-8">
        <button 
          className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => router.push('/')}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
