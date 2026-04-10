import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import {
  parseAndValidateAudioSourceUrl,
  type SafeAudioSourceValidationOptions,
} from './urlValidationUtils';

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;
const DISALLOWED_IP_BLOCKLIST = new BlockList();

const DISALLOWED_IPV4_SUBNETS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const DISALLOWED_IPV6_SUBNETS: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
];

for (const [network, prefix] of DISALLOWED_IPV4_SUBNETS) {
  DISALLOWED_IP_BLOCKLIST.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of DISALLOWED_IPV6_SUBNETS) {
  DISALLOWED_IP_BLOCKLIST.addSubnet(network, prefix, 'ipv6');
}

export interface SafeServerAudioFetchOptions extends SafeAudioSourceValidationOptions {
  maxRedirects?: number;
}

function isDevelopmentLocalhostAllowed(
  url: URL,
  options: SafeAudioSourceValidationOptions
): boolean {
  return (
    options.allowDevelopmentLocalhost === true &&
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  );
}

function isDisallowedIpAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return DISALLOWED_IP_BLOCKLIST.check(address, 'ipv4');
  }

  if (family === 6) {
    return DISALLOWED_IP_BLOCKLIST.check(address, 'ipv6');
  }

  return false;
}

async function assertSafeResolvedAddress(
  url: URL,
  options: SafeAudioSourceValidationOptions
): Promise<void> {
  if (isDevelopmentLocalhostAllowed(url, options)) {
    return;
  }

  if (isDisallowedIpAddress(url.hostname)) {
    throw new Error('URL resolves to a disallowed IP address');
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error('URL hostname did not resolve to any addresses');
  }

  for (const { address } of addresses) {
    if (isDisallowedIpAddress(address)) {
      throw new Error('URL resolves to a disallowed IP address');
    }
  }
}

export async function assertSafeServerAudioSourceUrl(
  url: string,
  options: SafeAudioSourceValidationOptions = {}
): Promise<URL> {
  const parsedUrl = parseAndValidateAudioSourceUrl(url, options);
  await assertSafeResolvedAddress(parsedUrl, options);
  return parsedUrl;
}

export async function safeFetchAudioSource(
  url: string,
  init: RequestInit = {},
  options: SafeServerAudioFetchOptions = {}
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...validationOptions } = options;

  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`Safe audio source fetch only supports GET/HEAD requests (received ${method})`);
  }

  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const parsedUrl = await assertSafeServerAudioSourceUrl(currentUrl, validationOptions);

    const response = await fetch(parsedUrl.toString(), {
      ...init,
      method,
      redirect: 'manual',
    });

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new Error('Too many redirects while fetching audio source');
    }

    const location = response.headers.get('location');

    if (!location) {
      throw new Error('Redirect response missing Location header');
    }

    currentUrl = new URL(location, parsedUrl).toString();
  }

  throw new Error('Too many redirects while fetching audio source');
}
