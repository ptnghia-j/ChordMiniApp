const mockParseBuffer = jest.fn();

jest.mock('music-metadata', () => ({
  parseBuffer: (...args: unknown[]) => mockParseBuffer(...args),
}), { virtual: true });

import {
  isMp3Like,
  parseBrowserYtDlpCandidatePath,
  sha256Hex,
  validateBrowserAudioCandidate,
} from '@/utils/browserAudioValidation';

describe('browserAudioValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseBuffer.mockResolvedValue({
      format: {
        duration: 123.4,
        bitrate: 192000,
      },
    });
  });

  it('parses owner, video ID, and hash from candidate paths', () => {
    const hash = 'a'.repeat(64);

    expect(parseBrowserYtDlpCandidatePath(`audio-candidates/user123/abc123def45/${hash}.mp3`)).toEqual({
      uid: 'user123',
      videoId: 'abc123def45',
      sha256: hash,
    });
  });

  it('detects ID3 and MP3 frame headers', () => {
    expect(isMp3Like(Buffer.from([0x49, 0x44, 0x33, 0x04]))).toBe(true);
    expect(isMp3Like(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
    expect(isMp3Like(Buffer.from('<html>not audio</html>'))).toBe(false);
  });

  it('rejects non-audio bytes before parsing metadata', async () => {
    const buffer = Buffer.from('<html>not audio</html>');

    await expect(validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: 'abc123def45',
      expectedSha256: await sha256Hex(buffer),
      expectedFileSize: buffer.byteLength,
    })).rejects.toThrow('not an MP3');

    expect(mockParseBuffer).not.toHaveBeenCalled();
  });

  it('rejects hash mismatches', async () => {
    const buffer = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);

    await expect(validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: 'abc123def45',
      expectedSha256: '0'.repeat(64),
      expectedFileSize: buffer.byteLength,
    })).rejects.toThrow('hash');
  });

  it('rejects unsupported MIME types', async () => {
    const buffer = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);

    await expect(validateBrowserAudioCandidate({
      buffer,
      contentType: 'text/html',
      expectedVideoId: 'abc123def45',
      expectedSha256: await sha256Hex(buffer),
      expectedFileSize: buffer.byteLength,
    })).rejects.toThrow('Unsupported audio content type');
  });

  it('rejects oversized candidates', async () => {
    const buffer = Buffer.concat([
      Buffer.from([0x49, 0x44, 0x33, 0x04]),
      Buffer.alloc(50 * 1024 * 1024),
    ]);

    await expect(validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: 'abc123def45',
      expectedSha256: await sha256Hex(buffer),
      expectedFileSize: buffer.byteLength,
    })).rejects.toThrow('50MB');
  });

  it('accepts parseable medium MP3 candidates', async () => {
    const buffer = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x01]);

    await expect(validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: 'abc123def45',
      expectedSha256: await sha256Hex(buffer),
      expectedFileSize: buffer.byteLength,
    })).resolves.toEqual({
      duration: 123.4,
      bitrate: 192000,
    });
  });
});
