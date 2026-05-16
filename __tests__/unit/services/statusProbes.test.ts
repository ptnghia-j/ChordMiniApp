const mockGetPythonApiUrl = jest.fn(() => 'https://python.private.test');
const mockGetSheetSageApiUrl = jest.fn(() => 'https://sheetsage.private.test');
const mockGetYtMp3GoBaseUrl = jest.fn(() => 'https://yt.private.test');
const mockCreateSafeTimeoutSignal = jest.fn(() => new AbortController().signal);
const mockExtractAudio = jest.fn();

jest.mock('@/config/serverBackend', () => ({
  getPythonApiUrl: () => mockGetPythonApiUrl(),
  getSheetSageApiUrl: () => mockGetSheetSageApiUrl(),
  getYtMp3GoBaseUrl: () => mockGetYtMp3GoBaseUrl(),
}));

jest.mock('@/utils/environmentUtils', () => ({
  createSafeTimeoutSignal: (timeoutMs: number) => mockCreateSafeTimeoutSignal(timeoutMs),
}));

jest.mock('@/services/youtube/ytMp3GoService', () => ({
  ytMp3GoService: {
    extractAudio: (...args: unknown[]) => mockExtractAudio(...args),
  },
}));

import { runStandardStatusProbes, runYtExtractionStatusProbe } from '@/services/status/statusProbes';

describe('statusProbes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      STATUS_YT2MP3GO_INFO_TIMEOUT_MS: '30000',
      STATUS_YT2MP3GO_EXTRACTION_TIMEOUT_MS: '250000',
      STATUS_YT2MP3GO_TEST_VIDEO_ID: 'CizitNpshbM',
      STATUS_YT2MP3GO_TEST_QUALITY: 'low',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('retries transient yt2mp3go metadata failures before marking the service healthy', async () => {
    let ytInfoAttempts = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/yt-downloader/info')) {
        ytInfoAttempts += 1;
        return {
          ok: ytInfoAttempts > 1,
          status: ytInfoAttempts > 1 ? 200 : 400,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();
    const ytProbe = probes.find((probe) => probe.serviceId === 'yt2mp3go');

    expect(ytInfoAttempts).toBe(2);
    expect(ytProbe).toMatchObject({
      probeKind: 'metadata',
      status: 'operational',
      ok: true,
    });
  });

  it('retries quick yt2mp3go extraction failures before recording an outage', async () => {
    mockExtractAudio
      .mockResolvedValueOnce({ success: false, videoId: 'CizitNpshbM' })
      .mockResolvedValueOnce({ success: true, videoId: 'CizitNpshbM' });

    const probe = await runYtExtractionStatusProbe();

    expect(mockExtractAudio).toHaveBeenCalledTimes(2);
    expect(probe).toMatchObject({
      serviceId: 'yt2mp3go',
      probeKind: 'extraction',
      status: 'operational',
      ok: true,
    });
  });
});
