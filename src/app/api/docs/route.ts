import { NextResponse } from 'next/server';

/**
 * API route to get API documentation
 * This provides cached API documentation with fallback when the Python backend is not available
 */
export async function GET() {
  try {
    // Try to call the Python backend API first
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-pluj3yargq-uc.a.run.app';
    
    try {
      const response = await fetch(`${backendUrl}/api/docs`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(8000) // 8 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        // Add cache headers for better performance
        return new NextResponse(JSON.stringify(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
          },
        });
      }
    } catch (error) {
      console.warn('Backend API docs not available, using fallback:', error);
    }

    // Fallback API documentation when the backend is not available
    const fallbackDocs = {
      title: "ChordMini Audio Analysis API",
      version: "1.0.0",
      description: "API for audio analysis including beat detection, chord recognition, and lyrics fetching",
      base_url: backendUrl,
      endpoints: [
        {
          path: "/",
          method: "GET",
          summary: "Health check and API status",
          description: "Returns the current status of the API and available models",
          responses: {
            "200": {
              description: "API status information",
              example: {
                status: "healthy",
                message: "Audio analysis API is running",
                beat_model: "Beat-Transformer",
                chord_model: "Chord-CNN-LSTM",
                genius_available: true
              }
            }
          }
        },
        {
          path: "/api/model-info",
          method: "GET",
          summary: "Get available models information",
          description: "Returns detailed information about available beat detection and chord recognition models",
          responses: {
            "200": {
              description: "Model information",
              example: {
                success: true,
                available_beat_models: ["beat-transformer", "madmom"],
                available_chord_models: ["chord-cnn-lstm", "btc-sl", "btc-pl"],
                default_beat_model: "beat-transformer",
                default_chord_model: "chord-cnn-lstm"
              }
            }
          }
        },
        {
          path: "/api/detect-beats",
          method: "POST",
          summary: "Detect beats in audio",
          description: "Analyzes audio file and returns beat timestamps, BPM, and time signature",
          parameters: {
            file: "Audio file (multipart form)",
            model: "beat-transformer or madmom (optional)"
          },
          responses: {
            "200": {
              description: "Beat detection results",
              example: {
                success: true,
                beats: [0.5, 1.0, 1.5, 2.0],
                beat_info: [
                  { time: 0.5, strength: 0.8 },
                  { time: 1.0, strength: 0.9 }
                ],
                downbeats: [0.5, 2.5],
                BPM: 120,
                duration: 3.0,
                time_signature: 4
              }
            }
          }
        },
        {
          path: "/api/recognize-chords",
          method: "POST",
          summary: "Recognize chords in audio (Chord-CNN-LSTM)",
          description: "Analyzes audio file and returns chord progressions with timestamps",
          parameters: {
            file: "Audio file (multipart form)"
          },
          responses: {
            "200": {
              description: "Chord recognition results",
              example: {
                success: true,
                chords: [
                  { chord: "C", time: 0.0, confidence: 0.95 },
                  { chord: "Am", time: 2.0, confidence: 0.87 }
                ],
                model_used: "chord-cnn-lstm"
              }
            }
          }
        },
        {
          path: "/api/recognize-chords-btc-sl",
          method: "POST",
          summary: "Recognize chords in audio (BTC Supervised Learning)",
          description: "Analyzes audio file using BTC SL model with 170 chord vocabulary",
          parameters: {
            file: "Audio file (multipart form)"
          }
        },
        {
          path: "/api/recognize-chords-btc-pl",
          method: "POST",
          summary: "Recognize chords in audio (BTC Pseudo-Label)",
          description: "Analyzes audio file using BTC PL model with 170 chord vocabulary",
          parameters: {
            file: "Audio file (multipart form)"
          }
        },
        {
          path: "/api/genius-lyrics",
          method: "POST",
          summary: "Fetch lyrics from Genius.com",
          description: "Retrieves song lyrics using artist and title information",
          parameters: {
            artist: "Artist name",
            title: "Song title"
          },
          responses: {
            "200": {
              description: "Lyrics retrieval results",
              example: {
                success: true,
                artist: "Artist Name",
                title: "Song Title",
                lyrics: "Song lyrics here...",
                url: "https://genius.com/..."
              }
            }
          }
        },
        {
          path: "/api/lrclib-lyrics",
          method: "POST",
          summary: "Fetch synchronized lyrics from LRClib",
          description: "Retrieves time-synchronized lyrics for karaoke-style display",
          parameters: {
            artist: "Artist name",
            title: "Song title",
            duration: "Song duration in seconds (optional)"
          },
          responses: {
            "200": {
              description: "Synchronized lyrics retrieval results",
              example: {
                success: true,
                lyrics: "[00:12.34] First line of lyrics\\n[00:15.67] Second line...",
                artist: "Artist Name",
                title: "Song Title",
                album: "Album Name",
                duration: 180.5
              }
            }
          }
        }
      ]
    };

    // Return the fallback response with cache headers
    return new NextResponse(JSON.stringify(fallbackDocs), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error in docs API route:', error);
    return NextResponse.json(
      { error: 'Failed to load API documentation' },
      { status: 500 }
    );
  }
}
