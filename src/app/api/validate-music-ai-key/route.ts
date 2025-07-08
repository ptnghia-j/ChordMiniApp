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

    // Validate the API key format (Music.ai keys are UUID format)
    // UUID format: 8-4-4-4-12 characters (e.g., "2677ee02-6013-41d0-9fed-ed59ba8b0fb1")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(apiKey)) {
      return NextResponse.json(
        { valid: false, error: 'Invalid API key format. Music.AI API keys should be in UUID format (e.g., "2677ee02-6013-41d0-9fed-ed59ba8b0fb1")' },
        { status: 400 }
      );
    }

    try {
      // Test the Music.ai API key with the application endpoint
      // This endpoint validates the API key and returns application info
      const testResponse = await fetch('https://api.music.ai/v1/application', {
        method: 'GET',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.ok) {
        const responseData = await testResponse.json();
        console.log('✅ Music.AI API key validation successful:', responseData);
        return NextResponse.json({
          valid: true,
          message: 'API key is valid',
          applicationInfo: responseData
        });
      } else if (testResponse.status === 401) {
        console.log('❌ Music.AI API key validation failed: 401 Unauthorized');
        return NextResponse.json(
          { valid: false, error: 'Invalid API key - authentication failed' },
          { status: 400 }
        );
      } else if (testResponse.status === 403) {
        console.log('❌ Music.AI API key validation failed: 403 Forbidden');
        return NextResponse.json(
          { valid: false, error: 'API key does not have required permissions' },
          { status: 400 }
        );
      } else {
        const errorText = await testResponse.text();
        console.log(`❌ Music.AI API key validation failed: ${testResponse.status} ${testResponse.statusText}`, errorText);
        return NextResponse.json(
          { valid: false, error: `Unable to validate API key (HTTP ${testResponse.status})` },
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
