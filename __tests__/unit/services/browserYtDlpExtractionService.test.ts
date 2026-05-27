class TestHeaders {
  private values = new Map<string, string>();

  set(key: string, value: string) {
    this.values.set(key.toLowerCase(), String(value));
  }

  get(key: string) {
    return this.values.get(key.toLowerCase()) || null;
  }
}

(globalThis as any).Headers = TestHeaders;

jest.mock('@/config/firebase', () => ({
  ensureAuthReady: jest.fn(),
  getAppCheckTokenForApi: jest.fn(),
  getCurrentAuthUser: jest.fn(),
  getStorageInstance: jest.fn(),
}));

import { __browserYtDlpTestUtils } from '@/services/audio/browserYtDlpExtractionService';

describe('browserYtDlpExtractionService queue helpers', () => {
  it('maps queue payloads into a stable browser state shape', () => {
    expect(__browserYtDlpTestUtils.normalizeQueueState({
      status: 'queued',
      leaseId: 'lease-1',
      queuePosition: 2,
      estimatedWaitSeconds: 45,
      retryAfterSeconds: 5,
      leaseExpiresAt: null,
    })).toEqual({
      status: 'queued',
      leaseId: 'lease-1',
      queuePosition: 2,
      estimatedWaitSeconds: 45,
      retryAfterSeconds: 5,
      leaseExpiresAt: null,
    });
  });

  it('adds the queue lease to proxied yt-dlp and media stream requests', () => {
    const headers = __browserYtDlpTestUtils.buildProxyRequestHeaders({
      Referer: 'https://www.youtube.com/watch?v=abcdefghijk',
      Range: 'bytes=0-',
    }, 'lease-1') as Headers;

    expect(headers.get('X-Override-Referer')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(headers.get('X-Override-Range')).toBe('bytes=0-');
    expect(headers.get('X-YouTube-Proxy-Lease')).toBe('lease-1');
    expect(headers.get('X-Skip-YouTube-Auth')).toBe('1');
  });

  describe('proxy routing utilities', () => {
    it('correctly identifies the Ultima Downloader proxy URL', () => {
      const { isUltimaProxy, ULTIMA_PROXY_URL } = __browserYtDlpTestUtils as any;
      expect(ULTIMA_PROXY_URL).toBe('https://ytpultimadownloader.robertpetersonkyle2.workers.dev/');
      expect(isUltimaProxy('https://ytpultimadownloader.robertpetersonkyle2.workers.dev/')).toBe(true);
      expect(isUltimaProxy('https://ytpultimadownloader.robertpetersonkyle2.workers.dev/queue/status')).toBe(true);
      expect(isUltimaProxy('https://www.ultimadownloader.xyz/yt-dlp-worker.js')).toBe(true);
      expect(isUltimaProxy('https://my-custom-proxy.workers.dev/')).toBe(false);
      expect(isUltimaProxy('/api/youtube-media-proxy')).toBe(false);
    });
  });
});
