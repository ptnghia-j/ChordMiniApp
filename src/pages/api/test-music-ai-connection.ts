import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

/**
 * API endpoint to test the Music.ai API connection
 * This endpoint will:
 * 1. Try to connect to the Music.ai API
 * 2. List available workflows
 * 3. Return the connection status and available workflows
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Testing Music.ai API connection...');

    // Get the API key from environment variables
    const apiKey = process.env.MUSIC_AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Music.ai API key not found in environment variables' });
    }

    console.log(`Using API key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);

    // Try multiple possible API endpoints
    const possibleEndpoints = [
      'https://api.music.ai/api/workflows',
      'https://api.music.ai/workflows',
      'https://api.music.ai/api/v1/workflows',
      'https://api.music.ai/v1/workflows',
      'https://music.ai/api/workflows'
    ];

    let workflows = [];
    let successfulEndpoint = '';
    let lastError = null;

    // Try each endpoint until one works
    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);

        const response = await axios.get(endpoint, {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 seconds
        });

        if (response.status === 200 && response.data) {
          console.log(`Successfully connected to: ${endpoint}`);
          console.log(`Response:`, response.data);

          workflows = response.data;
          successfulEndpoint = endpoint;
          break;
        }
      } catch (error) {
        console.log(`Endpoint ${endpoint} failed:`, error.message);
        lastError = error;
      }
    }

    // If we found a working endpoint, return the workflows
    if (successfulEndpoint) {
      return res.status(200).json({
        success: true,
        message: `Successfully connected to Music.ai API at ${successfulEndpoint}`,
        workflows
      });
    }

    // If all endpoints failed, try the SDK's endpoint
    try {
      console.log('Trying SDK endpoint...');

      const response = await axios.get('https://api.music.ai/api/job', {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 seconds
      });

      console.log('SDK endpoint response:', response.status, response.data);

      return res.status(200).json({
        success: true,
        message: 'Successfully connected to Music.ai API using SDK endpoint',
        jobs: response.data
      });
    } catch (error) {
      console.log('SDK endpoint failed:', error.message);

      // If all endpoints failed, return the error
      return res.status(500).json({
        error: 'Failed to connect to Music.ai API',
        details: lastError ? lastError.message : 'Unknown error',
        possibleEndpoints
      });
    }
  } catch (error: any) {
    console.error('Error testing Music.ai API connection:', error);
    return res.status(500).json({
      error: 'Error testing Music.ai API connection',
      details: error.message
    });
  }
}
