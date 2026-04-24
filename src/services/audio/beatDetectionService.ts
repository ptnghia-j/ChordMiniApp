// Beat detection service to communicate with the Next.js API proxy
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';
import { offloadUploadService } from '../storage/offloadUploadService';
import { getAppCheckTokenForApi } from '@/config/firebase';

// Interface for Python backend beat detection response
export interface BeatDetectionBackendResponse {
  success: boolean;
  beats: number[];
  downbeats?: number[];
  // New: optional dual-candidate downbeats (Madmom heuristic mode)
  downbeat_candidates?: { [key: string]: number[] } | { "3"?: number[]; "4"?: number[] };
  downbeat_candidates_meta?: { default?: number; strategy?: string };
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
                        'DL model with 5-channel audio separation, flexible in time signatures, slow processing speed',
            performance: data.beat_model_info?.['beat-transformer']?.performance || 'High accuracy, slower processing',
            uses_spleeter: data.beat_model_info?.['beat-transformer']?.uses_spleeter ?? true
          },
          'madmom': {
            name: data.beat_model_info?.['madmom']?.name || 'Madmom',
            description: data.beat_model_info?.['madmom']?.description ||
                        'Neural network with high accuracy and speed, best for common time signature',
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

    // Fetch App Check token for request attestation
    const appCheckToken = typeof window !== 'undefined'
      ? await getAppCheckTokenForApi()
      : null;

    const headers: HeadersInit = {};
    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetch('/api/detect-beats', {
      method: 'POST',
      body: formData,
      headers,
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
    const backendData = data as Partial<BeatDetectionBackendResponse>;
    const normalized: BeatDetectionResult & Partial<BeatDetectionBackendResponse> = {
      success: true,
      beats: data.beats as number[],
      downbeats: (data.downbeats as number[]) || [],
      // Pass through optional dual-candidate downbeats when present (Madmom)
      downbeat_candidates: backendData.downbeat_candidates,
      downbeat_candidates_meta: backendData.downbeat_candidates_meta,
      bpm: (data.BPM as number) || (data.bpm as number) || 120,
      total_beats: (data.beats as number[]).length,
      duration: (data.duration as number) || 0,
      time_signature: parseTimeSignature(data.time_signature),
      model: (data.model_used as string) || detector
    };
    return normalized;

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
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for beat detection');
    }

    if (audioFile.size > 100 * 1024 * 1024) {
      throw new Error('Audio file is too large for beat detection (>100MB)');
    }

    const validDetectors = ['auto', 'madmom', 'beat-transformer'];
    if (!validDetectors.includes(detector)) {
      throw new Error(`Invalid detector: ${detector}. Must be one of: ${validDetectors.join(', ')}`);
    }

    if (onProgress) onProgress(10);
    const normalized = await detectBeatsWithRateLimit(audioFile, detector);
    if (onProgress) onProgress(100);
    return normalized;
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
 * Detects beats from an existing Firebase/offload URL.
 * Production flows should forward the URL directly rather than re-downloading bytes in the browser.
 *
 * @param firebaseUrl - Firebase Storage URL of the audio file
 * @param detector - Which beat detector to use ('auto', 'madmom', or 'beat-transformer')
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromFirebaseUrl(
  firebaseUrl: string,
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'madmom',
  _videoId?: string
): Promise<BeatDetectionResult> {
  try {
    const result = await offloadUploadService.detectBeatsFromOffloadUrl(firebaseUrl, detector, {
      deleteAfterProcessing: true,
    });

    if (!result.success) {
      throw new Error(`Beat detection failed: ${result.error || 'Unknown offload error'}`);
    }

    const backendResponse = result.data as BeatDetectionBackendResponse;
    const normalized: BeatDetectionResult & Partial<BeatDetectionBackendResponse> = {
      success: true,
      beats: backendResponse.beats || [],
      downbeats: backendResponse.downbeats || [],
      downbeat_candidates: backendResponse.downbeat_candidates,
      downbeat_candidates_meta: backendResponse.downbeat_candidates_meta,
      bpm: backendResponse.BPM || backendResponse.bpm || 120,
      total_beats: (backendResponse.beats || []).length,
      duration: backendResponse.duration || 0,
      time_signature: parseTimeSignature(backendResponse.time_signature),
      model: backendResponse.model_used || backendResponse.model || detector
    };

    return normalized;

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
  detector: 'auto' | 'madmom' | 'beat-transformer' = 'madmom'
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

    // Fetch App Check token for request attestation
    const appCheckToken = typeof window !== 'undefined'
      ? await getAppCheckTokenForApi()
      : null;

    const headers: HeadersInit = {};
    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetch('/api/detect-beats', {
      method: 'POST',
      body: formData,
      headers,
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

      // Normalize and map to BeatDetectionResult
      const backendData: BeatDetectionBackendResponse = data as BeatDetectionBackendResponse;
      const normalized: BeatDetectionResult & Partial<BeatDetectionBackendResponse> = {
        success: true,
        beats: backendData.beats || [],
        downbeats: backendData.downbeats || [],
        // Pass through optional dual-candidate downbeats when present (Madmom)
        downbeat_candidates: backendData.downbeat_candidates,
        downbeat_candidates_meta: backendData.downbeat_candidates_meta,
        bpm: (backendData.BPM as number) || (backendData.bpm as number) || 120,
        total_beats: (backendData.beats || []).length,
        duration: (backendData.duration as number) || 0,
        time_signature: parseTimeSignature(backendData.time_signature),
        model: (backendData.model_used as string) || detector
      };
      return normalized;
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