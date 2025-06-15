/**
 * Music.ai API Key Validation Endpoint
 * Validates user-provided Music.ai API keys
 */

import { NextRequest, NextResponse } from 'next/server';

interface ValidationRequest {
  apiKey: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ValidationRequest;
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'API key is required' },
        { status: 400 }
      );
    }

    // Validate the API key format (Music.ai keys typically start with specific patterns)
    if (apiKey.length < 20) {
      return NextResponse.json(
        { valid: false, error: 'Invalid API key format' },
        { status: 400 }
      );
    }

    try {
      // Test the Music.ai API key with a minimal request
      // We'll use the workflows endpoint as it's lightweight
      const testResponse = await fetch('https://api.music.ai/workflows', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.ok) {
        return NextResponse.json({
          valid: true,
          message: 'API key is valid'
        });
      } else if (testResponse.status === 401) {
        return NextResponse.json(
          { valid: false, error: 'Invalid API key - authentication failed' },
          { status: 400 }
        );
      } else if (testResponse.status === 403) {
        return NextResponse.json(
          { valid: false, error: 'API key does not have required permissions' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { valid: false, error: 'Unable to validate API key' },
          { status: 400 }
        );
      }
    } catch (networkError) {
      console.error('Network error validating Music.ai API key:', networkError);
      return NextResponse.json(
        { valid: false, error: 'Network error - please check your connection' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error validating Music.ai API key:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
