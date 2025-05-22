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
}

// Interface for beat detection response
export interface BeatDetectionResult {
  success: boolean;
  beats: number[];            // Array of beat timestamps in seconds
  beat_info: BeatInfo[];      // Detailed beat info with strength values
  beats_with_positions?: BeatPosition[]; // Beats with their positions in measures
  downbeats?: number[];      // Array of downbeat timestamps (only for Beat-Transformer)
  downbeats_with_measures?: DownbeatInfo[]; // Downbeats with measure information
  bpm: number;                // Beats per minute
  total_beats: number;
  total_downbeats?: number;   // Only for Beat-Transformer
  duration: number;           // Duration of the audio in seconds
  model?: string;             // Which model was used (librosa or Beat-Transformer)
  error?: string;             // Optional error message
  time_signature?: number;    // Time signature (beats per measure, e.g., 4 for 4/4, 3 for 3/4)
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
      default_model: 'librosa',
      available_models: ['librosa'],
      beat_transformer_available: false,
      madmom_available: false,
      error: error instanceof Error ? error.message : 'Unknown error getting model info'
    };
  }
}

/**
 * Detects beats in an audio file using the Python backend API
 *
 * @param audioFile - The audio file to analyze (File object)
 * @param detector - Which beat detector to use ('auto', 'librosa', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @param onProgress - Optional callback for upload progress
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromFile(
  audioFile: File,
  detector: 'auto' | 'librosa' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto',
  onProgress?: (percent: number) => void
): Promise<BeatDetectionResult> {
  try {
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
                reject(new Error('The audio file is too large even with force=true. Try a smaller file, use beat-transformer-light, madmom, or librosa detector.'));
              } else if (detector === 'beat-transformer-light') {
                // If Beat-Transformer Light was requested but still got 413, the file is extremely large
                reject(new Error('The audio file is too large even with force=true. Try a smaller file, use madmom/librosa detector, or use the audio path method.'));
              } else {
                reject(new Error('The audio file is too large to process. Try a smaller file, use madmom/librosa detector, or try again with beat-transformer-light and force=true.'));
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
          throw new Error('The audio file is too large even with force=true. Try a smaller file, use beat-transformer-light, madmom, or librosa detector.');
        } else if (detector === 'beat-transformer-light') {
          // If Beat-Transformer Light was requested but still got 413, the file is extremely large
          throw new Error('The audio file is too large even with force=true. Try a smaller file, use madmom/librosa detector, or use the audio path method.');
        } else {
          throw new Error('The audio file is too large to process. Try a smaller file, use madmom/librosa detector, or try again with beat-transformer-light and force=true.');
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
      beat_info: [],
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
 * @param detector - Which beat detector to use ('auto', 'librosa', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @returns Promise with beat detection results
 */
export async function detectBeatsFromPath(
  audioPath: string,
  detector: 'auto' | 'librosa' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto'
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
      beat_info: [],
      bpm: 0,
      total_beats: 0,
      duration: 0,
      error: error instanceof Error ? error.message : 'Unknown error in beat detection'
    };
  }
}