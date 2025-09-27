// Beat detection service to communicate with the Python backend
import { config } from '@/config/env';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';
import { vercelBlobUploadService } from './vercelBlobUploadService';

// Interface for Python backend beat detection response
export interface BeatDetectionBackendResponse {
  success: boolean;
  beats: number[];
  downbeats?: number[];
  bpm?: number;
  BPM?: number; // Some responses use uppercase
  total_beats?: number;
  duration?: number;
  time_signature?: number | string; // Can be number or string like "3/4"
  model?: string;
  model_used?: string;
  error?: string;
}

// Helper function to parse time signature from various formats
function parseTimeSignature(timeSignature: unknown): number {
  const defaultValue = 4;

  if (typeof timeSignature === 'string') {
    // Handle string formats like "3/4", "4/4", etc.
    if (timeSignature.includes('/')) {
      const numerator = parseInt(timeSignature.split('/')[0], 10);
      if (!isNaN(numerator) && numerator >= 2 && numerator <= 16) {
        return numerator;
      }
    } else {
      // Handle string numbers like "3", "4"
      const parsed = parseInt(timeSignature, 10);
      if (!isNaN(parsed) && parsed >= 2 && parsed <= 16) {
        return parsed;
      }
    }
  } else if (typeof timeSignature === 'number') {
    // Handle numeric time signatures
    if (!isNaN(timeSignature) && timeSignature >= 2 && timeSignature <= 16) {
      return timeSignature;
    }
  }

  console.warn(`Invalid time signature: ${timeSignature}, using default ${defaultValue}`);
  return defaultValue;
}


// Base URL for the Python API (full backend with all features)
const API_BASE_URL = config.pythonApiUrl;

// Interface for beat info with strength
export interface BeatInfo {
  time: number;       // Beat time in seconds
  strength: number;   // Beat strength (0-1)
  beatNum?: number;   // Beat number within measure (1-based)
}

// Interface for downbeat info with measure
export interface DownbeatInfo {
  time: number;       // Downbeat time in seconds
  measureNum: number; // Measure number (1-based)
}

// Interface for beat with position
export interface BeatPosition {
  time: number;       // Beat time in seconds
  beatNum: number;    // Beat number within measure (1-based)
  source?: 'detected' | 'padded'; // Source of the beat (for timing compensation)
}

// Interface for beat detection response - pure model outputs
export interface BeatDetectionResult {
  success: boolean;
  beats: number[];            // Array of beat timestamps in seconds (pure model output)
  downbeats?: number[];       // Array of downbeat timestamps (only for Beat-Transformer)
  bpm: number;                // Beats per minute
  total_beats: number;
  total_downbeats?: number;   // Only for Beat-Transformer
  duration: number;           // Duration of the audio in seconds
  model?: string;             // Which model was used
  error?: string;             // Optional error message
  time_signature?: number;    // Time signature (beats per measure, e.g., 4 for 4/4, 3 for 3/4)
  beat_time_range_start?: number; // Start of the beat time range (for padding calculation)
  beat_time_range_end?: number;   // End of the beat time range
}

// Interface for model info response
export interface ModelInfoResult {
  success: boolean;
  default_model: string;
  available_models: string[];
  beat_transformer_available: boolean;

  madmom_available: boolean;
  model_info?: {
    [key: string]: {
      name: string;
      description: string;
      channels?: number;
      performance: string;
      uses_spleeter?: boolean;
    }
  };
  error?: string;
}

/**
 * Get information about available beat detection models
 *
 * @returns Promise with model information
 */
