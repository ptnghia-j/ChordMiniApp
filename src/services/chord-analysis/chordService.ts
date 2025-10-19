/**
 * Chord Service - focused solely on chord recognition
 * - Handles both direct File input and URL input (via proxy -> File)
 * - Preserves Vercel Blob upload path for >4MB files
 * - Preserves timeout, validation, and error handling semantics
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { vercelBlobUploadService } from '@/services/storage/vercelBlobUploadService';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';
import type { ChordDetectorType, ChordDetectionResult, ChordRecognitionBackendResponse } from '@/types/audioAnalysis';

/**
 * Recognize chords from a File with rate limiting and Blob upload handling
 */
export async function recognizeChordsWithRateLimit(
  audioFile: File,
  model: ChordDetectorType = 'chord-cnn-lstm'
): Promise<ChordDetectionResult[]> {
  try {
    // Validate input file
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for chord recognition');
    }

    // Blob path for > 4.0MB files
    if (vercelBlobUploadService.shouldUseBlobUpload(audioFile.size)) {
      console.log(`🔄 File size ${vercelBlobUploadService.getFileSizeString(audioFile.size)} > 4.0MB, using Vercel Blob upload`);

      try {
        const blobResult = await vercelBlobUploadService.recognizeChordsBlobUpload(audioFile, model);
        if (blobResult.success) {
          console.log(`✅ Vercel Blob chord recognition completed successfully`);
          const backendResponse = blobResult.data as ChordRecognitionBackendResponse;
          console.log(`🔍 Backend response structure:`, {
            hasSuccess: 'success' in backendResponse,
            hasChords: 'chords' in backendResponse,
            chordsIsArray: Array.isArray(backendResponse.chords),
            chordsLength: backendResponse.chords?.length || 0,
            modelUsed: backendResponse.model_used
          });

          if (!backendResponse.chords || !Array.isArray(backendResponse.chords)) {
            throw new Error(`Invalid chord recognition response: chords array not found or not an array`);
          }
          return backendResponse.chords as ChordDetectionResult[];
        } else {
          const errorMsg = blobResult.error || 'Unknown blob upload error';
          console.error(`❌ Vercel Blob upload failed for large file: ${errorMsg}`);
          throw new Error(`File too large for direct processing (${vercelBlobUploadService.getFileSizeString(audioFile.size)}). Blob upload failed: ${errorMsg}. Please try a smaller file or check your internet connection.`);
        }
      } catch (blobError) {
        const errorMsg = blobError instanceof Error ? blobError.message : String(blobError) || 'Unknown error';
        console.error(`❌ Vercel Blob upload error for large file: ${errorMsg}`);
        throw new Error(`File too large for direct processing (${vercelBlobUploadService.getFileSizeString(audioFile.size)}). Blob upload error: ${errorMsg}. Please try a smaller file or check your internet connection.`);
      }
    }

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for chord recognition (>100MB)');
    }

    // Build form data
    const formData = new FormData();
    formData.append('file', audioFile);
    if (model !== 'chord-cnn-lstm') {
      formData.append('chord_dict', 'large_voca'); // BTC models use large_voca
    } else {
      formData.append('chord_dict', 'full'); // CNN-LSTM uses full
    }

    // Endpoint selection
    const { getChordRecognitionEndpoint, getSafeChordModel } = await import('@/utils/modelFiltering');
    const safeModel = getSafeChordModel(model);
    const endpoint = getChordRecognitionEndpoint(safeModel);

    // Timeout
    const timeoutValue = 800000; // 13+ minutes
    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Request
    const response = await fetch(endpoint, { method: 'POST', body: formData, signal: abortSignal });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      if (response.status === 403) {
        console.error(`❌ Chord recognition API returned 403 Forbidden`);
        const responseText = await response.text().catch(() => 'Unable to read response');
        console.error(`📄 Error response: ${responseText}`);
        const serverHeader = response.headers.get('server');
        if (serverHeader && serverHeader.includes('AirTunes')) {
          throw new Error('Port conflict: Port 5000 is being used by Apple AirTunes. Change Python backend to use a different port (e.g., 5001, 8000)');
        }
        throw new Error(`Chord recognition failed: Backend returned 403 Forbidden. Ensure Python backend is running and accessible.`);
      }
      throw new Error(errorData.error || `Chord recognition failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Chord recognition failed: ${(data.error as string) || 'Unknown error from chord recognition service'}`);
    }
    if (!data.chords || !Array.isArray(data.chords)) {
      throw new Error('Invalid chord recognition response: missing or invalid chords array');
    }

    // Convert to ChordDetectionResult with validation
    const chords: ChordDetectionResult[] = [];
    for (let i = 0; i < data.chords.length; i++) {
      const chord = data.chords[i];
      if (!chord || typeof chord !== 'object') {
        console.warn(`Skipping invalid chord at index ${i}: not an object`);
        continue;
      }
      if (typeof chord.start !== 'number' || typeof chord.end !== 'number') {
        console.warn(`Skipping chord at index ${i}: invalid start/end times`);
        continue;
      }
      if (isNaN(chord.start) || isNaN(chord.end)) {
        console.warn(`Skipping chord at index ${i}: NaN start/end times`);
        continue;
      }
      if (chord.start < 0 || chord.end < 0 || chord.start >= chord.end) {
        console.warn(`Skipping chord at index ${i}: invalid time range (${chord.start}-${chord.end})`);
        continue;
      }
      if (!chord.chord || typeof chord.chord !== 'string') {
        console.warn(`Skipping chord at index ${i}: invalid chord name`);
        continue;
      }
      chords.push({ start: chord.start, end: chord.end, time: chord.start, chord: chord.chord, confidence: chord.confidence || 0.8 });
    }
    return chords;
  } catch (error) {
    console.error('Error in chord recognition with rate limiting:', error);
    throw error;
  }
}

