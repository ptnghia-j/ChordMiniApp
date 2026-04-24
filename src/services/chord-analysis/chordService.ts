/**
 * Chord Service - focused solely on chord recognition
 * - Handles both direct File input and URL input (via proxy -> File)
 * - Keeps local development on direct multipart uploads
 * - Exposes explicit offload helpers for production orchestration
 * - Preserves timeout, validation, and error handling semantics
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { offloadUploadService } from '@/services/storage/offloadUploadService';
import type { ChordDetectorType, ChordDetectionResult, ChordRecognitionBackendResponse } from '@/types/audioAnalysis';

/**
 * Recognize chords from a File with rate limiting.
 * Local development uses this direct multipart path.
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

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for chord recognition (>100MB)');
    }

    // Endpoint selection helpers and safe model resolution first (we need it for form fields)
    const { getChordRecognitionEndpoint, getSafeChordModel } = await import('@/utils/modelFiltering');
    const safeModel = getSafeChordModel(model);

    // Build form data (include explicit detector/model so backend doesn't default to 'auto')
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', safeModel); // Explicitly tell backend which detector to run
    formData.append('model', safeModel);    // Kept for compatibility with intermediate proxies
    if (safeModel !== 'chord-cnn-lstm') {
      formData.append('chord_dict', 'large_voca'); // BTC models use large_voca
    } else {
      formData.append('chord_dict', 'full'); // CNN-LSTM uses full
    }

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
 * Recognize chords from an existing offload URL.
 * Production orchestration should prefer this path.
 */
export async function recognizeChordsFromOffloadUrl(
  offloadUrl: string,
  model: ChordDetectorType = 'chord-cnn-lstm'
): Promise<ChordDetectionResult[]> {
  try {
    const result = await offloadUploadService.recognizeChordsFromOffloadUrl(offloadUrl, model, {
      deleteAfterProcessing: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Unknown offload error');
    }

    const backendResponse = result.data as ChordRecognitionBackendResponse;
    if (!backendResponse.chords || !Array.isArray(backendResponse.chords)) {
      throw new Error('Invalid chord recognition response: missing or invalid chords array');
    }

    return backendResponse.chords as ChordDetectionResult[];
  } catch (error) {
    console.error('Error in offload chord recognition:', error);
    throw error;
  }
}

