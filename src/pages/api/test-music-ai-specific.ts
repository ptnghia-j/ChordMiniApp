import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API endpoint to test the Music.ai API with the specific audio file
 *
 * @deprecated This endpoint is disabled to avoid using Music.ai for chord and beat detection
 * Please use the local chord and beat detection models instead
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({
    error: 'This endpoint is disabled to avoid unnecessary Music.ai API costs',
    message: 'Please use the local chord and beat detection models instead'
  });

  /*
  // The following code is disabled to avoid using Music.ai for chord and beat detection
  import path from 'path';
  import { CustomMusicAiClient } from '@/services/customMusicAiClient';
  import fs from 'fs/promises';

  try {
    console.log('Testing Music.ai API with specific audio file...');

    // Specific audio file and workflow
    const audioFile = 'KoM13RvBHrk_1747853615886.mp3';
    const workflow = 'untitled-workflow-a743cc'; // "Chords and Beat Mapping" workflow

    console.log(`Using audio file: ${audioFile}`);
    console.log(`Using workflow: ${workflow}`);
  */

    // Initialize the Music.ai client
    const apiKey = process.env.MUSIC_AI_API_KEY;
    if (!apiKey) {
      console.log('Music.ai API key not found in environment variables');
      console.log('Available environment variables:', Object.keys(process.env).filter(key => !key.startsWith('npm_')));
      return res.status(500).json({ error: 'Music.ai API key not found in environment variables' });
    }

    console.log(`Using API key from environment: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    const client = new CustomMusicAiClient({
      apiKey,
      timeout: 300000, // 5 minutes
      retries: 3
    });

    // Path to the specified audio file
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

    try {
      // Upload the file
      const downloadUrl = await client.uploadFile(fileData, 'audio/mpeg');
      console.log(`File uploaded successfully. Download URL: ${downloadUrl}`);

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

      // Return the job result
      return res.status(200).json({
        success: true,
        message: 'Job completed successfully',
        jobId,
        result: jobResult
      });
    } catch (error: any) {
      console.error('Error processing job:', error);

      // Return detailed error information
      return res.status(500).json({
        error: 'Error processing job',
        details: error.message,
        response: error.response?.data || null,
        status: error.response?.status || null
      });
    }
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Unexpected error', details: error.message });
  }
}
*/
