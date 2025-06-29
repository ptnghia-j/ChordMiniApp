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
  time_signature?: number;
  model?: string;
  model_used?: string;
  error?: string;
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
      console.log('🔍 Backend health check response:', data);

      // Convert health check response to model info format
      const result = {
        success: true,
        default_model: data.beat_model || 'beat-transformer',
        available_models: [data.beat_model, data.chord_model].filter(Boolean),
        beat_transformer_available: data.beat_transformer_available || data.beat_model === 'Beat-Transformer',
        madmom_available: data.madmom_available || true, // Available as fallback in the backend
        model_info: {
          'beat-transformer': {
            name: 'Beat-Transformer',
            description: 'Advanced beat detection using transformer architecture',
            performance: 'High accuracy, slower processing',
            uses_spleeter: true
          },
          'chord-cnn-lstm': {
            name: 'Chord-CNN-LSTM',
            description: 'Chord recognition using CNN-LSTM architecture',
            performance: 'High accuracy chord detection'
          }
        }
      };

      console.log('🔍 Processed model info result:', result);
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
      const duration = await getAudioDurationFromFile(audioFile);
      console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with beat detection analysis`);
    } catch (durationError) {
      console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
    }

    // Use the frontend API route for proper timeout handling
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', detector);
    if (detector === 'beat-transformer') {
      formData.append('force', 'true');
    }

    // Create a safe timeout signal that works across environments
    const timeoutValue = 600000; // 10 minutes timeout
    console.log(`🔍 Beat detection timeout value: ${timeoutValue} (type: ${typeof timeoutValue}, isInteger: ${Number.isInteger(timeoutValue)})`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    const response = await fetch('/api/detect-beats', {
      method: 'POST',
      body: formData,
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
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
      time_signature: (data.time_signature as number) || 4,
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
      console.log(`🔄 File size ${vercelBlobUploadService.getFileSizeString(audioFile.size)} > 4.0MB, using Vercel Blob upload`);

      try {
        // Use Vercel Blob upload for large files
        const blobResult = await vercelBlobUploadService.detectBeatsBlobUpload(audioFile, detector, onProgress);

        if (blobResult.success) {
          console.log(`✅ Vercel Blob beat detection completed successfully`);
          // The blob result data is already the Python backend response, so we can return it directly
          const backendResponse = blobResult.data as BeatDetectionBackendResponse;
          console.log(`🔍 Beat detection backend response structure:`, {
            hasSuccess: 'success' in backendResponse,
            hasBeats: 'beats' in backendResponse,
            beatsIsArray: Array.isArray(backendResponse.beats),
            beatsLength: backendResponse.beats?.length || 0,
            modelUsed: backendResponse.model || backendResponse.model_used
          });

          // Validate that we have a beats array
          if (!backendResponse.beats || !Array.isArray(backendResponse.beats)) {
            throw new Error(`Invalid beat detection response: beats array not found or not an array`);
          }

          return backendResponse as BeatDetectionResult;
        } else {
          // If blob upload fails, fall back to direct processing with warning
          console.warn(`⚠️ Vercel Blob upload failed: ${blobResult.error}, falling back to direct processing`);
          console.warn(`⚠️ This may hit Vercel's 4.5MB request body limit`);
        }
      } catch (blobError) {
        console.warn(`⚠️ Vercel Blob upload error: ${blobError}, falling back to direct processing`);
        console.warn(`⚠️ This may hit Vercel's 4.5MB request body limit`);
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
      const duration = await getAudioDurationFromFile(audioFile);
      console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with beat detection analysis`);
    } catch (durationError) {
      console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
    }

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', detector);

    // Add force=true parameter if Beat-Transformer is explicitly requested for large files
    if (detector === 'beat-transformer' && fileSizeMB > 30) {
      formData.append('force', 'true');
      console.log(`Added force=true parameter for ${detector} with large file`);
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
                    console.log('Beat-Transformer failed, trying madmom as fallback...');
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
                    console.log('Beat-Transformer failed with 500 error, trying madmom as fallback...');
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
        signal: createSafeTimeoutSignal(600000), // 10 minutes timeout
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
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
      console.log(`✅ Beat detection successful using: ${data.model || 'unknown'}`);

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

      // Validate time signature
      if (typeof data.time_signature !== 'number' || isNaN(data.time_signature) || data.time_signature < 2 || data.time_signature > 16) {
        console.warn(`Invalid time signature detected: ${data.time_signature}, using default 4`);
        data.time_signature = 4;
      }

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
        console.log('Beat-Transformer failed, trying madmom as fallback...');
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
      console.log('Added force=true parameter for Beat-Transformer with audio_path');
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
            console.log('Beat-Transformer failed, trying madmom as fallback...');
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
      console.log(`✅ Beat detection successful using: ${data.model || 'unknown'}`);

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