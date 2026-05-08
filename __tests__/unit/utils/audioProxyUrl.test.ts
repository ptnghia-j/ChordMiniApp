import {
  encodeAudioProxySourceUrl,
  buildAudioProxyUrl,
  isFirebaseProxyRedirectEnabled,
  isForceProxyRequested,
  resolveAudioProxyGetMode,
  AUDIO_PROXY_FORCE_QUERY_PARAM,
  AUDIO_PROXY_FIREBASE_REDIRECT_ENV,
} from '@/utils/audioProxyUrl';

describe('encodeAudioProxySourceUrl', () => {
  it('encodes a regular URL with encodeURIComponent', () => {
    const url = 'https://example.com/audio.mp3?a=1&b=2';
    expect(encodeAudioProxySourceUrl(url)).toBe(encodeURIComponent(url));
  });

  it('preserves square brackets for quicktube.app URLs', () => {
    const url = 'https://quicktube.app/dl/video[123].mp3';
    const encoded = encodeAudioProxySourceUrl(url);
    expect(encoded).toContain('[');
    expect(encoded).toContain(']');
    // The rest should still be encoded
    expect(encoded).not.toContain(' ');
  });

  it('fully encodes non-quicktube URLs including brackets', () => {
    const url = 'https://other.com/file[1].mp3';
    const encoded = encodeAudioProxySourceUrl(url);
    expect(encoded).toContain('%5B');
    expect(encoded).toContain('%5D');
  });
});

describe('buildAudioProxyUrl', () => {
  it('builds a basic proxy URL with encoded source', () => {
    const result = buildAudioProxyUrl('https://example.com/audio.mp3');
    expect(result).toMatch(/^\/api\/proxy-audio\?url=/);
    expect(result).toContain(encodeURIComponent('https://example.com/audio.mp3'));
  });

  it('includes videoId when provided', () => {
    const result = buildAudioProxyUrl('https://example.com/a.mp3', { videoId: 'abc123' });
    expect(result).toContain('videoId=abc123');
  });

  it('does not include videoId when null', () => {
    const result = buildAudioProxyUrl('https://example.com/a.mp3', { videoId: null });
    expect(result).not.toContain('videoId');
  });

  it('includes forceProxy param when true', () => {
    const result = buildAudioProxyUrl('https://example.com/a.mp3', { forceProxy: true });
    expect(result).toContain(`${AUDIO_PROXY_FORCE_QUERY_PARAM}=1`);
  });

  it('does not include forceProxy param when false', () => {
    const result = buildAudioProxyUrl('https://example.com/a.mp3', { forceProxy: false });
    expect(result).not.toContain(AUDIO_PROXY_FORCE_QUERY_PARAM);
  });

  it('includes both videoId and forceProxy', () => {
    const result = buildAudioProxyUrl('https://example.com/a.mp3', {
      videoId: 'vid1',
      forceProxy: true,
    });
    expect(result).toContain('videoId=vid1');
    expect(result).toContain(`${AUDIO_PROXY_FORCE_QUERY_PARAM}=1`);
  });
});

describe('isFirebaseProxyRedirectEnabled', () => {
  it('returns true when env value is undefined', () => {
    expect(isFirebaseProxyRedirectEnabled(undefined)).toBe(true);
  });

  it('returns true when env value is empty string', () => {
    expect(isFirebaseProxyRedirectEnabled('')).toBe(true);
  });

  it('returns true when env value is whitespace', () => {
    expect(isFirebaseProxyRedirectEnabled('  ')).toBe(true);
  });

  it('returns false for "0"', () => {
    expect(isFirebaseProxyRedirectEnabled('0')).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(isFirebaseProxyRedirectEnabled('false')).toBe(false);
  });

  it('returns false for "off"', () => {
    expect(isFirebaseProxyRedirectEnabled('off')).toBe(false);
  });

  it('returns false for "no"', () => {
    expect(isFirebaseProxyRedirectEnabled('no')).toBe(false);
  });

  it('returns false for "FALSE" (case-insensitive)', () => {
    expect(isFirebaseProxyRedirectEnabled('FALSE')).toBe(false);
  });

  it('returns true for "1"', () => {
    expect(isFirebaseProxyRedirectEnabled('1')).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(isFirebaseProxyRedirectEnabled('true')).toBe(true);
  });
});

describe('isForceProxyRequested', () => {
  it('returns false for null', () => {
    expect(isForceProxyRequested(null)).toBe(false);
  });

  it('returns true for empty string', () => {
    expect(isForceProxyRequested('')).toBe(true);
  });

  it('returns true for "1"', () => {
    expect(isForceProxyRequested('1')).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(isForceProxyRequested('true')).toBe(true);
  });

  it('returns true for "yes"', () => {
    expect(isForceProxyRequested('yes')).toBe(true);
  });

  it('returns true for "on"', () => {
    expect(isForceProxyRequested('on')).toBe(true);
  });

  it('returns true for "TRUE" (case-insensitive)', () => {
    expect(isForceProxyRequested('TRUE')).toBe(true);
  });

  it('returns false for "0"', () => {
    expect(isForceProxyRequested('0')).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(isForceProxyRequested('false')).toBe(false);
  });

  it('returns false for "no"', () => {
    expect(isForceProxyRequested('no')).toBe(false);
  });
});

describe('resolveAudioProxyGetMode', () => {
  it('returns proxy for non-Firebase URL', () => {
    expect(
      resolveAudioProxyGetMode({ isFirebaseUrl: false, forceProxyParam: null, redirectEnabled: true }),
    ).toBe('proxy');
  });

  it('returns redirect for Firebase URL with redirect enabled and no force proxy', () => {
    expect(
      resolveAudioProxyGetMode({ isFirebaseUrl: true, forceProxyParam: null, redirectEnabled: true }),
    ).toBe('redirect');
  });

  it('returns proxy for Firebase URL when redirect is disabled', () => {
    expect(
      resolveAudioProxyGetMode({ isFirebaseUrl: true, forceProxyParam: null, redirectEnabled: false }),
    ).toBe('proxy');
  });

  it('returns proxy for Firebase URL when force proxy is requested', () => {
    expect(
      resolveAudioProxyGetMode({ isFirebaseUrl: true, forceProxyParam: '1', redirectEnabled: true }),
    ).toBe('proxy');
  });

  it('returns proxy when both redirect disabled and force proxy set', () => {
    expect(
      resolveAudioProxyGetMode({ isFirebaseUrl: true, forceProxyParam: '1', redirectEnabled: false }),
    ).toBe('proxy');
  });
});

describe('exported constants', () => {
  it('AUDIO_PROXY_FORCE_QUERY_PARAM is forceProxy', () => {
    expect(AUDIO_PROXY_FORCE_QUERY_PARAM).toBe('forceProxy');
  });

  it('AUDIO_PROXY_FIREBASE_REDIRECT_ENV is correct', () => {
    expect(AUDIO_PROXY_FIREBASE_REDIRECT_ENV).toBe('AUDIO_PROXY_FIREBASE_REDIRECT_ENABLED');
  });
});
