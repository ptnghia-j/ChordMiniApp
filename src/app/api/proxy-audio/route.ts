import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { isFirebaseStorageUrl, parseAndValidateAudioSourceUrl } from '@/utils/urlValidationUtils';
import { safeFetchAudioSource } from '@/utils/safeServerAudioFetch';

/**
 * Fetch audio with Firebase Storage-aware retry logic
 */
async function fetchAudioWithRetry(
  fetchUrl: string,
  maxRetries: number = 3
): Promise<Response> {
  const isFirebaseUrl = isFirebaseStorageUrl(fetchUrl);
  const retries = isFirebaseUrl ? Math.max(maxRetries, 5) : maxRetries; // More retries for Firebase
  const baseTimeout = isFirebaseUrl ? 30000 : 120000; // Shorter timeout for Firebase retries

  console.log(`📡 Fetching audio (${isFirebaseUrl ? 'Firebase Storage' : 'External'}) with ${retries} max retries: ${fetchUrl}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const timeout = baseTimeout + (attempt - 1) * 10000; // Increase timeout with each retry
      const abortSignal = createSafeTimeoutSignal(timeout);

      console.log(`📡 Attempt ${attempt}/${retries} (timeout: ${timeout}ms): ${fetchUrl}`);

      const response = await safeFetchAudioSource(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Accept': 'audio/mpeg, audio/*, */*'
        },
        signal: abortSignal,
      });

      console.log(`📊 Response received (attempt ${attempt}):`, {
        status: response.status,
        statusText: response.statusText,
        url: response.url
      });

      if (response.ok) {
        console.log(`✅ Audio fetch successful on attempt ${attempt}`);
        return response;
      }

      // Handle Firebase Storage specific errors
      if (isFirebaseUrl && response.status === 403) {
        console.log(`⚠️ Firebase Storage 403 error (attempt ${attempt}/${retries}) - file may still be uploading`);

        if (attempt < retries) {
          // Exponential backoff for Firebase Storage 403s
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Waiting ${delay}ms before retry (Firebase upload may be in progress)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // For non-Firebase URLs or final attempt, try fallback request
      if (attempt === retries) {
        console.log(`🔄 Final attempt with minimal headers...`);
        try {
          const fallbackResponse = await safeFetchAudioSource(fetchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ChordMini/1.0)',
            },
            signal: createSafeTimeoutSignal(30000),
          });

          if (fallbackResponse.ok) {
            console.log(`✅ Fallback request successful`);
            return fallbackResponse;
          }
        } catch (fallbackError) {
          console.error(`❌ Fallback request failed:`, fallbackError);
        }
      }

      // If not the last attempt and not a Firebase 403, wait before retry
      if (attempt < retries && !(isFirebaseUrl && response.status === 403)) {
        const delay = 1000 * attempt; // Linear backoff for other errors
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error);

      if (attempt === retries) {
        throw error;
      }

      // Wait before retry
      const delay = 1000 * attempt;
      console.log(`⏳ Waiting ${delay}ms before retry after error...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`All ${retries} fetch attempts failed`);
}
import { retryAudioDownload } from '@/utils/retryUtils';