export async function getModelInfo(): Promise<ModelInfoResult> {
  try {
    // Use the frontend API proxy to avoid CORS issues
    const response = await fetch('/api/model-info');

    if (response.ok) {
      const data = await response.json();
      // console.log('🔍 Backend health check response:', data);

      // PERFORMANCE FIX: Use backend model descriptions when available, fallback to detailed descriptions
      const result = {
        success: true,
        default_model: data.beat_model || 'beat-transformer',
        available_models: [data.beat_model, data.chord_model].filter(Boolean),
        beat_transformer_available: data.beat_transformer_available || data.beat_model === 'Beat-Transformer',
        madmom_available: data.madmom_available || true, // Available as fallback in the backend
        model_info: {
          'beat-transformer': {
            name: data.beat_model_info?.['beat-transformer']?.name || 'Beat-Transformer',
            description: data.beat_model_info?.['beat-transformer']?.description ||
                        'DL model with 5-channel audio separation, good for music with multiple harmonic layers, supporting both simple and compound time signatures',
            performance: data.beat_model_info?.['beat-transformer']?.performance || 'High accuracy, slower processing',
            uses_spleeter: data.beat_model_info?.['beat-transformer']?.uses_spleeter ?? true
          },
          'madmom': {
            name: data.beat_model_info?.['madmom']?.name || 'Madmom',
            description: data.beat_model_info?.['madmom']?.description ||
                        'Neural network with good balance of accuracy and speed, best for common time signature, flexible in tempo changes',
            performance: data.beat_model_info?.['madmom']?.performance || 'Medium accuracy, medium speed',
            uses_spleeter: data.beat_model_info?.['madmom']?.uses_spleeter ?? false
          },
          'chord-cnn-lstm': {
            name: data.chord_model_info?.['chord-cnn-lstm']?.name || 'Chord-CNN-LSTM',
            description: data.chord_model_info?.['chord-cnn-lstm']?.description ||
                        'Chord recognition using CNN-LSTM architecture',
            performance: data.chord_model_info?.['chord-cnn-lstm']?.performance || 'High accuracy chord detection'
          }
        }
      };

      // console.log('🔍 Processed model info result:', result);
      return result;
    }
  } catch (error) {
    console.error('Backend service unavailable:', error);
  }

  // Fallback response if service is unavailable
  return {
    success: false,
    default_model: 'madmom',
    available_models: ['madmom'],
    beat_transformer_available: false,
    madmom_available: true,
    error: 'Backend service unavailable'
  };
}

/**
 * Detects beats in an audio file using the enhanced API service with rate limiting
 *
 * @param audioFile - The audio file to analyze (File object)
 * @param detector - Which beat detector to use ('auto', 'madmom', or 'beat-transformer')
 * @returns Promise with beat detection results
 */
