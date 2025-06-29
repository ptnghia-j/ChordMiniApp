import { NextResponse } from 'next/server';

/**
 * Genius API Key Validation Endpoint
 * 
 * This endpoint validates if the Genius API key is properly configured
 * and accessible in the current environment.
 */
export async function GET() {
  try {
    // Get Genius API key from environment
    const geniusApiKey = process.env.GENIUS_API_KEY;

    // Comprehensive environment debugging
    const envDebugInfo = {
      keyExists: !!geniusApiKey,
      keyLength: geniusApiKey?.length || 0,
      keyPrefix: geniusApiKey ? geniusApiKey.substring(0, 8) + '...' : 'N/A',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      isVercel: !!process.env.VERCEL,
      allGeniusKeys: Object.keys(process.env).filter(key => 
        key.toLowerCase().includes('genius')
      ),
      totalEnvVars: Object.keys(process.env).length,
      timestamp: new Date().toISOString()
    };

    // console.log('🔍 Genius API Key validation:', envDebugInfo);

    if (!geniusApiKey) {
      return NextResponse.json({
        success: false,
        error: 'Genius API key not found in environment variables',
        debug: envDebugInfo
      }, { status: 500 });
    }

    // Test the API key by making a simple request to Genius API
    try {
      const testResponse = await fetch('https://api.genius.com/search?q=test', {
        headers: {
          'Authorization': `Bearer ${geniusApiKey}`,
          'User-Agent': 'ChordMini/1.0'
        }
      });

      const testData = await testResponse.json();

      if (testResponse.ok && testData.meta?.status === 200) {
        return NextResponse.json({
          success: true,
          message: 'Genius API key is valid and working',
          debug: envDebugInfo,
          apiTest: {
            status: testResponse.status,
            statusText: testResponse.statusText,
            responseOk: testResponse.ok
          }
        });
      } else {
        return NextResponse.json({
          success: false,
          error: 'Genius API key is invalid or expired',
          debug: envDebugInfo,
          apiTest: {
            status: testResponse.status,
            statusText: testResponse.statusText,
            responseOk: testResponse.ok,
            errorData: testData
          }
        }, { status: 401 });
      }
    } catch (apiError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to test Genius API key',
        debug: envDebugInfo,
        apiError: apiError instanceof Error ? apiError.message : String(apiError)
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error validating Genius API key:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error during validation',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
