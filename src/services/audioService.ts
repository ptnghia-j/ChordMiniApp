/**
 * Audio Extraction Service
 *
 * This service handles the extraction of audio from YouTube videos.
 * It interacts with the backend API to extract audio and prepare it
 * for chord and beat analysis.
 */

/**
 * Extracts audio from a YouTube video and returns the audio URL and data
 * @param videoId The YouTube video ID
 * @returns Promise that resolves to an object containing the audio URL and data
 */
export async function extractAudio(videoId: string): Promise<{
  audioUrl: string;
  audioData: ArrayBuffer;
  fromFirebase?: boolean;
}> {
  try {
    console.log(`Extracting audio for video ID: ${videoId}`);

    // Add timeout control and retry logic
    const controller = new AbortController();
    // Increase timeout to 3 minutes (180 seconds)
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      console.log('Making API request to extract audio...');
      const response = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'Failed to extract audio';

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;

          // Handle YouTube API restrictions specifically
          if (errorMessage.includes('Could not download audio from YouTube') ||
              errorMessage.includes('Could not extract functions') ||
              errorMessage.includes('No audio formats found') ||
              errorMessage.includes('TypeError') ||
              errorMessage.includes('Load failed')) {
            errorMessage = 'YouTube is currently blocking audio extraction for this video. This is a common issue as YouTube frequently updates their systems to prevent downloading. Please try a different video or try again later.';
          }
        } catch {
          // If response isn't JSON, use status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }

        console.error('Server error response:', response.status, response.statusText);
        throw new Error(errorMessage);
      }

      const responseData = await response.json();

      if (!responseData.audioUrl) {
        throw new Error('No audio URL returned from server');
      }

      // Check if the audio is from Firebase Storage
      const fromFirebase = responseData.fromFirebase === true;
      const audioUrl = responseData.audioUrl;

      console.log(`Audio URL: ${audioUrl}, from Firebase: ${fromFirebase}`);

      // Fetch the audio data from the URL
      let audioResponse;
      let audioData;

      try {
        // If the URL is from Firebase, try to fetch from the local cache first
        if (fromFirebase) {
          // Extract the filename from the URL
          const urlParts = audioUrl.split('/');
          const filename = urlParts[urlParts.length - 1];

          // Try to find the file in the local cache
          const localAudioUrl = `/audio/${filename}`;
          console.log(`Trying local audio URL first: ${localAudioUrl}`);

          try {
            audioResponse = await fetch(localAudioUrl);

            if (audioResponse.ok) {
              console.log('Successfully fetched audio from local cache');
              audioData = await audioResponse.arrayBuffer();

              // Check if it's a placeholder file (very small size)
              if (audioData.byteLength < 100) {
                console.log('Found placeholder file, need to download the real audio');
                throw new Error('Placeholder file detected');
              }
            } else {
              throw new Error(`Failed to fetch audio data from local cache: ${localAudioUrl}`);
            }
          } catch {
            console.log('Local audio file not available or is a placeholder, fetching from original URL');

            // Try the original URL
            audioResponse = await fetch(audioUrl);

            if (!audioResponse.ok) {
              console.error(`Failed to fetch audio data from ${audioUrl}, status: ${audioResponse.status}`);
              throw new Error(`Failed to fetch audio data from ${audioUrl}`);
            }

            audioData = await audioResponse.arrayBuffer();

            // Save the audio data to the local cache
            try {
              const saveResponse = await fetch('/api/save-audio', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  videoId,
                  filename,
                  // We can't send the ArrayBuffer directly, so we'll need to implement a different approach
                  // This is just a placeholder for now
                  placeholder: false
                }),
              });

              if (saveResponse.ok) {
                console.log('Successfully saved audio to local cache');
              } else {
                console.error('Failed to save audio to local cache');
              }
            } catch (saveError) {
              console.error('Error saving audio to local cache:', saveError);
            }
          }
        } else {
          // For non-Firebase URLs, just fetch directly
          audioResponse = await fetch(audioUrl);

          if (!audioResponse.ok) {
            console.error(`Failed to fetch audio data from ${audioUrl}, status: ${audioResponse.status}`);
            throw new Error(`Failed to fetch audio data from ${audioUrl}`);
          }

          audioData = await audioResponse.arrayBuffer();
        }
      } catch (error) {
        console.error('Error fetching audio data:', error);
        throw new Error(`Failed to fetch audio data: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!audioData || audioData.byteLength === 0) {
        throw new Error('Received empty audio data');
      }

      console.log('Audio data received successfully, size:', audioData.byteLength, 'bytes');
      return { audioUrl, audioData, fromFirebase };
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Audio extraction timed out. Please try again.');
      }

      // Handle TypeError specifically
      if (fetchError instanceof TypeError ||
          (fetchError instanceof Error && fetchError.message && fetchError.message.includes('TypeError'))) {
        throw new Error('YouTube API has changed and is blocking audio extraction. Please try a different video.');
      }

      // Handle CORS errors
      if (fetchError instanceof Error && fetchError.message && fetchError.message.includes('NetworkError')) {
        throw new Error('Network error - YouTube may be blocking access. Try again later.');
      }

      // Re-throw the original error
      if (fetchError instanceof Error) {
        throw fetchError;
      } else {
        throw new Error('Unknown error during audio extraction');
      }
    }
  } catch (error) {
    console.error('Audio extraction error:', error);
    throw error;
  }
}

/**
 * Converts an ArrayBuffer to a Web Audio AudioBuffer for processing
 * @param audioContext The Web Audio API AudioContext
 * @param arrayBuffer The audio data as an ArrayBuffer
 * @returns Promise that resolves to an AudioBuffer
 */
export async function createAudioBufferFromArrayBuffer(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    audioContext.decodeAudioData(
      arrayBuffer,
      (buffer) => resolve(buffer),
      (error) => reject(new Error(`Error decoding audio data: ${error}`))
    );
  });
}

/**
 * Plays audio from an AudioBuffer through an AudioContext
 * @param audioContext The Web Audio API AudioContext
 * @param audioBuffer The audio data as an AudioBuffer
 * @returns An object containing the audio source node and start/stop methods
 */
export function playAudioBuffer(
  audioContext: AudioContext,
  audioBuffer: AudioBuffer
) {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  return {
    source,
    start: (startTime = 0) => {
      source.start(startTime);
    },
    stop: () => {
      try {
        source.stop();
      } catch {
        // Ignore errors if already stopped
      }
    }
  };
}

/**
 * Complete audio extraction and processing for a YouTube video
 * @param videoId The YouTube video ID
 * @returns Promise that resolves to an object containing the AudioBuffer and metadata
 */
export async function processAudio(videoId: string): Promise<{
  audioBuffer: AudioBuffer;
  audioUrl: string;
  fromFirebase?: boolean;
}> {
  try {
    // Extract audio from YouTube video
    const { audioData, audioUrl, fromFirebase } = await extractAudio(videoId);

    // Create Web Audio context
    // Define a type for the window with webkitAudioContext
    interface WindowWithWebkitAudioContext extends Window {
      webkitAudioContext?: typeof AudioContext;
    }

    // Get the appropriate AudioContext constructor
    const AudioContextClass = window.AudioContext ||
      (window as WindowWithWebkitAudioContext).webkitAudioContext ||
      AudioContext;

    const audioContext = new AudioContextClass();

    // Convert to AudioBuffer
    const audioBuffer = await createAudioBufferFromArrayBuffer(audioContext, audioData);

    return { audioBuffer, audioUrl, fromFirebase };
  } catch (error) {
    console.error('Audio processing error:', error);
    throw error;
  }
}