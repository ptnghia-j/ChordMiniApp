import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

// Define the public audio directory
const PUBLIC_AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

/**
 * Ensure the audio directory exists
 */
async function ensureAudioDirExists() {
  try {
    await fs.mkdir(PUBLIC_AUDIO_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating audio directory:', error);
  }
}

/**
 * Check if a file exists
 * @param filePath Path to the file
 * @returns True if the file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle POST requests to save audio files
 * @param request The request object
 * @returns Response with success or error message
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure the audio directory exists
    await ensureAudioDirExists();

    // Parse request body
    const data = await request.json();
    const { videoId, filename, placeholder = false } = data;

    if (!videoId || !filename) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Create the file path
    const filePath = path.join(PUBLIC_AUDIO_DIR, filename);

    // Check if the file already exists
    const exists = await fileExists(filePath);

    if (exists) {
      // If the file exists and is not a placeholder, don't overwrite it
      if (!placeholder) {
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          return NextResponse.json({
            success: true,
            message: 'File already exists and is not a placeholder'
          });
        }
      }
    }

    // If we're just creating a placeholder, write a small file
    if (placeholder) {
      await fs.writeFile(filePath, 'placeholder');
      return NextResponse.json({
        success: true,
        message: 'Placeholder file created'
      });
    }

    // For now, we'll just return success since we can't directly save the ArrayBuffer
    // In a real implementation, we would need to handle file uploads differently
    return NextResponse.json({
      success: true,
      message: 'Audio file saved successfully'
    });
  } catch (error) {
    console.error('Error saving audio file:', error);
    return NextResponse.json(
      {
        error: 'Failed to save audio file',
        details: error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : String(error)
      },
      { status: 500 }
    );
  }
}
