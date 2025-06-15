import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs/promises';
import musicAiService from '@/services/musicAiService';

/**
 * API endpoint to test the lyrics transcription with a specific audio file
 * This endpoint will:
 * 1. Use the specific audio file "KoM13RvBHrk_1747853615886.mp3"
 * 2. Transcribe lyrics using the "Chords and Beat Mapping" workflow
 * 3. Return the transcription results
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Testing lyrics transcription with specific audio file...');

    // Specific audio file and workflow
    const audioFile = 'KoM13RvBHrk_1747853615886.mp3';
    const workflow = 'untitled-workflow-a743cc'; // "Chords and Beat Mapping" workflow

    console.log(`Using audio file: ${audioFile}`);
    console.log(`Using workflow: ${workflow}`);

    // Path to the specified audio file
    const audioFilePath = path.join(process.cwd(), 'public', 'audio', audioFile);
    console.log(`Reading audio file from: ${audioFilePath}`);

    // Check if the file exists
    try {
      await fs.access(audioFilePath);
      console.log(`File exists at ${audioFilePath}`);
    } catch {
      return res.status(404).json({ error: `Audio file not found at ${audioFilePath}` });
    }

    // We're using the singleton instance of MusicAiService
    const service = musicAiService;

    // Transcribe lyrics
    console.log('Transcribing lyrics...');
    const transcription = await service.transcribeLyrics(`/audio/${audioFile}`, workflow);

    // Check if transcription was successful
    if (transcription.error) {
      console.error('Transcription failed:', transcription.error);
      return res.status(500).json({
        error: 'Lyrics transcription failed',
        details: transcription.error
      });
    }

    // Return the transcription results
    return res.status(200).json({
      success: true,
      message: 'Lyrics transcribed successfully',
      transcription
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
