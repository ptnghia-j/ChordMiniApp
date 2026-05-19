import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_PROXY_BYTES = 80 * 1024 * 1024;
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const ALLOWED_HOST_SUFFIXES = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'googlevideo.com',
  'ytimg.com',
  'youtubei.googleapis.com',
  'google.com',
  'googleapis.com',
  'gstatic.com',
];

function isAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (net.isIP(normalized)) {
    return false;
  }

  return ALLOWED_HOST_SUFFIXES.some((suffix) => (
    normalized === suffix || normalized.endsWith(`.${suffix}`)
  ));
}

function parseTargetUrl(value: string | null | undefined): URL {
  if (!value) {
    throw new Error('Missing target URL.');
  }

  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS YouTube media URLs are allowed.');
  }

  if (!isAllowedHost(parsed.hostname)) {
    throw new Error(`YouTube media proxy does not allow host: ${parsed.hostname}`);
  }

  return parsed;
}

function getConfiguredYouTubeCookie(): string | null {
  const envCookie = process.env.YOUTUBE_COOKIE?.trim();
  if (envCookie) {
    return envCookie;
  }

  const envCookiePath = process.env.YOUTUBE_COOKIE_FILE?.trim();
  const fallbackPath = process.env.NODE_ENV !== 'production'
    ? path.join(process.cwd(), 'YOUTUBE_COOKIE.txt')
    : null;
  const cookiePath = envCookiePath || fallbackPath;

  if (!cookiePath) {
    return null;
  }

  try {
    const resolvedPath = path.resolve(cookiePath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const fileCookie = fs.readFileSync(resolvedPath, 'utf8').trim();
    return fileCookie || null;
  } catch (error) {
    console.warn('[YouTube proxy] Failed to load configured cookie file:', error instanceof Error ? error.message : error);
    return null;
  }
}

function normalizeCookieHeader(rawCookie: string): string {
  let cookieStr = rawCookie.trim();
  if (
    (cookieStr.startsWith('"') && cookieStr.endsWith('"')) ||
    (cookieStr.startsWith("'") && cookieStr.endsWith("'"))
  ) {
    cookieStr = cookieStr.slice(1, -1).trim();
  }
  cookieStr = cookieStr.replace(/^Cookie:\s*/i, '');

  // Auto-parse Netscape format if provided by yt-dlp cookie export.
  if (cookieStr.includes('# Netscape HTTP Cookie File') || cookieStr.includes('.youtube.com') || cookieStr.includes('\t') || cookieStr.includes('\\t')) {
    const parts: string[] = [];
    const lines = cookieStr
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const tokens = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(/\s+/);
      if (tokens.length >= 7) {
        parts.push(`${tokens[5]}=${tokens[6]}`);
      }
    }
    cookieStr = parts.join('; ');
  } else {
    cookieStr = cookieStr
      .replace(/\\n|\\r|\r?\n|\r/g, '')
      .replace(/\\t|\t/g, ' ');
  }

  return cookieStr
    .replace(/\r?\n|\r/g, ' ')
    .split(';')
    .map(part => part.trim())
    .filter(part => /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=[\s\S]*$/.test(part))
    .join('; ');
}

function isYouTubeAuthHost(target?: URL): boolean {
  const hostname = target?.hostname.toLowerCase();
  return Boolean(hostname && (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtubei.googleapis.com'
  ));
}

async function applyYouTubeAuthHeaders(headers: Headers, cookieStr: string): Promise<void> {
  const sapiMatch = cookieStr.match(/\b(?:SAPISID|__Secure-[13]PAPISID)=([^;]+)/);
  if (!sapiMatch) {
    return;
  }

  try {
    const sapisid = sapiMatch[1];
    const time = Math.floor(Date.now() / 1000);
    const hashStr = `${time} ${sapisid} ${YOUTUBE_ORIGIN}`;

    let hashHex = '';
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(hashStr);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      hashHex = crypto.createHash('sha1').update(hashStr).digest('hex');
    }

    headers.set('Authorization', `SAPISIDHASH ${time}_${hashHex}`);
    headers.set('X-Origin', YOUTUBE_ORIGIN);
    headers.set('Origin', YOUTUBE_ORIGIN);
    headers.set('X-Goog-AuthUser', '0');
    const visitorMatch = cookieStr.match(/\bVISITOR_INFO1_LIVE=([^;]+)/);
    if (visitorMatch) {
      headers.set('X-Goog-Visitor-Id', visitorMatch[1]);
    }
  } catch (error) {
    console.error('[PROXY GET ERROR] SAPISIDHASH failed:', error);
  }
}

