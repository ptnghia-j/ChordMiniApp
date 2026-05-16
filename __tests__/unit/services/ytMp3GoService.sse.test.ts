import { YtMp3GoService, YtMp3GoResult } from '@/services/youtube/ytMp3GoService';

type YtMp3GoPrivate = {
  consumeSseBuffer: (buffer: string) => { messages: string[]; remainder: string };
  parseJobStatusPayload: (payload: string) => {
    status: 'processing' | 'complete' | 'failed';
    filePath?: string;
    fileSize?: number;
    error?: string;
  } | null;
  handleJobTerminalStatus: (
    jobStatus: {
      status: 'processing' | 'complete' | 'failed';
      filePath?: string;
      fileSize?: number;
      error?: string;
    },
    jobId: string,
    videoId: string,
    title?: string,
    duration?: number
  ) => Promise<YtMp3GoResult | null>;
  monitorJobStatus: (
    jobId: string,
    videoId: string,
    title?: string,
    duration?: number
  ) => Promise<YtMp3GoResult>;
  monitorJobStatusWithStreamingSse: (
    jobId: string,
    videoId: string,
    title?: string,
    duration?: number
  ) => Promise<YtMp3GoResult>;
  validateFileContentWithMetadata: (url: string) => Promise<{ isValid: boolean; realDuration?: number }>;
  getJobErrorDetails: (jobId: string) => Promise<string>;
};

describe('YtMp3GoService SSE monitoring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      YT_MP3_GO_BASE_URL: 'https://yt-private.example.com',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('handles chunked SSE boundaries without emitting partial messages', () => {
    const service = new YtMp3GoService();
    const privateService = service as unknown as YtMp3GoPrivate;

    const firstChunkResult = privateService.consumeSseBuffer('data: {"status":"processing"');
    expect(firstChunkResult.messages).toEqual([]);
    expect(firstChunkResult.remainder).toBe('data: {"status":"processing"');

    const secondChunkResult = privateService.consumeSseBuffer(
      `${firstChunkResult.remainder}}\n\n` +
      'data: {"status":"complete","filePath":"downloads/job123/audio.mp3"}\n\n'
    );

    expect(secondChunkResult.messages).toEqual([
      '{"status":"processing"}',
      '{"status":"complete","filePath":"downloads/job123/audio.mp3"}',
    ]);
    expect(secondChunkResult.remainder).toBe('');
  });

  it('ignores malformed SSE payloads and keeps the latest valid status', () => {
    const service = new YtMp3GoService();
    const privateService = service as unknown as YtMp3GoPrivate;

    const sampleSse =
      'data: {not-json}\n\n' +
      'data: {"status":"processing"}\n\n' +
      'data: {"status":"failed","error":"final failure"}\n\n';

    const { messages } = privateService.consumeSseBuffer(sampleSse);
    const parsedStatuses = messages
      .map(message => privateService.parseJobStatusPayload(message))
      .filter(Boolean);

    const latest = parsedStatuses[parsedStatuses.length - 1];

    expect(latest).toEqual({
      status: 'failed',
      error: 'final failure',
    });
  });

  it('returns success result for complete terminal statuses', async () => {
    const service = new YtMp3GoService();
    const privateService = service as unknown as YtMp3GoPrivate;

    jest.spyOn(privateService, 'validateFileContentWithMetadata').mockResolvedValue({
      isValid: true,
      realDuration: 143,
    });

    const result = await privateService.handleJobTerminalStatus(
      {
        status: 'complete',
        filePath: 'downloads/jobABC/song.mp3',
        fileSize: 1_024,
      },
      'jobABC',
      'abc123def45',
      'Test Song',
      120
    );

    expect(result).toEqual({
      success: true,
      audioUrl: 'https://yt-private.example.com/yt-downloader/downloads/jobABC/song.mp3',
      videoId: 'abc123def45',
      title: 'Test Song',
      duration: 143,
      filename: 'song.mp3',
      jobId: 'jobABC',
    });
  });

  it('returns failure result for failed terminal statuses', async () => {
    const service = new YtMp3GoService();
    const privateService = service as unknown as YtMp3GoPrivate;

    jest.spyOn(privateService, 'getJobErrorDetails').mockResolvedValue('yt-dlp returned exit code 1');

    const result = await privateService.handleJobTerminalStatus(
      {
        status: 'failed',
        error: 'download failed',
      },
      'jobDEF',
      'abc123def45',
      'Test Song',
      120
    );

    expect(result).toEqual({
      success: false,
      error: 'yt-mp3-go extraction failed: download failed (Details: yt-dlp returned exit code 1)',
      videoId: 'abc123def45',
      title: 'Test Song',
      duration: 120,
      jobId: 'jobDEF',
    });
  });

  it('propagates stream timeout errors when SSE monitoring fails', async () => {
    const service = new YtMp3GoService();
    const privateService = service as unknown as YtMp3GoPrivate;

    jest
      .spyOn(privateService, 'monitorJobStatusWithStreamingSse')
      .mockRejectedValue(new Error('AbortError: stream timeout'));

    await expect(privateService.monitorJobStatus('jobXYZ', 'abc123def45'))
      .rejects
      .toThrow('AbortError: stream timeout');
  });
});
