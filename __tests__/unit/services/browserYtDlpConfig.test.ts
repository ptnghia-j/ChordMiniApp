import {
  BROWSER_YTDLP_AUDIO_BITRATE,
  getBrowserYtDlpFfmpegArgs,
} from '@/services/audio/browserYtDlpConfig';

describe('browserYtDlpConfig', () => {
  it('pins browser production extraction to medium 192 kbps MP3 output', () => {
    expect(BROWSER_YTDLP_AUDIO_BITRATE).toBe('192k');
    expect(getBrowserYtDlpFfmpegArgs('input.m4a', 'output.mp3')).toEqual([
      '-i',
      'input.m4a',
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      'output.mp3',
    ]);
  });
});
