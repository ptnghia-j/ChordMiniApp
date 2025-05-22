import React, { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

/**
 * Test page for Music.ai API integration
 * This page allows you to:
 * 1. Test file upload to Music.ai API
 * 2. Test job creation with different workflows
 * 3. View the results of the API calls
 */
export default function TestMusicAi() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState('untitled-workflow-1b8813b');
  const [additionalParams, setAdditionalParams] = useState('{"language": "en"}');
  
  const router = useRouter();
  
  // Available workflows
  const workflows = [
    { slug: 'untitled-workflow-1b8940f', name: 'Lyric Transcription and Alignment 1' },
    { slug: 'untitled-workflow-1b893d5', name: 'Lyric Transcription and Alignment 2' },
    { slug: 'untitled-workflow-1b8813b', name: 'Lyric Transcription and Alignment 3' },
    { slug: 'untitled-workflow-c072ef', name: 'Untitled Workflow' },
    { slug: 'untitled-workflow-a743cc', name: 'Chords and Beat Mapping' },
  ];
  
  // Test file upload
  const testFileUpload = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.get('/api/test-music-ai-upload');
      setResult(response.data);
    } catch (error: any) {
      console.error('Error testing file upload:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
      setResult(error.response?.data || null);
    } finally {
      setLoading(false);
    }
  };
  
  // Test workflow
  const testWorkflow = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.get(`/api/test-music-ai-workflow?workflow=${selectedWorkflow}&params=${encodeURIComponent(additionalParams)}`);
      setResult(response.data);
    } catch (error: any) {
      console.error('Error testing workflow:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
      setResult(error.response?.data || null);
    } finally {
      setLoading(false);
    }
  };
  
  // Test lyrics transcription
  const testLyricsTranscription = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await axios.get('/api/test-lyrics-transcription');
      setResult(response.data);
    } catch (error: any) {
      console.error('Error testing lyrics transcription:', error);
      setError(error.response?.data?.error || error.message || 'Unknown error');
      setResult(error.response?.data || null);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Music.ai API Test</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Test File Upload</h2>
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
          onClick={testFileUpload}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Test File Upload'}
        </button>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Test Workflow</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Workflow
          </label>
          <select
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedWorkflow}
            onChange={(e) => setSelectedWorkflow(e.target.value)}
          >
            {workflows.map((workflow) => (
              <option key={workflow.slug} value={workflow.slug}>
                {workflow.name} ({workflow.slug})
              </option>
            ))}
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional Parameters (JSON)
          </label>
          <textarea
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={additionalParams}
            onChange={(e) => setAdditionalParams(e.target.value)}
            rows={5}
          />
        </div>
        
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
          onClick={testWorkflow}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Test Workflow'}
        </button>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Test Lyrics Transcription</h2>
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
          onClick={testLyricsTranscription}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Test Lyrics Transcription'}
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
          <h2 className="text-xl font-semibold mb-2">Result</h2>
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