async function getForwardHeaders(input: Record<string, unknown>, request?: NextRequest, target?: URL): Promise<Headers> {
  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36');
  headers.set('Accept', '*/*');
  headers.set('Accept-Language', 'en-US,en;q=0.9');

  const setSafeHeader = (key: string, value: string) => {
    const lowerKey = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'cookie', 'sec-ch-ua', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'origin', 'referer', 'x-skip-youtube-auth'].includes(lowerKey)) {
      return;
    }
    if (lowerKey.startsWith('x-override-')) {
      return;
    }
    headers.set(key, value);
  };

  const sourceHeaders = input || {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (typeof value === 'string') {
      setSafeHeader(key, value);
    }
  }

  if (request) {
    request.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.startsWith('x-') || 
        ['content-type', 'authorization', 'user-agent', 'accept', 'accept-language', 'referer', 'origin'].includes(lowerKey)
      ) {
        setSafeHeader(key, value);
      }
    });
  }

  const referer = request?.headers.get('X-Override-Referer') || (typeof sourceHeaders.Referer === 'string' ? sourceHeaders.Referer : null);
  const clientOrigin = request?.headers.get('X-Override-Origin') || (typeof sourceHeaders.Origin === 'string' ? sourceHeaders.Origin : null);
  const userAgent = request?.headers.get('X-Override-User-Agent') || (typeof sourceHeaders['X-Override-User-Agent'] === 'string' ? sourceHeaders['X-Override-User-Agent'] : null);
  const range = request?.headers.get('X-Override-Range') || request?.headers.get('Range') || (typeof sourceHeaders.Range === 'string' ? sourceHeaders.Range : null);
  const skipYouTubeAuth =
    request?.headers.get('X-Skip-YouTube-Auth') === '1' ||
    sourceHeaders['X-Skip-YouTube-Auth'] === '1' ||
    sourceHeaders['x-skip-youtube-auth'] === '1';

  if (referer && referer.startsWith('https://')) headers.set('Referer', referer);
  if (clientOrigin && clientOrigin.startsWith('https://')) headers.set('Origin', clientOrigin);
  if (userAgent) headers.set('User-Agent', userAgent);
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.set('Range', range);

  // Inject server-side YouTube cookie to bypass Datacenter IP bot checks,
  // EXCEPT for the actual media stream (googlevideo.com) which rejects requests with 403 if auth cookies are present.
  const isCdn = target?.hostname.includes('googlevideo.com');
  const configuredCookie = getConfiguredYouTubeCookie();
  if (configuredCookie && !isCdn && !skipYouTubeAuth) {
    const cookieStr = normalizeCookieHeader(configuredCookie);
    if (cookieStr) {
      headers.set('Cookie', cookieStr);

      // If we inject an authenticated cookie to a YouTube API endpoint, we must also
      // synthesize the SAPISIDHASH Authorization header, because the client (yt-dlp)
      // didn't know about these cookies and won't have generated it.
      if (isYouTubeAuthHost(target)) {
        await applyYouTubeAuthHeaders(headers, cookieStr);
      }
    }
  }

  return headers;
}

async function fetchAllowed(
  target: URL,
  headers: Headers,
  init: { method?: string; body?: BodyInit },
  redirectsRemaining = 3
): Promise<Response> {
  const response = await fetch(target, {
    headers,
    method: init.method || 'GET',
    body: init.body,
    redirect: 'manual',
    cache: 'no-store',
  });

  if ([301, 302, 303, 307, 308].includes(response.status) && redirectsRemaining > 0) {
    const location = response.headers.get('location');
    if (!location) {
      return response;
    }
    const redirected = parseTargetUrl(new URL(location, target).toString());
    return fetchAllowed(redirected, headers, init, redirectsRemaining - 1);
  }

  return response;
}

function isYouTubePlayerApi(target: URL): boolean {
  return isYouTubeAuthHost(target) && target.pathname.includes('/youtubei/v1/player');
}

function withoutYouTubeAuthHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  for (const key of [
    'Authorization',
    'Cookie',
    'Origin',
    'X-Origin',
    'X-Goog-AuthUser',
    'X-Goog-Visitor-Id',
  ]) {
    nextHeaders.delete(key);
  }
  return nextHeaders;
}

