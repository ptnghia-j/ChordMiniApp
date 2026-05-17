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

  it('aggregates standard endpoint probes into one result per service', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
    }) as Response);

    const probes = await runStandardStatusProbes();

    expect(probes.map((probe) => probe.serviceId)).toEqual(['beat', 'chord', 'sheetsage', 'yt2mp3go']);
    expect(probes.filter((probe) => probe.serviceId === 'beat')).toHaveLength(1);
    expect(probes.filter((probe) => probe.serviceId === 'chord')).toHaveLength(1);
    expect(probes.filter((probe) => probe.serviceId === 'sheetsage')).toHaveLength(1);
    expect(probes.find((probe) => probe.serviceId === 'beat')).toMatchObject({
      status: 'operational',
      ok: true,
    });
  });

  it('retries transient standard endpoint failures and reports operational recovery', async () => {
    const attemptsByUrl = new Map<string, number>();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const attempts = (attemptsByUrl.get(url) || 0) + 1;
      attemptsByUrl.set(url, attempts);

      if (url === 'https://python.private.test/api/chord-model-info' && attempts === 1) {
        return {
          ok: false,
          status: 503,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
      } as Response;
    });

    const probes = await runStandardStatusProbes();
    const chordProbe = probes.find((probe) => probe.serviceId === 'chord');

    expect(attemptsByUrl.get('https://python.private.test/api/chord-model-info')).toBe(2);
    expect(chordProbe).toMatchObject({
      serviceId: 'chord',
      status: 'operational',
      ok: true,
    });
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
