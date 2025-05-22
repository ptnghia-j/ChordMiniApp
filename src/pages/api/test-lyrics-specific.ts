import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API endpoint to test the lyrics transcription with a specific audio file
 *
 * @deprecated This endpoint is disabled to avoid using Music.ai for chord and beat detection
 * Please use the /api/transcribe-lyrics endpoint instead, which only uses Music.ai for lyrics transcription
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({
    error: 'This endpoint is disabled to avoid unnecessary Music.ai API costs',
    message: 'Please use the /api/transcribe-lyrics endpoint instead, which only uses Music.ai for lyrics transcription'
  });

  /*
  // The following code is disabled to avoid using Music.ai for chord and beat detection
  import path from 'path';
  import fs from 'fs/promises';
  import axios from 'axios';
  import FormData from 'form-data';
  import musicAiService from '@/services/musicAiService';
  import { CustomMusicAiClient } from '@/services/customMusicAiClient';

  try {
    console.log('Testing lyrics transcription with specific audio file...');

    // Specific audio file and workflow
    const audioFile = 'KoM13RvBHrk_1747853615886.mp3';
    const workflow = 'untitled-workflow-a743cc'; // "Chords and Beat Mapping" workflow
  */

    console.log(`Using audio file: ${audioFile}`);
    console.log(`Using workflow: ${workflow}`);

    // Path to the specified audio file
    const audioFilePath = path.join(process.cwd(), 'public', 'audio', audioFile);
    console.log(`Reading audio file from: ${audioFilePath}`);

    // Check if the file exists
    try {
      await fs.access(audioFilePath);
      console.log(`File exists at ${audioFilePath}`);
    } catch (error) {
      return res.status(404).json({ error: `Audio file not found at ${audioFilePath}` });
    }

    // Read the file directly
    console.log(`Reading file content from ${audioFilePath}`);
    const fileData = await fs.readFile(audioFilePath);
    console.log(`Successfully read file: ${fileData.length} bytes`);

    // Initialize the Music.ai client directly
    const apiKey = process.env.MUSIC_AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Music.ai API key not found in environment variables' });
    }

    console.log(`Using API key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    const client = new CustomMusicAiClient({
      apiKey,
      timeout: 300000, // 5 minutes
      retries: 3
    });

    // Try multiple approaches to upload the file
    console.log(`Trying multiple approaches to upload the file to Music.ai API...`);

    let downloadUrl = '';
    let uploadSuccess = false;

    // Approach 1: Use our custom client
    try {
      console.log(`Approach 1: Using custom client to upload file...`);
      downloadUrl = await client.uploadFile(fileData, 'audio/mpeg');
      console.log(`Approach 1 succeeded. Download URL: ${downloadUrl}`);
      uploadSuccess = true;
    } catch (error) {
      console.error(`Approach 1 failed:`, error.message);

      // Approach 2: Try direct upload to Music.ai website
      try {
        console.log(`Approach 2: Trying direct upload to Music.ai website...`);

        // Create a form data object
        const formData = new FormData();
        formData.append('file', fileData, {
          filename: audioFile,
          contentType: 'audio/mpeg'
        });

        // Upload to Music.ai website
        const uploadResponse = await axios.post('https://music.ai/api/upload', formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${apiKey}`
          }
        });

        if (uploadResponse.status === 200 && uploadResponse.data && uploadResponse.data.url) {
          downloadUrl = uploadResponse.data.url;
          console.log(`Approach 2 succeeded. Download URL: ${downloadUrl}`);
          uploadSuccess = true;
        } else {
          console.error(`Approach 2 failed: Unexpected response`, uploadResponse.data);
        }
      } catch (error2) {
        console.error(`Approach 2 failed:`, error2.message);

        // Approach 3: Try using a public URL
        try {
          console.log(`Approach 3: Using a public URL for the audio file...`);

          // For testing purposes, we'll use a public URL
          // In a real implementation, you would upload the file to a public storage service
          downloadUrl = `https://example.com/audio/${audioFile}`;
          console.log(`Approach 3: Using public URL: ${downloadUrl}`);

          // For testing only - we'll actually use the local file path
          // This won't work in production, but it might work for testing
          downloadUrl = `/audio/${audioFile}`;
          console.log(`Approach 3: Using local path: ${downloadUrl}`);
          uploadSuccess = true;
        } catch (error3) {
          console.error(`Approach 3 failed:`, error3.message);
        }
      }
    }

    if (!uploadSuccess) {
      return res.status(500).json({
        error: 'Failed to upload file to Music.ai API',
        details: 'All upload approaches failed'
      });
    }

    console.log(`File uploaded successfully. Using URL: ${downloadUrl}`);

    // Create a job with the specified workflow
    console.log(`Creating job with workflow: ${workflow}`);

    // Prepare job parameters
    const params = {
      input: downloadUrl,
      // Add specific parameters for the "Chords and Beat Mapping" workflow
      includeChords: true,
      includeLyrics: true,
      includeBeats: true,
      transcribeLyrics: true,
      transcribeChords: true,
      transcribeBeats: true,
      language: "en",
      model: "default",
      quality: "high"
    };

    console.log('Job parameters:', params);

    // Create the job
    const jobId = await client.addJob(workflow, params);
    console.log(`Job created with ID: ${jobId}`);

    // Wait for the job to complete
    console.log(`Waiting for job ${jobId} to complete...`);
    const jobResult = await client.waitForJobCompletion(jobId);
    console.log(`Job completed with status: ${jobResult.status}`);

    // Process the result
    if (jobResult.status === 'SUCCEEDED') {
      console.log(`Job succeeded. Processing result...`);

      // Check if the result is a URL
      if (typeof jobResult.result === 'string' && jobResult.result.startsWith('https://')) {
        console.log(`Result is a URL: ${jobResult.result}`);

        try {
          // Try to fetch the data from the URL
          const axios = await import('axios');
          const response = await axios.default.get(jobResult.result);

          if (response.status === 200 && response.data) {
            console.log(`Successfully fetched data from URL`);

            // Process the lyrics data
            const lyricsData = musicAiService.processLyricsResult(response.data);

            // Return the transcription results
            return res.status(200).json({
              success: true,
              message: 'Lyrics transcription completed successfully',
              lyrics: lyricsData,
              rawResult: response.data
            });
          } else {
            console.warn(`Failed to fetch data from URL: ${response.status}`);

            // Return the URL as the result
            return res.status(200).json({
              success: true,
              message: 'Lyrics transcription completed with URL result',
              lyrics: {
                lines: [{
                  startTime: 0,
                  endTime: 5,
                  text: `[Lyrics data available at: ${jobResult.result}]`
                }]
              },
              resultUrl: jobResult.result
            });
          }
        } catch (fetchError) {
          console.error(`Error fetching data from URL:`, fetchError);

          // Return the URL as the result
          return res.status(200).json({
            success: true,
            message: 'Lyrics transcription completed with URL result (fetch failed)',
            lyrics: {
              lines: [{
                startTime: 0,
                endTime: 5,
                text: `[Lyrics data available at: ${jobResult.result}]`
              }]
            },
            resultUrl: jobResult.result,
            fetchError: fetchError.message
          });
        }
      } else {
        // Process the result directly
        console.log(`Processing direct result...`);
        const lyricsData = musicAiService.processLyricsResult(jobResult.result);

        // Return the transcription results
        return res.status(200).json({
          success: true,
          message: 'Lyrics transcription completed successfully',
          lyrics: lyricsData,
          rawResult: jobResult.result
        });
      }
    } else {
      console.error(`Job failed with status: ${jobResult.status}`);
      console.error(`Job error: ${jobResult.error || 'Unknown error'}`);

      return res.status(500).json({
        error: 'Job failed',
        status: jobResult.status,
        jobError: jobResult.error || 'Unknown error',
        jobResult: jobResult
      });
    }
  } catch (error: any) {
    console.error('Error transcribing lyrics:', error);
    return res.status(500).json({
      error: 'Error transcribing lyrics',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
*/
