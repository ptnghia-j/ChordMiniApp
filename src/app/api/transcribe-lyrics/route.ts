import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import musicAiService from '@/services/lyrics/musicAiService';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebase/firebaseService';

interface CachedLyricsData {
  lyrics?: string;
  lines?: Array<{ chords?: unknown[] }>;
  [key: string]: unknown;
}

/**
 * API route to transcribe lyrics from an audio file
 * This route will:
 * 1. Check if lyrics are already cached in Firestore
 * 2. If not, transcribe lyrics using the Music.ai API
 * 3. Cache the results in Firestore
 * 4. Return the transcription results
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// Lyrics transcription is moderate ML processing
export const maxDuration = 300; // 5 minutes for lyrics processing
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { videoId, audioPath, forceRefresh, checkCacheOnly, musicAiApiKey } = body;

    console.log('🎵 [API] /api/transcribe-lyrics called');
    console.log('🎵 [API] Timestamp:', new Date().toISOString());
    console.log('🎵 [API] Request body analysis:', {
      videoId,
      audioPath,
      audioPathType: typeof audioPath,
      audioPathLength: audioPath?.length,
      forceRefresh,
      checkCacheOnly,
      musicAiApiKey: musicAiApiKey ? musicAiApiKey.substring(0, 8) + '...' : 'NOT_PROVIDED',
      isFirebaseUrl: audioPath?.includes('firebasestorage.googleapis.com'),
      hasAudioPath: !!audioPath
    });

    if (!videoId) {
      console.log('❌ [API] Video ID is missing');
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log('✅ [API] Video ID provided:', videoId);

    // Initialize Firestore
    const db = getFirestore(firebaseApp);
    console.log('🔥 [API] Firestore initialized');

    // Check if lyrics are already cached in Firestore (unless forceRefresh is true)
    console.log('🔍 [API] Checking for cached lyrics in Firestore...');
    const lyricsDocRef = doc(db, 'lyrics', videoId);
    const lyricsDoc = await getDoc(lyricsDocRef);

    // If lyrics are cached and forceRefresh is not true, return them
    if (lyricsDoc.exists() && !forceRefresh) {
      console.log(`✅ [API] Found cached lyrics for video ID: ${videoId}`);
      const cachedData = lyricsDoc.data() as CachedLyricsData;
      console.log('📦 [API] Cached data structure:', {
        type: typeof cachedData,
        hasLyrics: !!cachedData?.lyrics,
        lyricsType: typeof cachedData?.lyrics,
        hasLines: !!cachedData?.lines,
        linesCount: cachedData?.lines?.length || 0
      });

      // Process the cached data to ensure it's in the correct format
      try {
        // Check if the cached data itself is a URL string
        if (typeof cachedData === 'string' && (cachedData as string).startsWith('http')) {
          console.log(`Cached data is a direct URL string: ${cachedData}`);
          const processedLyrics = await musicAiService.processLyricsResult({ lyrics: cachedData });
          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache and processed',
            lyrics: processedLyrics,
            cached: true
          });
        }
        // If the cached data contains a URL instead of actual lyrics lines, fetch and process it
        else if (cachedData && cachedData.lyrics && typeof cachedData.lyrics === 'string' && cachedData.lyrics.startsWith('http')) {
          console.log(`Cached lyrics contains a URL, fetching and processing: ${cachedData.lyrics}`);
          const processedLyrics = await musicAiService.processLyricsResult({ lyrics: cachedData.lyrics });
          return NextResponse.json({
            success: true,
            message: 'Lyrics retrieved from cache and processed',
            lyrics: processedLyrics,
            cached: true
          });
        }
        // If the cached data already has lines property, ensure it has the correct format
        else if (cachedData && cachedData.lines) {
          console.log(`Cached lyrics already has lines property with ${cachedData.lines.length} lines`);
          // Make sure each line has a chords array
          const processedLines = cachedData.lines.map((line: { chords?: unknown[] }) => ({
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

    // If checkCacheOnly is true and no cache was found, return early
    if (checkCacheOnly) {
      console.log(`📦 [API] Cache-only check for video ID: ${videoId} - no cached lyrics found`);
      return NextResponse.json({
        success: false,
        message: 'No cached lyrics found',
        cached: false
      });
    }

    console.log('🎵 [API] Proceeding with new transcription request');

    // For non-cache-only requests, audioPath is required
    if (!audioPath) {
      console.log('❌ [API] audioPath is required for transcription requests (non-cache-only)');
      return NextResponse.json({
        error: 'Audio file not found. Please extract audio first.',
        details: 'audioPath is required for transcription requests'
      }, { status: 404 });
    }

    if (forceRefresh && lyricsDoc.exists()) {
      console.log(`Force refreshing lyrics for video ID: ${videoId}`);
    }

    // Handle audio path - prioritize provided audioPath (Firebase Storage URL)
    console.log('🎵 [API] Audio path analysis:');
    console.log('  - Received audioPath:', audioPath);
    console.log('  - audioPath type:', typeof audioPath);
    console.log('  - audioPath length:', audioPath?.length);
    console.log('  - Is null/undefined:', audioPath == null);
    console.log('  - Is empty string:', audioPath === '');

    let finalAudioPath = audioPath;

    // If audioPath is provided and looks like a Firebase Storage URL, use it directly
    if (finalAudioPath && (finalAudioPath.startsWith('https://firebasestorage.googleapis.com') || finalAudioPath.startsWith('https://storage.googleapis.com'))) {
      console.log(`✅ [API] Using Firebase Storage URL for transcription: ${finalAudioPath}`);
      console.log('🔥 [API] Firebase Storage URL detected - should work with Music.AI');
    } else if (!finalAudioPath) {
      console.log('❌ [API] No audioPath provided, checking for local audio file...');
      // Fallback: Check if we have a local audio file for this video ID
      const audioDir = path.join(process.cwd(), 'public', 'audio');
      try {
        const files = await fs.readdir(audioDir);
        const matchingFile = files.find(file => file.startsWith(`${videoId}_`));

        if (matchingFile) {
          finalAudioPath = `/audio/${matchingFile}`;
          console.log(`📁 [API] Using local audio file: ${finalAudioPath}`);
        } else {
          console.log('❌ [API] No local audio file found either');
          return NextResponse.json({ error: 'Audio file not found. Please extract audio first.' }, { status: 404 });
        }
      } catch (error) {
        console.error('❌ [API] Error reading audio directory:', error);
        return NextResponse.json({ error: 'Error accessing audio files' }, { status: 500 });
      }
    } else {
      // audioPath provided but not a Firebase URL - treat as local path
      console.log(`📁 [API] Using provided audio path (non-Firebase): ${finalAudioPath}`);
    }

    console.log(`🎵 [API] Final audio path for transcription: ${finalAudioPath}`);

    // Check if user provided Music.AI API key
    if (!musicAiApiKey) {
      return NextResponse.json({
        error: 'Music.AI API key is required for transcription. Please add your API key in settings.'
      }, { status: 400 });
    }

    // Use the "Lyric Transcription and Alignment" workflow for lyrics transcription
    const workflow = 'untitled-workflow-1b8940f';

    // Transcribe lyrics using the musicAiService with custom API key
    const lyricsData = await musicAiService.transcribeLyrics(finalAudioPath, workflow, musicAiApiKey);

    // Validate transcription data
    if (!lyricsData || !lyricsData.lines || lyricsData.lines.length === 0) {
      console.error('Invalid transcription data:', lyricsData);
      return NextResponse.json({
        error: 'Lyrics transcription returned no data',
        details: 'The transcription completed but returned no lyrics lines'
      }, { status: 500 });
    }

    // Cache the results in Firestore (non-critical operation)
    // Use the same direct approach as translations to avoid authentication issues
    try {
      console.log('🔍 [PRODUCTION DEBUG] Starting lyrics caching process...');
      console.log('🔍 [PRODUCTION DEBUG] Video ID:', videoId, 'Length:', videoId?.length, 'Type:', typeof videoId);

      // Analyze the raw lyricsData structure
      console.log('🔍 [PRODUCTION DEBUG] Raw lyricsData analysis:');
      console.log('🔍 [PRODUCTION DEBUG] - Type:', typeof lyricsData);
      console.log('🔍 [PRODUCTION DEBUG] - Is null/undefined:', lyricsData == null);
      console.log('🔍 [PRODUCTION DEBUG] - Constructor:', lyricsData?.constructor?.name);
      console.log('🔍 [PRODUCTION DEBUG] - Keys:', Object.keys(lyricsData || {}));
      console.log('🔍 [PRODUCTION DEBUG] - Lines type:', typeof lyricsData?.lines);
      console.log('🔍 [PRODUCTION DEBUG] - Lines length:', lyricsData?.lines?.length);
      console.log('🔍 [PRODUCTION DEBUG] - Lines is array:', Array.isArray(lyricsData?.lines));

      // Sample first few lines for structure analysis
      if (lyricsData?.lines && Array.isArray(lyricsData.lines) && lyricsData.lines.length > 0) {
        console.log('🔍 [PRODUCTION DEBUG] - First line structure:', JSON.stringify(lyricsData.lines[0], null, 2));
        if (lyricsData.lines.length > 1) {
          console.log('🔍 [PRODUCTION DEBUG] - Second line structure:', JSON.stringify(lyricsData.lines[1], null, 2));
        }
      }

      const lyricsDocRef = doc(db, 'lyrics', videoId);
      console.log('🔍 [PRODUCTION DEBUG] Document reference created for collection: lyrics, document:', videoId);

      const dataWithTimestamp = {
        ...lyricsData,
        videoId,
        timestamp: new Date().toISOString(),
        cached: true,
        source: 'music-ai-transcription'
      };

      console.log('🔍 [PRODUCTION DEBUG] Final data structure analysis:');
      console.log('🔍 [PRODUCTION DEBUG] - Total fields:', Object.keys(dataWithTimestamp).length);
      console.log('🔍 [PRODUCTION DEBUG] - Field names:', Object.keys(dataWithTimestamp));
      console.log('🔍 [PRODUCTION DEBUG] - videoId:', dataWithTimestamp.videoId);
      console.log('🔍 [PRODUCTION DEBUG] - timestamp:', dataWithTimestamp.timestamp);
      console.log('🔍 [PRODUCTION DEBUG] - cached:', dataWithTimestamp.cached);
      console.log('🔍 [PRODUCTION DEBUG] - source:', dataWithTimestamp.source);
      console.log('🔍 [PRODUCTION DEBUG] - lines count:', dataWithTimestamp.lines?.length);

      // Check for any problematic field types or values
      for (const [key, value] of Object.entries(dataWithTimestamp)) {
        const valueType = typeof value;
        const isArray = Array.isArray(value);
        const isNull = value === null;
        const isUndefined = value === undefined;
        console.log(`🔍 [PRODUCTION DEBUG] - Field "${key}": type=${valueType}, isArray=${isArray}, isNull=${isNull}, isUndefined=${isUndefined}`);

        // Check for circular references or complex objects
        if (valueType === 'object' && !isArray && !isNull) {
          try {
            JSON.stringify(value);
            console.log(`🔍 [PRODUCTION DEBUG] - Field "${key}" is serializable`);
          } catch (e) {
            console.log(`🔍 [PRODUCTION DEBUG] - Field "${key}" has serialization issues:`, e instanceof Error ? e.message : String(e));
          }
        }
      }

      // Calculate approximate document size
      try {
        const jsonString = JSON.stringify(dataWithTimestamp);
        const sizeInBytes = new Blob([jsonString]).size;
        console.log('🔍 [PRODUCTION DEBUG] - Estimated document size:', sizeInBytes, 'bytes');
        console.log('🔍 [PRODUCTION DEBUG] - Size in KB:', (sizeInBytes / 1024).toFixed(2), 'KB');

        // Firestore has a 1MB document size limit
        if (sizeInBytes > 1000000) {
          console.warn('⚠️ [PRODUCTION DEBUG] - Document size exceeds 1MB limit!');
        }
      } catch (sizeError) {
        console.error('🔍 [PRODUCTION DEBUG] - Error calculating document size:', sizeError);
      }

      console.log('🔍 [PRODUCTION DEBUG] Attempting setDoc operation...');
      await setDoc(lyricsDocRef, dataWithTimestamp);
      console.log(`✅ Successfully cached lyrics for video ID: ${videoId}`);
    } catch (cacheError: unknown) {
      console.error('❌ [PRODUCTION DEBUG] Error caching lyrics - COMPREHENSIVE ERROR ANALYSIS:');
      console.error('❌ Error type:', typeof cacheError);

      const errorObj = cacheError as Error & { code?: string; details?: unknown; customData?: unknown };
      console.error('❌ Error constructor:', errorObj?.constructor?.name);
      console.error('❌ Error message:', errorObj?.message);
      console.error('❌ Error code:', errorObj?.code);
      console.error('❌ Error stack:', errorObj?.stack);
      console.error('❌ Full error object:', cacheError);

      // Check if it's a FirebaseError
      if (errorObj?.code) {
        console.error('❌ Firebase error code:', errorObj.code);
        console.error('❌ Firebase error details:', errorObj.details);
        console.error('❌ Firebase error customData:', errorObj.customData);
      }

      // Continue even if caching fails - this is non-critical
    }

    // Return the transcription results
    return NextResponse.json({
      success: true,
      message: 'Lyrics transcribed successfully',
      lyrics: lyricsData,
      cached: false
    });
  } catch (error: unknown) {
    console.error('Error transcribing lyrics:', error);
    return NextResponse.json({
      error: 'Error transcribing lyrics',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
