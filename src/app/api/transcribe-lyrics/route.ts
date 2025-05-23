import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import musicAiService from '@/services/musicAiService';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseApp, saveLyricsToFirestore } from '@/services/firebaseService';

/**
 * API route to transcribe lyrics from an audio file
 * This route will:
 * 1. Check if lyrics are already cached in Firestore
 * 2. If not, transcribe lyrics using the Music.ai API
 * 3. Cache the results in Firestore
 * 4. Return the transcription results
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { videoId, audioPath, forceRefresh } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Initialize Firestore
    const db = getFirestore(firebaseApp);

    // Check if lyrics are already cached in Firestore (unless forceRefresh is true)
    const lyricsDocRef = doc(db, 'lyrics', videoId);
    const lyricsDoc = await getDoc(lyricsDocRef);

    // If lyrics are cached and forceRefresh is not true, return them
    if (lyricsDoc.exists() && !forceRefresh) {
      console.log(`Found cached lyrics for video ID: ${videoId}`);
      const cachedData = lyricsDoc.data();

      // Process the cached data to ensure it's in the correct format
      try {
        // Check if the cached data itself is a URL string
        if (typeof cachedData === 'string' && cachedData.startsWith('http')) {
          console.log(`Cached data is a direct URL string: ${cachedData}`);
          const processedLyrics = await musicAiService.processLyricsResult(cachedData);
          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache and processed',
            lyrics: processedLyrics,
            cached: true
          });
        }
        // If the cached data contains a URL instead of actual lyrics lines, fetch and process it
        else if (cachedData.lyrics && typeof cachedData.lyrics === 'string' && cachedData.lyrics.startsWith('http')) {
          console.log(`Cached lyrics contains a URL, fetching and processing: ${cachedData.lyrics}`);
          const processedLyrics = await musicAiService.processLyricsResult(cachedData.lyrics);
          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache and processed',
            lyrics: processedLyrics,
            cached: true
          });
        }
        // If the cached data already has lines property, ensure it has the correct format
        else if (cachedData.lines) {
          console.log(`Cached lyrics already has lines property with ${cachedData.lines.length} lines`);
          // Make sure each line has a chords array
          const processedLines = cachedData.lines.map((line: any) => ({
            ...line,
            chords: line.chords || []
          }));

          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache',
            lyrics: { lines: processedLines },
            cached: true
          });
        }
        // Otherwise, return the cached data as is
        else {
          console.log(`Returning cached lyrics data as is`);
          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache',
            lyrics: cachedData,
            cached: true
          });
        }
      } catch (error) {
        console.error('Error processing cached lyrics:', error);
        // If processing fails, try to return the original data
        return NextResponse.json({
          success: true,
          message: 'Lyrics retrieved from cache (unprocessed)',
          lyrics: cachedData,
          cached: true,
          processingError: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (forceRefresh && lyricsDoc.exists()) {
      console.log(`Force refreshing lyrics for video ID: ${videoId}`);
    }

    // If no audio path is provided, use the default path
    let finalAudioPath = audioPath;
    if (!finalAudioPath) {
      // Check if we have a specific audio file for this video ID
      const audioDir = path.join(process.cwd(), 'public', 'audio');
      try {
        const files = await fs.readdir(audioDir);
        const matchingFile = files.find(file => file.startsWith(`${videoId}_`));

        if (matchingFile) {
          finalAudioPath = `/audio/${matchingFile}`;
        } else {
          return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
        }
      } catch (error) {
        console.error('Error reading audio directory:', error);
        return NextResponse.json({ error: 'Error reading audio directory' }, { status: 500 });
      }
    }

    console.log(`Transcribing lyrics from audio: ${finalAudioPath}`);

    // Use the "Lyric Transcription and Alignment" workflow for lyrics transcription
    const workflow = 'untitled-workflow-1b8940f';

    // Transcribe lyrics (Music.ai is only used for lyrics transcription in our app)
    const lyricsData = await musicAiService.transcribeLyrics(finalAudioPath, workflow);

    // Check if transcription was successful
    if (lyricsData.error) {
      console.error('Transcription failed:', lyricsData.error);
      return NextResponse.json({
        error: 'Lyrics transcription failed',
        details: lyricsData.error
      }, { status: 500 });
    }

    // Cache the results in Firestore (non-critical operation)
    try {
      // Use our helper function from firebaseService
      await saveLyricsToFirestore(videoId, lyricsData);
      console.log(`Cached lyrics for video ID: ${videoId}`);
    } catch (cacheError) {
      console.error('Error caching lyrics:', cacheError);
      // Continue even if caching fails - this is non-critical
    }

    // Return the transcription results
    return NextResponse.json({
      success: true,
      message: 'Lyrics transcribed successfully',
      lyrics: lyricsData,
      cached: false
    });
  } catch (error: any) {
    console.error('Error transcribing lyrics:', error);
    return NextResponse.json({
      error: 'Error transcribing lyrics',
      details: error.message
    }, { status: 500 });
  }
}
