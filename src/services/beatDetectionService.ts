// Beat detection service to communicate with the Python backend
import { config } from '@/config/env';

// Base URL for the Python API
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
  beat_transformer_light_available?: boolean;
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
    const response = await fetch(`${API_BASE_URL}/api/model-info`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get model info');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting model info:', error);
    return {
      success: false,
      default_model: 'madmom',
      available_models: ['madmom'],
      beat_transformer_available: false,
      madmom_available: true,
      error: error instanceof Error ? error.message : 'Unknown error getting model info'
    };
  }
}

/**
 * Detects beats in an audio file using the Python backend API
 *
 * @param audioFile - The audio file to analyze (File object)
 * @param detector - Which beat detector to use ('auto', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @param onProgress - Optional callback for upload progress
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromFile(
  audioFile: File,
  detector: 'auto' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto',
  onProgress?: (percent: number) => void
): Promise<BeatDetectionResult> {
  try {
    console.log(`Detecting beats using ${detector} detector...`);

    // Enhanced input validation
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for beat detection');
    }

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for beat detection (>100MB)');
    }

    // Validate detector parameter
    const validDetectors = ['auto', 'madmom', 'beat-transformer', 'beat-transformer-light'];
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

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('detector', detector);

    // Add force=true parameter if Beat-Transformer or Beat-Transformer Light is explicitly requested for large files
    if ((detector === 'beat-transformer' && fileSizeMB > 30) ||
        (detector === 'beat-transformer-light' && fileSizeMB > 50)) {
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
            } catch (e) {
              reject(new Error('Invalid response format from beat detection API'));
            }
          } else {
            // Handle 413 Payload Too Large specifically
            if (xhr.status === 413) {
              if (detector === 'beat-transformer') {
                // If Beat-Transformer was requested but still got 413, the file is extremely large
                reject(new Error('The audio file is too large even with force=true. Try a smaller file, use beat-transformer-light or madmom detector.'));
              } else if (detector === 'beat-transformer-light') {
                // If Beat-Transformer Light was requested but still got 413, the file is extremely large
                reject(new Error('The audio file is too large even with force=true. Try a smaller file, use madmom detector, or use the audio path method.'));
              } else {
                reject(new Error('The audio file is too large to process. Try a smaller file, use madmom detector, or try again with beat-transformer-light and force=true.'));
              }
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                reject(new Error(errorData.error || `Failed to detect beats (HTTP ${xhr.status})`));
              } catch (e) {
                reject(new Error(`Beat detection failed with status ${xhr.status}`));
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

    // Standard fetch if no progress tracking needed
    const response = await fetch(`${API_BASE_URL}/api/detect-beats`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      // Handle different status codes appropriately
      if (response.status === 413) {
        if (detector === 'beat-transformer') {
          // If Beat-Transformer was requested but still got 413, the file is extremely large
          throw new Error('The audio file is too large even with force=true. Try a smaller file, use beat-transformer-light or madmom detector.');
        } else if (detector === 'beat-transformer-light') {
          // If Beat-Transformer Light was requested but still got 413, the file is extremely large
          throw new Error('The audio file is too large even with force=true. Try a smaller file, use madmom detector, or use the audio path method.');
        } else {
          throw new Error('The audio file is too large to process. Try a smaller file, use madmom detector, or try again with beat-transformer-light and force=true.');
        }
      }

      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to detect beats (HTTP ${response.status})`);
      } catch (jsonError) {
        // If response isn't valid JSON
        throw new Error(`Beat detection failed with status ${response.status}: ${response.statusText}`);
      }
    }

    try {
      const data = await response.json();

      // Enhanced validation of response data
      if (!data.success) {
        throw new Error(`Beat detection failed: ${data.error || 'Unknown error from beat detection service'}`);
      }

      // Validate response data structure
      if (!data.beats || !Array.isArray(data.beats)) {
        throw new Error('Invalid beat detection response: missing or invalid beats array');
      }

      if (data.beats.length === 0) {
        throw new Error('No beats detected in the audio. The audio may be too quiet, too short, or not contain rhythmic content.');
      }

      // Validate beat timestamps with bounds checking
      const invalidBeats = data.beats.filter((time: any) =>
        typeof time !== 'number' || isNaN(time) || time < 0 || time > 3600 // 1 hour max
      );

      if (invalidBeats.length > 0) {
        console.warn(`⚠️  Found ${invalidBeats.length} invalid beat timestamps, filtering them out`);
        data.beats = data.beats.filter((time: any) =>
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
        const invalidDownbeats = data.downbeats.filter((time: any) =>
          typeof time !== 'number' || isNaN(time) || time < 0 || time > 3600
        );

        if (invalidDownbeats.length > 0) {
          console.warn(`⚠️  Found ${invalidDownbeats.length} invalid downbeat timestamps, filtering them out`);
          data.downbeats = data.downbeats.filter((time: any) =>
            typeof time === 'number' && !isNaN(time) && time >= 0 && time <= 3600
          );
        }
      } else {
        data.downbeats = [];
      }

      // Validate beats_with_positions if present
      if (data.beats_with_positions && Array.isArray(data.beats_with_positions)) {
        const invalidPositions = data.beats_with_positions.filter((beat: any) =>
          !beat ||
          typeof beat.time !== 'number' ||
          typeof beat.beatNum !== 'number' ||
          isNaN(beat.time) ||
          isNaN(beat.beatNum) ||
          beat.time < 0 ||
          beat.time > 3600 ||
          beat.beatNum < 1 ||
          beat.beatNum > data.time_signature
        );

        if (invalidPositions.length > 0) {
          console.warn(`⚠️  Found ${invalidPositions.length} invalid beat positions, filtering them out`);
          data.beats_with_positions = data.beats_with_positions.filter((beat: any) =>
            beat &&
            typeof beat.time === 'number' &&
            typeof beat.beatNum === 'number' &&
            !isNaN(beat.time) &&
            !isNaN(beat.beatNum) &&
            beat.time >= 0 &&
            beat.time <= 3600 &&
            beat.beatNum >= 1 &&
            beat.beatNum <= data.time_signature
          );
        }
      } else {
        data.beats_with_positions = [];
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

      // Enhanced debug logging for validated model outputs
      console.log('=== VALIDATED MODEL OUTPUT DEBUG ===');
      console.log(`Successfully validated ${data.beats.length} beat timestamps`);
      console.log(`BPM: ${data.bpm}, Duration: ${data.duration}s`);
      console.log(`Model: ${data.model}, Time signature: ${data.time_signature}/4`);
      console.log(`Downbeats: ${data.downbeats.length}, Beat positions: ${data.beats_with_positions.length}`);
      console.log('=== END VALIDATED MODEL OUTPUT DEBUG ===');

      return data;
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new Error('Invalid response format from beat detection API');
    }
  } catch (error) {
    console.error('Error in beat detection:', error);

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
}

/**
 * Detects beats in an audio file already on the server
 *
 * @param audioPath - Path to the audio file on the server
 * @param detector - Which beat detector to use ('auto', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromPath(
  audioPath: string,
  detector: 'auto' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto'
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
        throw new Error(errorData.error || `Failed to detect beats (HTTP ${response.status})`);
      } catch (jsonError) {
        // If response isn't valid JSON
        throw new Error(`Beat detection failed with status ${response.status}: ${response.statusText}`);
      }
    }

    try {
      const data = await response.json();
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