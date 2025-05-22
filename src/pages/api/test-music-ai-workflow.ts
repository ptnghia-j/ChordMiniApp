import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API endpoint to test a specific Music.ai workflow
 *
 * @deprecated This endpoint is disabled to avoid using Music.ai for chord and beat detection
 * Please use the local chord and beat detection models instead, and only use Music.ai for lyrics transcription
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check if the workflow is for lyrics transcription
  const { workflow } = req.query;

  if (workflow === 'untitled-workflow-1b8940f' || workflow === 'untitled-workflow-1b8813b') {
    // Allow only lyrics transcription workflows
    return res.status(200).json({
      message: 'This endpoint only supports lyrics transcription workflows. Please use the /api/transcribe-lyrics endpoint instead.'
    });
  }

  // Block all other workflows
  return res.status(403).json({
    error: 'This endpoint is disabled to avoid unnecessary Music.ai API costs',
    message: 'Please use the local chord and beat detection models instead, and only use Music.ai for lyrics transcription'
  });

  /*
  // The following code is disabled to avoid using Music.ai for chord and beat detection
  import path from 'path';
  import { CustomMusicAiClient } from '@/services/customMusicAiClient';
  import fs from 'fs/promises';

  try {
    console.log('Testing Music.ai workflow...');

    // Get the workflow slug from the query parameters
    const { workflow, params } = req.query;

    if (!workflow) {
      return res.status(400).json({ error: 'Missing workflow parameter' });
    }

    console.log(`Using workflow: ${workflow}`);
  */

    // Parse additional parameters if provided
    let additionalParams = {};
    if (params) {
      try {
        additionalParams = JSON.parse(params as string);
        console.log('Using additional parameters:', additionalParams);
      } catch (error) {
        console.error('Error parsing params:', error);
        return res.status(400).json({ error: 'Invalid params format. Must be a valid JSON string.' });
      }
    }

    // Initialize the Music.ai client
    const apiKey = process.env.MUSIC_AI_API_KEY;
    if (!apiKey) {
      console.log('Music.ai API key not found in environment variables');
      console.log('Available environment variables:', Object.keys(process.env).filter(key => !key.startsWith('npm_')));
      return res.status(500).json({ error: 'Music.ai API key not found in environment variables' });
    }

    console.log(`Using API key from environment: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    const client = new CustomMusicAiClient({ apiKey });

    // Path to sample audio file
    const sampleFilePath = path.join(process.cwd(), 'public', 'audio', 'sample.mp3');
    console.log(`Reading sample file from: ${sampleFilePath}`);

    // Check if the file exists
    try {
      await fs.access(sampleFilePath);
    } catch (error) {
      return res.status(404).json({ error: `Sample file not found at ${sampleFilePath}` });
    }

    // Read the file
    const fileData = await fs.readFile(sampleFilePath);
    console.log(`Read sample file: ${sampleFilePath} (${fileData.length} bytes)`);

    // Upload the file to Music.ai API
    console.log('Uploading file to Music.ai API...');

    try {
      // Upload the file
      const downloadUrl = await client.uploadFile(fileData, 'audio/mpeg');
      console.log(`File uploaded successfully. Download URL: ${downloadUrl}`);

      // Create a job with the specified workflow
      console.log(`Creating job with workflow: ${workflow}`);

      // Prepare job parameters
      const jobParams = {
        input: downloadUrl,
        ...additionalParams
      };

      console.log('Job parameters:', jobParams);

      // Create the job
      const jobId = await client.addJob(workflow as string, jobParams);
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
