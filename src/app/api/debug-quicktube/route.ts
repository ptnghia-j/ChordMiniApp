import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * Debug endpoint to test QuickTube connectivity from Vercel environment
 * This helps diagnose HTTP 416 and other connectivity issues
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const testUrl = searchParams.get('url');
  
  if (!testUrl) {
    return NextResponse.json({
      error: 'Missing url parameter',
      usage: '/api/debug-quicktube?url=https://quicktube.app/dl/filename.mp3'
    }, { status: 400 });
  }

  const results: {
    environment: {
      isVercel: boolean;
      region: string;
      nodeEnv: string | undefined;
      timestamp: string;
    };
    testUrl: string;
    tests: Array<{
      name: string;
      success: boolean;
      status: number | null;
      statusText: string | null;
      headers: Record<string, string>;
      bufferSize?: number;
      url?: string;
      error: string | null;
    }>;
    summary?: {
      successfulTests: number;
      totalTests: number;
      successRate: string;
      recommendations: string[];
    };
  } = {
    environment: {
      isVercel: !!process.env.VERCEL,
      region: process.env.VERCEL_REGION || 'unknown',
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    },
    testUrl,
    tests: []
  };

  // Test 1: Basic HEAD request
  try {
    console.log(`🧪 Test 1: Basic HEAD request to ${testUrl}`);
    const headResponse = await fetch(testUrl, {
      method: 'HEAD',
      signal: createSafeTimeoutSignal(5000)
    });

    results.tests.push({
      name: 'Basic HEAD Request',
      success: headResponse.ok,
      status: headResponse.status,
      statusText: headResponse.statusText,
      headers: Object.fromEntries(headResponse.headers.entries()),
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'Basic HEAD Request',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 2: HEAD with cache-busting headers
  try {
    console.log(`🧪 Test 2: HEAD with cache-busting headers`);
    const headCacheResponse = await fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: createSafeTimeoutSignal(5000)
    });

    results.tests.push({
      name: 'HEAD with Cache-Busting',
      success: headCacheResponse.ok,
      status: headCacheResponse.status,
      statusText: headCacheResponse.statusText,
      headers: Object.fromEntries(headCacheResponse.headers.entries()),
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'HEAD with Cache-Busting',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 3: GET with Range header (the problematic one)
  try {
    console.log(`🧪 Test 3: GET with Range header`);
    const rangeResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1023',
        'Cache-Control': 'no-cache'
      },
      signal: createSafeTimeoutSignal(5000)
    });

    let bufferSize = 0;
    if (rangeResponse.ok) {
      try {
        const buffer = await rangeResponse.arrayBuffer();
        bufferSize = buffer.byteLength;
      } catch {
        // Ignore buffer read errors for this test
      }
    }

    results.tests.push({
      name: 'GET with Range Header',
      success: rangeResponse.ok,
      status: rangeResponse.status,
      statusText: rangeResponse.statusText,
      headers: Object.fromEntries(rangeResponse.headers.entries()),
      bufferSize,
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'GET with Range Header',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      bufferSize: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 4: Simple GET without Range
  try {
    console.log(`🧪 Test 4: Simple GET without Range`);
    const simpleGetResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache'
      },
      signal: createSafeTimeoutSignal(3000) // Shorter timeout
    });

    let bufferSize = 0;
    if (simpleGetResponse.ok) {
      try {
        // Try to read just a small portion
        const reader = simpleGetResponse.body?.getReader();
        if (reader) {
          const { value } = await reader.read();
          bufferSize = value ? value.length : 0;
          reader.releaseLock();
        }
      } catch {
        // Ignore buffer read errors for this test
      }
    }

    results.tests.push({
      name: 'Simple GET without Range',
      success: simpleGetResponse.ok,
      status: simpleGetResponse.status,
      statusText: simpleGetResponse.statusText,
      headers: Object.fromEntries(simpleGetResponse.headers.entries()),
      bufferSize,
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'Simple GET without Range',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      bufferSize: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 5: Different User-Agent
  try {
    console.log(`🧪 Test 5: Different User-Agent`);
    const uaResponse = await fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChordMini/1.0)'
      },
      signal: createSafeTimeoutSignal(5000)
    });

    results.tests.push({
      name: 'Different User-Agent',
      success: uaResponse.ok,
      status: uaResponse.status,
      statusText: uaResponse.statusText,
      headers: Object.fromEntries(uaResponse.headers.entries()),
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'Different User-Agent',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 6: Aggressive Cache-Busting
  try {
    console.log(`🧪 Test 6: Aggressive Cache-Busting`);
    const cacheBustResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChordMini-CacheBuster/1.0)',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'If-None-Match': '*',
        'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
      },
      signal: createSafeTimeoutSignal(5000)
    });

    let bufferSize = 0;
    if (cacheBustResponse.ok) {
      try {
        const buffer = await cacheBustResponse.arrayBuffer();
        bufferSize = buffer.byteLength;
      } catch {
        // Ignore buffer read errors for this test
      }
    }

    results.tests.push({
      name: 'Aggressive Cache-Busting',
      success: cacheBustResponse.ok && bufferSize > 0,
      status: cacheBustResponse.status,
      statusText: cacheBustResponse.statusText,
      headers: Object.fromEntries(cacheBustResponse.headers.entries()),
      bufferSize,
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'Aggressive Cache-Busting',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      bufferSize: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Test 7: URL-based Cache-Busting
  try {
    console.log(`🧪 Test 7: URL-based Cache-Busting`);
    const cacheBustUrl = `${testUrl}?cb=${Date.now()}&v=${Math.random().toString(36).substring(7)}`;
    const urlCacheBustResponse = await fetch(cacheBustUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChordMini-URLBuster/1.0)',
        'Cache-Control': 'no-cache',
      },
      signal: createSafeTimeoutSignal(5000)
    });

    let bufferSize = 0;
    if (urlCacheBustResponse.ok) {
      try {
        const buffer = await urlCacheBustResponse.arrayBuffer();
        bufferSize = buffer.byteLength;
      } catch {
        // Ignore buffer read errors for this test
      }
    }

    results.tests.push({
      name: 'URL-based Cache-Busting',
      success: urlCacheBustResponse.ok && bufferSize > 0,
      status: urlCacheBustResponse.status,
      statusText: urlCacheBustResponse.statusText,
      headers: Object.fromEntries(urlCacheBustResponse.headers.entries()),
      bufferSize,
      url: cacheBustUrl,
      error: null
    });
  } catch (error) {
    results.tests.push({
      name: 'URL-based Cache-Busting',
      success: false,
      status: null,
      statusText: null,
      headers: {},
      bufferSize: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Summary
  const successfulTests = results.tests.filter(test => test.success).length;
  const totalTests = results.tests.length;
  
  results.summary = {
    successfulTests,
    totalTests,
    successRate: `${Math.round((successfulTests / totalTests) * 100)}%`,
    recommendations: []
  };

  // Add recommendations based on test results
  const rangeTest = results.tests.find(test => test.name === 'GET with Range Header');
  if (rangeTest && rangeTest.status === 416) {
    results.summary.recommendations.push('Range requests are not supported - avoid using Range headers');
  }

  const headTest = results.tests.find(test => test.name === 'Basic HEAD Request');
  if (headTest && headTest.success) {
    results.summary.recommendations.push('HEAD requests work - use for file size validation');
  }

  const simpleGetTest = results.tests.find(test => test.name === 'Simple GET without Range');
  if (simpleGetTest && simpleGetTest.success) {
    results.summary.recommendations.push('Simple GET requests work - use for content validation');
  }

  const cacheBustTest = results.tests.find(test => test.name === 'Aggressive Cache-Busting');
  if (cacheBustTest && cacheBustTest.success) {
    results.summary.recommendations.push('Aggressive cache-busting headers work - use for CDN cache issues');
  }

  const urlCacheBustTest = results.tests.find(test => test.name === 'URL-based Cache-Busting');
  if (urlCacheBustTest && urlCacheBustTest.success) {
    results.summary.recommendations.push('URL-based cache-busting works - use as last resort for persistent cache issues');
  }

  // Check for empty file issues
  const emptyFileTests = results.tests.filter(test =>
    test.success && test.bufferSize !== undefined && test.bufferSize === 0
  );
  if (emptyFileTests.length > 0) {
    results.summary.recommendations.push('WARNING: Some requests return empty files - this indicates a CDN caching issue');
  }

  // Check for Cloudflare cache hits
  const cloudflareHits = results.tests.filter(test =>
    test.headers && test.headers['cf-cache-status'] === 'HIT'
  );
  if (cloudflareHits.length > 0) {
    results.summary.recommendations.push('Cloudflare cache detected - use cache-busting strategies for fresh content');
  }

  console.log(`🧪 Debug test completed: ${successfulTests}/${totalTests} tests passed`);

  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json'
    }
  });
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
