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

  it('maps queue payloads with cooling_down status and leaseToken', () => {
    expect(__browserYtDlpTestUtils.normalizeQueueState({
      status: 'cooling_down',
      leaseId: 'lease-1',
      leaseToken: 'lease-1.12345.media.sig',
      queuePosition: 0,
      estimatedWaitSeconds: 300,
      retryAfterSeconds: 300,
      leaseExpiresAt: null,
    })).toEqual({
      status: 'cooling_down',
      leaseId: 'lease-1',
      leaseToken: 'lease-1.12345.media.sig',
      queuePosition: 0,
      estimatedWaitSeconds: 300,
      retryAfterSeconds: 300,
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

    it('redacts proxy endpoints from error messages', () => {
      const { redactProxyUrl } = __browserYtDlpTestUtils as any;
      const primary = 'https://chord-mini-youtube-proxy.phantrongnghia510.workers.dev/';
      const secondary = 'https://ytpultimadownloader.robertpetersonkyle2.workers.dev/';

      const msg1 = 'Failed to load resource from https://chord-mini-youtube-proxy.phantrongnghia510.workers.dev/api';
      expect(redactProxyUrl(msg1, primary, secondary)).toBe('Failed to load resource from [REDACTED_PROXY]api');

      const msg2 = 'Failed on ytpultimadownloader.robertpetersonkyle2.workers.dev: status of 403';
      expect(redactProxyUrl(msg2, primary, secondary)).toBe('Failed on [REDACTED_PROXY]: status of 403');

      const msg3 = 'Error connecting to someother-user.workers.dev/endpoint';
      expect(redactProxyUrl(msg3)).toBe('Error connecting to [REDACTED_PROXY]/endpoint');
    });
  });
});
