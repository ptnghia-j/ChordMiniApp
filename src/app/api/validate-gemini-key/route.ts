/**
 * Gemini API Key Validation Endpoint
 * Validates user-provided Gemini API keys and returns quota information
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

    // Validate the API key format (Gemini keys typically start with specific patterns)
    if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
      return NextResponse.json(
        { valid: false, error: 'Invalid Gemini API key format' },
        { status: 400 }
      );
    }

    try {
      // Test the Gemini API key with a minimal request
      const testResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (testResponse.ok) {
        // Try to get quota information if available
        let quotaInfo = undefined;
        
        try {
          // Make a small test request to check quota
          const quotaTestResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: 'test' }]
                }],
                generationConfig: {
                  maxOutputTokens: 1
                }
              })
            }
          );

          // Check response headers for quota information
          const remainingQuota = quotaTestResponse.headers.get('x-ratelimit-remaining');
          const quotaLimit = quotaTestResponse.headers.get('x-ratelimit-limit');
          const resetTime = quotaTestResponse.headers.get('x-ratelimit-reset');

          if (remainingQuota && quotaLimit) {
            const used = parseInt(quotaLimit) - parseInt(remainingQuota);
            quotaInfo = {
              used: Math.max(0, used),
              limit: parseInt(quotaLimit),
              resetTime: resetTime || undefined
            };
          } else {
            // Fallback quota estimation (Gemini free tier is typically 60 requests per minute)
            quotaInfo = {
              used: 0,
              limit: 60,
              resetTime: new Date(Date.now() + 60000).toISOString() // 1 minute from now
            };
          }
        } catch (quotaError) {
          console.log('Could not determine quota info:', quotaError);
          // Provide default quota info for free tier
          quotaInfo = {
            used: 0,
            limit: 60,
            resetTime: new Date(Date.now() + 60000).toISOString()
          };
        }

        return NextResponse.json({
          valid: true,
          message: 'API key is valid',
          quotaInfo
        });
      } else if (testResponse.status === 400) {
        const errorData = await testResponse.json().catch(() => ({}));
        if (errorData.error?.message?.includes('API_KEY_INVALID')) {
          return NextResponse.json(
            { valid: false, error: 'Invalid API key' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { valid: false, error: 'API key validation failed' },
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
      console.error('Network error validating Gemini API key:', networkError);
      return NextResponse.json(
        { valid: false, error: 'Network error - please check your connection' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error validating Gemini API key:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
