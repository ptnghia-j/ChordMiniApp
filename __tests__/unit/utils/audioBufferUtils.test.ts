import { audioBufferToWav } from '@/utils/audioBufferUtils';

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function createMockAudioBuffer(
  channels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let i = 0; i < channels; i++) {
    channelData.push(new Float32Array(length).fill(0.5));
  }
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

async function expectAudioBufferToWavError(
  audioBuffer: AudioBuffer,
  message: string,
): Promise<void> {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(audioBufferToWav(audioBuffer)).rejects.toThrow(message);
  expect(consoleErrorSpy).toHaveBeenCalledWith('Error in audioBufferToWav:', expect.any(Error));

  consoleErrorSpy.mockRestore();
}

describe('audioBufferToWav', () => {
  it('converts a valid mono AudioBuffer to a WAV Blob', async () => {
    const buffer = createMockAudioBuffer(1, 44100, 44100);
    const blob = await audioBufferToWav(buffer);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
    // 44 header + 44100 samples * 1 ch * 2 bytes
    expect(blob.size).toBe(44 + 44100 * 2);
  });

  it('converts a valid stereo AudioBuffer with interleaved data', async () => {
    const buffer = createMockAudioBuffer(2, 1000, 44100);
    const blob = await audioBufferToWav(buffer);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
    // 44 header + 1000 samples * 2 channels * 2 bytes
    expect(blob.size).toBe(44 + 1000 * 2 * 2);
  });

  it('produces a WAV with correct RIFF header', async () => {
    const buffer = createMockAudioBuffer(1, 100, 44100);
    const blob = await audioBufferToWav(buffer);
    const arrayBuffer = await blobToArrayBuffer(blob);
    const view = new DataView(arrayBuffer);

    // First 4 bytes should be 'RIFF'
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    expect(riff).toBe('RIFF');

    // Bytes 8-11 should be 'WAVE'
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    expect(wave).toBe('WAVE');
  });

  it('writes correct WAV fmt chunk values', async () => {
    const buffer = createMockAudioBuffer(2, 100, 48000);
    const blob = await audioBufferToWav(buffer);
    const arrayBuffer = await blobToArrayBuffer(blob);
    const view = new DataView(arrayBuffer);

    // Audio format (PCM = 1) at offset 20
    expect(view.getUint16(20, true)).toBe(1);
    // Number of channels at offset 22
    expect(view.getUint16(22, true)).toBe(2);
    // Sample rate at offset 24
    expect(view.getUint32(24, true)).toBe(48000);
    // Bits per sample at offset 34
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('throws for 0 channels', async () => {
    const buffer = createMockAudioBuffer(0, 100, 44100);
    await expectAudioBufferToWavError(buffer, 'Invalid number of channels');
  });

  it('throws for >32 channels', async () => {
    const buffer = createMockAudioBuffer(33, 100, 44100);
    await expectAudioBufferToWavError(buffer, 'Invalid number of channels');
  });

  it('throws for 0 length', async () => {
    const buffer = createMockAudioBuffer(1, 0, 44100);
    await expectAudioBufferToWavError(buffer, 'Invalid audio length');
  });

  it('throws for invalid sample rate (0)', async () => {
    const buffer = {
      numberOfChannels: 1,
      length: 100,
      sampleRate: 0,
      duration: 0,
      getChannelData: () => new Float32Array(100).fill(0.5),
    } as unknown as AudioBuffer;
    await expectAudioBufferToWavError(buffer, 'Invalid sample rate');
  });

  it('throws for sample rate exceeding 192000', async () => {
    const buffer = {
      numberOfChannels: 1,
      length: 100,
      sampleRate: 200000,
      duration: 0,
      getChannelData: () => new Float32Array(100).fill(0.5),
    } as unknown as AudioBuffer;
    await expectAudioBufferToWavError(buffer, 'Invalid sample rate');
  });

  it('throws for null AudioBuffer', async () => {
    await expectAudioBufferToWavError(null as unknown as AudioBuffer, 'AudioBuffer is null or undefined');
  });

  it('clamps sample values to [-1, 1] range', async () => {
    const channelData = new Float32Array([2.0, -2.0, 0.5, NaN]);
    const buffer = {
      numberOfChannels: 1,
      length: 4,
      sampleRate: 44100,
      duration: 4 / 44100,
      getChannelData: () => channelData,
    } as unknown as AudioBuffer;

    const blob = await audioBufferToWav(buffer);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(44 + 4 * 2);
  });
});
