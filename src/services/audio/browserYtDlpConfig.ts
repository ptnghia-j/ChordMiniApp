export const BROWSER_YTDLP_OUTPUT_FORMAT = 'mp3';
export const BROWSER_YTDLP_AUDIO_BITRATE = '192k';
export const BROWSER_YTDLP_MAX_FINAL_BYTES = 50 * 1024 * 1024;
export const BROWSER_YTDLP_WORKER_PATH = '/browser-ytdlp-worker.js';

export function getBrowserYtDlpFfmpegArgs(inputName: string, outputName: string): string[] {
  return [
    '-i',
    inputName,
    '-vn',
    '-c:a',
    'libmp3lame',
    '-b:a',
    BROWSER_YTDLP_AUDIO_BITRATE,
    outputName,
  ];
}
