/**
 * Audio Conversion Utilities
 * 
 * CRITICAL FIX: Ensures all audio files are standardized to 44100Hz sample rate
 * before being sent to the Beat-Transformer model to prevent frame rate mismatches
 * in DBN post-processing that cause only 1 beat detection instead of proper beat arrays.
 */

/**
 * Converts an audio file to 44100Hz sample rate using Web Audio API
 * 
 * @param audioFile - The input audio file
 * @returns Promise<File> - The converted audio file at 44100Hz
 */
export async function convertAudioTo44100Hz(audioFile: File): Promise<File> {
  try {
    console.log(`🔧 CRITICAL FIX: Converting audio to 44100Hz - input: ${audioFile.name} (${audioFile.size} bytes)`);
    
    // Read the audio file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Create AudioContext with target sample rate of 44100Hz
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextClass({
      sampleRate: 44100
    });
    
    console.log(`🔧 AudioContext created with sample rate: ${audioContext.sampleRate}Hz`);
    
    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(`🔧 Original audio: ${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);
    
    // Check if conversion is needed
    if (audioBuffer.sampleRate === 44100) {
      console.log(`✅ Audio already at 44100Hz, no conversion needed`);
      audioContext.close();
      return audioFile;
    }
    
    // Create OfflineAudioContext for conversion
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.ceil(audioBuffer.duration * 44100), // Duration in samples at 44100Hz
      44100 // Target sample rate
    );
    
    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Connect to destination
    source.connect(offlineContext.destination);
    
    // Start rendering
    source.start(0);
    const convertedBuffer = await offlineContext.startRendering();
    
    console.log(`🔧 Converted audio: ${convertedBuffer.sampleRate}Hz, ${convertedBuffer.duration.toFixed(2)}s, ${convertedBuffer.numberOfChannels} channels`);
    
    // Convert AudioBuffer to WAV file
    const wavBlob = audioBufferToWav(convertedBuffer);
    
    // Create new File with converted audio
    const convertedFile = new File([wavBlob], audioFile.name.replace(/\.[^/.]+$/, '_44100Hz.wav'), {
      type: 'audio/wav'
    });
    
    console.log(`✅ CRITICAL FIX: Audio converted to 44100Hz - output: ${convertedFile.name} (${convertedFile.size} bytes)`);
    
    // Clean up
    audioContext.close();
    
    return convertedFile;
    
  } catch (error) {
    console.error(`❌ Audio conversion failed:`, error);
    console.warn(`⚠️ Falling back to original file - this may cause beat detection issues if sample rate != 44100Hz`);
    return audioFile;
  }
}

/**
 * Converts AudioBuffer to WAV format
 * 
 * @param buffer - The AudioBuffer to convert
 * @returns Blob - WAV audio blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const bufferSize = 44 + dataSize;
  
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Convert audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Detects the sample rate of an audio file without full conversion
 * 
 * @param audioFile - The audio file to analyze
 * @returns Promise<number> - The detected sample rate
 */
export async function detectAudioSampleRate(audioFile: File): Promise<number> {
  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextClass();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    audioContext.close();
    return sampleRate;
  } catch (error) {
    console.warn(`⚠️ Could not detect sample rate:`, error);
    return 44100; // Default assumption
  }
}

/**
 * Checks if an audio file needs conversion to 44100Hz
 * 
 * @param audioFile - The audio file to check
 * @returns Promise<boolean> - True if conversion is needed
 */
export async function needsConversionTo44100Hz(audioFile: File): Promise<boolean> {
  try {
    const sampleRate = await detectAudioSampleRate(audioFile);
    return sampleRate !== 44100;
  } catch (error) {
    console.warn(`⚠️ Could not determine if conversion needed:`, error);
    return false; // Assume no conversion needed if we can't detect
  }
}

/**
 * Converts audio file to 44100Hz with progress tracking
 * 
 * @param audioFile - The input audio file
 * @param onProgress - Optional progress callback (0-100)
 * @returns Promise<File> - The converted audio file
 */
export async function convertAudioTo44100HzWithProgress(
  audioFile: File,
  onProgress?: (progress: number) => void
): Promise<File> {
  try {
    onProgress?.(10); // Starting conversion
    
    const needsConversion = await needsConversionTo44100Hz(audioFile);
    onProgress?.(20);
    
    if (!needsConversion) {
      onProgress?.(100);
      return audioFile;
    }
    
    onProgress?.(30);
    const convertedFile = await convertAudioTo44100Hz(audioFile);
    onProgress?.(100);
    
    return convertedFile;
  } catch (error) {
    console.error(`❌ Audio conversion with progress failed:`, error);
    onProgress?.(100);
    return audioFile;
  }
}
