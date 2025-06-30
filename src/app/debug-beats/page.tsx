'use client';

import { useState } from 'react';

export default function DebugBeatsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const testBeatDetection = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('🧪 Testing beat detection with file:', file.name);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('detector', 'beat-transformer');

      const response = await fetch('/api/detect-beats', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔍 Beat detection response:', data);
      setResult(data);

    } catch (err) {
      console.error('❌ Beat detection test failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Beat Detection Debug Tool</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Audio File</h2>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="mb-4 block w-full text-sm text-gray-300
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-600 file:text-white
                     hover:file:bg-blue-700"
          />
          
          {file && (
            <div className="mb-4">
              <p className="text-sm text-gray-400">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            </div>
          )}
          
          <button
            onClick={testBeatDetection}
            disabled={!file || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                     px-4 py-2 rounded font-semibold"
          >
            {loading ? 'Testing...' : 'Test Beat Detection'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Error</h3>
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Beat Detection Results</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold mb-2">Basic Info</h4>
                <p>Success: {String(result.success) === 'true' ? '✅' : '❌'}</p>
                <p>BPM: {String(result.BPM || result.bpm || 'N/A')}</p>
                <p>Duration: {String(result.duration || 'N/A')}s</p>
                <p>Time Signature: {String(result.time_signature || 'N/A')}</p>
                <p>Model: {String(result.model_used || result.model || 'N/A')}</p>
              </div>
              
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold mb-2">Beat Analysis</h4>
                <p>Beats Found: {Array.isArray(result.beats) ? result.beats.length : 0}</p>
                <p>Beats Type: {typeof result.beats}</p>
                <p>Is Array: {Array.isArray(result.beats) ? '✅' : '❌'}</p>
                <p>Total Beats: {String(result.total_beats || 'N/A')}</p>
                <p>Downbeats: {Array.isArray(result.downbeats) ? result.downbeats.length : 0}</p>
              </div>
            </div>

            {result.beats && Array.isArray(result.beats) ? (
              <div className="mb-6">
                <h4 className="font-semibold mb-2">Beat Analysis</h4>
                {(result.beats as unknown[]).length === 1 ? (
                  <div className="bg-red-900 border border-red-700 p-4 rounded">
                    <p className="text-red-300 font-semibold">🚨 CRITICAL BUG DETECTED!</p>
                    <p>Only 1 beat returned: {String((result.beats as unknown[])[0])}</p>
                    <p>Expected beats for {String(result.duration || 0)}s at {String(result.BPM || result.bpm || 120)} BPM:
                       ~{Math.round((Number(result.duration) || 0) * (Number(result.BPM || result.bpm) || 120) / 60)}</p>
                  </div>
                ) : (
                  <div className="bg-green-900 border border-green-700 p-4 rounded">
                    <p className="text-green-300">✅ Beat detection appears normal</p>
                    <p>First 10 beats: [{(result.beats as unknown[]).slice(0, 10).map(String).join(', ')}]</p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="bg-gray-700 p-4 rounded">
              <h4 className="font-semibold mb-2">Full Response</h4>
              <pre className="text-xs overflow-auto max-h-96 bg-gray-900 p-3 rounded">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
