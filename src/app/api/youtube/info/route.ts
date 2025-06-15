import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// YouTube video ID validation regex
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Get the correct yt-dlp path for different environments
const getYtDlpPath = () => {
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    // In Vercel, yt-dlp should be in the project root after build
    return './yt-dlp';
  }
  return 'yt-dlp'; // Use system PATH in local development
};

/**
 * Enhanced YouTube Video Info API Route
 * Fetches video metadata using yt-dlp with comprehensive error handling
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    // Enhanced input validation
    if (!videoId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing videoId parameter',
          suggestion: 'Please provide a valid YouTube video ID'
        },
        { status: 400 }
      );
    }

    // Validate video ID format
    if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid YouTube video ID format',
          suggestion: 'Please provide a valid 11-character YouTube video ID (e.g., dQw4w9WgXcQ)'
        },
        { status: 400 }
      );
    }

    console.log(`Fetching video info for: ${videoId}`);

    // Construct YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const ytDlpPath = getYtDlpPath();

    // Enhanced yt-dlp command with multiple fallback options
    const commands = [
      // Primary command - fastest and most reliable
      `${ytDlpPath} --dump-single-json --no-warnings --no-check-certificate --geo-bypass "${youtubeUrl}"`,

      // Fallback 1 - with additional headers
      `${ytDlpPath} --dump-single-json --no-warnings --no-check-certificate --geo-bypass --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${youtubeUrl}"`,

      // Fallback 2 - with different extraction method
      `${ytDlpPath} --dump-single-json --no-warnings --force-ipv4 --ignore-errors "${youtubeUrl}"`
    ];

    let lastError: Error | null = null;
    
    // Try each command in sequence
    for (let i = 0; i < commands.length; i++) {
      try {
        console.log(`Attempting video info fetch (method ${i + 1}/${commands.length})`);
        
        // Set timeout for each attempt (30 seconds)
        const { stdout, stderr } = await Promise.race([
          execPromise(commands[i]),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
          )
        ]);

        if (stderr && !stderr.includes('WARNING')) {
          console.warn(`yt-dlp stderr (method ${i + 1}):`, stderr);
        }

        if (!stdout || stdout.trim() === '') {
          throw new Error('Empty response from yt-dlp');
        }

        // Parse the JSON response
        let videoInfo;
        try {
          videoInfo = JSON.parse(stdout);
        } catch (parseError) {
          throw new Error(`Failed to parse video info JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
        }

        // Validate required fields
        if (!videoInfo || typeof videoInfo !== 'object') {
          throw new Error('Invalid video info structure received');
        }

        // Extract and validate video information
        const title = videoInfo.title || videoInfo.fulltitle || `YouTube Video ${videoId}`;
        const duration = videoInfo.duration || videoInfo.duration_string || 0;
        const uploader = videoInfo.uploader || videoInfo.channel || 'Unknown';
        const description = videoInfo.description || '';
        const viewCount = videoInfo.view_count || 0;
        const uploadDate = videoInfo.upload_date || '';

        // Additional validation
        if (videoInfo.is_live) {
          return NextResponse.json(
            { 
              success: false,
              error: 'Live streams are not supported',
              suggestion: 'Please try a regular YouTube video instead of a live stream'
            },
            { status: 400 }
          );
        }

        if (videoInfo.duration && videoInfo.duration > 3600) { // 1 hour limit
          return NextResponse.json(
            { 
              success: false,
              error: 'Video is too long for processing',
              suggestion: 'Please try a video shorter than 1 hour'
            },
            { status: 400 }
          );
        }

        console.log(`Successfully fetched video info: "${title}" (${duration}s)`);

        return NextResponse.json({
          success: true,
          title,
          duration,
          uploader,
          description,
          viewCount,
          uploadDate,
          videoId,
          url: youtubeUrl
        });

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Method ${i + 1} failed:`, lastError.message);
        
        // If this is the last attempt, we'll handle the error below
        if (i === commands.length - 1) {
          break;
        }
        
        // Wait a bit before trying the next method
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // All methods failed, provide specific error handling
    if (lastError) {
      console.error('All video info fetch methods failed:', lastError.message);
      
      // Provide specific error messages based on the error type
      let errorMessage = 'Failed to fetch video information';
      let suggestion = 'Please try again or check if the video ID is correct';
      
      if (lastError.message.includes('timed out')) {
        errorMessage = 'Request timed out while fetching video information';
        suggestion = 'The video server may be slow. Please try again in a few moments.';
      } else if (lastError.message.includes('Video unavailable') || lastError.message.includes('not available')) {
        errorMessage = 'Video is not available';
        suggestion = 'The video may be private, deleted, or region-restricted. Please try a different video.';
      } else if (lastError.message.includes('Private video') || lastError.message.includes('private')) {
        errorMessage = 'Video is private';
        suggestion = 'This video is private and cannot be accessed. Please try a public video.';
      } else if (lastError.message.includes('age-restricted') || lastError.message.includes('Sign in to confirm your age')) {
        errorMessage = 'Video is age-restricted';
        suggestion = 'Age-restricted videos cannot be processed. Please try a different video.';
      } else if (lastError.message.includes('network') || lastError.message.includes('connection')) {
        errorMessage = 'Network connection error';
        suggestion = 'Please check your internet connection and try again.';
      } else if (lastError.message.includes('quota') || lastError.message.includes('rate limit')) {
        errorMessage = 'Service temporarily unavailable due to rate limiting';
        suggestion = 'Please wait a few minutes and try again.';
      }

      return NextResponse.json(
        { 
          success: false,
          error: errorMessage,
          suggestion,
          details: lastError.message
        },
        { status: 500 }
      );
    }

    // Fallback error (shouldn't reach here)
    return NextResponse.json(
      { 
        success: false,
        error: 'Unknown error occurred while fetching video information',
        suggestion: 'Please try again or contact support if the issue persists'
      },
      { status: 500 }
    );

  } catch (error) {
    console.error('Unexpected error in video info API:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        suggestion: 'An unexpected error occurred. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support POST method for consistency
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    // Create a new URL with the videoId as a query parameter
    const url = new URL(request.url);
    url.searchParams.set('videoId', videoId);

    // Create a new request with the modified URL
    const newRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers
    });

    // Call the GET handler
    return GET(newRequest);
  } catch {
    return NextResponse.json(
      { 
        success: false,
        error: 'Invalid request body',
        suggestion: 'Please provide a valid JSON body with videoId field'
      },
      { status: 400 }
    );
  }
}
