const FIREBASE_PROXY_REDIRECT_DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

export const AUDIO_PROXY_FORCE_QUERY_PARAM = 'forceProxy';
export const AUDIO_PROXY_FIREBASE_REDIRECT_ENV = 'AUDIO_PROXY_FIREBASE_REDIRECT_ENABLED';

export interface BuildAudioProxyUrlOptions {
  videoId?: string | null;
  forceProxy?: boolean;
}

export interface ResolveAudioProxyGetModeOptions {
  isFirebaseUrl: boolean;
  forceProxyParam: string | null;
  redirectEnabled?: boolean;
}

export function encodeAudioProxySourceUrl(audioUrl: string): string {
  if (audioUrl.includes('quicktube.app/dl/')) {
    return encodeURIComponent(audioUrl).replace(/%5B/g, '[').replace(/%5D/g, ']');
  }

  return encodeURIComponent(audioUrl);
}

export function buildAudioProxyUrl(
  audioUrl: string,
  options: BuildAudioProxyUrlOptions = {},
): string {
  const queryParts = [`url=${encodeAudioProxySourceUrl(audioUrl)}`];

  if (options.videoId) {
    queryParts.push(`videoId=${encodeURIComponent(options.videoId)}`);
  }

  if (options.forceProxy) {
    queryParts.push(`${AUDIO_PROXY_FORCE_QUERY_PARAM}=1`);
  }

  return `/api/proxy-audio?${queryParts.join('&')}`;
}

export function isFirebaseProxyRedirectEnabled(
  envValue: string | undefined = process.env[AUDIO_PROXY_FIREBASE_REDIRECT_ENV],
): boolean {
  if (envValue == null || envValue.trim() === '') {
    return true;
  }

  return !FIREBASE_PROXY_REDIRECT_DISABLED_VALUES.has(envValue.trim().toLowerCase());
}

export function isForceProxyRequested(forceProxyParam: string | null): boolean {
  if (forceProxyParam == null) {
    return false;
  }

  const normalized = forceProxyParam.trim().toLowerCase();
  return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function resolveAudioProxyGetMode(
  options: ResolveAudioProxyGetModeOptions,
): 'redirect' | 'proxy' {
  if (!options.isFirebaseUrl) {
    return 'proxy';
  }

  if (!options.redirectEnabled || isForceProxyRequested(options.forceProxyParam)) {
    return 'proxy';
  }

  return 'redirect';
}
