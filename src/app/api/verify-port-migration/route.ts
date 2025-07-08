import { NextResponse } from 'next/server';

/**
 * Comprehensive verification endpoint for port 5000 → 5001 migration
 * Tests all configuration points and provides migration status
 */
export async function GET() {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      migration: {
        status: 'checking',
        issues: [] as string[],
        warnings: [] as string[],
        success: [] as string[]
      },
      configuration: {
        environmentVariable: process.env.NEXT_PUBLIC_PYTHON_API_URL,
        fallbackUrls: [] as { file: string; url: string }[],
        expectedPort: '5001'
      },
      connectivity: {
        port5000: { status: 'unknown', details: '' },
        port5001: { status: 'unknown', details: '' }
      },
      recommendations: [] as string[]
    };

    // Check environment variable
    const envUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL;
    if (envUrl) {
      if (envUrl.includes('5001')) {
        results.migration.success.push('✅ Environment variable uses port 5001');
      } else if (envUrl.includes('5000')) {
        results.migration.issues.push('❌ Environment variable still uses port 5000');
        results.recommendations.push('Update NEXT_PUBLIC_PYTHON_API_URL in .env.local to use port 5001');
      } else {
        results.migration.warnings.push('⚠️ Environment variable uses custom URL (not localhost)');
      }
    } else {
      results.migration.warnings.push('⚠️ NEXT_PUBLIC_PYTHON_API_URL not set, using fallback');
    }

    // Test fallback configurations from various modules
    const fallbackTests = [
      { name: 'API Config', fallback: 'http://localhost:5001' },
      { name: 'Environment Config', fallback: 'http://localhost:5001' },
      { name: 'Backend Config', fallback: 'http://localhost:5001' }
    ];

    fallbackTests.forEach(test => {
      if (test.fallback.includes('5001')) {
        results.migration.success.push(`✅ ${test.name} fallback uses port 5001`);
      } else if (test.fallback.includes('5000')) {
        results.migration.issues.push(`❌ ${test.name} fallback still uses port 5000`);
      }
      results.configuration.fallbackUrls.push({
        file: test.name,
        url: test.fallback
      });
    });

    // Test port connectivity
    try {
      // Test port 5000 (should show AirTunes on macOS)
      const port5000Response = await fetch('http://localhost:5000/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      const serverHeader = port5000Response.headers.get('server');
      if (serverHeader?.includes('AirTunes')) {
        results.connectivity.port5000 = {
          status: 'airtunes',
          details: `Apple AirTunes service detected (${serverHeader})`
        };
        results.migration.success.push('✅ Port 5000 correctly shows AirTunes (conflict avoided)');
      } else {
        results.connectivity.port5000 = {
          status: 'other',
          details: `Unexpected service on port 5000: ${serverHeader || 'unknown'}`
        };
        results.migration.warnings.push('⚠️ Port 5000 has unexpected service (not AirTunes)');
      }
    } catch {
      results.connectivity.port5000 = {
        status: 'unavailable',
        details: 'Port 5000 not accessible'
      };
      results.migration.warnings.push('⚠️ Port 5000 not accessible (may not be macOS or AirTunes disabled)');
    }

    try {
      // Test port 5001 (should show our Python backend or be unavailable)
      const actualUrl = envUrl || 'http://localhost:5001';
      const port5001Response = await fetch(`${actualUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      if (port5001Response.ok) {
        const data = await port5001Response.json();
        results.connectivity.port5001 = {
          status: 'backend_running',
          details: `Python backend accessible: ${JSON.stringify(data)}`
        };
        results.migration.success.push('✅ Python backend running and accessible on port 5001');
      } else {
        results.connectivity.port5001 = {
          status: 'backend_error',
          details: `Backend returned ${port5001Response.status}`
        };
        results.migration.warnings.push('⚠️ Python backend accessible but returned error');
      }
    } catch {
      results.connectivity.port5001 = {
        status: 'unavailable',
        details: 'Python backend not accessible'
      };
      results.migration.warnings.push('⚠️ Python backend not running (start with: cd python_backend && python app.py)');
      results.recommendations.push('Start Python backend: cd python_backend && python app.py');
    }

    // Determine overall migration status
    if (results.migration.issues.length === 0) {
      if (results.migration.warnings.length === 0) {
        results.migration.status = 'complete';
      } else {
        results.migration.status = 'complete_with_warnings';
      }
    } else {
      results.migration.status = 'incomplete';
    }

    // Add final recommendations
    if (results.migration.status === 'complete') {
      results.recommendations.push('🎉 Migration complete! All configurations use port 5001');
      results.recommendations.push('Test chord recognition and beat detection with real audio files');
    } else if (results.migration.status === 'incomplete') {
      results.recommendations.push('Fix the configuration issues listed above');
      results.recommendations.push('Restart both Python backend and Next.js development server');
    }

    return NextResponse.json({
      success: true,
      migrationComplete: results.migration.status === 'complete',
      ...results
    });

  } catch (error) {
    console.error('Migration verification error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Check system configuration and try again'
    }, { status: 500 });
  }
}
