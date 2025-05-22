import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API endpoint to test Music.ai file upload
 *
 * @deprecated This endpoint is disabled to avoid using Music.ai for unnecessary uploads
 * Please use the transcribe-lyrics endpoint directly for lyrics transcription
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({
    error: 'This endpoint is disabled to avoid unnecessary Music.ai API costs',
    message: 'Please use the /api/transcribe-lyrics endpoint directly for lyrics transcription'
  });

  /*
  // The following code is disabled to avoid using Music.ai for unnecessary uploads
  import fs from 'fs/promises';
  import path from 'path';
  import axios from 'axios';
  import { CustomMusicAiClient } from '@/services/customMusicAiClient';

  try {
    console.log('Testing Music.ai file upload...');
  */

    // Initialize the Music.ai client
    const apiKey = process.env.MUSIC_AI_API_KEY;
    if (!apiKey) {
      console.log('Music.ai API key not found in environment variables');
      console.log('Available environment variables:', Object.keys(process.env).filter(key => !key.startsWith('npm_')));

      // Use a placeholder API key for testing
      const placeholderApiKey = 'test-api-key';
      console.log(`Using placeholder API key: ${placeholderApiKey}`);

      const client = new CustomMusicAiClient({ apiKey: placeholderApiKey });

      // Return early with a message about the missing API key
      return res.status(500).json({
        error: 'Music.ai API key not found in environment variables',
        message: 'Using placeholder API key for testing. This will not work with the real API.'
      });
    }

    console.log(`Using API key from environment: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    const client = new CustomMusicAiClient({ apiKey });

    // Path to specific audio file
    const audioFile = 'KoM13RvBHrk_1747853615886.mp3';
    const audioFilePath = path.join(process.cwd(), 'public', 'audio', audioFile);
    console.log(`Reading audio file from: ${audioFilePath}`);

    // Check if the file exists
    try {
      await fs.access(audioFilePath);
    } catch (error) {
      return res.status(404).json({ error: `Audio file not found at ${audioFilePath}` });
    }

    // Read the file
    const fileData = await fs.readFile(audioFilePath);
    console.log(`Read audio file: ${audioFilePath} (${fileData.length} bytes)`);

    // Upload the file to Music.ai API
    console.log('Uploading file to Music.ai API...');

    // Try multiple approaches
    console.log('Trying multiple approaches to upload the file...');

    // Approach 1: Use our custom client
    try {
      console.log('Approach 1: Using our custom client...');

      // Get signed URLs
      const { uploadUrl, downloadUrl } = await client.getSignedUrls();
      console.log('Successfully got signed URLs:');
      console.log(`- Upload URL: ${uploadUrl}`);
      console.log(`- Download URL: ${downloadUrl}`);

      // Upload the file
      const uploadResponse = await client.uploadFile(fileData, 'audio/mpeg');
      console.log(`File uploaded successfully. Download URL: ${uploadResponse}`);

      // Return the download URL
      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully using our custom client',
        downloadUrl: uploadResponse,
        approach: 'custom-client'
      });
    } catch (customClientError: any) {
      console.error('Error using custom client:', customClientError.message);

      // Approach 2: Try direct API calls
      try {
        console.log('Approach 2: Using direct API calls...');

        // Try multiple possible API endpoints
        const possibleEndpoints = [
          'https://api.music.ai/api/upload',
          'https://api.music.ai/upload',
          'https://api.music.ai/api/v1/upload',
          'https://api.music.ai/v1/upload',
          'https://music.ai/api/upload'
        ];

        let uploadUrl = '';
        let downloadUrl = '';
        let successfulEndpoint = '';

        // Try each endpoint until one works
        for (const endpoint of possibleEndpoints) {
          try {
            console.log(`Trying endpoint: ${endpoint}`);

            // According to the documentation, we should use GET
            const response = await axios.get(endpoint, {
              headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 seconds
            });

            if (response.status === 200 && response.data && response.data.uploadUrl && response.data.downloadUrl) {
              console.log(`Successfully got signed URLs from: ${endpoint}`);
              console.log(`Upload URL: ${response.data.uploadUrl}`);
              console.log(`Download URL: ${response.data.downloadUrl}`);

              uploadUrl = response.data.uploadUrl;
              downloadUrl = response.data.downloadUrl;
              successfulEndpoint = endpoint;
              break;
            } else {
              console.log(`Endpoint ${endpoint} returned unexpected response:`, response.data);
            }
          } catch (error) {
            console.log(`Endpoint ${endpoint} failed:`, error.message);
          }
        }

        // If we couldn't get signed URLs, throw an error
        if (!uploadUrl || !downloadUrl) {
          throw new Error('Failed to get signed URLs from any endpoint');
        }

        // Upload the file to the signed URL
        console.log(`Uploading file to: ${uploadUrl}`);

        const uploadResponse = await axios.put(uploadUrl, fileData, {
          headers: {
            'Content-Type': 'audio/mpeg'
          },
          timeout: 30000 // 30 seconds
        });

        console.log(`Upload response status: ${uploadResponse.status}`);

        if (uploadResponse.status >= 200 && uploadResponse.status < 300) {
          console.log('File uploaded successfully');

          return res.status(200).json({
            success: true,
            message: 'File uploaded successfully using direct API calls',
            endpoint: successfulEndpoint,
            uploadUrl,
            downloadUrl,
            approach: 'direct-api'
          });
        } else {
          throw new Error(`Failed to upload file: ${uploadResponse.status}`);
        }
      } catch (directApiError: any) {
        console.error('Error using direct API calls:', directApiError.message);

        // Both approaches failed, return detailed error information
        return res.status(500).json({
          error: 'All upload approaches failed',
          customClientError: {
            message: customClientError.message,
            response: customClientError.response?.data || null,
            status: customClientError.response?.status || null
          },
          directApiError: {
            message: directApiError.message,
            response: directApiError.response?.data || null,
            status: directApiError.response?.status || null
          }
        });
      }
    }
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Unexpected error', details: error.message });
  }
}
*/
