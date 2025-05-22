import React, { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

/**
 * Test page for Music.ai API file upload
 * This page allows you to:
 * 1. Test the Music.ai API file upload process
 * 2. View the results of the API call
 */
export default function TestMusicAiUpload() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  
  // Test the Music.ai API file upload
  const testUpload = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.get('/api/test-music-ai-upload');
      setResult(response.data);
    } catch (error: any) {
      console.error('Error testing Music.ai API file upload:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
      setResult(error.response?.data || null);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Test Music.ai API File Upload</h1>
      
      <div className="mb-8">
        <p className="mb-4">
          This test will upload the specific audio file <code>KoM13RvBHrk_1747853615886.mp3</code> to the Music.ai API.
        </p>
        
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
          onClick={testUpload}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Test Upload'}
        </button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
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
