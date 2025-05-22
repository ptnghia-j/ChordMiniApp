import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';

/**
 * API endpoint to check if an audio file exists for a given video ID
 * This endpoint will:
 * 1. Check if an audio file exists in the public/audio directory
 * 2. Return the result of the check
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the video ID from the query parameters
    const { videoId } = req.query;
    
    if (!videoId || typeof videoId !== 'string') {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    // Path to the audio directory
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    
    try {
      // Check if the directory exists
      await fs.access(audioDir);
    } catch (error) {
      // If the directory doesn't exist, create it
      await fs.mkdir(audioDir, { recursive: true });
      console.log(`Created audio directory: ${audioDir}`);
      
      // Since we just created the directory, the file doesn't exist
      return res.status(200).json({ exists: false });
    }
    
    // Get all files in the directory
    const files = await fs.readdir(audioDir);
    
    // Check if any file starts with the video ID
    const fileExists = files.some(file => file.startsWith(`${videoId}_`));
    
    // If a specific file is requested, check if it exists
    if (req.query.filename && typeof req.query.filename === 'string') {
      const specificFile = req.query.filename;
      const specificFilePath = path.join(audioDir, specificFile);
      
      try {
        await fs.access(specificFilePath);
        return res.status(200).json({ 
          exists: true,
          path: `/audio/${specificFile}`
        });
      } catch (error) {
        return res.status(200).json({ exists: false });
      }
    }
    
    // Return the result
    return res.status(200).json({ 
      exists: fileExists,
      // If the file exists, return the path to the first matching file
      path: fileExists 
        ? `/audio/${files.find(file => file.startsWith(`${videoId}_`))}`
        : null
    });
  } catch (error: any) {
    console.error('Error checking if audio exists:', error);
    return res.status(500).json({ 
      error: 'Error checking if audio exists', 
      details: error.message 
    });
  }
}