export async function detectBeatsWithRateLimit(
  audioFile: File,
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer'
): Promise<BeatDetectionResult> {
  try {
    // Enhanced input validation
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for beat detection');
    }

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for beat detection (>100MB)');
    }

    // Log audio duration for debugging before sending to ML service
    try {
      await getAudioDurationFromFile(audioFile);
      // console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with beat detection analysis`);
    } catch {
      // console.warn(`⚠️ Could not detect audio duration for debugging: ${error}`);
    }

    // Use the frontend API route for proper timeout handling
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', detector);
    if (detector === 'beat-transformer') {
      formData.append('force', 'true');
    }

    // Create a safe timeout signal that works across environments
    const timeoutValue = 800000; // 13+ minutes timeout to match API routes


    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    const response = await fetch('/api/detect-beats', {
      method: 'POST',
      body: formData,
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

      // Handle 403 Forbidden errors - likely port conflict or backend unavailable
      if (response.status === 403) {
        console.error(`❌ Beat detection API returned 403 Forbidden`);
        const responseText = await response.text().catch(() => 'Unable to read response');
        console.error(`📄 Error response: ${responseText}`);

        // Check if this is Apple AirTunes intercepting port 5000
        const serverHeader = response.headers.get('server');
        if (serverHeader && serverHeader.includes('AirTunes')) {
          throw new Error('Port conflict: Port 5000 is being used by Apple AirTunes. Change Python backend to use a different port (e.g., 5001, 8000)');
        }

        throw new Error(`Beat detection failed: Backend returned 403 Forbidden. Ensure Python backend is running and accessible.`);
      }

      throw new Error(errorData.error || `Beat detection failed: ${response.status}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || !data.success) {
      // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
      if (detector === 'beat-transformer' && data.error?.includes('500')) {
        return detectBeatsWithRateLimit(audioFile, 'madmom');
      }

      throw new Error(data.error || 'Beat detection failed');
    }

    // Validate response structure
    if (!data || !Array.isArray(data.beats)) {
      throw new Error('Invalid response format from beat detection API');
    }

    // Convert to expected format
    return {
      success: true,
      beats: data.beats as number[],
      downbeats: (data.downbeats as number[]) || [],
      bpm: (data.BPM as number) || (data.bpm as number) || 120,
      total_beats: (data.beats as number[]).length,
      duration: (data.duration as number) || 0,
      time_signature: parseTimeSignature(data.time_signature),
      model: (data.model_used as string) || detector
    };

  } catch (error) {
    console.error('Error in beat detection with rate limiting:', error);
    throw error;
  }
}

/**
 * Detects beats in an audio file using the Python backend API
 *
 * @param audioFile - The audio file to analyze (File object)
 * @param detector - Which beat detector to use ('auto', 'madmom', or 'beat-transformer')
 * @param onProgress - Optional callback for upload progress
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromFile(
  audioFile: File,
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  onProgress?: (percent: number) => void
): Promise<BeatDetectionResult> {
  try {

    // Enhanced input validation
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for beat detection');
    }

    // Check if file should use Vercel Blob upload (> 4.0MB)
    if (vercelBlobUploadService.shouldUseBlobUpload(audioFile.size)) {


      try {
        // Use Vercel Blob upload for large files
        const blobResult = await vercelBlobUploadService.detectBeatsBlobUpload(audioFile, detector, onProgress);

        if (blobResult.success) {

          // The blob result data is already the Python backend response, so we can return it directly
          const backendResponse = blobResult.data as BeatDetectionBackendResponse;


          // Validate that we have a beats array
          if (!backendResponse.beats || !Array.isArray(backendResponse.beats)) {
            throw new Error(`Invalid beat detection response: beats array not found or not an array`);
          }

          return backendResponse as BeatDetectionResult;
        } else {
          // For large files, don't fall back to direct processing - throw error instead
          const errorMsg = blobResult.error || 'Unknown blob upload error';
          console.error(`❌ Vercel Blob upload failed for large file: ${errorMsg}`);
          throw new Error(`File too large for direct processing (${vercelBlobUploadService.getFileSizeString(audioFile.size)}). Blob upload failed: ${errorMsg}. Please try a smaller file or check your internet connection.`);
        }
      } catch (blobError) {
        // For large files, don't fall back to direct processing - throw error instead
        const errorMsg = blobError instanceof Error ? blobError.message : String(blobError) || 'Unknown error';
        console.error(`❌ Vercel Blob upload error for large file: ${errorMsg}`);
        throw new Error(`File too large for direct processing (${vercelBlobUploadService.getFileSizeString(audioFile.size)}). Blob upload error: ${errorMsg}. Please try a smaller file or check your internet connection.`);
      }
    }

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for beat detection (>100MB)');
    }

    // Validate detector parameter
    const validDetectors = ['auto', 'madmom', 'beat-transformer'];
    if (!validDetectors.includes(detector)) {
      throw new Error(`Invalid detector: ${detector}. Must be one of: ${validDetectors.join(', ')}`);
    }

    // Check file size and warn if over 20MB
    const fileSizeMB = audioFile.size / (1024 * 1024);
    if (fileSizeMB > 20) {
      console.warn(`Large file detected (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`);

      // For files over 30MB, prefer madmom or librosa for better performance
      if (fileSizeMB > 30) {
        // If user explicitly requested beat-transformer, keep it and add force parameter
        if (detector === 'beat-transformer') {
          console.warn('File is very large. Adding force=true parameter to use Beat-Transformer.');
          // Add force=true parameter to the formData later
        }
        // If auto-selected, switch to madmom or librosa
        else if (detector === 'auto') {
          console.warn('File is very large. Using madmom or librosa for better performance.');
          // Will use the best available model on the server side
        }
      }
    }

    // Log audio duration for debugging before sending to ML service
    try {
      await getAudioDurationFromFile(audioFile);
      // console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with beat detection analysis`);
    } catch {
      // console.warn(`⚠️ Could not detect audio duration for debugging: ${error}`);
    }

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', detector);

    // Add force=true parameter if Beat-Transformer is explicitly requested for large files
    if (detector === 'beat-transformer' && fileSizeMB > 30) {
      formData.append('force', 'true');
      // console.log(`Added force=true parameter for ${detector} with large file`);
    }

    // Use XMLHttpRequest to track upload progress
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              reject(new Error('Invalid response format from beat detection API'));
            }
          } else {
            // Handle 413 Payload Too Large specifically
            if (xhr.status === 413) {
              if (detector === 'beat-transformer') {
                // If Beat-Transformer was requested but still got 413, the file is extremely large
                reject(new Error('The audio file is too large even with force=true. Try a smaller file or use madmom detector.'));
              } else {
                reject(new Error('The audio file is too large to process. Try a smaller file or use madmom detector.'));
              }
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                // Provide more helpful error messages for common issues
                if (errorData.error?.includes('No beat detection model available')) {
                  // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
                  if (detector === 'beat-transformer') {
                    // console.log('Beat-Transformer failed, trying madmom as fallback...');
                    resolve(detectBeatsFromFile(audioFile, 'madmom', onProgress));
                    return;
                  }
                  reject(new Error('Beat detection service is temporarily unavailable. Please try again in a few moments or contact support.'));
                } else {
                  reject(new Error(errorData.error || `Failed to detect beats (HTTP ${xhr.status})`));
                }
              } catch {
                if (xhr.status === 500) {
                  // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
                  if (detector === 'beat-transformer') {

                    resolve(detectBeatsFromFile(audioFile, 'madmom', onProgress));
                    return;
                  }
                  reject(new Error('Beat detection service encountered an internal error. Please try again or contact support.'));
                } else {
                  reject(new Error(`Beat detection failed with status ${xhr.status}`));
                }
              }
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error occurred during beat detection'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Beat detection was aborted'));
        });

        xhr.open('POST', `${API_BASE_URL}/api/detect-beats`);
        xhr.send(formData);
      });
    }

    // Use the frontend API route for consistent timeout and error handling
    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('detector', detector);
      if (detector === 'beat-transformer') {
        formData.append('force', 'true');
      }

      const response = await fetch('/api/detect-beats', {
        method: 'POST',
        body: formData,
        signal: createSafeTimeoutSignal(800000), // 13+ minutes timeout to match API routes
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

        // Handle 403 Forbidden errors - likely port conflict or backend unavailable
        if (response.status === 403) {
          console.error(`❌ Beat detection API returned 403 Forbidden`);
          const responseText = await response.text().catch(() => 'Unable to read response');
          console.error(`📄 Error response: ${responseText}`);

          // Check if this is Apple AirTunes intercepting port 5000
          const serverHeader = response.headers.get('server');
          if (serverHeader && serverHeader.includes('AirTunes')) {
            throw new Error('Port conflict: Port 5000 is being used by Apple AirTunes. Change Python backend to use a different port (e.g., 5001, 8000)');
          }

          throw new Error(`Beat detection failed: Backend returned 403 Forbidden. Ensure Python backend is running and accessible.`);
        }

        // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
        if (detector === 'beat-transformer') {
          return detectBeatsFromFile(audioFile, 'madmom', onProgress);
        }
        throw new Error(errorData.error || `Beat detection failed: ${response.status}`);
      }

      const data = await response.json();



      // Enhanced validation of response data
      if (!data || !data.success) {
        throw new Error(`Beat detection failed: ${data?.error || 'Unknown error from beat detection service'}`);
      }

      // Add model identification for debugging
      // console.log(`✅ Beat detection successful using: ${data.model || 'unknown'}`);

      // Validate response data structure
      if (!data.beats || !Array.isArray(data.beats)) {
        throw new Error('Invalid beat detection response: missing or invalid beats array');
      }

      if (data.beats.length === 0) {
        throw new Error('No beats detected in the audio. The audio may be too quiet, too short, or not contain rhythmic content.');
      }

      // Validate beat timestamps with bounds checking
      const invalidBeats = data.beats.filter((time: unknown) =>
        typeof time !== 'number' || isNaN(time) || time < 0 || time > 3600 // 1 hour max
      );

      if (invalidBeats.length > 0) {
        console.warn(`⚠️  Found ${invalidBeats.length} invalid beat timestamps, filtering them out`);
        data.beats = data.beats.filter((time: unknown) =>
          typeof time === 'number' && !isNaN(time) && time >= 0 && time <= 3600
        );

        if (data.beats.length === 0) {
          throw new Error('All detected beats have invalid timestamps');
        }
      }

      // Validate BPM
      if (typeof data.bpm !== 'number' || isNaN(data.bpm) || data.bpm <= 0 || data.bpm > 300) {
        console.warn(`Invalid BPM detected: ${data.bpm}, using default 120`);
        data.bpm = 120;
      }

      // Parse and validate time signature using helper function
      data.time_signature = parseTimeSignature(data.time_signature);

      // Validate downbeats if present
      if (data.downbeats && Array.isArray(data.downbeats)) {
        const invalidDownbeats = data.downbeats.filter((time: unknown) =>
          typeof time !== 'number' || isNaN(time) || time < 0 || time > 3600
        );

        if (invalidDownbeats.length > 0) {
          console.warn(`⚠️  Found ${invalidDownbeats.length} invalid downbeat timestamps, filtering them out`);
          data.downbeats = data.downbeats.filter((time: unknown) =>
            typeof time === 'number' && !isNaN(time) && time >= 0 && time <= 3600
          );
        }
      } else {
        data.downbeats = [];
      }

      // Validate beats_with_positions if present
      const beatsWithPositions = (data as Record<string, unknown>).beats_with_positions;
      if (beatsWithPositions && Array.isArray(beatsWithPositions)) {
        const invalidPositions = beatsWithPositions.filter((beat: unknown) =>
          !beat ||
          typeof (beat as Record<string, unknown>).time !== 'number' ||
          typeof (beat as Record<string, unknown>).beatNum !== 'number' ||
          isNaN((beat as Record<string, unknown>).time as number) ||
          isNaN((beat as Record<string, unknown>).beatNum as number) ||
          ((beat as Record<string, unknown>).time as number) < 0 ||
          ((beat as Record<string, unknown>).time as number) > 3600 ||
          ((beat as Record<string, unknown>).beatNum as number) < 1 ||
          ((beat as Record<string, unknown>).beatNum as number) > (data.time_signature || 4)
        );

        if (invalidPositions.length > 0) {
          console.warn(`⚠️  Found ${invalidPositions.length} invalid beat positions, filtering them out`);
          (data as Record<string, unknown>).beats_with_positions = beatsWithPositions.filter((beat: unknown) =>
            beat &&
            typeof (beat as Record<string, unknown>).time === 'number' &&
            typeof (beat as Record<string, unknown>).beatNum === 'number' &&
            !isNaN((beat as Record<string, unknown>).time as number) &&
            !isNaN((beat as Record<string, unknown>).beatNum as number) &&
            ((beat as Record<string, unknown>).time as number) >= 0 &&
            ((beat as Record<string, unknown>).time as number) <= 3600 &&
            ((beat as Record<string, unknown>).beatNum as number) >= 1 &&
            ((beat as Record<string, unknown>).beatNum as number) <= (data.time_signature || 4)
          );
        }
      } else {
        (data as Record<string, unknown>).beats_with_positions = [];
      }

      // Validate time range values
      if (typeof data.beat_time_range_start !== 'number' || isNaN(data.beat_time_range_start) || data.beat_time_range_start < 0) {
        console.warn(`Invalid beat_time_range_start: ${data.beat_time_range_start}, using 0`);
        data.beat_time_range_start = 0;
      }

      if (typeof data.beat_time_range_end !== 'number' || isNaN(data.beat_time_range_end) || data.beat_time_range_end < 0) {
        console.warn(`Invalid beat_time_range_end: ${data.beat_time_range_end}, using last beat time`);
        data.beat_time_range_end = data.beats.length > 0 ? data.beats[data.beats.length - 1] : 0;
      }



      return data;
    } catch (error) {
      console.error('Error in beat detection:', error);

      // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
      if (detector === 'beat-transformer') {

        return detectBeatsFromFile(audioFile, 'madmom', onProgress);
      }

      // Enhanced error handling with specific suggestions
      let errorMessage = 'Unknown error in beat detection';

      if (error instanceof Error) {
        if (error.message.includes('out of bounds') || error.message.includes('bounds')) {
          errorMessage = 'Beat detection failed due to data bounds error. This may be caused by corrupted audio data or unsupported audio format. Please try a different audio file.';
        } else if (error.message.includes('memory') || error.message.includes('allocation')) {
          errorMessage = 'Beat detection failed due to memory constraints. Please try a shorter audio clip or use the madmom detector.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Beat detection timed out. Please try a shorter audio clip or use the madmom detector for better performance.';
        } else if (error.message.includes('too large')) {
          errorMessage = 'Audio file is too large for beat detection. Please use a smaller file or try the madmom detector.';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        beats: [],
        bpm: 0,
        total_beats: 0,
        duration: 0,
        error: errorMessage
      };
    }
  } catch (error) {
    console.error('Error in detectBeatsFromFile:', error);
    return {
      success: false,
      beats: [],
      bpm: 0,
      total_beats: 0,
      duration: 0,
      error: error instanceof Error ? error.message : 'Unknown error in beat detection'
    };
  }
}

