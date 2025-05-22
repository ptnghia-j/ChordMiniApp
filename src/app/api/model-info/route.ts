import { NextResponse } from 'next/server';

/**
 * API route to get information about available models
 * This provides fallback model information when the Python backend is not available
 */
export async function GET() {
  try {
    // Try to call the Python backend API first
    try {
      const response = await fetch('http://localhost:5000/api/model-info', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Parse the response
        const data = await response.json();
        // Return the response
        return NextResponse.json(data);
      }
    } catch (backendError) {
      console.warn('Backend not available, using fallback model info');
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
            default: false
          },
          {
            id: 'beat-transformer-light',
            name: 'Beat-Transformer (light)',
            description: 'Lightweight version of Beat-Transformer without source separation',
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
          }
        ]
      }
    };

    // Return the fallback response
    return NextResponse.json(fallbackModelInfo);
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
            }
          ]
        }
      }
    );
  }
}
