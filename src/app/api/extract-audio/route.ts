import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified, YouTubeVideoMetadata } from '@/services/audioExtractionSimplified';
import { detectEnvironment } from '@/utils/environmentDetection';

/**
 * Audio Extraction API Route - Environment-Aware Service Integration
 *
 * This route implements a streamlined extraction workflow:
 * - Uses YouTube search metadata directly (no filename guessing)
 * - Video ID-based caching and storage
 * - Environment-aware service selection:
 *   - Vercel Production: yt-mp3-go (better Unicode support)
 *   - Local Development: yt-dlp
 *   - Fallback: QuickTube
 * - Leverages existing search results for metadata
 */

// Configure Vercel function timeout - Use 300 seconds to match vercel.json
// This allows time for audio extraction job creation + polling attempts
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const {
      videoId,
      forceRedownload = false,
      getInfoOnly = false,
      originalTitle,
      // New: Accept YouTube search metadata directly
      videoMetadata
    } = data;

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
      let result;

      // Use simplified extraction with search metadata if available
      if (videoMetadata) {
        console.log(`📊 Using provided video metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(videoMetadata, forceRedownload);
      } else {
        // Fallback: create metadata from available data
        const fallbackMetadata: YouTubeVideoMetadata = {
          id: videoId,
          title: originalTitle || `YouTube Video ${videoId}`,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          channelTitle: 'Unknown Channel'
        };

        console.log(`🔄 Using fallback metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(fallbackMetadata, forceRedownload);
      }

      if (!result.success) {
        console.error(`❌ Simplified extraction failed for ${videoId}:`, result.error);
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
      const env = detectEnvironment();
      const method = env.strategy === 'ytdlp' ? 'yt-dlp' : 'yt2mp3-magic';

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
      console.error(`❌ Simplified extraction error for ${videoId}:`, extractionError);

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