/**
 * Detects beats from a Firebase Storage URL by downloading the file first and then processing it
 * This bypasses CSP issues by using our existing API infrastructure
 *
 * @param firebaseUrl - Firebase Storage URL of the audio file
 * @param detector - Which beat detector to use ('auto', 'madmom', or 'beat-transformer')
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromFirebaseUrl(
  firebaseUrl: string,
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  videoId?: string
): Promise<BeatDetectionResult> {
  try {


    // Step 1: Download the Firebase Storage file using our proxy service
    const encodedUrl = encodeURIComponent(firebaseUrl);
    const proxyUrl = videoId ? `/api/proxy-audio?url=${encodedUrl}&videoId=${videoId}` : `/api/proxy-audio?url=${encodedUrl}`;

    console.log(`[36m[detectBeatsFromFirebaseUrl][0m videoId=${videoId || 'none'} -> proxyUrl=${proxyUrl.substring(0, 140)}...`);

    const response = await fetch(proxyUrl);
    if (!response.ok) {
      console.error(`[31m[detectBeatsFromFirebaseUrl][0m proxy fetch failed: status=${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch audio from Firebase URL: ${response.status} ${response.statusText}`);
    }

    const audioBlob = await response.blob();

    // Validate audio blob
    if (audioBlob.size === 0) {
      throw new Error('Downloaded audio file is empty');
    }



    // Step 2: Create a File object from the blob
    const audioFile = new File([audioBlob], "firebase_audio.wav", { type: "audio/wav" });

    // Step 3: Use our existing beat detection service with the downloaded file


    // Use the vercel blob upload service which has our environment-aware logic
    const blobResult = await vercelBlobUploadService.processAudioFile(audioFile, 'detect-beats', {
      detector: detector
    });

    if (blobResult.success) {
      // Convert blob service response to beat detection format
      const backendResponse = blobResult.data as BeatDetectionBackendResponse;


      return {
        success: true,
        beats: backendResponse.beats || [],
        downbeats: backendResponse.downbeats || [],
        bpm: backendResponse.BPM || backendResponse.bpm || 120,
        total_beats: (backendResponse.beats || []).length,
        duration: backendResponse.duration || 0,
        time_signature: parseTimeSignature(backendResponse.time_signature),
        model: backendResponse.model_used || detector
      };
    } else if (blobResult.error === 'USE_STANDARD_FLOW') {
      // Fallback to standard beat detection flow

      return await detectBeatsFromFile(audioFile, detector);
    } else {
      throw new Error(`Beat detection failed: ${blobResult.error}`);
    }

  } catch (error) {
    console.error('Error in Firebase URL beat detection:', error);
    throw error;
  }
}



/**
 * Detects beats in an audio file already on the server
 *
 * @param audioPath - Path to the audio file on the server
 * @param detector - Which beat detector to use ('auto', 'madmom', or 'beat-transformer')
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromPath(
  audioPath: string,
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer'
): Promise<BeatDetectionResult> {
  try {
    const formData = new FormData();
    formData.append('audio_path', audioPath);
    formData.append('detector', detector);

    // Add force=true parameter if Beat-Transformer is explicitly requested
    // This is needed for large files
    if (detector === 'beat-transformer') {
      formData.append('force', 'true');

    }

    const response = await fetch(`${API_BASE_URL}/api/detect-beats`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      // Handle different status codes appropriately
      if (response.status === 413) {
        if (detector === 'beat-transformer') {
          // If Beat-Transformer was requested but still got 413, the file is extremely large
          throw new Error('The audio file is too large even with force=true. Try a smaller file or use madmom/librosa detector.');
        } else {
          throw new Error('The audio file is too large to process. Try a smaller file, use madmom/librosa detector, or try again with beat-transformer and force=true.');
        }
      }

      try {
        const errorData = await response.json();
        // Provide more helpful error messages for common issues
        if (errorData.error?.includes('No beat detection model available')) {
          // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
          if (detector === 'beat-transformer') {

            return detectBeatsFromPath(audioPath, 'madmom');
          }
          throw new Error('Beat detection service is temporarily unavailable. Please try again in a few moments or contact support.');
        }
        throw new Error(errorData.error || `Failed to detect beats (HTTP ${response.status})`);
      } catch {
        // If response isn't valid JSON
        if (response.status === 500) {
          // If Beat-Transformer failed and we haven't tried madmom yet, try madmom as fallback
          if (detector === 'beat-transformer') {

            return detectBeatsFromPath(audioPath, 'madmom');
          }
          throw new Error('Beat detection service encountered an internal error. Please try again or contact support.');
        }
        throw new Error(`Beat detection failed with status ${response.status}: ${response.statusText}`);
      }
    }

    try {
      const data = await response.json();

      // Add model identification for debugging
      // console.log(`✅ Beat detection successful using: ${data.model || 'unknown'}`);

      return data;
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new Error('Invalid response format from beat detection API');
    }
  } catch (error) {
    console.error('Error in beat detection:', error);
    return {
      success: false,
      beats: [],
      bpm: 0,
      total_beats: 0,
      duration: 0,
      error: error instanceof Error ? error.message : 'Unknown error in beat detection'
    };
  }
}