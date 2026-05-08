import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

describe('audioDurationUtils', () => {
  const originalAudio = global.Audio;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(global, 'Audio', {
      value: originalAudio,
      configurable: true,
      writable: true,
    });
  });

  it('rejects file-duration detection in non-browser/server environments', async () => {
    Object.defineProperty(global, 'Audio', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'demo.mp3', { type: 'audio/mpeg' });

    await expect(getAudioDurationFromFile(file)).rejects.toThrow(
      'Audio duration detection from File is only available in browser environments'
    );
  });
});