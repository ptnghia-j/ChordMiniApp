import { NextResponse } from 'next/server';

/**
 * Test endpoint to verify port 5001 configuration is working correctly
 */
export async function GET() {
  try {
    // Test environment variable configuration
    const configuredUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL;
    const fallbackUrl = 'http://localhost:5001'; // Should match our new fallback
    const actualUrl = configuredUrl || fallbackUrl;
    
    console.log(`🧪 Testing port configuration fix`);
    console.log(`📋 NEXT_PUBLIC_PYTHON_API_URL: ${configuredUrl || 'not set'}`);
    console.log(`🔧 Fallback URL: ${fallbackUrl}`);
    console.log(`🎯 Actual URL being used: ${actualUrl}`);
    
    // Test connectivity to the configured port
    const tests = [];
    
    // Test 1: Check if port 5000 still shows AirTunes
    try {
      const airtunesResponse = await fetch('http://localhost:5000/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      const serverHeader = airtunesResponse.headers.get('server');
      tests.push({
        name: 'Port 5000 (should be AirTunes)',
        url: 'http://localhost:5000/health',
        status: airtunesResponse.status,
        server: serverHeader,
        isAirTunes: serverHeader?.includes('AirTunes') || false,
        expected: 'AirTunes service'
      });
    } catch (error) {
      tests.push({
        name: 'Port 5000 (should be AirTunes)',
        url: 'http://localhost:5000/health',
        status: 'error',
        server: null,
        isAirTunes: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        expected: 'AirTunes service'
      });
    }
    
    // Test 2: Check if our configured port is accessible
    try {
      const backendResponse = await fetch(`${actualUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      const serverHeader = backendResponse.headers.get('server');
      const responseData = backendResponse.ok ? await backendResponse.json() : null;
      
      tests.push({
        name: 'Configured Python Backend Port',
        url: `${actualUrl}/health`,
        status: backendResponse.status,
        server: serverHeader,
        isFlask: serverHeader?.includes('Werkzeug') || serverHeader?.includes('gunicorn') || false,
        data: responseData,
        expected: 'Python Flask backend'
      });
    } catch (error) {
      tests.push({
        name: 'Configured Python Backend Port',
        url: `${actualUrl}/health`,
        status: 'error',
        server: null,
        isFlask: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        expected: 'Python Flask backend'
      });
    }
    
    // Analysis
    const airtunesTest = tests.find(t => t.name.includes('5000'));
    const backendTest = tests.find(t => t.name.includes('Backend'));
    
    const portConflictResolved = airtunesTest?.isAirTunes && !backendTest?.isAirTunes;
    // Note: backendAccessible is used for analysis but not returned in response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const backendAccessible = backendTest?.status === 200 || backendTest?.status === 'error';
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      configuration: {
        environmentVariable: configuredUrl,
        fallbackUrl,
        actualUrl,
        portChangeApplied: actualUrl.includes('5001')
      },
      tests,
      analysis: {
        portConflictResolved,
        backendAccessible: backendTest?.status === 200,
        airtunesStillOnPort5000: airtunesTest?.isAirTunes,
        configurationCorrect: actualUrl.includes('5001')
      },
      recommendations: {
        nextSteps: [
          backendTest?.status === 200 ? 
            '✅ Python backend is running and accessible' :
            '🚀 Start Python backend: cd python_backend && python app.py',
          portConflictResolved ?
            '✅ Port conflict resolved - using port 5001' :
            '⚠️ Verify port configuration is correct',
          '🧪 Test chord recognition with real audio file',
          '🧪 Test beat detection with real audio file'
        ]
      }
    });
    
  } catch (error) {
    console.error('Port fix test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Check environment configuration and Python backend status'
    }, { status: 500 });
  }
}
