import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified, YouTubeVideoMetadata } from '@/services/audio/audioExtractionSimplified';
import { detectEnvironment } from '@/utils/environmentDetection';
import { firebaseStorageSimplified } from '@/services/firebase/firebaseStorageSimplified';

/**
 * Audio Extraction API Route - Environment-Aware Service Integration
 *
 * This route implements a streamlined extraction workflow:
 * - Uses YouTube search metadata directly (no filename guessing)
 * - Video ID-based caching and storage
 * - Environment-aware service selection:
 *   - Production: browser-side yt-dlp, finalized through /api/audio/finalize-browser-extraction
 *   - Local development: local yt-dlp
 *   - Rollback only: configured yt-mp3-go endpoint via explicit strategy override
 * - Leverages existing search results for metadata
 */

// Configure Vercel function timeout - Use 300 seconds to match vercel.json
// This allows time for audio extraction job creation + polling attempts
export const maxDuration = 300;

async function getCachedBrowserExtractionResult(videoMetadata: YouTubeVideoMetadata) {
  const videoId = videoMetadata.id;

  try {
    const { ensureFirebaseInitialized } = await import('@/config/firebase');
    await ensureFirebaseInitialized();
  } catch (initError) {
    console.warn('⚠️ Firebase initialization failed, continuing with browser extraction:', initError);
  }

  try {
    const { findExistingAudioFile } = await import('@/services/firebase/firebaseStorageService');
    const existingFile = await findExistingAudioFile(videoId);
    if (existingFile) {
      firebaseStorageSimplified.saveAudioMetadataBackground({
        videoId,
        audioUrl: existingFile.audioUrl,
        title: videoMetadata.title,
        thumbnail: videoMetadata.thumbnail,
        channelTitle: videoMetadata.channelTitle,
        duration: 0,
        fileSize: existingFile.fileSize || 0,
        extractionService: 'firebase-storage-cache',
        extractionTimestamp: Date.now(),
        videoDuration: videoMetadata.duration,
      });

      return {
        success: true,
        audioUrl: existingFile.audioUrl,
        title: videoMetadata.title,
        duration: 0,
        fromCache: true,
        isStreamUrl: false,
      };
    }
  } catch (storageError) {
    console.warn('⚠️ Firebase Storage cache check failed before browser extraction:', storageError);
  }

  const cached = await firebaseStorageSimplified.getCachedAudioMetadata(videoId);
  if (cached) {
    return {
      success: true,
      audioUrl: cached.audioUrl,
      title: cached.title,
      duration: cached.duration,
      fromCache: true,
      isStreamUrl: cached.isStreamUrl,
      streamExpiresAt: cached.streamExpiresAt,
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const {
      videoId,
      forceRedownload: requestedForceRedownload = false,
      forceRefresh: legacyForceRefresh = false,
      getInfoOnly = false,
      originalTitle,
      // New: Accept YouTube search metadata directly
      videoMetadata
    } = data;
    const forceRedownload = requestedForceRedownload === true || legacyForceRefresh === true;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    console.log(`🎵 Simplified audio extraction: ${videoId}${originalTitle ? ` ("${originalTitle}")` : ''}`);

    // If getInfoOnly is true, just return basic video info
    if (getInfoOnly) {
      return NextResponse.json({
        success: true,
        title: originalTitle || `YouTube Video ${videoId}`,
        duration: 0,
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`
      });
    }

    try {
      const env = detectEnvironment();
      const resolvedMetadata: YouTubeVideoMetadata = videoMetadata || {
        id: videoId,
        title: typeof originalTitle === 'string' && originalTitle.length > 0 ? originalTitle : 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: 'Unknown Channel'
      };

      if (env.strategy === 'browser-ytdlp') {
        if (!forceRedownload) {
          const cachedResult = await getCachedBrowserExtractionResult(resolvedMetadata);
          if (cachedResult) {
            return NextResponse.json({
              success: true,
              audioUrl: cachedResult.audioUrl,
              title: cachedResult.title,
              duration: cachedResult.duration,
              youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
              fromCache: cachedResult.fromCache,
              isStreamUrl: cachedResult.isStreamUrl,
              streamExpiresAt: cachedResult.streamExpiresAt,
              method: 'browser-ytdlp-cache'
            });
          }
        }

        return NextResponse.json({
          success: false,
          requiresBrowserExtraction: true,
          method: 'browser-ytdlp',
          videoId,
          title: resolvedMetadata.title,
          duration: resolvedMetadata.duration,
          youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
        }, { status: 202 });
      }

      let result;

      // Use extraction with search metadata if available
      if (videoMetadata) {
        console.log(`📊 Using provided video metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(videoMetadata, forceRedownload);
      } else {
        // Fallback: create metadata from available data
        const fallbackMetadata: YouTubeVideoMetadata = {
          id: videoId,
          title: typeof originalTitle === 'string' && originalTitle.length > 0 ? originalTitle : 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          channelTitle: 'Unknown Channel'
        };

        console.log(`🔄 Using fallback metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(fallbackMetadata, forceRedownload);
      }

      if (!result.success) {
        console.error('❌ Simplified extraction failed', { videoId, error: result.error });
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Audio extraction failed',
            details: 'Audio extraction service is currently unavailable or the video cannot be processed',
            suggestion: 'The video may be restricted, too long, or temporarily unavailable. Please try a different video or try again later.'
          },
          { status: 500 }
        );
      }

      console.log(`✅ Simplified extraction successful for ${videoId}`);

      // Determine the method based on environment
      const method = env.strategy === 'ytdlp' ? 'yt-dlp' : 'yt-mp3-go';

      return NextResponse.json({
        success: true,
        audioUrl: result.audioUrl,
        title: result.title,
        duration: result.duration,
        youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
        fromCache: result.fromCache,
        isStreamUrl: result.isStreamUrl,
        streamExpiresAt: result.streamExpiresAt,
        method
      });

    } catch (extractionError) {
      console.error('❌ Simplified extraction error', { videoId, extractionError });

      const errorMessage = extractionError instanceof Error ? extractionError.message : 'Unknown error';

      return NextResponse.json(
        {
          success: false,
          error: 'Audio extraction failed',
          details: errorMessage,
          suggestion: 'The video may be restricted, too long, or temporarily unavailable. Please try a different video or try again later.'
        },
        { status: 500 }
      );
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
