import { NextRequest, NextResponse } from 'next/server';
import { getCachedAudioFile, saveAudioFileMetadata } from '@/services/firebaseStorageService';
import { localExtractionService } from '@/services/localExtractionService';
import { localCacheService } from '@/services/localCacheService';

/**
 * Audio Extraction API Route with Caching Support
 *
 * This route implements a caching layer that:
 * - Checks for cached audio files first (Firebase Storage + Firestore)
 * - Falls back to Python backend for new extractions
 * - Supports both local development and production environments
 */

/**
 * Determine if we should use local extraction or backend
 */
function shouldUseLocalExtraction(): boolean {
  // Only use local extraction for true local development
  const isLocalDevelopment = process.env.NODE_ENV === 'development' &&
                            process.env.VERCEL === undefined &&
                            process.env.VERCEL_ENV === undefined;

  console.log(`Environment check: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}, VERCEL_ENV=${process.env.VERCEL_ENV}, shouldUseLocal=${isLocalDevelopment}`);

  return isLocalDevelopment;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const { videoId, forceRedownload = false, getInfoOnly = false } = data;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    console.log(`Audio extraction request: videoId=${videoId}, forceRedownload=${forceRedownload}, getInfoOnly=${getInfoOnly}`);

    // Check cache first (unless force redownload or info only)
    if (!forceRedownload && !getInfoOnly) {
      console.log(`Checking cache for ${videoId}...`);

      // Try local cache first (for development)
      if (shouldUseLocalExtraction()) {
        try {
          const localCached = await localCacheService.getCachedAudio(videoId);
          if (localCached) {
            console.log(`Found local cached audio for ${videoId}, returning from cache`);

            return NextResponse.json({
              success: true,
              audioUrl: localCached.audioUrl,
              title: localCached.title,
              duration: localCached.duration,
              youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
              fromCache: true,
              isStreamUrl: false,
              message: 'Loaded from local cache'
            });
          }
        } catch (localCacheError) {
          console.warn('Local cache check failed:', localCacheError);
        }
      }

      // Try Firebase cache (for production)
      try {
        const cachedAudio = await getCachedAudioFile(videoId);
        if (cachedAudio) {
          console.log(`Found Firebase cached audio for ${videoId}, returning from cache`);

          return NextResponse.json({
            success: true,
            audioUrl: cachedAudio.audioUrl,
            title: cachedAudio.title || `YouTube Video ${videoId}`, // Include title from cache
            duration: cachedAudio.duration || 0, // Include duration from cache
            youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
            fromCache: true,
            isStreamUrl: cachedAudio.isStreamUrl || false,
            streamExpiresAt: cachedAudio.streamExpiresAt,
            message: 'Loaded from Firebase cache'
          });
        }
      } catch (cacheError) {
        console.warn('Firebase cache check failed, proceeding with extraction:', cacheError);
      }
    }

    // Determine extraction method
    if (shouldUseLocalExtraction()) {
      // Use local extraction for development
      console.log('Using local extraction for development');

      try {
        const result = await localExtractionService.extractAudio(videoId, getInfoOnly);

        if (!result.success) {
          return NextResponse.json(
            {
              success: false,
              error: result.error || 'Local extraction failed',
              details: 'Local yt-dlp extraction failed'
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          audioUrl: result.audioUrl,
          title: result.title,
          duration: result.duration,
          youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
          fromCache: result.fromCache || false,
          isStreamUrl: false,
          message: 'Extracted using local yt-dlp'
        });

      } catch (localError) {
        console.error('Local extraction failed, falling back to backend:', localError);
        // Fall through to backend extraction
      }
    }

    // Use backend extraction (production or local fallback)
    {
      // Use backend extraction
      console.log('Using backend extraction');
      const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-pluj3yargq-uc.a.run.app';

      console.log(`Proxying audio extraction to backend: ${backendUrl}/api/extract-audio`);
      console.log(`Request data:`, { videoId, forceRedownload, getInfoOnly });

      try {
        // Create an AbortController for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for audio extraction

        const response = await fetch(`${backendUrl}/api/extract-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
          body: JSON.stringify({
            ...data,
            // Add additional parameters to help with bot detection
            useEnhancedExtraction: true,
            retryCount: 0
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend audio extraction failed: ${response.status} ${response.statusText} - ${errorText}`);

        // If backend fails with 500, try local extraction as fallback (if available)
        if (response.status === 500 && !getInfoOnly) {
          console.log('Backend failed with 500, attempting local extraction fallback...');

          try {
            const localResult = await localExtractionService.extractAudio(videoId, getInfoOnly);

            if (localResult.success) {
              console.log('Local extraction fallback succeeded');
              return NextResponse.json({
                success: true,
                audioUrl: localResult.audioUrl,
                title: localResult.title,
                duration: localResult.duration,
                youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
                fromCache: false,
                isStreamUrl: false,
                message: 'Extracted using local fallback after backend failure'
              });
            }
          } catch (fallbackError) {
            console.warn('Local extraction fallback also failed:', fallbackError);
          }
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to extract audio from YouTube',
            details: `Backend error: ${response.status} ${response.statusText}`,
            suggestion: response.status === 500 ?
              'The video may be restricted or temporarily unavailable. Please try a different video or try again later.' :
              'Please check the video URL and try again.',
            backendUrl: backendUrl // Include backend URL for debugging
          },
          { status: response.status }
        );
      }

        const result = await response.json();
        console.log(`Backend audio extraction successful`);

        // Cache the result if it's a successful extraction (not info-only)
        if (result.success && !getInfoOnly && result.audioUrl) {
          try {
            await saveAudioFileMetadata({
              videoId,
              audioUrl: result.audioUrl,
              title: result.title || `YouTube Video ${videoId}`, // Include title in cache
              storagePath: `stream/${videoId}`, // Virtual path for stream URLs
              fileSize: 0, // Unknown for stream URLs
              duration: result.duration || 0,
              isStreamUrl: true,
              streamExpiresAt: result.streamExpiresAt
            });
            console.log(`Cached audio metadata for ${videoId}`);
          } catch (cacheError) {
            console.warn('Failed to cache audio metadata:', cacheError);
          }
        }

        return NextResponse.json(result);
      } catch (fetchError) {
        console.error('Network error during backend extraction:', fetchError);

        // Check if it's a timeout error
        const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
        const errorMessage = isTimeout ? 'Request timeout (60s)' :
                            (fetchError instanceof Error ? fetchError.message : String(fetchError));

        // Try local extraction as fallback for network errors (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log('Network error, attempting local extraction fallback...');
          try {
            const localResult = await localExtractionService.extractAudio(videoId, getInfoOnly);
            if (localResult.success) {
              return NextResponse.json({
                success: true,
                audioUrl: localResult.audioUrl,
                title: localResult.title,
                duration: localResult.duration,
                youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
                fromCache: false,
                isStreamUrl: false,
                message: 'Extracted using local fallback after network error'
              });
            }
          } catch (fallbackError) {
            console.warn('Local extraction fallback also failed:', fallbackError);
          }
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to extract audio from YouTube',
            details: `Network error: ${errorMessage}`,
            suggestion: isTimeout ?
              'The audio extraction request timed out. Please try a shorter video or try again later.' :
              'Please check your internet connection and try again.',
            backendUrl: backendUrl,
            isTimeout: isTimeout
          },
          { status: 500 }
        );
      }
    }

  } catch (error: unknown) {
    console.error('Error proxying audio extraction:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to extract audio from YouTube',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
