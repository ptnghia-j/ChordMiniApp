import { NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * API route to get information about available models
 * This provides fallback model information when the Python backend is not available
 */
export async function GET() {
  try {
    // Try to call the Python backend API first with timeout
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    try {
      const response = await fetch(`${backendUrl}/api/model-info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging (increased for cold starts)
        signal: createSafeTimeoutSignal(15000) // 15 second timeout for cold starts
      });

      if (response.ok) {
        const data = await response.json();
        // Return the response with cache headers for better performance
        return new NextResponse(JSON.stringify(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
          },
        });
      }
    } catch (error) {
      console.warn('Backend model-info not available, using fallback:', error);
    }

    // Fallback model information when the backend is not available
    const fallbackModelInfo = {
      success: true,
      models: {
        beat: [
          {
            id: 'beat-transformer',
            name: 'Beat-Transformer',
            description: 'Deep learning model for beat tracking with downbeat detection',
            default: true
          },

          {
            id: 'madmom',
            name: 'Madmom',
            description: 'Classical beat tracking algorithm',
            default: false
          }
        ],
        chord: [
          {
            id: 'chord-cnn-lstm',
            name: 'Chord-CNN-LSTM',
            description: 'Deep learning model for chord recognition',
            default: true
          },
          {
            id: 'btc-sl',
            name: 'BTC SL (Supervised Learning)',
            description: 'Transformer-based model with supervised learning',
            default: false
          },
          {
            id: 'btc-pl',
            name: 'BTC PL (Pseudo-Label)',
            description: 'Transformer-based model with pseudo-labeling',
            default: false
          }
        ]
      }
    };

    // Return the fallback response with cache headers
    return new NextResponse(JSON.stringify(fallbackModelInfo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error in model-info API route:', error);
    return NextResponse.json(
      {
        success: true,
        models: {
          beat: [
            {
              id: 'beat-transformer-light',
              name: 'Beat-Transformer (light)',
              description: 'Lightweight version of Beat-Transformer without source separation',
              default: true
            }
          ],
          chord: [
            {
              id: 'chord-cnn-lstm',
              name: 'Chord-CNN-LSTM',
              description: 'Deep learning model for chord recognition',
              default: true
            },
            {
              id: 'btc-sl',
              name: 'BTC SL (Supervised Learning)',
              description: 'Transformer-based model with supervised learning',
              default: false
            },
            {
              id: 'btc-pl',
              name: 'BTC PL (Pseudo-Label)',
              description: 'Transformer-based model with pseudo-labeling',
              default: false
            }
          ]
        }
      }
    );
  }
}