/**
 * Helper to recognize chords from File or URL input (URL fetched via proxy → File)
 */
export async function recognizeChordsFromInput(
  audioInput: File | string,
  model: ChordDetectorType = 'chord-cnn-lstm',
  videoId?: string
): Promise<ChordDetectionResult[]> {
  if (audioInput instanceof File) {
    return recognizeChordsWithRateLimit(audioInput, model);
  }

  // URL path: fetch via proxy; preserve QuickTube brackets
  console.log('Processing chord recognition from URL:', audioInput);
  const encodedUrl = audioInput.includes('quicktube.app/dl/')
    ? encodeURIComponent(audioInput).replace(/%5B/g, '[').replace(/%5D/g, ']')
    : encodeURIComponent(audioInput);
  const proxyUrl = videoId ? `/api/proxy-audio?url=${encodedUrl}&videoId=${videoId}` : `/api/proxy-audio?url=${encodedUrl}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(`Backend service temporarily unavailable (${response.status}). Please try again in a few minutes or use the file upload option.`);
    } else if (response.status === 413) {
      throw new Error(`Audio file too large for processing (${response.status}). Please try a shorter audio clip or use a different video.`);
    } else if (response.status === 408 || response.status === 504) {
      throw new Error(`Request timed out (${response.status}). The backend service may be experiencing high load. Please try again in a few minutes.`);
    }
    throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
  }
  const audioBlob = await response.blob();
  if (audioBlob.size === 0) throw new Error('Audio file is empty or corrupted');
  if (audioBlob.size > 100 * 1024 * 1024) throw new Error('Audio file is too large (>100MB). Please use a smaller file.');

  const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });
  try { await getAudioDurationFromFile(audioFile); } catch (e) { console.warn(`⚠️ Could not detect audio duration: ${e}`); }
  return recognizeChordsWithRateLimit(audioFile, model);
}