async function proxy(
  target: URL,
  headers: Headers,
  init: { method?: string; body?: BodyInit } = {},
  debug = false
): Promise<Response> {
  let upstream = await fetchAllowed(target, headers, init);
  let retriedWithoutAuth = false;
  if (upstream.status === 400 && isYouTubePlayerApi(target) && headers.has('Cookie')) {
    // Some Innertube player clients reject account cookies with INVALID_ARGUMENT.
    // Keep cookies for webpage/next requests, but let yt-dlp still receive an
    // unauthenticated player response instead of no player response at all.
    upstream = await fetchAllowed(target, withoutYouTubeAuthHeaders(headers), init);
    retriedWithoutAuth = true;
  }
  const contentLength = Number(upstream.headers.get('content-length') || '0');
  
  if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BYTES) {
    return NextResponse.json({ error: 'YouTube media response is too large for browser extraction.' }, { status: 413 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    const detail = await upstream.text().catch(() => upstream.statusText);
    if (upstream.status === 403) {
      console.warn('[YouTube proxy] Upstream 403', {
        host: target.hostname,
        method: init.method || 'GET',
        hasCookie: headers.has('Cookie'),
        hasAuthorization: headers.has('Authorization'),
        hasOrigin: headers.has('Origin'),
        hasReferer: headers.has('Referer'),
        hasRange: headers.has('Range'),
      });
    }
    return NextResponse.json({ error: detail || upstream.statusText }, { status: upstream.status });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  responseHeaders.set('Content-Type', contentType);
  
  // Only forward Content-Length if the response is not compressed.
  // Node's fetch auto-decompresses gzip, which breaks the Content-Length contract and causes Next.js 500 errors.
  if (contentLength > 0 && !upstream.headers.has('content-encoding')) {
    responseHeaders.set('Content-Length', String(contentLength));
  }
  responseHeaders.set('Cache-Control', 'no-store');
  if (debug) {
    const cookieHeader = headers.get('Cookie') || '';
    responseHeaders.set('X-YouTube-Proxy-Auth', [
      `cookie=${headers.has('Cookie') ? '1' : '0'}`,
      `sapisid=${headers.has('Authorization') ? '1' : '0'}`,
      `sid=${/\bSID=/.test(cookieHeader) ? '1' : '0'}`,
      `secureSid=${/\b__Secure-[13]PSID=/.test(cookieHeader) ? '1' : '0'}`,
      `loginInfo=${/\bLOGIN_INFO=/.test(cookieHeader) ? '1' : '0'}`,
      `origin=${headers.has('Origin') ? '1' : '0'}`,
      `retryNoAuth=${retriedWithoutAuth ? '1' : '0'}`,
    ].join(';'));
  }

  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) responseHeaders.set('Content-Range', contentRange);

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  try {
    const target = parseTargetUrl(request.nextUrl.searchParams.get('url'));
    const headers = await getForwardHeaders({}, request, target);
    return await proxy(target, headers, {}, request.nextUrl.searchParams.get('debugProxy') === '1');
  } catch (error) {
    console.error('[PROXY GET ERROR]', error);
    return NextResponse.json({ error: error instanceof Error ? error.stack : 'Invalid media proxy request.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const queryTarget = request.nextUrl.searchParams.get('url');
    if (queryTarget) {
      const target = parseTargetUrl(queryTarget);
      const body = await request.arrayBuffer();
      const headers = await getForwardHeaders({}, request, target);
      return await proxy(target, headers, {
        method: 'POST',
        body: body.byteLength > 0 ? body : undefined,
      }, request.nextUrl.searchParams.get('debugProxy') === '1');
    }

    const body = await request.json();
    const target = parseTargetUrl(typeof body.url === 'string' ? body.url : null);
    const headers = await getForwardHeaders(
      body.headers && typeof body.headers === 'object' ? body.headers as Record<string, unknown> : {},
      request,
      target
    );
    
    let method = 'GET';
    if (typeof body.method === 'string') {
      method = body.method;
    } else if (typeof body.body === 'string' && body.body.length > 0) {
      method = 'POST';
    }

    return await proxy(target, headers, { 
      method, 
      body: typeof body.body === 'string' ? body.body : undefined 
    }, request.nextUrl.searchParams.get('debugProxy') === '1');
  } catch (error) {
    console.error('[PROXY POST ERROR]', error);
    return NextResponse.json({ error: error instanceof Error ? error.stack : 'Invalid media proxy request.' }, { status: 400 });
  }
}
