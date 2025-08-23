/**
 * Convert AudioBuffer to WAV format with enhanced bounds checking
 */
export async function audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
  try {
    if (!audioBuffer) throw new Error('AudioBuffer is null or undefined');

    const numOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    if (numOfChannels <= 0 || numOfChannels > 32) throw new Error(`Invalid number of channels: ${numOfChannels}. Must be between 1 and 32.`);
    if (length <= 0 || length > 192000 * 300) throw new Error(`Invalid audio length: ${length} samples. Must be between 1 and ${192000 * 300} samples.`);
    if (sampleRate <= 0 || sampleRate > 192000) throw new Error(`Invalid sample rate: ${sampleRate}Hz. Must be between 1 and 192000 Hz.`);

    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;

    if (dataSize > 2147483647) throw new Error(`Audio data too large: ${dataSize} bytes. Maximum supported size is 2GB.`);
    const totalBufferSize = 44 + dataSize;
    if (totalBufferSize > 2147483647) throw new Error(`Total WAV file size too large: ${totalBufferSize} bytes.`);

    const buffer = new ArrayBuffer(totalBufferSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData: Float32Array[] = [];
    for (let i = 0; i < numOfChannels; i++) {
      const channelBuffer = audioBuffer.getChannelData(i);
      if (!channelBuffer || channelBuffer.length !== length) {
        throw new Error(`Invalid channel data for channel ${i}: expected ${length} samples, got ${channelBuffer?.length || 0}`);
      }
      channelData.push(channelBuffer);
    }

    let writeOffset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numOfChannels; channel++) {
        if (writeOffset < 44 || writeOffset >= totalBufferSize - 1) throw new Error(`Write offset out of bounds: ${writeOffset} (buffer size: ${totalBufferSize})`);
        let sample = channelData[channel][i];
        if (typeof sample !== 'number' || isNaN(sample)) sample = 0;
        sample = Math.max(-1, Math.min(1, sample));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        sample = Math.max(-32768, Math.min(32767, Math.round(sample)));
        view.setInt16(writeOffset, sample, true);
        writeOffset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  } catch (error) {
    console.error('Error in audioBufferToWav:', error);
    throw new Error(`Failed to convert AudioBuffer to WAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function writeString(view: DataView, offset: number, string: string): void {
  if (!view) throw new Error('DataView is null or undefined');
  if (typeof offset !== 'number' || offset < 0) throw new Error(`Invalid offset: ${offset}. Must be a non-negative number.`);
  if (typeof string !== 'string') throw new Error(`Invalid string: ${string}. Must be a string.`);
  if (offset + string.length > view.byteLength) throw new Error(`String write would exceed buffer bounds: offset ${offset} + length ${string.length} > buffer size ${view.byteLength}`);
  for (let i = 0; i < string.length; i++) {
    const charCode = string.charCodeAt(i);
    if (isNaN(charCode) || charCode < 0 || charCode > 255) throw new Error(`Invalid character code at position ${i}: ${charCode}. Must be between 0 and 255.`);
    view.setUint8(offset + i, charCode);
  }
}

