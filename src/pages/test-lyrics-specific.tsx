import React, { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import LeadSheetDisplay from '@/components/LeadSheetDisplay';

/**
 * Test page for lyrics transcription with a specific audio file
 * This page allows you to:
 * 1. Test the lyrics transcription with the specific audio file
 * 2. View the results of the API call
 * 3. Display the transcribed lyrics in the lead sheet format
 */
export default function TestLyricsSpecific() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  
  const router = useRouter();
  
  // Test with specific audio file
  const testWithSpecificAudio = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLyrics(null);
    
    try {
      const response = await axios.get('/api/test-lyrics-specific');
      setResult(response.data);
      
      // Process the result to extract lyrics
      if (response.data && response.data.lyrics) {
        console.log('Setting lyrics data:', response.data.lyrics);
        setLyrics(response.data.lyrics);
      }
    } catch (error: any) {
      console.error('Error testing with specific audio:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
      setResult(error.response?.data || null);
    } finally {
      setLoading(false);
    }
  };
  
  // Simulate time progression for the lead sheet display
  React.useEffect(() => {
    if (lyrics && lyrics.lines && lyrics.lines.length > 0) {
      const maxTime = lyrics.lines[lyrics.lines.length - 1].endTime;
      const interval = setInterval(() => {
        setCurrentTime(prev => {
          const newTime = prev + 0.1;
          if (newTime > maxTime) {
            clearInterval(interval);
            return maxTime;
          }
          return newTime;
        });
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [lyrics]);
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Test Lyrics Transcription with Specific Audio File</h1>
      
      <div className="mb-8">
        <p className="mb-4">
          This test will use the specific audio file <code>KoM13RvBHrk_1747853615886.mp3</code> with the "Chords and Beat Mapping" workflow.
        </p>
        
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
          onClick={testWithSpecificAudio}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Test with Specific Audio'}
        </button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {lyrics && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Lyrics Display</h2>
          <div className="bg-white p-4 rounded-lg shadow">
            <LeadSheetDisplay
              lyrics={lyrics}
              currentTime={currentTime}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
            />
          </div>
        </div>
      )}
      
      {result && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">API Result</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
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