/**
 * Audio Proxy API Route
 *
 * This route proxies audio requests to avoid CORS issues when fetching
 * audio files from external sources like QuickTube.
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// Audio proxy needs time for large files (3-4 minute songs can be 5-10MB)
export const maxDuration = 180; // 3 minutes for proxy operations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');
    const videoId = searchParams.get('videoId'); // Optional videoId for cache lookup

    if (!audioUrl) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      );
    }

    const isFirebaseUrl = isFirebaseStorageUrl(audioUrl);
    console.log(`🔎 proxy-audio: videoId=${videoId || 'none'}, isFirebaseUrl=${isFirebaseUrl}`);

    // PRIORITY FIX: Check for cached complete audio file first (from parallel pipeline)
    if (videoId && isFirebaseUrl) {
      try {
        const { getCachedAudioFile, getCachedAudioMeta } = await import('@/services/api/parallelPipelineService');
        const meta = getCachedAudioMeta(videoId);
        console.log(`🔎 cache-meta:`, meta);
        const cachedFile = getCachedAudioFile(videoId);

        if (cachedFile) {
          console.log(`🚀 Using cached complete audio file for proxy (${(cachedFile.size / 1024 / 1024).toFixed(2)}MB)`);

          // Convert blob to ArrayBuffer
          const audioBuffer = await cachedFile.arrayBuffer();

          return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
              'Content-Type': cachedFile.type || 'audio/mpeg',
              'Content-Length': audioBuffer.byteLength.toString(),
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
              'X-Cache-Source': 'parallel-pipeline', // Debug header
              'X-Cache-Hit': 'true',
              'X-Cache-Age': String(meta.ageMs ?? 0),
              'X-Cache-Expires-In': String(meta.expiresInMs ?? 0)
            },
          });
        } else {
          console.log(`⚠️ No cached file found for ${videoId}, proceeding with Firebase URL fetch`);
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache lookup failed during proxy-audio request', { videoId, cacheError });
      }
    }

    // Validate URL to prevent SSRF attacks
    try {
      parseAndValidateAudioSourceUrl(audioUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid URL format';
      return NextResponse.json(
        { error: message },
        { status: message === 'Invalid URL format' ? 400 : 403 }
      );
    }

    console.log(`🔄 Proxying audio request: ${audioUrl}`);

    // CRITICAL FIX: QuickTube URLs require unencoded square brackets
    // Do NOT encode square brackets for QuickTube URLs as they expect [videoId] format
    let fetchUrl = audioUrl;
    try {
      const isQuickTubeUrl = audioUrl.includes('quicktube.app/dl/');

      if (isQuickTubeUrl) {
        // For QuickTube URLs, ensure square brackets are NOT encoded
        if (audioUrl.includes('%5B') || audioUrl.includes('%5D')) {
          // Decode any encoded square brackets for QuickTube
          fetchUrl = audioUrl.replace(/%5B/g, '[').replace(/%5D/g, ']');
          console.log(`🔧 QuickTube URL decoded for fetch: ${fetchUrl}`);
        } else {
          console.log(`🔧 QuickTube URL already has unencoded brackets: ${fetchUrl}`);
        }
      } else {
        // For non-QuickTube URLs, apply standard encoding if needed
        const isAlreadyEncoded = audioUrl.includes('%5B') || audioUrl.includes('%5D');
        if (!isAlreadyEncoded && (audioUrl.includes('[') || audioUrl.includes(']'))) {
          fetchUrl = audioUrl.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
          console.log(`🔧 Non-QuickTube URL encoded for fetch: ${fetchUrl}`);
        }
      }
    } catch (urlError) {
      console.warn('URL encoding warning:', urlError);
    }

    // Use Firebase-aware retry logic for fetching audio
    const response = await fetchAudioWithRetry(fetchUrl);

    // Get the audio data with detailed logging and manual stream reading
    // // console.log(`🔍 Response headers:`, Object.fromEntries(response.headers.entries()));
    // // console.log(`🔍 Content-Length header:`, response.headers.get('content-length'));
    // // console.log(`🔍 Content-Type header:`, response.headers.get('content-type'));

    const expectedSize = parseInt(response.headers.get('content-length') || '0', 10);
    // // console.log(`🔍 Expected file size: ${expectedSize} bytes (${(expectedSize / 1024 / 1024).toFixed(2)}MB)`);

    // Try manual stream reading for better control over the download process
    let audioBuffer: ArrayBuffer;

    if (response.body) {
      console.log(`🔄 Using manual stream reading for better download control...`);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`✅ Stream reading completed. Total bytes: ${totalBytes}`);
            break;
          }

          if (value) {
            chunks.push(value);
            totalBytes += value.length;

            // Log progress for large files
            if (expectedSize > 0 && totalBytes % (256 * 1024) === 0) { // Every 256KB
              const progress = (totalBytes / expectedSize * 100).toFixed(1);
              console.log(`📊 Download progress: ${totalBytes} / ${expectedSize} bytes (${progress}%)`);
            }
          }
        }

        // Combine all chunks into a single ArrayBuffer
        const combinedArray = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          combinedArray.set(chunk, offset);
          offset += chunk.length;
        }
        audioBuffer = combinedArray.buffer;

      } catch (streamError) {
        console.error(`❌ Stream reading failed:`, streamError);
        console.log(`🔄 Falling back to arrayBuffer() method...`);
        audioBuffer = await response.arrayBuffer();
      }
    } else {
      console.log(`🔄 No response body stream, using arrayBuffer() method...`);
      audioBuffer = await response.arrayBuffer();
    }

    // // console.log(`🔍 Final downloaded bytes: ${audioBuffer.byteLength}`);
    // // console.log(`🔍 Expected bytes: ${expectedSize}`);

    if (expectedSize > 0 && audioBuffer.byteLength < expectedSize) {
      console.error(`❌ Incomplete download: got ${audioBuffer.byteLength} bytes, expected ${expectedSize} bytes`);
      console.error(`❌ Download completion: ${(audioBuffer.byteLength / expectedSize * 100).toFixed(1)}%`);
    } else if (expectedSize > 0 && audioBuffer.byteLength === expectedSize) {
      console.log(`✅ Complete download: ${audioBuffer.byteLength} bytes match expected size`);
    }

    // Validate file size and content
    if (audioBuffer.byteLength === 0) {
      console.error(`❌ Received empty audio file from: ${fetchUrl}`);
      console.error(`🔍 Original URL: ${audioUrl}`);
      console.error(`🔍 Response headers:`, Object.fromEntries(response.headers.entries()));

      // Use the robust retry utility for handling empty files
      console.log(`🔄 Attempting retry strategies for empty file...`);

      const retryResult = await retryAudioDownload(fetchUrl, {
        maxAttempts: 5,
        timeoutMs: 120000, // Match the main timeout
        onRetry: (attempt, strategy) => {
          console.log(`📊 Retry ${attempt} (${strategy.name}) response headers from previous attempt:`,
            Object.fromEntries(response.headers.entries()));
        }
      });

      if (retryResult.success && retryResult.buffer && retryResult.response) {
        console.log(`✅ Retry successful after ${retryResult.attempt} attempts using ${retryResult.strategy.name}`);
        return new NextResponse(retryResult.buffer, {
          status: 200,
          headers: {
            'Content-Type': retryResult.response.headers.get('Content-Type') || 'audio/mpeg',
            'Content-Length': retryResult.buffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        console.error(`❌ All retry attempts failed:`, retryResult.allErrors.map(e => e.message));
        return NextResponse.json(
          {
            error: 'Audio file is empty or corrupted. This may be due to CDN cache issues or the file may not be ready yet.',
            details: {
              originalUrl: audioUrl,
              fetchUrl: fetchUrl,
              responseStatus: response.status,
              contentLength: response.headers.get('content-length'),
              retryAttempts: retryResult.attempt,
              retryErrors: retryResult.allErrors.map(e => e.message),
              suggestion: 'Please try again in a few minutes or use a different video.'
            }
          },
          { status: 422 }
        );
      }
    }

    if (audioBuffer.byteLength < 1000) { // Less than 1KB is likely an error page
      console.error(`❌ Received suspiciously small audio file: ${audioBuffer.byteLength} bytes from: ${fetchUrl}`);
      console.error(`🔍 Content preview:`, new TextDecoder().decode(audioBuffer.slice(0, 200)));
      return NextResponse.json(
        {
          error: 'Audio file appears to be corrupted or is an error response',
          details: {
            originalUrl: audioUrl,
            fetchUrl: fetchUrl,
            fileSize: audioBuffer.byteLength,
            contentPreview: new TextDecoder().decode(audioBuffer.slice(0, 200))
          }
        },
        { status: 422 }
      );
    }

    if (audioBuffer.byteLength > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio file too large (max 100MB)' },
        { status: 413 }
      );
    }

    console.log(`✅ Successfully proxied audio: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

    // Return the audio with appropriate headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error: unknown) {
    console.error('Error proxying audio:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to proxy audio file',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}


// Handle HEAD requests (for size probing via cache during upload window)
export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');
    const videoId = searchParams.get('videoId');

    if (!audioUrl) {
      return new NextResponse(null, { status: 400 });
    }

    const isFirebaseUrl = isFirebaseStorageUrl(audioUrl);

    if (videoId && isFirebaseUrl) {
      try {
        const { getCachedAudioFile, getCachedAudioMeta } = await import('@/services/api/parallelPipelineService');
        const meta = getCachedAudioMeta(videoId);
        const cachedFile = getCachedAudioFile(videoId);
        if (cachedFile) {
          // Respond with headers only
          return new NextResponse(null, {
            status: 200,
            headers: {
              'Content-Type': cachedFile.type || 'audio/mpeg',
              'Content-Length': String(cachedFile.size),
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
              'X-Cache-Source': 'parallel-pipeline',
              'X-Cache-Hit': 'true',
              'X-Cache-Age': String(meta.ageMs ?? 0),
              'X-Cache-Expires-In': String(meta.expiresInMs ?? 0)
            }
          });
        }
      } catch (e) {
        console.warn('HEAD cache check failed:', e);
      }
    }

    // If not cached or not Firebase URL, validate domain and proxy HEAD
    const fetchUrl = audioUrl;
    try {
      parseAndValidateAudioSourceUrl(audioUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid URL format';
      return new NextResponse(null, { status: message === 'Invalid URL format' ? 400 : 403 });
    }

    try {
      const headResp = await safeFetchAudioSource(fetchUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'ChordMini/1.0' },
        signal: createSafeTimeoutSignal(15000),
      });
      const len = headResp.headers.get('content-length') || '0';
      return new NextResponse(null, {
        status: headResp.status,
        headers: {
          'Content-Length': len,
          'Content-Type': headResp.headers.get('content-type') || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch {
      return new NextResponse(null, { status: 502 });
    }
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
